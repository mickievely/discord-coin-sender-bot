const fs = require("fs");
const path = require("path");

const PID_FILE = path.join(__dirname, "..", "..", ".local-bot.pid");

function writeLocalPid() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid), "utf8");
  } catch (err) {
    console.warn("local pid 파일 쓰기 실패:", err.message);
  }
}

function clearLocalPid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

function registerLocalPidCleanup() {
  const cleanup = () => clearLocalPid();
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

module.exports = { writeLocalPid, clearLocalPid, registerLocalPidCleanup };