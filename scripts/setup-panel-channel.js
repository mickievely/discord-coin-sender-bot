/**
 * 테스트 길드에 대행 패널 채널 생성 후 test/.env 의 CHANNEL_PANEL 갱신
 * node scripts/setup-panel-channel.js
 */
const fs = require("node:fs");
const path = require("node:path");
require("../src/loadEnv");
const { REST, Routes, ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../src/config");

const CATEGORY_NAME = "코인대행";
const PANEL_CHANNEL_NAME = "대행패널";
const testEnvPath = path.join(__dirname, "..", "test", ".env");

async function main() {
  const token = config.token;
  const guildId = config.guildId;
  if (!token || !guildId) {
    console.error("DISCORD_TOKEN, GUILD_ID 필요");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const channels = await rest.get(Routes.guildChannels(guildId));

  let category = channels.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME
  );

  if (!category) {
    category = await rest.post(Routes.guildChannels(guildId), {
      body: {
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
      },
    });
    console.log("카테고리 생성:", category.name, category.id);
  } else {
    console.log("카테고리 있음:", category.id);
  }

  let panel = channels.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.parent_id === category.id &&
      c.name === PANEL_CHANNEL_NAME
  );

  if (!panel) {
    panel = await rest.post(Routes.guildChannels(guildId), {
      body: {
        name: PANEL_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent_id: category.id,
        topic: "자동 재고·김프 패널 (봇만 편집)",
        permission_overwrites: [],
      },
    });
    console.log("패널 채널 생성:", panel.name, panel.id);
  } else {
    console.log("패널 채널 있음:", panel.id);
    await rest.patch(Routes.channel(panel.id), {
      body: { permission_overwrites: [] },
    });
    console.log("패널 채널 권한 초기화 (봇 전송 가능)");
  }

  if (!fs.existsSync(testEnvPath)) {
    console.log("CHANNEL_PANEL=", panel.id);
    return;
  }

  let text = fs.readFileSync(testEnvPath, "utf8");
  if (/^CHANNEL_PANEL=.*/m.test(text)) {
    text = text.replace(/^CHANNEL_PANEL=.*/m, `CHANNEL_PANEL=${panel.id}`);
  } else {
    text += `\nCHANNEL_PANEL=${panel.id}\n`;
  }
  fs.writeFileSync(testEnvPath, text, "utf8");
  console.log("test/.env CHANNEL_PANEL 갱신 완료:", panel.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});