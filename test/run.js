// 테스트 실행: node test/run.js  (test/.env 우선, 나머지는 루트 .env)
const path = require("path");
process.env.ENV_FILE = path.join(__dirname, ".env");
require("../src/index.js");
