const exchange = require("./exchange");
const cwalletSession = require("../lib/cwalletSession");

const BALANCE_PATH = "/cctip/v1/account/asset/balance/get";

function hasSession() {
  return cwalletSession.hasStorageState();
}

async function getAllBalances() {
  if (!hasSession()) return {};
  try {
    const data = await cwalletSession.postApi(BALANCE_PATH);
    if (!data || data.code !== 10000 || !Array.isArray(data.data)) return {};

    const result = {};
    for (const c of exchange.SUPPORTED) result[c] = 0;
    for (const row of data.data) {
      const sym = String(row.symbol || "").toUpperCase();
      if (!exchange.SUPPORTED.includes(sym)) continue;
      const bal = parseFloat(row.balance ?? row.quantity ?? 0) || 0;
      result[sym] += Math.max(0, bal);
    }
    return result;
  } catch {
    return {};
  }
}

module.exports = {
  hasSession,
  getAllBalances,
};