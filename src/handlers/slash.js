const db = require("../db");
const { requireAdmin } = require("../lib/auth");
const { replyV2 } = require("../ui/v2");

async function handleSlash(interaction) {
  const name = interaction.commandName;

  if (name === "강제인증") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const user = interaction.options.getUser("유저");
    db.addVerifiedUser(user.id);
    return replyV2(interaction, {
      lines: [`${user.tag} 강제 인증 완료`],
    });
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

  if (name === "잔액관리") {
    const err = requireAdmin(interaction);
    if (err) return replyV2(interaction, { lines: [err] });
    const amount = interaction.options.getInteger("금액");
    const user = interaction.options.getUser("유저");
    const opt = interaction.options.getString("옵션");

    if (amount <= 0) {
      return replyV2(interaction, { lines: ["금액은 1원 이상이어야 합니다."] });
    }

    if (!db.getVerifiedUser(user.id)) {
      return replyV2(interaction, { lines: ["인증되지 않은 고객입니다."] });
    }

    if (opt === "add") {
      db.addBalance(user.id, amount, "관리자추가");
      const row = db.getVerifiedUser(user.id);
      return replyV2(interaction, {
        lines: [
          `${user.tag} · ₩${amount.toLocaleString("ko-KR")} 추가`,
          `현재 잔액: ₩${(row?.now_amount || 0).toLocaleString("ko-KR")}`,
        ],
      });
    }

    if (!db.subtractBalance(user.id, amount)) {
      return replyV2(interaction, { lines: ["잔액이 부족합니다."] });
    }
    db.addTransactionHistory(user.id, amount, "관리자차감", { coinType: "KRW" });
    const row = db.getVerifiedUser(user.id);
    return replyV2(interaction, {
      lines: [
        `${user.tag} · ₩${amount.toLocaleString("ko-KR")} 제거`,
        `현재 잔액: ₩${(row?.now_amount || 0).toLocaleString("ko-KR")}`,
      ],
    });
  }
}

module.exports = { handleSlash };