const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { resolveButtonEmoji } = require("../emojis/render");
const config = require("../config");
const db = require("../db");
const { NiceApi } = require("../services/niceApi");
const {
  parseRequestResult,
  parseVerifyResult,
  niceGenderDigit,
} = require("../services/niceParse");
const verifySessions = require("../state/verifySessions");
const {
  ackInteractionForEdit,
  buildV2Payload,
  updateV2,
} = require("../ui/v2");
const { TELECOM_SELECT, MVNO_SELECT } = require("./verifyTelecomSelect");

function verifyV2(options) {
  return buildV2Payload({ showFooter: false, ...options });
}

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

/** ephemeral·패널 버튼 응답: followUp 없이 기존 메시지 editReply */
async function editVerifyMessage(interaction, options, extra = {}) {
  const payload = {
    ...(Array.isArray(options)
      ? verifyV2({ lines: options })
      : typeof options === "object" && options !== null && options.lines
        ? verifyV2(options)
        : verifyV2({ lines: [String(options)] })),
    ...extra,
  };
  await ackInteractionForEdit(interaction);
  return interaction.editReply(payload);
}

const CAPTCHA_TTL_SEC = 120;

function isCaptchaExpired(session) {
  const at = session?.captchaExpiresAt;
  if (at == null) return false;
  return Math.floor(Date.now() / 1000) >= at;
}

function clearVerifySession(userId) {
  verifySessions.del(userId);
  try {
    const captchaPath = path.join(CAPTCHA_DIR, `captcha-${userId}.png`);
    if (fs.existsSync(captchaPath)) fs.unlinkSync(captchaPath);
  } catch {
    /* ignore */
  }
}

function captchaExpiredOptions() {
  return {
    lines: [
      "**입력 시간 만료**",
      "보안문자·본인정보 입력 시간이 지났습니다.",
      "아래 **다시 인증**을 눌러 주세요.",
    ],
    buttons: [
      {
        id: "start_verify",
        label: "다시 인증",
        style: ButtonStyle.Primary,
        emojiKey: "start_verify",
      },
    ],
  };
}

async function failCaptchaExpired(interaction) {
  clearVerifySession(interaction.user.id);
  await ackInteractionForEdit(interaction);
  return interaction.editReply({
    ...verifyV2(captchaExpiredOptions()),
    files: [],
  });
}

function buildCaptchaPayload(session) {
  if (isCaptchaExpired(session)) return captchaExpiredOptions();
  const expiresAt =
    session?.captchaExpiresAt ||
    Math.floor(Date.now() / 1000) + CAPTCHA_TTL_SEC;
  return {
    lines: [
      "**SMS 본인확인**",
      "보안문자 확인 → **본인정보 입력**",
      `마감 <t:${expiresAt}:R>`,
    ],
    attachmentGallery: "captcha.png",
    buttons: [
      {
        id: "verify_open_info",
        label: "본인정보 입력",
        style: ButtonStyle.Danger,
        emojiKey: "verify_info",
      },
    ],
  };
}

function captchaAttachmentForUser(userId) {
  const captchaPath = path.join(CAPTCHA_DIR, `captcha-${userId}.png`);
  if (!fs.existsSync(captchaPath)) return null;
  return new AttachmentBuilder(captchaPath, { name: "captcha.png" });
}

async function replyWithCaptcha(interaction, captchaBuffer) {
  const expiresAt = Math.floor(Date.now() / 1000) + CAPTCHA_TTL_SEC;
  const session = verifySessions.get(interaction.user.id);
  if (session) {
    session.captchaExpiresAt = expiresAt;
    session.genderSex = session.genderSex || null;
    verifySessions.set(interaction.user.id, session);
  }
  const file = new AttachmentBuilder(captchaBuffer, { name: "captcha.png" });
  return editVerifyMessage(
    interaction,
    buildCaptchaPayload(session),
    { files: [file] }
  );
}

function buildVerifyInfoModal() {
  const maleEm = resolveButtonEmoji("gender_male");
  const femaleEm = resolveButtonEmoji("gender_female");
  const maleOpt = new StringSelectMenuOptionBuilder()
    .setLabel("남자")
    .setValue("M");
  const femaleOpt = new StringSelectMenuOptionBuilder()
    .setLabel("여자")
    .setValue("F");
  if (maleEm) maleOpt.setEmoji(maleEm);
  if (femaleEm) femaleOpt.setEmoji(femaleEm);

  const modal = new ModalBuilder()
    .setCustomId("verify_info_modal")
    .setTitle("SMS 휴대폰 본인확인");

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("보안문자")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("captcha")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(12)
          .setRequired(true)
      ),
    new LabelBuilder()
      .setLabel("이름")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(true)
      ),
    new LabelBuilder()
      .setLabel("생년월일 (6자리)")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("birth")
          .setPlaceholder("예: 060101")
          .setStyle(TextInputStyle.Short)
          .setMinLength(6)
          .setMaxLength(6)
          .setRequired(true)
      ),
    new LabelBuilder()
      .setLabel("성별")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("gender")
          .setPlaceholder("성별 선택")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(maleOpt, femaleOpt)
      ),
    new LabelBuilder()
      .setLabel("휴대폰번호 (11자리)")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("phone")
          .setStyle(TextInputStyle.Short)
          .setMinLength(10)
          .setMaxLength(11)
          .setRequired(true)
      )
  );

  return modal;
}

async function onStartVerify(interaction) {
  if (db.getVerifiedUser(interaction.user.id)) {
    return editVerifyMessage(interaction, [
      "**이미 본인인증이 완료되었습니다.**",
    ]);
  }
  return editVerifyMessage(interaction, {
    lines: ["**통신사를 선택해 주세요.**"],
    selects: [TELECOM_SELECT],
  });
}

async function onTelecomSelected(interaction, key) {
  if (key === "MVNO") {
    const payload = {
      lines: ["**알뜰폰 통신사 선택**"],
      selects: [MVNO_SELECT],
      showFooter: false,
    };
    if (interaction.isStringSelectMenu()) {
      return updateV2(interaction, payload);
    }
    return editVerifyMessage(interaction, payload);
  }

  const mobileCode = MOBILE_CODE[key];
  if (!mobileCode) {
    return editVerifyMessage(interaction, ["지원하지 않는 통신사입니다."]);
  }

  await editVerifyMessage(interaction, {
    lines: ["**보안문자 요청 중…**", "잠시만 기다려 주세요."],
  });

  const api = new NiceApi();
  const init = await api.Initalize(mobileCode);
  if (!init.success) {
    return editVerifyMessage(interaction, {
      lines: [
        "**초기화 실패**",
        String(init.error || "NICE API 오류"),
        "잠시 후 다시 시도해 주세요.",
      ],
    });
  }

  verifySessions.set(interaction.user.id, {
    api,
    telecom: mobileCode,
    attempts: 0,
    genderSex: null,
    captchaExpiresAt: null,
  });

  ensureCaptchaDir();
  const captchaPath = path.join(CAPTCHA_DIR, `captcha-${interaction.user.id}.png`);
  fs.writeFileSync(captchaPath, init.captchaStream);

  return replyWithCaptcha(interaction, init.captchaStream);
}

async function onOpenInfoModal(interaction) {
  const session = verifySessions.get(interaction.user.id);
  if (!session) {
    return failCaptchaExpired(interaction);
  }
  if (isCaptchaExpired(session)) {
    return failCaptchaExpired(interaction);
  }
  return interaction.showModal(buildVerifyInfoModal());
}

async function onInfoModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const session = verifySessions.get(interaction.user.id);
  if (!session?.api) {
    return interaction.editReply(verifyV2(captchaExpiredOptions()));
  }
  if (isCaptchaExpired(session)) {
    clearVerifySession(interaction.user.id);
    return interaction.editReply(verifyV2(captchaExpiredOptions()));
  }

  const captcha = interaction.fields.getTextInputValue("captcha").trim();
  const name = interaction.fields.getTextInputValue("name").trim();
  const birthRaw = interaction.fields
    .getTextInputValue("birth")
    .replace(/\D/g, "")
    .trim();
  const phone = interaction.fields.getTextInputValue("phone").replace(/\D/g, "");

  if (birthRaw.length !== 6) {
    return interaction.editReply(
      verifyV2({
        lines: ["**입력 오류**", "생년월일은 6자리(YYMMDD)로 입력해 주세요."],
      })
    );
  }

  let genderSex;
  try {
    const picked = interaction.fields.getStringSelectValues("gender");
    genderSex = picked[0] === "F" ? "F" : picked[0] === "M" ? "M" : null;
  } catch {
    genderSex = null;
  }
  if (!genderSex) {
    return interaction.editReply(
      verifyV2({
        lines: ["**입력 오류**", "성별을 선택해 주세요."],
      })
    );
  }
  session.genderSex = genderSex;

  let gender;
  try {
    gender = niceGenderDigit(birthRaw, genderSex);
  } catch (err) {
    return interaction.editReply(
      verifyV2({
        lines: ["**입력 오류**", String(err.message || "생년월일을 확인해 주세요.")],
      })
    );
  }
  const birth = birthRaw;

  await interaction.editReply(
    verifyV2({ lines: ["**정보 확인 중…**"] })
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
      verifyV2({
        lines: ["**오류**", String(req.error || "요청 실패")],
      })
    );
  }

  const parsed = parseRequestResult(req.result);
  if (!parsed.ok) {
    return interaction.editReply(
      verifyV2({
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
    ...verifyV2({
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
    return editVerifyMessage(interaction, ["먼저 본인정보를 입력해 주세요."]);
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
      verifyV2({ lines: ["세션이 만료되었습니다."] })
    );
  }

  const code = interaction.fields.getTextInputValue("verify_code").trim();
  await interaction.editReply(
    verifyV2({ lines: ["**인증코드 확인 중…**"] })
  );

  const v = await session.api.VerifyCode(code);
  if (!v.success) {
    return interaction.editReply(
      verifyV2({ lines: ["**오류**", String(v.error)] })
    );
  }

  const parsed = parseVerifyResult(v.result);
  if (!parsed.ok) {
    session.attempts = (session.attempts || 0) + 1;
    verifySessions.set(interaction.user.id, session);
    if (session.attempts >= 3) {
      verifySessions.del(interaction.user.id);
      return interaction.editReply(
        verifyV2({
          lines: [
            "**인증 실패**",
            parsed.message,
            "시도 횟수 초과. 처음부터 다시 시도해 주세요.",
          ],
        })
      );
    }
    return interaction.editReply(
      verifyV2({
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

  clearVerifySession(interaction.user.id);

  await sendVerifyLog(client, interaction.user.id, [
    `이름: ${session.name}`,
    `휴대폰: ${session.phone}`,
    `생년월일: ${session.birth}`,
    `통신사: ${session.telecom}`,
  ]);

  return interaction.editReply(
    verifyV2({
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
  return false;
}

async function routeVerifySelect(interaction) {
  const id = interaction.customId;
  if (id === "verify_telecom_select" || id === "verify_mvno_select") {
    const key = interaction.values[0];
    await onTelecomSelected(interaction, key);
    return true;
  }
  return false;
}

module.exports = {
  routeVerifyButton,
  routeVerifySelect,
  onInfoModal,
  onCodeModal,
};