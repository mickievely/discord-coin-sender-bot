/**
 * NICE proc 응답 파서 스모크 테스트
 */
const assert = require("node:assert/strict");
const { parseRequestResult, parseVerifyResult } = require("../src/services/niceParse");

assert.equal(
  parseRequestResult({ code: "SUCCESS", message: "OK" }).ok,
  true
);
assert.equal(
  parseRequestResult({ code: "RETRY", message: "SERVICE_CAPTCHA_E0" }).ok,
  false
);
assert.match(
  parseRequestResult({ code: "RETRY", message: "SERVICE_CAPTCHA_E0" }).message,
  /보안문자/
);

assert.equal(
  parseVerifyResult({ code: "SUCCESS", message: "OK" }).ok,
  true
);

console.log("test-nice-parse: OK");