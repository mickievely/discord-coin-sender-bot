const { ButtonStyle } = require("discord.js");
const config = require("../config");
const exchange = require("../services/exchange");
const mexc = require("../services/mexc");
const { buildV2Payload } = require("./v2");
const { persistPanelMessageId } = require("../lib/envFile");

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
  return lines.length ? lines.join(" · ") : "`재고 없음`";
}

async function buildPanelPayload(refreshLabel) {
  let kimchi = 0;
  try {
    kimchi = await exchange.getKimchiPremium();
  } catch (e) {
    console.error("김프 조회 실패:", e.message);
  }
  const stock = await stockLines();
  const fee = (config.serviceFeeRate * 100).toFixed(1);

  return buildV2Payload({
    lines: [
      `# ${config.serviceDisplayName}`,
      "",
      `### 실시간 재고 (₩) · ${stock}`,
      `김치프리미엄 \`${kimchi >= 0 ? "+" : ""}${kimchi.toFixed(2)}%\``,
      `수수료(서비스) \`${fee}%\``,
      `갱신 \`${refreshLabel}\``,
    ],
    buttons: [
      { id: "svc_use", label: "대행이용", emojiKey: "svc_use" },
      {
        id: "svc_purchase",
        label: "매입하기",
        style: ButtonStyle.Success,
        emojiKey: "svc_purchase",
      },
      { id: "svc_info", label: "내 정보", emojiKey: "svc_info" },
      { id: "svc_charge", label: "충전하기", emojiKey: "svc_charge" },
      { id: "svc_minimum", label: "최소송금", emojiKey: "svc_minimum" },
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

async function refreshPanel() {
  if (!panelMessage) return;
  currentRate = await exchange.getExchangeRate();
  const label = `${bumpCounter()}초전`;
  const payload = await buildPanelPayload(label);
  await panelMessage.edit(payload);
}

async function initPanel(client) {
  const channelId = config.channels.panel;
  if (!channelId) {
    console.warn("CHANNEL_PANEL 미설정 — 패널 자동 게시 생략");
    return;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error("CHANNEL_PANEL 채널을 찾을 수 없습니다:", channelId);
    return;
  }
  const mid = config.panelMessageId;
  if (mid) {
    try {
      const msg = await channel.messages.fetch(mid);
      setPanelMessage(msg);
      await refreshPanel();
      console.log("패널 메시지 갱신 준비 (PANEL_MESSAGE_ID)");
      return;
    } catch {
      console.warn("PANEL_MESSAGE_ID 무효 — 새 패널 전송");
    }
  }
  const msg = await sendPanel(channel);
  persistPanelMessageId(msg.id);
  console.log("패널 게시 완료");
}

function startPanelRefresh(intervalMs = 60_000) {
  return setInterval(() => {
    refreshPanel().catch(() => {
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
  initPanel,
  startPanelRefresh,
  setPanelMessage,
  get currentRate() {
    return currentRate;
  },
};