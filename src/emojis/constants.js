const BOOTSTRAP_ICONS_VERSION =
  process.env.BOOTSTRAP_ICONS_VERSION || "1.11.3";

const CDN_HOST = "cdnjs.cloudflare.com";
const CDN_PATH_PREFIX = `/ajax/libs/bootstrap-icons/${BOOTSTRAP_ICONS_VERSION}/icons/`;

const MAX_PNG_BYTES = 256 * 1024;
const PNG_SIZE = 128;
const ICON_FILL = "#FFFFFF";

function bootstrapIconSvgUrl(iconBaseName) {
  const base = String(iconBaseName || "")
    .trim()
    .replace(/\.svg$/i, "");
  if (!/^[a-z0-9-]+$/i.test(base)) {
    throw new Error(`invalid bootstrap icon name: ${iconBaseName}`);
  }
  return `https://${CDN_HOST}${CDN_PATH_PREFIX}${base}.svg`;
}

const CRYPTO_ICONS_PKG =
  process.env.CRYPTOCURRENCY_ICONS_VERSION || "0.18.1";

function assertAllowedSvgUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid SVG URL: ${url}`);
  }
  if (parsed.hostname === CDN_HOST) {
    const pathRe = new RegExp(
      `^/ajax/libs/bootstrap-icons/${BOOTSTRAP_ICONS_VERSION.replace(/\./g, "\\.")}/icons/[a-z0-9-]+\\.svg$`,
      "i"
    );
    if (!pathRe.test(parsed.pathname)) {
      throw new Error(`SVG path not allowed: ${parsed.pathname}`);
    }
    return url;
  }
  if (parsed.hostname === "cdn.jsdelivr.net") {
    const cryptoRe = new RegExp(
      `^/npm/cryptocurrency-icons@${CRYPTO_ICONS_PKG.replace(/\./g, "\\.")}/svg/color/[a-z0-9]+\\.svg$`,
      "i"
    );
    if (cryptoRe.test(parsed.pathname)) {
      return url;
    }
  }
  throw new Error(`SVG host not allowed: ${parsed.hostname}`);
}

function cryptocurrencyIconSvgUrl(symbol) {
  const sym = String(symbol || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]+$/.test(sym)) {
    throw new Error(`invalid crypto symbol: ${symbol}`);
  }
  return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@${CRYPTO_ICONS_PKG}/svg/color/${sym}.svg`;
}

module.exports = {
  BOOTSTRAP_ICONS_VERSION,
  CDN_HOST,
  CRYPTO_ICONS_PKG,
  MAX_PNG_BYTES,
  PNG_SIZE,
  ICON_FILL,
  bootstrapIconSvgUrl,
  cryptocurrencyIconSvgUrl,
  assertAllowedSvgUrl,
};