/**
 * Open Cwallet in a persistent browser profile, then save storageState for Node tests.
 *
 *   node scripts/cwallet-save-storage-state.js
 *
 * If already logged in in this profile, it saves immediately after the page loads.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PROFILE_DIR = path.join(ROOT, ".cwallet-browser-profile");
const OUT_DIR = path.join(ROOT, "secrets");
const OUT_FILE = path.join(OUT_DIR, "cwallet-storage-state.json");

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error(
      "playwright not installed. Run: npm install -D playwright && npx playwright install chromium"
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://my.cwallet.com/wallet/summary", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  console.log(
    "\nIf you are not logged in, complete login in the browser window.\n" +
      "When wallet summary is visible, press Enter here to save session...\n"
  );

  await new Promise((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  await context.storageState({ path: OUT_FILE });
  console.log(`Saved: ${OUT_FILE}`);
  console.log("Test with: node scripts/cwallet-session-test.js");

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});