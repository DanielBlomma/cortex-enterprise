#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cortexBin = require.resolve("@danielblomma/cortex-mcp/bin/cortex.mjs");

try {
  execFileSync(process.execPath, [cortexBin, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
