const config = require("../config");
const db = require("../db");

function isAllowed(userId) {
  if (!config.allowedUserIds.length) return true;
  return config.allowedUserIds.some((id) => id === BigInt(userId));
}

function isAdmin(userId) {
  return db.checkAdmin(
    userId,
    config.defaultAdminId,
    config.allowedUserIds
  );
}

function requireAdmin(interaction) {
  if (!isAllowed(interaction.user.id)) {
    return "이 명령어는 허용된 사용자만 사용할 수 있습니다.";
  }
  if (!isAdmin(interaction.user.id)) {
    return "권한이 없습니다.";
  }
  return null;
}

module.exports = { isAllowed, isAdmin, requireAdmin };