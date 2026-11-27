const cwallet = require("./cwallet");

const STOCK_SYMBOL = "USDT";

function formatKrw(amount) {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

/** 패널 재고: Cwallet USDT만 */
async function getStockSummary(usdKrw, kimchiPercent) {
  const appliedRate = usdKrw * (1 + kimchiPercent / 100);
  let usdt = 0;

  if (cwallet.hasSession()) {
    const balances = await cwallet.getAllBalances();
    usdt = balances[STOCK_SYMBOL] || 0;
  }

  const totalKrw = usdt * appliedRate;

  const oneLine =
    usdt > 0 ? formatKrw(totalKrw) : "`재고 없음`";

  return { totalKrw, oneLine };
}

module.exports = {
  getStockSummary,
  formatKrw,
};