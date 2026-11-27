const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const config = require("../config");

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("대행패널")
      .setDescription("대행 Components V2 패널을 채널에 게시"),
    new SlashCommandBuilder()
      .setName("재고새로고침")
      .setDescription("실시간 재고·김프 패널 갱신"),
    new SlashCommandBuilder()
      .setName("수수료변경")
      .setDescription("서비스 수수료율 변경 (예: 5 → 5%)")
      .addNumberOption((o) =>
        o.setName("퍼센트").setDescription("수수료 %").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("강제인증")
      .setDescription("고객 강제 인증")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("고객블랙")
      .setDescription("인증 고객 블랙 처리")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("고객충전")
      .setDescription("인증 고객 충전")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("금액").setDescription("충전 원화 금액").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("충전승인")
      .setDescription("자동충전 승인")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("금액").setDescription("승인 원화 금액").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("충전거절")
      .setDescription("자동충전 거절")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("금액").setDescription("거절 원화 금액").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("사유").setDescription("거절 사유").setRequired(false)
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
      .setName("txid조회")
      .setDescription("TXID 내역 조회")
      .addUserOption((o) =>
        o.setName("유저").setDescription("대상 사용자").setRequired(true)
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
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(appId), { body });
  }
}

module.exports = { registerCommands, buildCommands };