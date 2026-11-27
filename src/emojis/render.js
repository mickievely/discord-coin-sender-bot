const { logEmoji } = require("./log");
const { registryByKey } = require("./registry");

function resolveButtonEmoji(key) {
  const row = registryByKey().get(key);
  if (!row?.discordId) {
    logEmoji("error", key, "missing_discord_id", {});
    return null;
  }
  return { id: row.discordId, name: row.name };
}

function formatEmojiInText(key) {
  const row = registryByKey().get(key);
  if (!row?.discordId) {
    logEmoji("error", key, "missing_discord_id", {});
    return `[emoji:${key} 없음]`;
  }
  return `<:${row.name}:${row.discordId}>`;
}

module.exports = { resolveButtonEmoji, formatEmojiInText };