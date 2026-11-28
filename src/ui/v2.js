const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const config = require("../config");
const { resolveButtonEmoji } = require("../emojis/render");
const {
  getPanelBannerAttachmentSync,
  getEmbedIconAttachmentSync,
  readLocalImageAttachment,
} = require("./panelBanner");

/** 버튼/셀렉트가 달린 메시지가 ephemeral인지 */
function isEphemeralComponentMessage(interaction) {
  if (!interaction.isMessageComponent?.()) return false;
  const msg = interaction.message;
  if (!msg?.flags) return false;
  return msg.flags.has(MessageFlags.Ephemeral);
}

/** Discord 3초 제한: editReply 전에 즉시 defer */
async function ackInteractionForEdit(interaction) {
  if (interaction.deferred || interaction.replied) return;
  if (isEphemeralComponentMessage(interaction)) {
    await interaction.deferUpdate();
    return;
  }
  if (interaction.isMessageComponent?.()) {
    await interaction.deferReply({ ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
}

function resolveUrlOrLocalFile(envValue) {
  const v = (envValue || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    return { imageUrl: v, files: undefined };
  }
  const local = readLocalImageAttachment(v);
  if (local) {
    return { imageUrl: local.url, files: [local.attachment] };
  }
  return null;
}

function resolvePanelImage(url) {
  if (url) return { imageUrl: url, files: undefined };

  const banner = getPanelBannerAttachmentSync();
  if (banner) {
    return { imageUrl: banner.url, files: [banner.attachment] };
  }

  const fromPanel =
    resolveUrlOrLocalFile(process.env.PANEL_IMAGE_URL) ||
    resolveUrlOrLocalFile(config.panelImageUrl);
  if (fromPanel) return fromPanel;

  const fromIcon =
    resolveUrlOrLocalFile(process.env.EMBED_ICON_URL) ||
    resolveUrlOrLocalFile(config.embedIconUrl);
  if (fromIcon) return fromIcon;

  const icon = getEmbedIconAttachmentSync();
  if (icon) {
    return { imageUrl: icon.url, files: [icon.attachment] };
  }

  throw new Error(
    "패널 이미지 없음 — 봇 기동 시 브랜드 이미지 생성이 실패했거나 PANEL_IMAGE_URL / EMBED_ICON_URL을 확인하세요."
  );
}

/**
 * Components V2 메시지 (이미지 1개 + 푸터 필수, 임베드/content 미사용)
 */
function buildV2Payload({
  lines = [],
  imageUrl,
  /** 패널만 true — 버튼/슬래시 ephemeral 응답에는 이미지 없음 */
  showImage = false,
  /** editReply files[].name 과 짝 (예: captcha.png) */
  attachmentGallery,
  /** 패널·일반 UI는 true, 본인인증 등에서는 false */
  showFooter = true,
  accentColor = 0xffff00,
  buttons = [],
  selects = [],
}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);

  for (const line of lines) {
    const content = String(line ?? "").slice(0, 4000);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content || "\u200b")
    );
  }

  let resolved = null;
  if (showImage) {
    resolved = resolvePanelImage(imageUrl);
    const gallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(resolved.imageUrl)
    );
    container.addMediaGalleryComponents(gallery);
  } else if (attachmentGallery) {
    const name = String(attachmentGallery).replace(/^attachment:\/\//, "");
    const gallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${name}`)
    );
    container.addMediaGalleryComponents(gallery);
  }

  if (buttons.length) {
    const row = new ActionRowBuilder();
    for (const b of buttons.slice(0, 5)) {
      const btn = new ButtonBuilder()
        .setCustomId(b.id)
        .setLabel(b.label)
        .setStyle(b.style ?? ButtonStyle.Secondary)
        .setDisabled(Boolean(b.disabled));
      const em =
        b.emojiKey != null ? resolveButtonEmoji(b.emojiKey) : null;
      if (em) btn.setEmoji(em);
      row.addComponents(btn);
    }
    container.addActionRowComponents(row);
  }

  for (const sel of selects) {
    const options = sel.options.map((o) => {
      if (!o.emojiKey) return o;
      const em = resolveButtonEmoji(o.emojiKey);
      return em ? { ...o, emoji: em } : o;
    });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(sel.id)
      .setPlaceholder(sel.placeholder || "선택")
      .addOptions(options);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(menu)
    );
  }

  if (showFooter) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(config.footerText)
    );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
  if (resolved?.files?.length) payload.files = resolved.files;
  return payload;
}

async function replyV2(interaction, options) {
  const payload = buildV2Payload(options);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, ephemeral: options.ephemeral ?? true });
}

async function updateV2(interaction, options) {
  const payload = buildV2Payload(options);
  if (isEphemeralComponentMessage(interaction)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    return interaction.editReply(payload);
  }
  return interaction.update(payload);
}

module.exports = {
  buildV2Payload,
  replyV2,
  updateV2,
  isEphemeralComponentMessage,
  ackInteractionForEdit,
};