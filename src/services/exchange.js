const config = require("../config");

const SUPPORTED = ["USDT", "BNB", "TRX", "LTC"];

const MIN_COIN = {
  USDT: 10,
  TRX: 10,
  LTC: 0.015,
  BNB: 0.008,
};

const CHAIN_FEE = {
  USDT: { BSC: 0.8, TRX: 1.0 },
  TRX: { TRX: 1.0 },
  LTC: { LTC: 0.001 },
  BNB: { BSC: 0.0005 },
};

const UPBIT_MARKET = {
  USDT: "USDT-KRW",
  BNB: "BNB-KRW",
  TRX: "TRX-KRW",
  LTC: "LTC-KRW",
};

/** 김프 계산용 글로벌 BTC (고정 1곳, env 추가 없음) */
const BINANCE_BTC_USDT_URL =
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseDirectKimchi(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  const n =
    raw.premium_percent ??
    raw.kimchi_premium ??
    raw.premium ??
    raw.kimchi ??
    raw.data?.premium_percent;
  if (n != null && Number.isFinite(Number(n))) return Number(n);
  return null;
}

/** 환율: USD_KRW_RATE_URL 1회만 */
async function getExchangeRate() {
  const data = await fetchJson(config.usdKrwRateUrl);
  const row = Array.isArray(data) ? data[0] : data;
  const rate = row?.trade_price ?? row?.rate ?? row?.KRW;
  if (!rate || rate <= 0) throw new Error("환율 없음");
  return rate;
}

/**
 * 김치프리미엄: KIMCHI_PREMIUM_URL 1회
 * - JSON에 premium_percent 등 있으면 그대로 사용
 * - Upbit KRW-BTC 티커면 글로벌은 Binance BTCUSDT 1회로 계산 (env는 1개만)
 */
async function getKimchiPremium() {
  const data = await fetchJson(config.kimchiPremiumUrl);
  const direct = parseDirectKimchi(data);
  if (direct != null) return Number(direct.toFixed(2));

  const upbitRow = Array.isArray(data) ? data[0] : data;
  const upbitBtc = upbitRow?.trade_price;
  if (!upbitBtc) throw new Error("김프(업비트) 가격 없음");

  const global = await fetchJson(BINANCE_BTC_USDT_URL);
  const binanceUsd = parseFloat(global.price);
  if (!binanceUsd) throw new Error("김프(글로벌) 가격 없음");

  const fx = await getExchangeRate();
  const globalKrw = binanceUsd * fx;
  return Number((((upbitBtc - globalKrw) / globalKrw) * 100).toFixed(2));
}

async function getUpbitCoinPriceUsd(coin) {
  const market = UPBIT_MARKET[coin];
  if (!market) return 0;
  if (coin === "USDT") return 1;
  try {
    const data = await fetchJson(
      `${config.upbitTickerBaseUrl}${market}`
    );
    const krw = data[0]?.trade_price;
    const usdKrw = await getExchangeRate();
    return usdKrw > 0 ? krw / usdKrw : 0;
  } catch {
    return 0;
  }
}

async function getMexcPriceUsd(coin) {
  if (coin === "USDT") return 1;
  try {
    const data = await fetchJson(
      `${config.mexcTickerPriceBaseUrl}${coin}USDT`
    );
    return parseFloat(data.price) || 0;
  } catch {
    return 0;
  }
}

async function getCoinPrice(coin) {
  const upper = coin.toUpperCase();
  const up = await getUpbitCoinPriceUsd(upper);
  if (up > 0) return up;
  return getMexcPriceUsd(upper);
}

async function getAllCoinPrices() {
  const prices = {};
  for (const c of SUPPORTED) {
    prices[c] = await getCoinPrice(c);
  }
  return prices;
}

async function getMinimumAmountsKrw() {
  const prices = await getAllCoinPrices();
  let krwRate = 0;
  let kimchi = 0;
  try {
    krwRate = await getExchangeRate();
    kimchi = await getKimchiPremium();
  } catch {
    krwRate = 1350;
    kimchi = 0;
  }
  const actualRate = krwRate * (1 + kimchi / 100);
  const out = {};
  for (const [coin, min] of Object.entries(MIN_COIN)) {
    const p = prices[coin] || 0;
    out[coin] = p > 0 ? Math.floor(min * p * actualRate) : 0;
  }
  return out;
}

function getTransactionFee(coin, network) {
  const map = CHAIN_FEE[coin.toUpperCase()] || {};
  return map[network.toUpperCase()] ?? 1;
}

function krwToCoinAmount(krwAmount, coinPrice, actualKrwRate) {
  if (!coinPrice || !actualKrwRate) return 0;
  return krwAmount / actualKrwRate / coinPrice;
}

module.exports = {
  SUPPORTED,
  MIN_COIN,
  getExchangeRate,
  getKimchiPremium,
  getCoinPrice,
  getAllCoinPrices,
  getMinimumAmountsKrw,
  getTransactionFee,
  krwToCoinAmount,
};