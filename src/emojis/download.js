const { assertAllowedSvgUrl } = require("./constants");
const { logEmoji } = require("./log");

async function downloadBootstrapSvg(svgUrl) {
  const url = assertAllowedSvgUrl(svgUrl);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    logEmoji("error", svgUrl, "download_failed", { error: e.message });
    throw e;
  }

  if (res.status === 429) {
    logEmoji("error", svgUrl, "rate_limited", { status: 429 });
    throw new Error("429 Too Many Requests");
  }

  if (res.status !== 200) {
    logEmoji("error", svgUrl, "http_error", { status: res.status });
    throw new Error(`HTTP ${res.status}`);
  }

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (
    ctype &&
    !ctype.includes("svg") &&
    !ctype.includes("octet-stream") &&
    !ctype.includes("text/plain")
  ) {
    logEmoji("error", svgUrl, "not_svg", { contentType: ctype });
    throw new Error(`unexpected content-type: ${ctype}`);
  }

  const text = await res.text();
  if (!text.trim().startsWith("<")) {
    logEmoji("error", svgUrl, "not_svg_body", {});
    throw new Error("invalid SVG body");
  }
  return text;
}

module.exports = { downloadBootstrapSvg };