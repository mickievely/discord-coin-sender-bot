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

let cachedUsdKrw = 0;
let cachedUsdKrwAt = 0;
const RATE_CACHE_MS = 30_000;
const RATE_FALLBACK = 1350;

let cachedKimchiFx = 0;
let cachedKimchiFxAt = 0;

function parseKimchiForexFromJson(data) {
  if (data == null) return null;
  if (typeof data === "number" && data > 0) return data;
  const yahoo = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (Number.isFinite(yahoo) && yahoo > 0) return yahoo;
  const row = Array.isArray(data) ? data[0] : data;
  const fromRow = Number(
    row?.trade_price ?? row?.rate ?? row?.price ?? row?.KRW ?? row?.krw
  );
  if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
  const nested =
    data?.rates?.KRW ??
    data?.rates?.krw ??
    data?.usd?.krw ??
    data?.data?.rate;
  const n = Number(nested);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

/** kimpga 방식 분모: USD/KRW (실시간 환율, 업비트 USDT 아님) */
async function getKimchiForexRate() {
  const now = Date.now();
  if (cachedKimchiFx > 0 && now - cachedKimchiFxAt < RATE_CACHE_MS) {
    return cachedKimchiFx;
  }
  try {
    const data = await fetchJson(config.kimchiForexUrl, {
      headers: { "User-Agent": "discord-coin-sender-bot/1.0" },
    });
    const rate = parseKimchiForexFromJson(data);
    if (!rate) throw new Error("김프 환율(USD/KRW) 없음");
    cachedKimchiFx = rate;
    cachedKimchiFxAt = now;
    return rate;
  } catch (err) {
    if (cachedKimchiFx > 0) return cachedKimchiFx;
    console.error("김프 환율 조회 실패, 폴백 사용:", err.message);
    return RATE_FALLBACK;
  }
}

function calcKimchiPercent(domesticKrw, globalKrw) {
  if (!domesticKrw || !globalKrw) throw new Error("김프 가격 없음");
  return Number((((domesticKrw - globalKrw) / globalKrw) * 100).toFixed(2));
}

/** 환율: Upbit KRW-USDT trade_price = ₩/1 USDT (USD·KRW 대용) */
async function fetchUsdKrwFromUrl() {
  const data = await fetchJson(config.usdKrwRateUrl);
  const row = Array.isArray(data) ? data[0] : data;
  const rate = Number(
    row?.trade_price ?? row?.opening_price ?? row?.rate ?? row?.KRW
  );
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("환율 없음");
  return rate;
}

async function getExchangeRate() {
  const now = Date.now();
  if (cachedUsdKrw > 0 && now - cachedUsdKrwAt < RATE_CACHE_MS) {
    return cachedUsdKrw;
  }
  try {
    const rate = await fetchUsdKrwFromUrl();
    cachedUsdKrw = rate;
    cachedUsdKrwAt = now;
    return rate;
  } catch (err) {
    if (cachedUsdKrw > 0) return cachedUsdKrw;
    console.error("환율 조회 실패, 폴백 사용:", err.message);
    return RATE_FALLBACK;
  }
}

/**
 * 김치프리미엄 (kimpga·김프가 방식)
 * ({업비트 원화가 − 글로벌 원화가} ÷ 글로벌 원화가) × 100
 * - USDT: 업비트 KRW-USDT vs 1달러 × USD/KRW 환율
 * - BTC: 업비트 KRW-BTC vs 바이낸스 BTCUSDT × USD/KRW
 */
async function getKimchiPremium() {
  const fx = await getKimchiForexRate();
  const symbol = config.kimchiSymbol;

  if (symbol === "USDT") {
    const domesticKrw = await getExchangeRate();
    const globalKrw = fx;
    return calcKimchiPercent(domesticKrw, globalKrw);
  }

  const data = await fetchJson(config.kimchiPremiumUrl);
  const upbitRow = Array.isArray(data) ? data[0] : data;
  const domesticKrw = upbitRow?.trade_price;
  if (!domesticKrw) throw new Error("김프(업비트) 가격 없음");

  const global = await fetchJson(BINANCE_BTC_USDT_URL);
  const binanceUsd = parseFloat(global.price);
  if (!binanceUsd) throw new Error("김프(글로벌) 가격 없음");

  const globalKrw = binanceUsd * fx;
  return calcKimchiPercent(domesticKrw, globalKrw);
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

async function getBinancePriceUsd(coin) {
  if (coin === "USDT") return 1;
  try {
    const data = await fetchJson(
      `https://api.binance.com/api/v3/ticker/price?symbol=${coin}USDT`
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
  return getBinancePriceUsd(upper);
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

function normalizeNetworkKey(network) {
  const n = String(network).toLowerCase();
  if (n === "bep20") return "BSC";
  if (n === "trc20") return "TRX";
  if (n === "ltc") return "LTC";
  return String(network).toUpperCase();
}

function getTransactionFee(coin, network) {
  const map = CHAIN_FEE[coin.toUpperCase()] || {};
  return map[normalizeNetworkKey(network)] ?? 1;
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
  getKimchiForexRate,
  getCoinPrice,
  getAllCoinPrices,
  getMinimumAmountsKrw,
  getTransactionFee,
  normalizeNetworkKey,
  krwToCoinAmount,
};