const { Client, Events, GatewayIntentBits } = require("discord.js");
const config = require("./config");
const { registerCommands } = require("./commands/register");
const { handleSlash } = require("./handlers/slash");
const {
  handleButton,
  handleSelect,
  handleModal,
} = require("./handlers/components");
const panel = require("./ui/panel");

if (!config.token) {
  console.error("DISCORD_TOKEN이 .env에 없습니다.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`${c.user.tag} 준비 완료`);
  try {
    await registerCommands(c);
    console.log("슬래시 커맨드 등록 완료");
  } catch (e) {
    console.error("커맨드 등록 실패:", e.message);
  }
  panel.startPanelRefresh();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlash(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, client);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction, client);
    }
  } catch (err) {
    console.error("interaction error:", err);
    const payload = require("./ui/v2").buildV2Payload({
      lines: ["처리 중 오류가 발생했습니다."],
    });
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction
        .reply({ ...payload, ephemeral: true })
        .catch(() => {});
    }
  }
});

client.login(config.token);