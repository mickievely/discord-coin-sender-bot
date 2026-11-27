/**
 * 길드에 로그 채널·카테고리가 없으면 생성하고 test/.env 에 ID 반영
 */
const fs = require("node:fs");
const path = require("node:path");
require("../src/loadEnv");
const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");

const LOG_CHANNELS = [
  { key: "CHANNEL_PURCHASE_LOG", name: "구매-로그", topic: "대행 이용 공지" },
  { key: "CHANNEL_TRANSFER_LOG", name: "송금-로그", topic: "TXID 송금 로그" },
  { key: "CHANNEL_VERIFY_LOG", name: "인증-로그", topic: "PASS 인증 로그" },
  { key: "CHANNEL_CHARGE_LOG", name: "충전-로그", topic: "충전 요청/승인" },
  { key: "CHANNEL_ADMIN_LOG", name: "관리-로그", topic: "운영 로그" },
];

const CATEGORY_NAME = "코인대행-로그";

function parseEnvFile(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    map.set(t.slice(0, eq).trim(), t.slice(eq + 1));
  }
  return map;
}

function serializeEnv(map, comments = []) {
  const lines = [...comments, ""];
  const order = [
    "# test/.env — 루트 .env 보다 우선 (gitignore)",
    "# Discord",
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "GUILD_ID",
    "",
    "# 관리자",
    "DEFAULT_ADMIN_ID",
    "ALLOWED_USER_IDS",
    "",
    "# 표시",
    "SERVICE_DISPLAY_NAME",
    "PANEL_IMAGE_URL",
    "EMBED_ICON_URL",
    "",
    "# 수수료",
    "SERVICE_FEE_RATE",
    "",
    "# MEXC",
    "MEXC_API_KEY",
    "MEXC_SECRET_KEY",
    "",
    "# 입금",
    "DEPOSIT_BANK_NAME",
    "DEPOSIT_ACCOUNT_NO",
    "DEPOSIT_ACCOUNT_HOLDER",
    "",
    "# 로그 채널",
    ...LOG_CHANNELS.map((c) => c.key),
    "",
    "# 매입 주소 JSON",
    "COIN_ADDRESSES",
  ];
  const seen = new Set();
  for (const item of order) {
    if (!item) {
      lines.push("");
      continue;
    }
    if (item.startsWith("#")) {
      lines.push(item);
      continue;
    }
    if (map.has(item)) {
      lines.push(`${item}=${map.get(item)}`);
      seen.add(item);
    } else if (
      [
        "SERVICE_DISPLAY_NAME",
        "SERVICE_FEE_RATE",
        "COIN_ADDRESSES",
      ].includes(item)
    ) {
      if (item === "SERVICE_DISPLAY_NAME") lines.push(`${item}=코인대행`);
      if (item === "SERVICE_FEE_RATE") lines.push(`${item}=5`);
      if (item === "COIN_ADDRESSES")
        lines.push(`${item}={"TRX":"","LTC":"","BNB":""}`);
      seen.add(item);
    }
  }
  for (const [k, v] of map) {
    if (!seen.has(k)) lines.push(`${k}=${v}`);
  }
  return lines.join("\n").trimEnd() + "\n";
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;
  if (!token || !guildId) {
    console.error("DISCORD_TOKEN, GUILD_ID 필요 (test/.env)");
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME
  );
  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "코인대행 봇 로그 카테고리",
    });
    console.log("카테고리 생성:", category.id);
  }

  const envPath = path.join(process.cwd(), "test", ".env");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const envMap = parseEnvFile(envPath);
  const rootMap = parseEnvFile(path.join(process.cwd(), ".env"));
  for (const [k, v] of rootMap) {
    if (!envMap.has(k) || !envMap.get(k)) envMap.set(k, v);
  }
  if (!envMap.get("DISCORD_TOKEN")) envMap.set("DISCORD_TOKEN", token);
  if (!envMap.get("GUILD_ID")) envMap.set("GUILD_ID", guildId);

  if (!envMap.get("DEFAULT_ADMIN_ID")) {
    const ownerId = guild.ownerId || (await guild.fetchOwner()).id;
    envMap.set("DEFAULT_ADMIN_ID", ownerId);
    if (!envMap.get("ALLOWED_USER_IDS")) {
      envMap.set("ALLOWED_USER_IDS", ownerId);
    }
  }

  if (!envMap.get("PANEL_IMAGE_URL")) {
    envMap.set(
      "PANEL_IMAGE_URL",
      guild.iconURL({ size: 256, extension: "png" }) ||
        "https://cdn.discordapp.com/embed/avatars/0.png"
    );
  }

  const ids = {};
  for (const spec of LOG_CHANNELS) {
    let ch = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.name === spec.name &&
        c.parentId === category.id
    );
    if (!ch) {
      ch = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: spec.topic,
        reason: "코인대행 봇 로그",
      });
      console.log("채널 생성:", spec.name, ch.id);
    } else {
      console.log("채널 존재:", spec.name, ch.id);
    }
    ids[spec.key] = ch.id;
    envMap.set(spec.key, ch.id);
  }

  fs.writeFileSync(envPath, serializeEnv(envMap), "utf8");
  console.log("test/.env 업데이트 완료");
  console.log(JSON.stringify(ids, null, 2));

  await client.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});