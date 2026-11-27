const { REST, Routes } = require("discord.js");
const { logEmoji } = require("./log");
const { saveRegistryLocalOverlay, getRegistry } = require("./registry");

function assertUnique(entries) {
  const names = new Set();
  const hashes = new Set();
  for (const row of entries) {
    if (names.has(row.name)) {
      throw new Error(`duplicate emoji name: ${row.name}`);
    }
    names.add(row.name);
    if (row.sha256) {
      if (hashes.has(row.sha256)) {
        throw new Error(`duplicate sha256: ${row.name}`);
      }
      hashes.add(row.sha256);
    }
  }
}

async function registerApplicationEmoji({ token, applicationId, name, pngBuffer }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const image = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  try {
    const body = await rest.post(Routes.applicationEmojis(applicationId), {
      body: { name, image },
    });
    return body;
  } catch (e) {
    if (e.status === 429) {
      logEmoji("error", name, "discord_429", {});
    } else {
      logEmoji("error", name, "register_failed", {
        status: e.status,
        message: e.message,
      });
    }
    throw e;
  }
}

async function registerAllFromRegistry({ token, applicationId, icons }) {
  const reg = getRegistry();
  const updated = [];

  for (const spec of icons) {
    const existing = (reg.icons || []).find((i) => i.key === spec.key);
    const row = existing ? { ...existing } : { ...spec };
    delete row.png;

    if (row.discordId) {
      updated.push(row);
      continue;
    }
    if (!spec.png) {
      logEmoji("error", spec.key, "missing_png", {});
      updated.push(row);
      continue;
    }
    const created = await registerApplicationEmoji({
      token,
      applicationId,
      name: row.name,
      pngBuffer: spec.png,
    });
    row.discordId = String(created.id);
    row.registeredAt = new Date().toISOString();
    updated.push(row);
    logEmoji("info", spec.key, "registered", { discordId: row.discordId });
  }

  assertUnique(updated);
  saveRegistryLocalOverlay(updated);
  const next = { ...reg, icons: updated, updatedAt: new Date().toISOString() };
  return next;
}

module.exports = {
  assertUnique,
  registerApplicationEmoji,
  registerAllFromRegistry,
};