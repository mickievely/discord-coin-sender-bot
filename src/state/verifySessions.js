/** @type {Map<string, { api: import('../services/niceApi').NiceApi, telecom: string, name?: string, birth?: string, gender?: string, phone?: string, attempts: number }>} */
const sessions = new Map();

const SESSION_TTL_MS = 10 * 60 * 1000;

function set(userId, entry) {
  sessions.set(String(userId), {
    ...entry,
    createdAt: Date.now(),
    attempts: entry.attempts ?? 0,
  });
}

function get(userId) {
  const s = sessions.get(String(userId));
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(String(userId));
    return null;
  }
  return s;
}

function del(userId) {
  sessions.delete(String(userId));
}

module.exports = { sessions, set, get, del };