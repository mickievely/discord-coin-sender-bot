const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const config = require("../config");

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("강제인증")
      .setDescription("고객 강제 인증")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("정보조회")
      .setDescription("인증 정보 조회")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("인증해체")
      .setDescription("인증 해제")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("잔액관리")
      .setDescription("고객 잔액 추가 또는 차감")
      .addIntegerOption((o) =>
        o.setName("금액").setDescription("원화 금액").setRequired(true)
      )
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("옵션")
          .setDescription("추가 또는 제거")
          .setRequired(true)
          .addChoices(
            { name: "추가", value: "add" },
            { name: "제거", value: "remove" }
          )
      ),
  ].map((c) => c.toJSON());
}

async function registerCommands(client) {
  if (!config.token) return;
  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = buildCommands();
  const appId = String(
    process.env.CLIENT_ID || client.application?.id || client.user.id
  );
  const guildId = config.guildId ? String(config.guildId) : null;

  /** 예전 글로벌 커맨드(대행패널·재고새로고침 등) 일괄 제거 */
  await rest.put(Routes.applicationCommands(appId), { body: [] });

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
    console.log(
      `슬래시 커맨드 (길드): ${body.map((c) => c.name).join(", ") || "없음"}`
    );
  } else {
    await rest.put(Routes.applicationCommands(appId), { body });
    console.log(
      `슬래시 커맨드 (글로벌): ${body.map((c) => c.name).join(", ") || "없음"}`
    );
  }
}

module.exports = { registerCommands, buildCommands };