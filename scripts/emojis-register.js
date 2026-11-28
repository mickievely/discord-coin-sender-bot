/**
 * 등록된 PNG → Discord 애플리케이션 이모지 (길드 이모지 아님)
 * node scripts/emojis-register.js
 */
require("../src/loadEnv");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../src/config");
const { registerAllFromRegistry } = require("../src/emojis/register");
const { getRegistry, reloadRegistry } = require("../src/emojis/registry");
const { logEmoji } = require("../src/emojis/log");

async function main() {
  const token = config.token;
  const appId = String(process.env.CLIENT_ID || "");
  if (!token || !appId) {
    console.error("DISCORD_TOKEN, CLIENT_ID 필요");
    process.exit(1);
  }

  reloadRegistry();
  const reg = getRegistry();
  const payloads = [];

  for (const row of reg.icons || []) {
    const pngPath = path.join(
      process.cwd(),
      ...String(row.pngFile).split(/[/\\]/)
    );
    if (!fs.existsSync(pngPath)) {
      logEmoji("error", row.key, "png_missing", { pngPath });
      process.exit(1);
    }
    payloads.push({
      ...row,
      png: fs.readFileSync(pngPath),
    });
  }

  await registerAllFromRegistry({
    token,
    applicationId: appId,
    icons: payloads,
  });
  console.log("application emoji register done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});