/**
 * NICE Initialize smoke test (캡차 수집만, 개인정보 미사용)
 * 사용: node scripts/test-nice-init.js [SK|KT|LG]
 */
const fs = require("node:fs");
const path = require("node:path");
const { NiceApi } = require("../src/services/niceApi");

const code = process.argv[2] || "SK";

(async () => {
  console.log(`Testing NiceApi.Initalize mobile_code=${code} ...`);
  const api = new NiceApi();
  const result = await api.Initalize(code);
  if (!result.success) {
    console.error("FAIL:", result.error);
    process.exit(1);
  }
  const out = path.join(process.cwd(), "captcha", `test-${code}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, result.captchaStream);
  console.log("OK captchaVersion:", result.captchaVersion);
  console.log("OK captcha bytes:", result.captchaStream.length);
  console.log("OK saved:", out);
  process.exit(0);
})();