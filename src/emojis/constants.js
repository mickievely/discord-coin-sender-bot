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

function assertAllowedSvgUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid SVG URL: ${url}`);
  }
  if (parsed.hostname !== CDN_HOST) {
    throw new Error(`SVG host not allowed: ${parsed.hostname}`);
  }
  const pathRe = new RegExp(
    `^/ajax/libs/bootstrap-icons/${BOOTSTRAP_ICONS_VERSION.replace(/\./g, "\\.")}/icons/[a-z0-9-]+\\.svg$`,
    "i"
  );
  if (!pathRe.test(parsed.pathname)) {
    throw new Error(`SVG path not allowed: ${parsed.pathname}`);
  }
  return url;
}

module.exports = {
  BOOTSTRAP_ICONS_VERSION,
  CDN_HOST,
  MAX_PNG_BYTES,
  PNG_SIZE,
  ICON_FILL,
  bootstrapIconSvgUrl,
  assertAllowedSvgUrl,
};