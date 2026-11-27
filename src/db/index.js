const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_DIR = path.join(process.cwd(), "DB");
const VERIFY_DB = path.join(DB_DIR, "verify_user.db");
const HISTORY_DB = path.join(DB_DIR, "history.db");

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function openDb(file) {
  return new DatabaseSync(file);
}

function initSchema() {
  ensureDir();

  const verify = openDb(VERIFY_DB);
  verify.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      phone TEXT,
      DOB TEXT,
      name TEXT,
      telecom TEXT,
      Total_amount INTEGER DEFAULT 0,
      now_amount INTEGER DEFAULT 0
    );
  `);
  verify.close();

  const history = openDb(HISTORY_DB);
  history.exec(`
    CREATE TABLE IF NOT EXISTS transaction_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount INTEGER,
      type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      txid TEXT,
      coin_type TEXT,
      address TEXT,
      fee INTEGER DEFAULT 0
    );
  `);
  history.close();
}

initSchema();

function getVerifyDb() {
  return openDb(VERIFY_DB);
}

function getHistoryDb() {
  return openDb(HISTORY_DB);
}

function getVerifiedUser(userId) {
  const db = getVerifyDb();
  const row = db
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .get(Number(userId));
  db.close();
  return row || null;
}

function addVerifiedUser(userId, phone = "", dob = "", name = "", telecom = "") {
  const db = getVerifyDb();
  db.prepare(
    `INSERT OR REPLACE INTO users (user_id, phone, DOB, name, telecom, Total_amount, now_amount)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT Total_amount FROM users WHERE user_id = ?), 0),
             COALESCE((SELECT now_amount FROM users WHERE user_id = ?), 0))`
  ).run(
    Number(userId),
    phone,
    dob,
    name,
    telecom,
    Number(userId),
    Number(userId)
  );
  db.close();
}

function removeVerifiedUser(userId) {
  const db = getVerifyDb();
  db.prepare("DELETE FROM users WHERE user_id = ?").run(Number(userId));
  db.close();
}

function addBalance(userId, amount, type = "충전") {
  const db = getVerifyDb();
  const uid = Number(userId);
  const current = db
    .prepare("SELECT Total_amount, now_amount FROM users WHERE user_id = ?")
    .get(uid);

  if (current) {
    const newTotal = current.Total_amount + amount;
    const newNow = current.now_amount + amount;
    db.prepare(
      "UPDATE users SET Total_amount = ?, now_amount = ? WHERE user_id = ?"
    ).run(newTotal, newNow, uid);
  } else {
    db.prepare(
      "INSERT INTO users (user_id, Total_amount, now_amount) VALUES (?, ?, ?)"
    ).run(uid, amount, amount);
  }
  db.close();

  addTransactionHistory(userId, amount, type, { coinType: "KRW" });
}

function subtractBalance(userId, amount) {
  const db = getVerifyDb();
  const uid = userId === null || userId === undefined ? null : Number(userId);

  if (uid === null) {
    const result = db
      .prepare(
        "UPDATE users SET now_amount = now_amount - ? WHERE now_amount >= ?"
      )
      .run(amount, amount);
    db.close();
    return (result?.changes ?? 0) > 0;
  }

  const current = db
    .prepare("SELECT now_amount FROM users WHERE user_id = ?")
    .get(uid);
  if (!current || current.now_amount < amount) {
    db.close();
    return false;
  }
  db.prepare(
    "UPDATE users SET now_amount = now_amount - ? WHERE user_id = ?"
  ).run(amount, uid);
  db.close();
  return true;
}

function addTransactionHistory(
  userId,
  amount,
  type,
  { txid = "", coinType = "", address = "", fee = 0 } = {}
) {
  const db = getHistoryDb();
  db.prepare(
    `INSERT INTO transaction_history (user_id, amount, type, txid, coin_type, address, fee)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(Number(userId), amount, type, txid, coinType, address, fee);
  db.close();
}

function getTransactionHistory(userId, limit = 50) {
  const db = getHistoryDb();
  const rows = db
    .prepare(
      `SELECT * FROM transaction_history WHERE user_id = ?
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(Number(userId), limit);
  db.close();
  return rows;
}

function checkAdmin(userId, defaultAdminId, allowedUserIds = []) {
  const id = BigInt(userId);
  if (defaultAdminId && id === BigInt(defaultAdminId)) return true;
  return allowedUserIds.some((allowedId) => allowedId === id);
}

module.exports = {
  initSchema,
  getVerifiedUser,
  addVerifiedUser,
  removeVerifiedUser,
  addBalance,
  subtractBalance,
  addTransactionHistory,
  getTransactionHistory,
  checkAdmin,
};