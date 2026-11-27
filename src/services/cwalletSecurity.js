const crypto = require("node:crypto");
const config = require("../config");
const cwalletSession = require("../lib/cwalletSession");

const DECISION_ALLOW = 2;
const DECISION_CHALLENGE = 1;

function md5(text) {
  return crypto.createHash("md5").update(String(text)).digest("hex");
}

function newOperationId() {
  return crypto.randomUUID();
}

async function transactionPreCheck(scene, payload) {
  const operation_id = newOperationId();
  const res = await cwalletSession.postApi(
    "/cctip/v1/transaction-security/precheck",
    {
      scene,
      operation_id,
      payload_version: 1,
      payload,
    }
  );
  if (res?.code !== 10000) {
    return {
      ok: false,
      error: res?.msg || "보안 사전검사 실패",
      raw: res,
    };
  }
  const data = res.data;
  if (data?.decision === DECISION_ALLOW && data?.operation_grant_token) {
    return {
      ok: true,
      operation_id,
      operation_grant_token: data.operation_grant_token,
      security_payload_version: 1,
    };
  }
  if (data?.decision !== DECISION_CHALLENGE || !data?.challenge_id) {
    return {
      ok: false,
      error: data?.status?.error_msg || "보안 승인 불가",
      raw: res,
    };
  }

  const password = String(config.cwalletPassword || "").trim();
  if (!password) {
    return {
      ok: false,
      error:
        "Cwallet 패스워드가 필요합니다. CWALLET_PASSWORD 환경 변수를 설정하세요.",
    };
  }

  const confirm = await cwalletSession.postApi(
    "/cctip/v1/transaction-security/confirm",
    {
      challenge_id: data.challenge_id,
      operation_id,
      method: "PAY_PASS_TOTP",
      pay_pass: md5(password),
      ...(config.cwalletTotp ? { totp_code: config.cwalletTotp } : {}),
      enable_verify_exemption: true,
    }
  );

  const grant =
    confirm?.data?.operation_grant_token ||
    confirm?.operation_grant_token ||
    confirm?.data?.confirm?.operation_grant_token;

  if (confirm?.code !== 10000 || !grant) {
    return {
      ok: false,
      error: confirm?.msg || "패스워드 확인 실패",
      raw: confirm,
    };
  }

  return {
    ok: true,
    operation_id,
    operation_grant_token: grant,
    security_payload_version:
      confirm?.data?.security_payload_version || 1,
  };
}

module.exports = {
  transactionPreCheck,
  md5,
  newOperationId,
};