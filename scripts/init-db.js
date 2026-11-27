const { initSchema, dataDbPath } = require("../src/db");

initSchema();
console.log("SQLite 스키마 확인 완료 (데이터 삭제 없음):", dataDbPath);