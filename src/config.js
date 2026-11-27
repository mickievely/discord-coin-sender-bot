require("./loadEnv");

function intList(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
}

function channelIdStr(raw) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (s === "0") return null;
  return s;
}

const SERVICE_DISPLAY_NAME =
  process.env.SERVICE_DISPLAY_NAME || "코인대행";

/** .env에는 퍼센트 숫자 (예: 5 = 5%). 0~1 소수는 예전 방식(0.05)도 허용 */
function parseServiceFeeFromEnv(raw) {
  const n = Number(String(raw ?? "5").trim());
  if (!Number.isFinite(n) || n < 0) {
    return { percent: 5, rate: 0.05 };
  }
  if (n > 0 && n < 1) {
    return { percent: n * 100, rate: n };
  }
  return { percent: n, rate: n / 100 };
}

const serviceFee = parseServiceFeeFromEnv(process.env.SERVICE_FEE_RATE);

const KIMCHI_SYMBOL = (process.env.KIMCHI_SYMBOL || "BTC").toUpperCase();

module.exports = {
  token: process.env.DISCORD_TOKEN || "",
  guildId: process.env.GUILD_ID || null,
  defaultAdminId: process.env.DEFAULT_ADMIN_ID
    ? BigInt(process.env.DEFAULT_ADMIN_ID)
    : 0n,
  allowedUserIds: intList(process.env.ALLOWED_USER_IDS),
  serviceDisplayName: SERVICE_DISPLAY_NAME,
  panelImageUrl:
    process.env.PANEL_IMAGE_URL ||
    "https://cdn.discordapp.com/embed/avatars/0.png",
  embedIconUrl: process.env.EMBED_ICON_URL || process.env.PANEL_IMAGE_URL || "",
  serviceFeePercent: serviceFee.percent,
  serviceFeeRate: serviceFee.rate,
  mexcApiKey: process.env.MEXC_API_KEY || "",
  mexcSecretKey: process.env.MEXC_SECRET_KEY || "",
  depositBankName: process.env.DEPOSIT_BANK_NAME || "",
  depositAccountNo: process.env.DEPOSIT_ACCOUNT_NO || "",
  depositAccountHolder: process.env.DEPOSIT_ACCOUNT_HOLDER || "",
  channels: {
    panel: channelIdStr(process.env.CHANNEL_PANEL),
    purchase: channelIdStr(process.env.CHANNEL_PURCHASE_LOG),
    transfer: channelIdStr(process.env.CHANNEL_TRANSFER_LOG),
    verify: channelIdStr(process.env.CHANNEL_VERIFY_LOG),
    charge: channelIdStr(process.env.CHANNEL_CHARGE_LOG),
    admin: channelIdStr(process.env.CHANNEL_ADMIN_LOG),
  },
  panelMessageId: channelIdStr(process.env.PANEL_MESSAGE_ID),
  kimchiSymbol: KIMCHI_SYMBOL,
  kimchiUpbitTickerUrl:
    process.env.KIMCHI_UPBIT_TICKER_URL ||
    `https://api.upbit.com/v1/ticker?markets=KRW-${KIMCHI_SYMBOL}`,
  kimchiGlobalPriceUrl:
    process.env.KIMCHI_GLOBAL_PRICE_URL ||
    `https://api.binance.com/api/v3/ticker/price?symbol=${KIMCHI_SYMBOL}USDT`,
  kimchiUsdtKrwUrl:
    process.env.KIMCHI_USDT_KRW_URL ||
    "https://api.upbit.com/v1/ticker?markets=KRW-USDT",
  usdKrwExchangeUrl:
    process.env.USD_KRW_EXCHANGE_URL ||
    "https://api.exchangerate-api.com/v4/latest/USD",
  upbitTickerBaseUrl:
    process.env.UPBIT_TICKER_BASE_URL ||
    "https://api.upbit.com/v1/ticker?markets=",
  mexcTickerPriceBaseUrl:
    process.env.MEXC_TICKER_PRICE_BASE_URL ||
    "https://api.mexc.com/api/v3/ticker/price?symbol=",
  coinAddresses: (() => {
    try {
      return JSON.parse(process.env.COIN_ADDRESSES || "{}");
    } catch {
      return {};
    }
  })(),
  footerText: `© 2026 ${SERVICE_DISPLAY_NAME}. All rights reserved.`,
};