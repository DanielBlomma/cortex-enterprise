#!/usr/bin/env node
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: node scripts/sign-license.mjs <unsigned.lic> [output.lic]");
  console.error();
  console.error("The unsigned .lic file should contain key-value lines like:");
  console.error("  customer: ACME Corp");
  console.error("  edition: air-gapped");
  console.error("  issued: 2026-04-02");
  console.error("  expires: 2027-04-02");
  console.error("  max_repos: 50");
  console.error("  features: audit_log,policy_local,bundled_embeddings");
  process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1] || inputPath.replace(/\.lic$/, ".signed.lic");

const privateKeyPath = join(__dirname, "..", "packages", "cloud", "keys", "private.pem");
const privateKeyPem = readFileSync(privateKeyPath, "utf8");
const privateKey = createPrivateKey(privateKeyPem);

const payload = readFileSync(inputPath, "utf8").trim();

const signature = sign(null, Buffer.from(payload), privateKey);
const signatureBase64 = signature.toString("base64");

const output = `${payload}\n---\n${signatureBase64}\n`;
writeFileSync(outputPath, output);

console.log(`Signed license written to: ${outputPath}`);
