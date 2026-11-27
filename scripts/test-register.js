require("../src/loadEnv");
const { REST, Routes } = require("discord.js");
const { buildCommands } = require("../src/commands/register");
const config = require("../src/config");

const rest = new REST({ version: "10" }).setToken(config.token);
const body = buildCommands();
const appId = String(process.env.CLIENT_ID);
const guildId = String(config.guildId);

console.log("registering", body.length, "commands...");
rest
  .put(Routes.applicationGuildCommands(appId, guildId), { body })
  .then(() => console.log("ok"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });