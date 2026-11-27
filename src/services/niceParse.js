/** NICE /cert/.../proc 공통 JSON: { code: "SUCCESS"|"RETRY", message: "..." } */

const NICE_MESSAGE_KO = {
  SERVICE_CAPTCHA_E0: "보안문자가 올바르지 않습니다.",
  SERVICE_CAPTCHA_E1: "보안문자를 입력해 주세요.",
  MOBILE_CERT_DEFAULT_EE: "이름·생년월일·성별·휴대폰번호를 확인해 주세요.",
  MOBILE_CERT_SMS_EE: "SMS 인증 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

function friendlyNiceMessage(message) {
  const key = String(message || "").trim();
  if (!key) return null;
  if (NICE_MESSAGE_KO[key]) return NICE_MESSAGE_KO[key];
  if (/[가-힣]/.test(key)) return key;
  return `오류 코드: ${key}. 입력 내용을 확인한 뒤 다시 시도해 주세요.`;
}

function asPayload(data) {
  if (data == null) return null;
  if (typeof data === "object" && !Buffer.isBuffer(data)) return data;
  if (typeof data === "string") {
    const t = data.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseNiceProc(data) {
  const json = asPayload(data);
  if (json && typeof json === "object") {
    const code = String(json.code ?? json.resultCode ?? "").toUpperCase();
    const rawMsg = json.message ?? json.resultMsg ?? json.msg ?? "";
    if (
      code === "SUCCESS" ||
      code === "0000" ||
      json.success === true ||
      json.success === "Y"
    ) {
      return {
        ok: true,
        code: "SUCCESS",
        message: friendlyNiceMessage(rawMsg) || "처리되었습니다.",
      };
    }
    const friendly = friendlyNiceMessage(rawMsg) || friendlyNiceMessage(code);
    if (friendly) {
      return { ok: false, code: code || "RETRY", message: friendly };
    }
  }

  const html = String(data ?? "");
  if (/인증번호\s*(를)?\s*발송|SMS\s*발송|certCode|confirm\/proc/i.test(html)) {
    return { ok: true, code: "SUCCESS", message: "SMS 인증번호가 발송되었습니다." };
  }
  const alertMatch = html.match(/alert\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (alertMatch) {
    return { ok: false, code: "RETRY", message: alertMatch[1] };
  }
  const errMatch = html.match(/class="error[^"]*"[^>]*>([^<]+)/i);
  if (errMatch) {
    return { ok: false, code: "RETRY", message: errMatch[1].trim() };
  }
  if (/캡cha|자동입력|보안문자/i.test(html)) {
    return { ok: false, code: "RETRY", message: "보안문자가 올바르지 않습니다." };
  }
  return {
    ok: false,
    code: "UNKNOWN",
    message: "본인확인 요청 결과를 확인할 수 없습니다. 다시 시도해 주세요.",
  };
}

/** 주민번호 앞 6자리 YY → 연도 (00–29: 2000년대, 30–99: 1900년대) */
function inferBirthYearFromYy(yyTwo) {
  const yy = parseInt(String(yyTwo), 10);
  if (!Number.isFinite(yy) || yy < 0 || yy > 99) return null;
  return yy <= 29 ? 2000 + yy : 1900 + yy;
}

/**
 * NICE myNum2: 1900년대 남1/여2, 2000년대 남3/여4
 * @param {string} birth6 YYMMDD
 * @param {"M"|"F"} sex
 */
function niceGenderDigit(birth6, sex) {
  if (!/^\d{6}$/.test(String(birth6))) {
    throw new Error("생년월일 6자리를 확인해 주세요.");
  }
  const year = inferBirthYearFromYy(birth6.slice(0, 2));
  if (!year) throw new Error("생년월일 형식이 올바르지 않습니다.");
  const male = sex === "M";
  if (year >= 2000) return male ? "3" : "4";
  return male ? "1" : "2";
}

function parseRequestResult(data) {
  const parsed = parseNiceProc(data);
  if (parsed.ok) {
    return {
      ...parsed,
      message: "SMS 인증번호가 발송되었습니다.",
    };
  }
  return parsed;
}

function parseVerifyResult(data) {
  const parsed = parseNiceProc(data);
  if (parsed.ok) {
    return {
      ...parsed,
      message: "본인인증이 완료되었습니다.",
    };
  }
  if (parsed.code !== "UNKNOWN") return parsed;
  const html = String(data ?? "");
  if (/인증번호|확인\s*실패|불일치/i.test(html)) {
    return {
      ok: false,
      code: "RETRY",
      message: "인증번호가 올바르지 않습니다.",
    };
  }
  return {
    ok: false,
    code: "UNKNOWN",
    message: "인증 결과를 확인할 수 없습니다.",
  };
}

module.exports = {
  parseRequestResult,
  parseVerifyResult,
  niceGenderDigit,
  inferBirthYearFromYy,
};