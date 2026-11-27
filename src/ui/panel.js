const { ButtonStyle } = require("discord.js");
const config = require("../config");
const exchange = require("../services/exchange");
const mexc = require("../services/mexc");
const { buildV2Payload } = require("./v2");

let panelMessage = null;
let refreshCounter = 0;
let currentRate = 1350;

function bumpCounter() {
  refreshCounter += 1;
  if (refreshCounter > 60) refreshCounter = 1;
  return refreshCounter;
}

async function stockLines() {
  const balances = await mexc.getAllBalances();
  const prices = await exchange.getAllCoinPrices();
  const lines = [];
  for (const symbol of exchange.SUPPORTED) {
    const bal = balances[symbol] || 0;
    if (bal > 0) {
      const krw = bal * (prices[symbol] || 0) * currentRate;
      lines.push(`**${symbol}** · ₩${Math.round(krw).toLocaleString("ko-KR")}`);
    }
  }
  return lines.length ? lines.join("\n") : "`재고 없음`";
}

async function buildPanelPayload(refreshLabel) {
  const kimchi = await exchange.getKimchiPremium();
  const stock = await stockLines();
  const fee = (config.serviceFeeRate * 100).toFixed(1);

  return buildV2Payload({
    lines: [
      `# ${config.serviceDisplayName}`,
      "",
      `### 실시간 재고 (₩)\n${stock}`,
      `김치프리미엄 \`${kimchi >= 0 ? "+" : ""}${kimchi.toFixed(2)}%\``,
      `수수료(서비스) \`${fee}%\``,
      `갱신 \`${refreshLabel}\``,
    ],
    buttons: [
      { id: "svc_use", label: "대행이용", emoji: "💰" },
      { id: "svc_purchase", label: "매입하기", style: ButtonStyle.Success, emoji: "💵" },
      { id: "svc_info", label: "내 정보", emoji: "👤" },
      { id: "svc_charge", label: "충전하기", emoji: "💳" },
      { id: "svc_minimum", label: "최소송금", emoji: "📊" },
    ],
  });
}

async function sendPanel(channel) {
  currentRate = await exchange.getExchangeRate();
  const payload = await buildPanelPayload(`${bumpCounter()}초전`);
  const msg = await channel.send(payload);
  panelMessage = msg;
  return msg;
}

async function refreshPanel(manual = false) {
  if (!panelMessage) return;
  currentRate = await exchange.getExchangeRate();
  const label = manual ? "수동" : `${bumpCounter()}초전`;
  const payload = await buildPanelPayload(label);
  await panelMessage.edit(payload);
}

function startPanelRefresh(intervalMs = 300_000) {
  return setInterval(() => {
    refreshPanel(false).catch(() => {
      panelMessage = null;
    });
  }, intervalMs);
}

function setPanelMessage(msg) {
  panelMessage = msg;
}

module.exports = {
  buildPanelPayload,
  sendPanel,
  refreshPanel,
  startPanelRefresh,
  setPanelMessage,
  get currentRate() {
    return currentRate;
  },
};