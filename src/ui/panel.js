const { ActivityType, ButtonStyle } = require("discord.js");
const config = require("../config");
const exchange = require("../services/exchange");
const inventory = require("../services/inventory");
const { buildV2Payload } = require("./v2");
const { persistPanelMessageId } = require("../lib/envFile");

let panelMessage = null;
let currentRate = 1350;
let currentKimchi = 0;
let lastTotalKrw = 0;

/** Discord 상대 시각 (예: 3분 전) */
function refreshTimestamp() {
  const unix = Math.floor(Date.now() / 1000);
  return `<t:${unix}:R>`;
}

async function loadMarketRates() {
  let usdKrw = currentRate;
  let kimchi = currentKimchi;
  try {
    usdKrw = await exchange.getExchangeRate();
    kimchi = await exchange.getKimchiPremium();
  } catch (e) {
    console.error("환율/김프 조회 실패:", e.message);
  }
  currentRate = usdKrw;
  currentKimchi = kimchi;
  return { usdKrw, kimchi };
}

async function buildPanelPayload(refreshLabel) {
  const { usdKrw, kimchi } = await loadMarketRates();
  const stock = await inventory.getStockSummary(usdKrw, kimchi);
  lastTotalKrw = stock.totalKrw;

  const fee = (config.serviceFeeRate * 100).toFixed(1);
  const kimchiStr = `${kimchi >= 0 ? "+" : ""}${kimchi.toFixed(2)}%`;

  return buildV2Payload({
    showImage: true,
    lines: [
      `# ${config.serviceDisplayName}`,
      "",
      `### 실시간 재고 (₩) · ${stock.oneLine}`,
      `김치프리미엄 \`${kimchiStr}\``,
      `수수료(서비스) \`${fee}%\``,
      `갱신 ${refreshLabel}`,
    ],
    buttons: [
      { id: "svc_use", label: "구매", emojiKey: "svc_use" },
      { id: "svc_charge", label: "충전", emojiKey: "svc_charge" },
      { id: "svc_info", label: "정보", emojiKey: "svc_info" },
      { id: "svc_minimum", label: "최소", emojiKey: "svc_minimum" },
      {
        id: "svc_purchase",
        label: "매입",
        style: ButtonStyle.Success,
        emojiKey: "svc_purchase",
      },
    ],
  });
}

async function sendPanel(channel) {
  const payload = await buildPanelPayload(refreshTimestamp());
  const msg = await channel.send(payload);
  panelMessage = msg;
  return msg;
}

async function refreshPanel() {
  if (!panelMessage) return;
  const payload = await buildPanelPayload(refreshTimestamp());
  await panelMessage.edit(payload);
}

async function updateBotPresence(client) {
  if (!client?.user) return;
  const rate = Math.round(currentRate);
  const total = inventory.formatKrw(lastTotalKrw);
  try {
    await client.user.setPresence({
      activities: [
        {
          name: `실시간 재고 ${total} · 환율 ₩${rate.toLocaleString("ko-KR")}`,
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    });
  } catch (e) {
    console.error("프레즌스 갱신 실패:", e.message);
  }
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
      await updateBotPresence(client);
      console.log("패널 메시지 갱신 준비 (PANEL_MESSAGE_ID)");
      return;
    } catch {
      console.warn("PANEL_MESSAGE_ID 무효 — 새 패널 전송");
    }
  }
  const msg = await sendPanel(channel);
  persistPanelMessageId(msg.id);
  await updateBotPresence(client);
  console.log("패널 게시 완료");
}

function startPanelRefresh(client, intervalMs = 60_000) {
  return setInterval(() => {
    refreshPanel()
      .then(() => updateBotPresence(client))
      .catch(() => {
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
  updateBotPresence,
  get currentRate() {
    return currentRate;
  },
  get currentKimchi() {
    return currentKimchi;
  },
};