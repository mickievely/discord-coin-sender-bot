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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getUsdtKrwFromUpbit() {
  const url = config.kimchiUsdtKrwUrl;
  if (!url) return 0;
  const data = await fetchJson(url);
  const row = Array.isArray(data) ? data[0] : data;
  const p = row?.trade_price;
  return p > 0 ? p : 0;
}

async function getExchangeRate() {
  try {
    const usdtKrw = await getUsdtKrwFromUpbit();
    if (usdtKrw > 0) return usdtKrw;
    const data = await fetchJson(config.usdKrwExchangeUrl);
    const rate =
      data?.rates?.KRW ??
      data?.data?.rates?.KRW ??
      data?.result?.KRW;
    return rate > 0 ? rate : 1350;
  } catch {
    return 1350;
  }
}

async function getKimchiPremium() {
  try {
    const upbit = await fetchJson(config.kimchiUpbitTickerUrl);
    const globalTicker = await fetchJson(config.kimchiGlobalPriceUrl);
    const upbitPrice = upbit[0]?.trade_price;
    const binanceUsd =
      parseFloat(globalTicker.price) ||
      parseFloat(globalTicker?.data?.price) ||
      0;
    if (!upbitPrice || !binanceUsd) throw new Error("가격 없음");

    const krwPerUsd = await getUsdtKrwFromUpbit();
    const fx = krwPerUsd > 0 ? krwPerUsd : await getExchangeRate();
    const globalKrw = binanceUsd * fx;
    return Number((((upbitPrice - globalKrw) / globalKrw) * 100).toFixed(2));
  } catch {
    return 0;
  }
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
  const krwRate = await getExchangeRate();
  const kimchi = await getKimchiPremium();
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