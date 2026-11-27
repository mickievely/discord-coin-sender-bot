function logEmoji(level, key, reason, extra = {}) {
  const msg = `[emojis] key=${key} reason=${reason}`;
  const detail = { key, reason, ...extra };
  if (level === "error") console.error(msg, detail);
  else if (level === "warn") console.warn(msg, detail);
  else console.log(msg, detail);
}

module.exports = { logEmoji };