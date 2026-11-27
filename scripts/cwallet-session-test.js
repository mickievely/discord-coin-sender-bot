/**
 * Cwallet web session connectivity test (cookie + optional localStorage).
 *
 * Usage:
 *   node scripts/cwallet-session-test.js
 *
 * Env:
 *   CWALLET_STORAGE_STATE  — path to Playwright storageState JSON (default: secrets/cwallet-storage-state.json)
 *   CWALLET_COOKIES_JSON   — legacy: JSON array of cookie objects only
 *
 * Expected success: code 10000 and USDT balance ~80 (or whatever is on the account).
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const BASE = "https://my.cwallet.com";
const BALANCE_PATH = "/cctip/v1/account/asset/balance/get";
const USER_BASIC_PATH = "/cctip/v1/account/user/basic";

function resolveStatePath() {
  const fromEnv = process.env.CWALLET_STORAGE_STATE;
  if (fromEnv && String(fromEnv).trim()) {
    return path.resolve(fromEnv);
  }
  return path.resolve(__dirname, "..", "secrets", "cwallet-storage-state.json");
}

function resolveLegacyCookiesPath() {
  const fromEnv = process.env.CWALLET_COOKIES_JSON;
  if (fromEnv && String(fromEnv).trim()) {
    return path.resolve(fromEnv);
  }
  return path.resolve(__dirname, "..", "secrets", "cwallet-cookies.json");
}

function loadStorageState(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

async function applyStorageState(jar, state) {
  const cookies = state.cookies || [];
  for (const c of cookies) {
    const domain = c.domain?.startsWith(".") ? c.domain.slice(1) : c.domain || "my.cwallet.com";
    const cookieStr = [
      `${c.name}=${c.value}`,
      `Domain=${domain}`,
      `Path=${c.path || "/"}`,
      c.secure ? "Secure" : "",
      c.httpOnly ? "HttpOnly" : "",
    ]
      .filter(Boolean)
      .join("; ");
    await jar.setCookie(cookieStr, `${BASE}/`);
  }
}

function mergeLocalStorageHeaders(state) {
  const origin = (state.origins || []).find(
    (o) => o.origin === BASE || o.origin === "https://my.cwallet.com"
  );
  if (!origin?.localStorage?.length) return {};
  const map = Object.fromEntries(
    origin.localStorage.map((e) => [e.name, e.value])
  );
  const headers = {};
  if (map.lang) headers["x-lang"] = map.lang;
  if (map.SM_DEVICE_ID) headers["x-device-id"] = map.SM_DEVICE_ID;
  return headers;
}

async function postJson(client, urlPath, extraHeaders = {}) {
  const res = await client.post(urlPath, {}, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: BASE,
      Referer: `${BASE}/wallet/summary`,
      ...extraHeaders,
    },
    validateStatus: () => true,
    timeout: 20000,
  });
  return res;
}

function findUsdtBalance(data) {
  const list = data?.data;
  if (!Array.isArray(list)) return null;
  const row = list.find((x) => String(x.symbol || "").toUpperCase() === "USDT");
  if (!row) return null;
  return row.balance ?? row.quantity ?? row.amount ?? null;
}

async function runWithJar(jar, extraHeaders, label) {
  const client = wrapper(
    axios.create({
      baseURL: BASE,
      jar,
      withCredentials: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    })
  );

  const basic = await postJson(client, USER_BASIC_PATH, extraHeaders);
  const balance = await postJson(client, BALANCE_PATH, extraHeaders);

  const basicJson =
    typeof basic.data === "object" ? basic.data : { parseError: String(basic.data).slice(0, 120) };
  const balanceJson =
    typeof balance.data === "object"
      ? balance.data
      : { parseError: String(balance.data).slice(0, 120) };

  const usdt = findUsdtBalance(balanceJson);
  const ok = balanceJson.code === 10000 && basicJson.code === 10000;

  console.log(`\n--- ${label} ---`);
  console.log(`user/basic HTTP ${basic.status} code ${basicJson.code ?? "?"}`);
  console.log(`balance/get HTTP ${balance.status} code ${balanceJson.code ?? "?"}`);
  if (usdt != null) console.log(`USDT balance: ${usdt}`);
  if (!ok) {
    console.log("Session NOT valid for API (need httpOnly cookies in storage state).");
    if (balanceJson.msg) console.log("msg:", balanceJson.msg);
  } else {
    console.log("Session OK — same as logged-in browser.");
  }
  return ok;
}

async function main() {
  const statePath = resolveStatePath();
  const legacyPath = resolveLegacyCookiesPath();

  if (fs.existsSync(statePath)) {
    const state = loadStorageState(statePath);
    const jar = new CookieJar();
    await applyStorageState(jar, state);
    const extra = mergeLocalStorageHeaders(state);
    const ok = await runWithJar(jar, extra, `storageState: ${statePath}`);
    process.exit(ok ? 0 : 1);
  }

  if (fs.existsSync(legacyPath)) {
    const cookies = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    const jar = new CookieJar();
    await applyStorageState(jar, { cookies });
    const ok = await runWithJar(jar, {}, `cookies: ${legacyPath}`);
    process.exit(ok ? 0 : 1);
  }

  console.error(`
No session file found.

1) Save login for SSH/automation (recommended):
   node scripts/cwallet-save-storage-state.js
   (log in once in the Playwright window; writes secrets/cwallet-storage-state.json)

2) Or export Playwright/Chrome cookies (must include HttpOnly) to:
   ${statePath}
`);
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});