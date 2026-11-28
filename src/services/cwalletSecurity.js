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

function mapSecurityError(msg, code) {
  if (msg === "ErrSecurityPayloadInvalid" || code === 320008) {
    return [
      "Cwallet 출금 보안 확인에 실패했습니다.",
      "· `CWALLET_PASSWORD`(결제 PIN) 확인",
      "· 2FA 사용 중이면 6자리 코드를 `CWALLET_TOTP`에 넣거나, 시크릿은 `CWALLET_2FA_SECRET`",
      "· `node scripts/cwallet-save-storage-state.js`로 세션 재저장",
    ].join("\n");
  }
  if (msg === "ErrRiskAssetForbidden" || code === 260002) {
    return "Cwallet이 이 출금 요청을 거절했습니다. 주소와 네트워크를 다시 확인해 주세요.";
  }
  if (msg === "ErrInvalidValue") {
    return "송금 수량이 올바르지 않습니다. (소수 자릿수·잔액·최소금액 확인)";
  }
  if (msg === "ErrBalanceInsufficient" || code === 10038) {
    return "Cwallet 출금 가능 잔액이 부족합니다.";
  }
  if (msg === "ErrWithdrawAddrFormat" || code === 100801) {
    return "출금 주소 형식이 올바르지 않습니다.";
  }
  if (msg === "ErrWithdrawValueLessThanLimit" || code === 10081) {
    return "출금 수량이 Cwallet 최소 출금액보다 작습니다.";
  }
  return msg || "보안 확인 실패";
}

function totpCodeForConfirm() {
  const raw = String(config.cwalletTotp || "").trim();
  if (!raw) {
    const secret = String(process.env.CWALLET_2FA_SECRET || "").trim();
    if (secret) {
      try {
        const { authenticator } = require("otplib");
        return authenticator.generate(secret.replace(/\s+/g, "").toUpperCase());
      } catch {
        /* otplib 미설치 */
      }
    }
    return "";
  }
  if (/^\d{6}$/.test(raw)) return raw;
  try {
    const { authenticator } = require("otplib");
    return authenticator.generate(raw.replace(/\s+/g, "").toUpperCase());
  } catch {
    return raw;
  }
}

async function verifyPayPassHash(passwordHash) {
  const res = await cwalletSession.postApi(
    "/cctip/v1/setting/pay-pass/verify",
    { pay_pass: passwordHash }
  );
  return res?.code === 10000;
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
      error: mapSecurityError(res?.msg, res?.code),
      raw: res,
    };
  }
  const data = res.data;
  if (data?.decision === DECISION_ALLOW && data?.operation_grant_token) {
    return {
      ok: true,
      operation_id,
      operation_grant_token: data.operation_grant_token,
      security_payload_version:
        data.security_payload_version ?? data.payload_version ?? 1,
    };
  }
  if (data?.decision !== DECISION_CHALLENGE || !data?.challenge_id) {
    return {
      ok: false,
      error: mapSecurityError(
        data?.status?.error_msg,
        data?.status?.code
      ),
      raw: res,
    };
  }

  const password = String(config.cwalletPassword || "").trim();
  if (!password) {
    return {
      ok: false,
      error:
        "Cwallet 패스워드가 필요합니다. `.env`에 `CWALLET_PASSWORD`를 설정하세요.",
    };
  }

  const payPassHash = md5(password);
  const payOk = await verifyPayPassHash(payPassHash);
  if (!payOk) {
    return {
      ok: false,
      error: "Cwallet 결제 PIN이 올바르지 않습니다. `CWALLET_PASSWORD`를 확인하세요.",
    };
  }

  const totp = totpCodeForConfirm();
  const methods = data.methods || [];
  const wantsTotp = methods.some(
    (m) => m.totp_required || m.method === 2
  );
  if (wantsTotp && !totp && !config.cwalletTotp) {
    /* PAY_PASS_TOTP without live code — still attempt confirm */
  }

  const confirmBody = {
    challenge_id: data.challenge_id,
    operation_id,
    method: "PAY_PASS_TOTP",
    pay_pass: payPassHash,
  };
  if (totp) confirmBody.totp_code = totp;
  if (data.allow_verify_exemption) {
    confirmBody.enable_verify_exemption = true;
  }

  const confirm = await cwalletSession.postApi(
    "/cctip/v1/transaction-security/confirm",
    confirmBody
  );

  const inner = confirm?.data?.confirm || confirm?.data;
  const grant =
    inner?.operation_grant_token ||
    confirm?.data?.operation_grant_token ||
    confirm?.operation_grant_token;

  if (confirm?.code !== 10000 || !grant) {
    return {
      ok: false,
      error: mapSecurityError(confirm?.msg, confirm?.code),
      raw: confirm,
    };
  }

  return {
    ok: true,
    operation_id,
    operation_grant_token: grant,
    security_payload_version:
      inner?.security_payload_version ??
      confirm?.data?.security_payload_version ??
      1,
  };
}

module.exports = {
  transactionPreCheck,
  md5,
  newOperationId,
  mapSecurityError,
};