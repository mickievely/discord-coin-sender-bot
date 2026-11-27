const fs = require("node:fs");
const path = require("node:path");
const { root, testEnvPath } = require("../loadEnv");

function envWritePath() {
  if (process.env.ENV_FILE && fs.existsSync(process.env.ENV_FILE)) {
    return process.env.ENV_FILE;
  }
  if (fs.existsSync(testEnvPath)) return testEnvPath;
  return path.join(root, ".env");
}

function setEnvInFile(key, value) {
  const filePath = envWritePath();
  if (!fs.existsSync(filePath)) return false;

  const id = String(value);
  let text = fs.readFileSync(filePath, "utf8");
  const line = `${key}=${id}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(filePath, text, "utf8");
  process.env[key] = id;
  return filePath;
}

function persistPanelMessageId(messageId) {
  const filePath = setEnvInFile("PANEL_MESSAGE_ID", messageId);
  if (filePath) {
    console.log(`PANEL_MESSAGE_ID 자동 저장 (${path.basename(filePath)}):`, messageId);
  }
  return filePath;
}

module.exports = { envWritePath, setEnvInFile, persistPanelMessageId };