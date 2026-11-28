/**
 * Bootstrap Icons (cdnjs) → assets/emojis/svg + png + registry.json
 * node scripts/emojis-sync-assets.js
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  bootstrapIconSvgUrl,
  cryptocurrencyIconSvgUrl,
} = require("../src/emojis/constants");
const { downloadBootstrapSvg } = require("../src/emojis/download");
const { svgToEmojiPng } = require("../src/emojis/png");
const { assertUnique } = require("../src/emojis/register");
const {
  ASSETS_DIR,
  loadCatalog,
  saveRegistry,
} = require("../src/emojis/registry");
const { logEmoji } = require("../src/emojis/log");

async function main() {
  const catalog = loadCatalog();
  const svgDir = path.join(ASSETS_DIR, "svg");
  const pngDir = path.join(ASSETS_DIR, "png");
  fs.mkdirSync(svgDir, { recursive: true });
  fs.mkdirSync(pngDir, { recursive: true });

  const icons = [];
  for (const def of catalog.icons) {
  let svgUrl;
  let svgFile;
  try {
      let localSvg;
      if (def.localSvg) {
        svgFile = `assets/emojis/svg/${def.localSvg}`;
        const localPath = path.join(ASSETS_DIR, "svg", def.localSvg);
        localSvg = fs.readFileSync(localPath, "utf8");
        svgUrl = `local:${def.localSvg}`;
      } else if (def.cryptoSymbol) {
        svgUrl =
          def.cdnSvg || cryptocurrencyIconSvgUrl(def.cryptoSymbol);
        const svgText = await downloadBootstrapSvg(svgUrl);
        const svgName = `crypto-${String(def.cryptoSymbol).toLowerCase()}.svg`;
        svgFile = `assets/emojis/svg/${svgName}`;
        fs.writeFileSync(path.join(ASSETS_DIR, "svg", svgName), svgText, "utf8");
        localSvg = svgText;
      } else if (def.cdnSvg) {
        svgUrl = def.cdnSvg;
        const svgText = await downloadBootstrapSvg(svgUrl);
        const slug = def.key.replace(/[^a-z0-9_-]/gi, "_");
        const svgName = `cdn-${slug}.svg`;
        svgFile = `assets/emojis/svg/${svgName}`;
        fs.writeFileSync(path.join(ASSETS_DIR, "svg", svgName), svgText, "utf8");
        localSvg = svgText;
      } else {
        svgUrl = bootstrapIconSvgUrl(def.icon);
        const svgText = await downloadBootstrapSvg(svgUrl);
        svgFile = `assets/emojis/svg/${def.icon}.svg`;
        fs.writeFileSync(path.join(ASSETS_DIR, "svg", `${def.icon}.svg`), svgText, "utf8");
        localSvg = fs.readFileSync(
          path.join(ASSETS_DIR, "svg", `${def.icon}.svg`),
          "utf8"
        );
      }
      const { png, sha256 } = await svgToEmojiPng(localSvg, def.key, {
        preserveColors: Boolean(def.preserveColors),
      });
      const pngName = `${def.name}.png`;
      fs.writeFileSync(path.join(pngDir, pngName), png);

      icons.push({
        key: def.key,
        name: def.name,
        category: def.category,
        sha256,
        svgUrl,
        svgFile,
        pngFile: `assets/emojis/png/${pngName}`,
        discordId: null,
      });
    } catch (e) {
      logEmoji("error", def.key, "sync_failed", { error: e.message });
      throw e;
    }
  }

  assertUnique(icons);
  for (const row of icons) {
    row.discordId = null;
    delete row.registeredAt;
  }
  const registry = {
    bootstrapIconsVersion: catalog.bootstrapIconsVersion,
    updatedAt: new Date().toISOString(),
    icons,
  };
  saveRegistry(registry);
  console.log(`synced ${icons.length} icons → assets/emojis`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});