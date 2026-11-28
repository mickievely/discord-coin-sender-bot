const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const {
  randomSignKey,
  encryptBody,
  signKeyHeader,
  decryptBody,
  shouldEncrypt,
} = require("./cwalletSign");

const BASE = "https://my.cwallet.com";

let cachedClient = null;
let cachedHeaders = null;
let cachedStateMtime = 0;

function resolveStoragePath(explicit) {
  if (explicit && String(explicit).trim()) {
    return path.resolve(explicit);
  }
  return path.resolve(process.cwd(), "secrets", "cwallet-storage-state.json");
}

function storagePath() {
  return resolveStoragePath(process.env.CWALLET_STORAGE_STATE);
}

function hasStorageState() {
  try {
    return fs.existsSync(storagePath());
  } catch {
    return false;
  }
}

async function applyStorageState(jar, state) {
  for (const c of state.cookies || []) {
    const domain = c.domain?.startsWith(".")
      ? c.domain.slice(1)
      : c.domain || "my.cwallet.com";
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

async function getClient() {
  const file = storagePath();
  if (!hasStorageState()) return null;

  const mtime = fs.statSync(file).mtimeMs;
  if (cachedClient && mtime === cachedStateMtime) {
    return { client: cachedClient, headers: cachedHeaders };
  }

  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const jar = new CookieJar();
  await applyStorageState(jar, state);
  const headers = mergeLocalStorageHeaders(state);
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
  cachedClient = client;
  cachedHeaders = headers;
  cachedStateMtime = mtime;
  return { client, headers };
}

async function postApi(urlPath, body = {}) {
  const session = await getClient();
  if (!session) return null;
  const { client, headers } = session;
  const encrypt = shouldEncrypt(urlPath);
  const randomKey = encrypt ? randomSignKey() : "";
  const payload = encrypt
    ? encryptBody(JSON.stringify(body ?? {}), randomKey)
    : body;
  const res = await client.post(urlPath, payload, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: BASE,
      Referer: `${BASE}/wallet/summary`,
      "X-Device-Type": "web",
      "X-Device-Scene": "online",
      ...(encrypt
        ? {
            "X-Sign-Source": "CC",
            "X-Sign-Key": signKeyHeader(randomKey),
          }
        : {}),
      ...headers,
    },
    transformRequest: encrypt ? [(data) => data] : undefined,
    validateStatus: () => true,
    timeout: 20000,
  });
  return decryptBody(res.data);
}

module.exports = {
  BASE,
  storagePath,
  hasStorageState,
  postApi,
};