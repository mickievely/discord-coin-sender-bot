const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { AttachmentBuilder } = require("discord.js");
const config = require("../config");
const { setEnvInFile } = require("../lib/envFile");
const { root } = require("../loadEnv");

const WIDTH = 1280;
const HEIGHT = 720;
const ICON_SIZE = 512;
const BANNER_FILENAME = "panel-banner.png";
const ICON_FILENAME = "embed-icon.png";
const BANNER_ATTACHMENT_URL = `attachment://${BANNER_FILENAME}`;
const ICON_ATTACHMENT_URL = `attachment://${ICON_FILENAME}`;

const GENERATED_DIR = path.join(root, "assets", "generated");
const BANNER_PATH = path.join(GENERATED_DIR, BANNER_FILENAME);
const ICON_PATH = path.join(GENERATED_DIR, ICON_FILENAME);

/** @type {{ title: string, banner: AttachmentBuilder | null, icon: AttachmentBuilder | null }} */
let cache = { title: "", banner: null, icon: null };

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function titleFontSize(title, base) {
  const len = [...title].length;
  if (len <= 5) return base;
  if (len <= 8) return Math.round(base * 0.82);
  if (len <= 12) return Math.round(base * 0.65);
  if (len <= 18) return Math.round(base * 0.5);
  return Math.round(base * 0.38);
}

function buildBannerSvg(title) {
  const display = escapeXml(title);
  const fontSize = titleFontSize(title, 108);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f0f12"/>
      <stop offset="45%" stop-color="#1a1a24"/>
      <stop offset="100%" stop-color="#2a2410"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffe566" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffff00" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffe566" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect y="${HEIGHT * 0.62}" width="100%" height="6" fill="url(#accent)"/>
  <text x="50%" y="46%"
    font-family="Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="middle"
    filter="url(#glow)">${display}</text>
</svg>`;
}

function buildIconSvg(title) {
  const display = escapeXml(title);
  const fontSize = titleFontSize(title, 88);
  const r = ICON_SIZE * 0.22;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ibg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a24"/>
      <stop offset="100%" stop-color="#2a2410"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="${r}" fill="url(#ibg)"/>
  <rect x="24" y="24" width="${ICON_SIZE - 48}" height="${ICON_SIZE - 48}" rx="${r - 8}" fill="none" stroke="#ffff00" stroke-width="4" opacity="0.55"/>
  <text x="50%" y="52%"
    font-family="Pretendard, 'Malgun Gothic', sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="middle">${display}</text>
</svg>`;
}

function toEnvRelative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function persistGeneratedPathsIfEmpty() {
  const relBanner = toEnvRelative(BANNER_PATH);
  const relIcon = toEnvRelative(ICON_PATH);
  if (!(process.env.PANEL_IMAGE_URL || "").trim()) {
    setEnvInFile("PANEL_IMAGE_URL", relBanner);
  }
  if (!(process.env.EMBED_ICON_URL || "").trim()) {
    setEnvInFile("EMBED_ICON_URL", relIcon);
  }
}

async function warmPanelBanner(title = config.serviceDisplayName) {
  const display = String(title || "코인대행").trim().slice(0, 24);
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const bannerBuf = await sharp(Buffer.from(buildBannerSvg(display)))
    .png()
    .toBuffer();
  const iconBuf = await sharp(Buffer.from(buildIconSvg(display)))
    .png()
    .toBuffer();

  fs.writeFileSync(BANNER_PATH, bannerBuf);
  fs.writeFileSync(ICON_PATH, iconBuf);

  cache = {
    title: display,
    banner: new AttachmentBuilder(bannerBuf, { name: BANNER_FILENAME }),
    icon: new AttachmentBuilder(iconBuf, { name: ICON_FILENAME }),
  };

  persistGeneratedPathsIfEmpty();
  return cache;
}

function displayTitleMatches() {
  return cache.title === String(config.serviceDisplayName).trim().slice(0, 24);
}

function getPanelBannerAttachmentSync() {
  if (!cache.banner || !displayTitleMatches()) return null;
  return { url: BANNER_ATTACHMENT_URL, attachment: cache.banner };
}

function getEmbedIconAttachmentSync() {
  if (!cache.icon || !displayTitleMatches()) return null;
  return { url: ICON_ATTACHMENT_URL, attachment: cache.icon };
}

function readLocalImageAttachment(envPath) {
  const raw = (envPath || "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) return null;
  const abs = path.isAbsolute(raw) ? raw : path.join(root, raw);
  if (!fs.existsSync(abs)) return null;
  const name = path.basename(abs);
  const buffer = fs.readFileSync(abs);
  return {
    url: `attachment://${name}`,
    attachment: new AttachmentBuilder(buffer, { name }),
  };
}

module.exports = {
  warmPanelBanner,
  getPanelBannerAttachmentSync,
  getEmbedIconAttachmentSync,
  readLocalImageAttachment,
  PANEL_BANNER_ATTACHMENT_URL: BANNER_ATTACHMENT_URL,
  ICON_ATTACHMENT_URL,
  GENERATED_DIR,
  BANNER_PATH,
  ICON_PATH,
};