const CryptoJS = require("crypto-js");
const blob = require("./cwalletSignBlob.json");

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");

const LCG_A = 214013;
const LCG_C = 2531011;
const LCG_M = 1 << 31;

let tables = null;

function aesIvFromKey(keyWordArray) {
  return CryptoJS.lib.WordArray.create(keyWordArray.words.slice(0, 4), 16);
}

function aesEncryptToBase64(plain, keyWordArray) {
  const encrypted = CryptoJS.AES.encrypt(plain, keyWordArray, {
    iv: aesIvFromKey(keyWordArray),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

function aesDecryptBase64(cipherB64, keyWordArray) {
  const ciphertext = CryptoJS.enc.Base64.parse(cipherB64);
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    keyWordArray,
    {
      iv: aesIvFromKey(keyWordArray),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  return CryptoJS.enc.Utf8.stringify(decrypted);
}

function loadTables() {
  if (tables) return tables;
  const key = blob.key.repeat(Math.ceil(16 / blob.key.length)).slice(0, 16);
  const json = aesDecryptBase64(blob.content, CryptoJS.enc.Utf8.parse(key));
  const parsed = JSON.parse(json);
  tables = {
    signKey: parsed.signKey,
    verifyKeyGroup: parsed.verifyKeyGroup,
    verifyInvGroup: parsed.verifyInvGroup,
  };
  return tables;
}

function dayOfYearUtc(now = Date.now()) {
  const t = new Date(now);
  const start = Date.UTC(t.getUTCFullYear(), 0, 1);
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.floor((today - start) / 86400000) + 1;
}

function dailyKeyIv() {
  const { verifyKeyGroup, verifyInvGroup } = loadTables();
  let r = dayOfYearUtc();
  r = (LCG_A * r + LCG_C) % LCG_M;
  return [
    CryptoJS.enc.Utf8.parse(verifyKeyGroup[r % verifyKeyGroup.length]),
    CryptoJS.enc.Utf8.parse(verifyInvGroup[r % verifyInvGroup.length]),
  ];
}

/** Hex-wrap with the daily verify key (web `l`). */
function wrapHex(text) {
  const [key, iv] = dailyKeyIv();
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(text), key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.ciphertext.toString(CryptoJS.enc.Hex);
}

function unwrapHex(hex) {
  const [key, iv] = dailyKeyIv();
  const ciphertext = CryptoJS.enc.Hex.parse(hex);
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );
  return CryptoJS.enc.Utf8.stringify(decrypted);
}

function randomSignKey() {
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    const idx = Math.ceil(61 * Math.random());
    out += ALPHABET[idx] || ALPHABET[0];
  }
  return out;
}

/** Web production body: base64(AES(hexWrap(json), randomKey)). */
function encryptBody(jsonText, randomKey) {
  return aesEncryptToBase64(wrapHex(jsonText), CryptoJS.enc.Utf8.parse(randomKey));
}

function signKeyHeader(randomKey) {
  return wrapHex(randomKey);
}

function decryptBody(payload) {
  if (typeof payload !== "string" || !payload) return payload;
  try {
    const { signKey } = loadTables();
    const hex = aesDecryptBase64(payload, CryptoJS.enc.Utf8.parse(signKey));
    const plain = unwrapHex(hex);
    return JSON.parse(plain);
  } catch {
    return payload;
  }
}

const SKIP_ENCRYPT = new Set([
  "/chain/token/all/get",
  "/chain/token/list/get",
]);

function shouldEncrypt(urlPath) {
  const path = String(urlPath || "").replace(/^\/cctip\/v1/, "");
  return !SKIP_ENCRYPT.has(path);
}

module.exports = {
  randomSignKey,
  encryptBody,
  signKeyHeader,
  decryptBody,
  shouldEncrypt,
};
