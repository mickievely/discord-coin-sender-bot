const fs = require("node:fs");
const path = require("node:path");

const ASSETS_DIR = path.join(process.cwd(), "assets", "emojis");
const CATALOG_PATH = path.join(ASSETS_DIR, "catalog.json");
const REGISTRY_PATH = path.join(ASSETS_DIR, "registry.json");
const REGISTRY_LOCAL_PATH = path.join(ASSETS_DIR, "registry.local.json");

let cache = null;

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, "utf8");
  return JSON.parse(raw);
}

function loadRegistryLocal() {
  if (!fs.existsSync(REGISTRY_LOCAL_PATH)) return null;
  return JSON.parse(fs.readFileSync(REGISTRY_LOCAL_PATH, "utf8"));
}

function mergeRegistry(base, local) {
  if (!local?.icons?.length) return base;
  const byKey = new Map((local.icons || []).map((i) => [i.key, i]));
  return {
    ...base,
    icons: (base.icons || []).map((row) => {
      const overlay = byKey.get(row.key);
      if (!overlay?.discordId) return row;
      return {
        ...row,
        discordId: overlay.discordId,
        registeredAt: overlay.registeredAt || row.registeredAt,
      };
    }),
  };
}

function loadRegistryFile() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { bootstrapIconsVersion: "1.11.3", icons: [] };
  }
  const base = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const local = loadRegistryLocal();
  return mergeRegistry(base, local);
}

function saveRegistry(data) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  cache = data;
}

function saveRegistryLocalOverlay(iconsWithIds) {
  const local = {
    updatedAt: new Date().toISOString(),
    icons: iconsWithIds
      .filter((i) => i.discordId)
      .map((i) => ({
        key: i.key,
        name: i.name,
        discordId: i.discordId,
        registeredAt: i.registeredAt,
      })),
  };
  fs.writeFileSync(
    REGISTRY_LOCAL_PATH,
    `${JSON.stringify(local, null, 2)}\n`,
    "utf8"
  );
}

function getRegistry() {
  if (!cache) {
    cache = loadRegistryFile();
  }
  return cache;
}

function registryByKey() {
  const reg = getRegistry();
  const map = new Map();
  for (const row of reg.icons || []) {
    map.set(row.key, row);
  }
  return map;
}

function reloadRegistry() {
  cache = null;
  return getRegistry();
}

module.exports = {
  ASSETS_DIR,
  CATALOG_PATH,
  REGISTRY_PATH,
  REGISTRY_LOCAL_PATH,
  loadCatalog,
  loadRegistryFile,
  saveRegistry,
  saveRegistryLocalOverlay,
  getRegistry,
  registryByKey,
  reloadRegistry,
};