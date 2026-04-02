#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, "..", "packages", "cloud", "keys");

mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(join(keysDir, "public.pem"), publicKey);
writeFileSync(join(keysDir, "private.pem"), privateKey, { mode: 0o600 });

console.log("Key pair generated:");
console.log(`  Public:  packages/cloud/keys/public.pem`);
console.log(`  Private: packages/cloud/keys/private.pem (KEEP SECRET)`);
console.log();
console.log("Public key to embed in src/license/public-key.ts:");
console.log(publicKey);
