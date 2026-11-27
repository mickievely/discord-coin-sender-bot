const crypto = require("node:crypto");
const config = require("../config");
const exchange = require("./exchange");

const BASE = "https://api.mexc.com";

function signParams(params, secret) {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

async function signedGet(path, params = {}) {
  const timestamp = Date.now();
  const body = { ...params, timestamp };
  body.signature = signParams(body, config.mexcSecretKey);
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
  ).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "X-MEXC-APIKEY": config.mexcApiKey },
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

async function signedPost(path, params = {}) {
  const timestamp = Date.now();
  const body = { ...params, recvWindow: 60000, timestamp };
  body.signature = signParams(body, config.mexcSecretKey);
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
  ).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: "POST",
    headers: { "X-MEXC-APIKEY": config.mexcApiKey },
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}

function hasKeys() {
  return Boolean(config.mexcApiKey && config.mexcSecretKey);
}

async function getAllBalances() {
  if (!hasKeys()) return {};
  try {
    const data = await signedGet("/api/v3/account");
    const result = {};
    for (const c of exchange.SUPPORTED) result[c] = 0;
    for (const b of data.balances || []) {
      if (exchange.SUPPORTED.includes(b.asset)) {
        result[b.asset] = Math.max(0, parseFloat(b.free) || 0);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function txLink(txid, coin) {
  const c = coin.toUpperCase();
  if (c === "TRX") return `https://tronscan.org/#/transaction/${txid}`;
  if (c === "LTC")
    return `https://blockchair.com/litecoin/transaction/${txid}`;
  return `https://bscscan.com/tx/${txid}`;
}

const NET_MAP = {
  bep20: "BSC",
  trc20: "TRX",
  ltc: "LTC",
  bnb: "BSC",
};

async function withdrawCoin(amount, address, network, coin) {
  if (!hasKeys()) {
    return { success: false, error: "MEXC API 키가 설정되지 않았습니다." };
  }
  const net = NET_MAP[network.toLowerCase()];
  if (!net) return { success: false, error: `지원하지 않는 네트워크: ${network}` };

  const min = exchange.MIN_COIN[coin.toUpperCase()] ?? 10;
  if (amount < min) {
    return { success: false, error: `최소 송금 미달 (${min} ${coin})` };
  }

  try {
    const data = await signedPost("/api/v3/capital/withdraw", {
      coin: coin.toUpperCase(),
      address: String(address).trim(),
      amount: String(amount),
      netWork: net,
    });

    if (data?.id) {
      return {
        success: true,
        txid: String(data.id),
        network: net,
        coin: coin.toUpperCase(),
        to_address: address,
        share_link: txLink(data.id, coin),
        fee: exchange.getTransactionFee(coin, net),
      };
    }
    return {
      success: false,
      error: data?.msg || "거래소 오류",
    };
  } catch (e) {
    return { success: false, error: e.message || "네트워크 오류" };
  }
}

module.exports = {
  hasKeys,
  getAllBalances,
  withdrawCoin,
};