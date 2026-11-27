const path = require("path");
const dotenv = require("dotenv");

// ENV_FILE 지정 시 그 파일을 먼저 읽고, 빠진 값은 루트 .env에서 채움 (dotenv는 기존 값을 덮어쓰지 않음)
if (process.env.ENV_FILE) dotenv.config({ path: process.env.ENV_FILE });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function intList(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
}

function channelId(raw) {
  if (!raw) return null;
  const n = BigInt(String(raw).trim());
  return n === 0n ? null : n;
}

const SERVICE_DISPLAY_NAME =
  process.env.SERVICE_DISPLAY_NAME || "코인대행";

module.exports = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  clientSecret: process.env.CLIENT_SECRET || "",
  guildId: process.env.GUILD_ID || null,
  defaultAdminId: process.env.DEFAULT_ADMIN_ID
    ? BigInt(process.env.DEFAULT_ADMIN_ID)
    : 0n,
  allowedUserIds: intList(process.env.ALLOWED_USER_IDS),
  serviceDisplayName: SERVICE_DISPLAY_NAME,
  panelImageUrl: process.env.PANEL_IMAGE_URL || "",
  embedIconUrl: process.env.EMBED_ICON_URL || process.env.PANEL_IMAGE_URL || "",
  serviceFeeRate: Number(process.env.SERVICE_FEE_RATE || "0.05"),
  mexcApiKey: process.env.MEXC_API_KEY || "",
  mexcSecretKey: process.env.MEXC_SECRET_KEY || "",
  depositBankName: process.env.DEPOSIT_BANK_NAME || "",
  depositAccountNo: process.env.DEPOSIT_ACCOUNT_NO || "",
  depositAccountHolder: process.env.DEPOSIT_ACCOUNT_HOLDER || "",
  channels: {
    purchase: channelId(process.env.CHANNEL_PURCHASE_LOG),
    transfer: channelId(process.env.CHANNEL_TRANSFER_LOG),
    verify: channelId(process.env.CHANNEL_VERIFY_LOG),
    charge: channelId(process.env.CHANNEL_CHARGE_LOG),
    admin: channelId(process.env.CHANNEL_ADMIN_LOG),
  },
  coinAddresses: (() => {
    try {
      return JSON.parse(process.env.COIN_ADDRESSES || "{}");
    } catch {
      return {};
    }
  })(),
  footerText: `© 2026 ${SERVICE_DISPLAY_NAME}. All rights reserved.`,
};