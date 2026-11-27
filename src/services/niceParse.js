/** NICE HTML/JSON 응답에서 성공·실패 메시지 추출 */

function stripScripts(html) {
  return String(html || "");
}

function parseRequestResult(data) {
  const html = stripScripts(data);
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

function parseVerifyResult(data) {
  const html = stripScripts(data);
  if (/인증\s*성공|완료|SUCCESS|0000|checkplus_success/i.test(html)) {
    return { ok: true, code: "SUCCESS", message: "본인인증이 완료되었습니다." };
  }
  const alertMatch = html.match(/alert\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (alertMatch) {
    return { ok: false, code: "RETRY", message: alertMatch[1] };
  }
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

module.exports = { parseRequestResult, parseVerifyResult };