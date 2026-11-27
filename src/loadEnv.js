const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const testEnv = path.join(root, "test", ".env");
if (fs.existsSync(testEnv)) {
  dotenv.config({ path: testEnv, override: true });
}

module.exports = { root, testEnvPath: testEnv };