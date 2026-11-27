const crypto = require("node:crypto");
const sharp = require("sharp");
const { ICON_FILL, MAX_PNG_BYTES, PNG_SIZE } = require("./constants");
const { logEmoji } = require("./log");

function paintSvgWhite(svgText) {
  let s = svgText;
  s = s.replace(/currentColor/gi, ICON_FILL);
  s = s.replace(/fill="(?!none)[^"]*"/gi, `fill="${ICON_FILL}"`);
  if (!/fill=/i.test(s) && /<svg/i.test(s)) {
    s = s.replace(/<svg/i, `<svg fill="${ICON_FILL}"`);
  }
  return s;
}

async function svgToEmojiPng(svgText, keyForLog = "unknown", opts = {}) {
  const painted = opts.preserveColors ? svgText : paintSvgWhite(svgText);
  let png;
  try {
    png = await sharp(Buffer.from(painted, "utf8"), { density: 192 })
      .resize(PNG_SIZE, PNG_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch (e) {
    logEmoji("error", keyForLog, "png_convert_failed", { error: e.message });
    throw e;
  }

  if (png.length > MAX_PNG_BYTES) {
    logEmoji("error", keyForLog, "png_too_large", { bytes: png.length });
    throw new Error(`PNG exceeds ${MAX_PNG_BYTES} bytes`);
  }

  const sha256 = crypto.createHash("sha256").update(png).digest("hex");
  return { png, sha256 };
}

module.exports = { svgToEmojiPng, paintSvgWhite };