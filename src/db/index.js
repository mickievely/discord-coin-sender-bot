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
      user_id TEXT PRIMARY KEY,
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
      user_id TEXT,
      amount INTEGER,
      type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      txid TEXT,
      coin_type TEXT,
      address TEXT,
      fee INTEGER DEFAULT 0
    );
  `);
  ensureUserIdTextSchema(db);
  migrateLegacyUserIds(db);
  db.close();
  schemaReady = true;
}

/** 예전 스키마 INTEGER user_id → TEXT (node:sqlite 바인딩 오류 방지) */
function ensureUserIdTextSchema(db) {
  const info = db
    .prepare(
      "SELECT type FROM pragma_table_info('users') WHERE name = 'user_id'"
    )
    .get();
  if (!info) return;
  if (String(info.type).toUpperCase() === "TEXT") return;

  db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE users__id_text (
      user_id TEXT PRIMARY KEY,
      phone TEXT,
      DOB TEXT,
      name TEXT,
      telecom TEXT,
      Total_amount INTEGER DEFAULT 0,
      now_amount INTEGER DEFAULT 0
    );
    INSERT INTO users__id_text
      (user_id, phone, DOB, name, telecom, Total_amount, now_amount)
    SELECT CAST(user_id AS TEXT), phone, DOB, name, telecom, Total_amount, now_amount
    FROM users;
    DROP TABLE users;
    ALTER TABLE users__id_text RENAME TO users;
    COMMIT;
  `);
}

/** 예전 INTEGER user_id 행을 Discord snowflake 문자열로 맞춤 */
function migrateLegacyUserIds(db) {
  const users = db.prepare("SELECT user_id FROM users").all();
  const updUser = db.prepare(
    "UPDATE users SET user_id = ? WHERE rowid = ?"
  );
  const selRowid = db.prepare(
    `SELECT rowid FROM users WHERE ${SQL_USER_ID_MATCH} LIMIT 1`
  );
  for (const row of users) {
    const canonical = userIdKey(row.user_id);
    if (canonical === String(row.user_id)) continue;
    const hit = selRowid.get(row.user_id);
    if (!hit) continue;
    try {
      updUser.run(canonical, hit.rowid);
    } catch {
      /* duplicate canonical — 수동 정리 필요 */
    }
  }
  db.exec(`
    UPDATE transaction_history
    SET user_id = CAST(user_id AS TEXT)
    WHERE user_id IS NOT NULL AND typeof(user_id) != 'text'
  `);
}

function getDb() {
  initSchema();
  if (!sharedDb) {
    sharedDb = openDb(DATA_DB);
  }
  return sharedDb;
}

/** Discord snowflake — Number() 시 정밀도·범위 오류 방지 */
function userIdKey(userId) {
  return String(userId);
}

/** node:sqlite가 INTEGER 컬럼에 ? 바인딩 시 Number 변환 → snowflake 범위 오류 방지 */
const SQL_USER_ID_MATCH = "CAST(user_id AS TEXT) = ?";

function getVerifiedUser(userId) {
  const key = userIdKey(userId);
  const row = getDb()
    .prepare(`SELECT * FROM users WHERE ${SQL_USER_ID_MATCH} LIMIT 1`)
    .get(key);
  return row || null;
}

function addVerifiedUser(userId, phone = "", dob = "", name = "", telecom = "") {
  const key = userIdKey(userId);
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO users (user_id, phone, DOB, name, telecom, Total_amount, now_amount)
       VALUES (?, ?, ?, ?, ?, COALESCE((SELECT Total_amount FROM users WHERE ${SQL_USER_ID_MATCH}), 0),
               COALESCE((SELECT now_amount FROM users WHERE ${SQL_USER_ID_MATCH}), 0))`
    )
    .run(key, phone, dob, name, telecom, key, key);
}

function removeVerifiedUser(userId) {
  getDb()
    .prepare(`DELETE FROM users WHERE ${SQL_USER_ID_MATCH}`)
    .run(userIdKey(userId));
}

function addBalance(userId, amount, type = "충전") {
  const db = getDb();
  const uid = userIdKey(userId);
  const current = db
    .prepare(`SELECT Total_amount, now_amount FROM users WHERE ${SQL_USER_ID_MATCH}`)
    .get(uid);

  if (current) {
    const newTotal = current.Total_amount + amount;
    const newNow = current.now_amount + amount;
    db.prepare(
      `UPDATE users SET Total_amount = ?, now_amount = ? WHERE ${SQL_USER_ID_MATCH}`
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
  const uid =
    userId === null || userId === undefined ? null : userIdKey(userId);

  if (uid === null) {
    const result = db
      .prepare(
        "UPDATE users SET now_amount = now_amount - ? WHERE now_amount >= ?"
      )
      .run(amount, amount);
    return (result?.changes ?? 0) > 0;
  }

  const current = db
    .prepare(`SELECT now_amount FROM users WHERE ${SQL_USER_ID_MATCH}`)
    .get(uid);
  if (!current || current.now_amount < amount) {
    return false;
  }
  db.prepare(
    `UPDATE users SET now_amount = now_amount - ? WHERE ${SQL_USER_ID_MATCH}`
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
    .run(userIdKey(userId), amount, type, txid, coinType, address, fee);
}

function getTransactionHistory(userId, limit = 50) {
  return getDb()
    .prepare(
      `SELECT * FROM transaction_history WHERE ${SQL_USER_ID_MATCH}
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(userIdKey(userId), limit);
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