const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const config = require("../config");
const db = require("../db");
const { NiceApi } = require("../services/niceApi");
const { parseRequestResult, parseVerifyResult } = require("../services/niceParse");
const verifySessions = require("../state/verifySessions");
const { buildV2Payload } = require("../ui/v2");

const MOBILE_CODE = {
  SKT: "SK",
  KT: "KT",
  LG: "LG",
  SKM: "SM",
  KTM: "KM",
  LGM: "LM",
};

const CAPTCHA_DIR = path.join(process.cwd(), "captcha");

function ensureCaptchaDir() {
  if (!fs.existsSync(CAPTCHA_DIR)) fs.mkdirSync(CAPTCHA_DIR, { recursive: true });
}

async function replyWithCaptcha(interaction, lines, captchaBuffer) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  const file = new AttachmentBuilder(captchaBuffer, { name: "captcha.png" });
  return interaction.editReply({
    ...buildV2Payload({
      lines,
      buttons: [
        {
          id: "verify_open_info",
          label: "본인정보 입력",
          style: ButtonStyle.Danger,
          emojiKey: "verify_info",
        },
      ],
    }),
    files: [file],
  });
}

async function onStartVerify(interaction) {
  if (db.getVerifiedUser(interaction.user.id)) {
    return ephemeralLines(interaction, [
      "**이미 본인인증이 완료되었습니다.**",
    ]);
  }
  return ephemeralLines(interaction, {
    lines: ["**통신사를 선택해 주세요.**"],
    buttons: [
      { id: "verify_telecom_SKT", label: "SKT", style: ButtonStyle.Danger },
      { id: "verify_telecom_KT", label: "KT", style: ButtonStyle.Danger },
      { id: "verify_telecom_LG", label: "LG U+", style: ButtonStyle.Danger },
      { id: "verify_telecom_MVNO", label: "알뜰폰", style: ButtonStyle.Secondary },
    ],
  });
}

async function ephemeralLines(interaction, options) {
  const payload = Array.isArray(options)
    ? buildV2Payload({ lines: options })
    : typeof options === "object" && options.lines
      ? buildV2Payload(options)
      : buildV2Payload({ lines: [String(options)] });
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  return interaction.editReply(payload);
}

async function onTelecomButton(interaction, key) {
  if (key === "MVNO") {
    return ephemeralLines(interaction, {
      lines: ["**알뜰폰 통신사 선택**"],
      buttons: [
        { id: "verify_telecom_SKM", label: "SKT 알뜰" },
        { id: "verify_telecom_KTM", label: "KT 알뜰" },
        { id: "verify_telecom_LGM", label: "LG 알뜰" },
      ],
    });
  }

  const mobileCode = MOBILE_CODE[key];
  if (!mobileCode) {
    return ephemeralLines(interaction, ["지원하지 않는 통신사입니다."]);
  }

  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply(
    buildV2Payload({
      lines: ["**보안문자 요청 중…**", "잠시만 기다려 주세요."],
    })
  );

  const api = new NiceApi();
  const init = await api.Initalize(mobileCode);
  if (!init.success) {
    return interaction.editReply(
      buildV2Payload({
        lines: [
          "**초기화 실패**",
          String(init.error || "NICE API 오류"),
          "잠시 후 다시 시도해 주세요.",
        ],
      })
    );
  }

  verifySessions.set(interaction.user.id, {
    api,
    telecom: mobileCode,
    attempts: 0,
  });

  ensureCaptchaDir();
  const captchaPath = path.join(CAPTCHA_DIR, `captcha-${interaction.user.id}.png`);
  fs.writeFileSync(captchaPath, init.captchaStream);

  return replyWithCaptcha(
    interaction,
    [
      "**휴대폰 본인확인 (SMS)**",
      "이미지의 보안문자 숫자를 확인한 뒤 **본인정보 입력**을 눌러 주세요.",
      "입력 시간: 2분 이내",
    ],
    init.captchaStream
  );
}

async function onOpenInfoModal(interaction) {
  const session = verifySessions.get(interaction.user.id);
  if (!session) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply(
      buildV2Payload({ lines: ["세션이 만료되었습니다. 처음부터 다시 시도해 주세요."] })
    );
  }
  const modal = new ModalBuilder()
    .setCustomId("verify_info_modal")
    .setTitle("SMS 휴대폰 본인확인");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("captcha")
        .setLabel("캡차 (이미지 숫자)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(12)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("name")
        .setLabel("이름")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(40)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("birth")
        .setLabel("생년월일/성별 (7자리)")
        .setPlaceholder("예: 0601013")
        .setStyle(TextInputStyle.Short)
        .setMinLength(7)
        .setMaxLength(7)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("phone")
        .setLabel("휴대폰번호 (11자리)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(10)
        .setMaxLength(11)
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function onInfoModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const session = verifySessions.get(interaction.user.id);
  if (!session?.api) {
    return interaction.editReply(
      buildV2Payload({ lines: ["세션이 만료되었습니다."] })
    );
  }

  const captcha = interaction.fields.getTextInputValue("captcha").trim();
  const name = interaction.fields.getTextInputValue("name").trim();
  const birthRaw = interaction.fields.getTextInputValue("birth").trim();
  const phone = interaction.fields.getTextInputValue("phone").replace(/\D/g, "");

  const birth = birthRaw.slice(0, 6);
  const gender = birthRaw.slice(6, 7);

  await interaction.editReply(
    buildV2Payload({ lines: ["**정보 확인 중…**"] })
  );

  const req = await session.api.RequestCode(
    name,
    birth,
    gender,
    phone,
    captcha
  );

  if (!req.success) {
    return interaction.editReply(
      buildV2Payload({
        lines: ["**오류**", String(req.error || "요청 실패")],
      })
    );
  }

  const parsed = parseRequestResult(req.result);
  if (!parsed.ok) {
    return interaction.editReply(
      buildV2Payload({
        lines: ["**본인 확인 실패**", parsed.message],
      })
    );
  }

  session.name = name;
  session.birth = birth;
  session.gender = gender;
  session.phone = phone;
  verifySessions.set(interaction.user.id, session);

  return interaction.editReply({
    ...buildV2Payload({
      lines: [
        "**SMS 인증번호가 발송되었습니다.**",
        "문자 6자리를 입력해 주세요.",
      ],
      buttons: [
        {
          id: "verify_open_code",
          label: "인증번호 입력",
          style: ButtonStyle.Primary,
        },
      ],
    }),
  });
}

async function onOpenCodeModal(interaction) {
  const session = verifySessions.get(interaction.user.id);
  if (!session?.phone) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply(
      buildV2Payload({ lines: ["먼저 본인정보를 입력해 주세요."] })
    );
  }
  const modal = new ModalBuilder()
    .setCustomId("verify_code_modal")
    .setTitle("인증번호 입력");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("verify_code")
        .setLabel("인증번호 6자리")
        .setStyle(TextInputStyle.Short)
        .setMinLength(6)
        .setMaxLength(6)
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

async function sendVerifyLog(client, userId, fields) {
  const chId = config.channels.verify;
  if (!chId) return;
  const ch = await client.channels.fetch(String(chId)).catch(() => null);
  if (!ch?.isTextBased()) return;
  await ch.send(
    buildV2Payload({
      lines: [
        "**PASS 인증 완료**",
        `사용자: <@${userId}> (${userId})`,
        ...fields,
      ],
    })
  );
}

async function onCodeModal(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const session = verifySessions.get(interaction.user.id);
  if (!session?.api) {
    return interaction.editReply(
      buildV2Payload({ lines: ["세션이 만료되었습니다."] })
    );
  }

  const code = interaction.fields.getTextInputValue("verify_code").trim();
  await interaction.editReply(
    buildV2Payload({ lines: ["**인증코드 확인 중…**"] })
  );

  const v = await session.api.VerifyCode(code);
  if (!v.success) {
    return interaction.editReply(
      buildV2Payload({ lines: ["**오류**", String(v.error)] })
    );
  }

  const parsed = parseVerifyResult(v.result);
  if (!parsed.ok) {
    session.attempts = (session.attempts || 0) + 1;
    verifySessions.set(interaction.user.id, session);
    if (session.attempts >= 3) {
      verifySessions.del(interaction.user.id);
      return interaction.editReply(
        buildV2Payload({
          lines: [
            "**인증 실패**",
            parsed.message,
            "시도 횟수 초과. 처음부터 다시 시도해 주세요.",
          ],
        })
      );
    }
    return interaction.editReply(
      buildV2Payload({
        lines: [parsed.message, "다시 입력해 주세요."],
        buttons: [
          {
            id: "verify_open_code",
            label: "인증번호 입력",
            style: ButtonStyle.Primary,
          },
        ],
      })
    );
  }

  const dob = `${session.birth}${session.gender}`;
  db.addVerifiedUser(
    interaction.user.id,
    session.phone,
    dob,
    session.name,
    session.telecom
  );
  verifySessions.del(interaction.user.id);

  try {
    const captchaPath = path.join(
      CAPTCHA_DIR,
      `captcha-${interaction.user.id}.png`
    );
    if (fs.existsSync(captchaPath)) fs.unlinkSync(captchaPath);
  } catch {
    /* ignore */
  }

  await sendVerifyLog(client, interaction.user.id, [
    `이름: ${session.name}`,
    `휴대폰: ${session.phone}`,
    `생년월일: ${session.birth}`,
    `통신사: ${session.telecom}`,
  ]);

  return interaction.editReply(
    buildV2Payload({
      lines: [
        `**${session.name}** 고객님, 본인인증이 완료되었습니다.`,
        "이제 대행 서비스를 이용할 수 있습니다.",
      ],
    })
  );
}

async function routeVerifyButton(interaction, id) {
  if (id === "start_verify") return onStartVerify(interaction);
  if (id === "verify_open_info") return onOpenInfoModal(interaction);
  if (id === "verify_open_code") return onOpenCodeModal(interaction);
  if (id.startsWith("verify_telecom_")) {
    const key = id.replace("verify_telecom_", "");
    return onTelecomButton(interaction, key);
  }
  return false;
}

module.exports = {
  routeVerifyButton,
  onInfoModal,
  onCodeModal,
};