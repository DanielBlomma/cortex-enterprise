#!/usr/bin/env node
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cortexBin = join(__dirname, "..", "node_modules", "@danielblomma", "cortex-mcp", "bin", "cortex.mjs");

try {
  execFileSync(process.execPath, [cortexBin, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
