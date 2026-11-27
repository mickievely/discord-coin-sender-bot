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

function assertImageUrl(url) {
  const u = url || config.panelImageUrl || config.embedIconUrl;
  if (!u) {
    throw new Error("PANEL_IMAGE_URL 또는 EMBED_ICON_URL이 필요합니다.");
  }
  return u;
}

/**
 * Components V2 메시지 (이미지 1개 + 푸터 필수, 임베드/content 미사용)
 */
function buildV2Payload({
  lines = [],
  imageUrl,
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

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(assertImageUrl(imageUrl))
  );
  container.addMediaGalleryComponents(gallery);

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

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(config.footerText)
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function replyV2(interaction, options) {
  const payload = buildV2Payload(options);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, ephemeral: options.ephemeral ?? true });
}

async function updateV2(interaction, options) {
  return interaction.update(buildV2Payload(options));
}

module.exports = {
  buildV2Payload,
  replyV2,
  updateV2,
};