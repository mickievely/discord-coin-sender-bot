const { initSchema, dataDbPath } = require("../src/db");

initSchema();
console.log("SQLite 초기화 완료:", dataDbPath);