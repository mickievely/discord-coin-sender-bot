const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config");

const DB_DIR = path.join(process.cwd(), "DB");
const DATA_DB = path.join(DB_DIR, config.databaseFile);

let sharedDb = null;
let schemaReady = false;

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function openDb(file) {
  return new DatabaseSync(file);
}

function initSchema() {
  if (schemaReady) return;
  ensureDir();

  const db = openDb(DATA_DB);
  db.exec(`
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
  db.exec(`
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
  db.close();
  schemaReady = true;
}

function getDb() {
  initSchema();
  if (!sharedDb) {
    sharedDb = openDb(DATA_DB);
  }
  return sharedDb;
}

function getVerifiedUser(userId) {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .get(Number(userId));
  return row || null;
}

function addVerifiedUser(userId, phone = "", dob = "", name = "", telecom = "") {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO users (user_id, phone, DOB, name, telecom, Total_amount, now_amount)
       VALUES (?, ?, ?, ?, ?, COALESCE((SELECT Total_amount FROM users WHERE user_id = ?), 0),
               COALESCE((SELECT now_amount FROM users WHERE user_id = ?), 0))`
    )
    .run(
      Number(userId),
      phone,
      dob,
      name,
      telecom,
      Number(userId),
      Number(userId)
    );
}

function removeVerifiedUser(userId) {
  getDb().prepare("DELETE FROM users WHERE user_id = ?").run(Number(userId));
}

function addBalance(userId, amount, type = "충전") {
  const db = getDb();
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

  addTransactionHistory(userId, amount, type, { coinType: "KRW" });
}

function subtractBalance(userId, amount) {
  const db = getDb();
  const uid = userId === null || userId === undefined ? null : Number(userId);

  if (uid === null) {
    const result = db
      .prepare(
        "UPDATE users SET now_amount = now_amount - ? WHERE now_amount >= ?"
      )
      .run(amount, amount);
    return (result?.changes ?? 0) > 0;
  }

  const current = db
    .prepare("SELECT now_amount FROM users WHERE user_id = ?")
    .get(uid);
  if (!current || current.now_amount < amount) {
    return false;
  }
  db.prepare(
    "UPDATE users SET now_amount = now_amount - ? WHERE user_id = ?"
  ).run(amount, uid);
  return true;
}

function addTransactionHistory(
  userId,
  amount,
  type,
  { txid = "", coinType = "", address = "", fee = 0 } = {}
) {
  getDb()
    .prepare(
      `INSERT INTO transaction_history (user_id, amount, type, txid, coin_type, address, fee)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(Number(userId), amount, type, txid, coinType, address, fee);
}

function getTransactionHistory(userId, limit = 50) {
  return getDb()
    .prepare(
      `SELECT * FROM transaction_history WHERE user_id = ?
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(Number(userId), limit);
}

function checkAdmin(userId, defaultAdminId, allowedUserIds = []) {
  const id = BigInt(userId);
  if (defaultAdminId && id === BigInt(defaultAdminId)) return true;
  return allowedUserIds.some((allowedId) => allowedId === id);
}

initSchema();

module.exports = {
  initSchema,
  getDb,
  dataDbPath: DATA_DB,
  getVerifiedUser,
  addVerifiedUser,
  removeVerifiedUser,
  addBalance,
  subtractBalance,
  addTransactionHistory,
  getTransactionHistory,
  checkAdmin,
};