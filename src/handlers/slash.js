const { MessageFlags } = require("discord.js");
const config = require("../config");
const db = require("../db");
const { requireAdmin } = require("../lib/auth");
const { setServiceFeeRate } = require("../services/fees");
const { replyV2, buildV2Payload } = require("../ui/v2");
const panel = require("../ui/panel");

async function handleSlash(interaction) {
  const name = interaction.commandName;

  if (name === "대행패널") {
    const err = requireAdmin(interaction);
    if (err) {
      return replyV2(interaction, { lines: [`**접근 거부**\n${err}`] });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msg = await panel.sendPanel(interaction.channel);
    panel.setPanelMessage(msg);
    await interaction.editReply(
      buildV2Payload({
        lines: [
          `**완료**`,
          `${interaction.user.displayName}님이 대행 패널을 게시했습니다.`,
        ],
      })
    );
    return;
  }

  if (name === "재고새로고침") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    await panel.refreshPanel(true);
    return replyV2(interaction, { lines: ["패널을 새로고침했습니다."] });
  }

  if (name === "수수료변경") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const pct = interaction.options.getNumber("퍼센트");
    if (!setServiceFeeRate(pct / 100)) {
      return replyV2(interaction, {
        lines: ["허용 범위를 벗어났습니다 (0~50%)."],
      });
    }
    return replyV2(interaction, {
      lines: [`수수료율이 ${pct.toFixed(2)}%로 변경되었습니다.`],
    });
  }

  if (name === "강제인증") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    db.addVerifiedUser(user.id);
    return replyV2(interaction, {
      lines: [`${user.tag} 강제 인증 완료`],
    });
  }

  if (name === "고객블랙") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    const existed = db.getVerifiedUser(user.id);
    if (existed) db.removeVerifiedUser(user.id);
    return replyV2(interaction, {
      lines: [
        existed
          ? `${user.tag} 블랙 처리되었습니다.`
          : `${user.tag} 인증 이력이 없습니다.`,
      ],
    });
  }

  if (name === "고객충전" || name === "충전승인") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("금액");
    if (!db.getVerifiedUser(user.id)) {
      return replyV2(interaction, { lines: ["인증되지 않은 고객입니다."] });
    }
    db.addBalance(user.id, amount);
    return replyV2(interaction, {
      lines: [`${user.tag} · ₩${amount.toLocaleString("ko-KR")} 충전 완료`],
    });
  }

  if (name === "충전거절") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("금액");
    const reason = interaction.options.getString("사유") || "사유 없음";
    try {
      await user.send({
        ...buildV2Payload({
          lines: [
            "**충전 거절**",
            `₩${amount.toLocaleString("ko-KR")}`,
            `사유: ${reason}`,
          ],
        }),
      });
    } catch {
      /* DM 차단 */
    }
    return replyV2(interaction, { lines: ["거절 알림을 처리했습니다."] });
  }

  if (name === "정보조회") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    const row = db.getVerifiedUser(user.id);
    if (!row) {
      return replyV2(interaction, { lines: [`${user.tag} 인증 정보 없음`] });
    }
    return replyV2(interaction, {
      lines: [
        `**${user.tag}**`,
        `이름: ${row.name || "-"}`,
        `잔액: ₩${(row.now_amount || 0).toLocaleString("ko-KR")}`,
        `누적: ₩${(row.Total_amount || 0).toLocaleString("ko-KR")}`,
      ],
    });
  }

  if (name === "인증해체") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    db.removeVerifiedUser(user.id);
    return replyV2(interaction, { lines: [`${user.tag} 인증 해제`] });
  }

  if (name === "txid조회") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    const txs = db.getTransactionHistory(user.id, 30);
    const lines = txs
      .filter((t) => t.txid)
      .slice(0, 15)
      .map(
        (t) =>
          `${t.type} ₩${t.amount.toLocaleString("ko-KR")} · ${t.coin_type || ""}\n\`${t.txid}\``
      );
    return replyV2(interaction, {
      lines: lines.length ? lines : ["TXID 내역 없음"],
    });
  }
}

module.exports = { handleSlash };