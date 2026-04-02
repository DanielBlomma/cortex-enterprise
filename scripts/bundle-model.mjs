#!/usr/bin/env node
/**
 * Copies the embedding model from a cortex project's cache into this package
 * for air-gapped distribution. Run once before publishing.
 *
 * Usage: node scripts/bundle-model.mjs [source-cortex-root]
 *   Default source: ../cortex
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");

const cortexRoot = process.argv[2] || join(packageRoot, "..", "cortex");
const modelName = "Xenova/all-MiniLM-L6-v2";

const sourceDir = join(cortexRoot, ".context", "embeddings", "models", modelName);
const targetDir = join(packageRoot, "models", modelName);

if (!existsSync(sourceDir)) {
  console.error(`Model not found at: ${sourceDir}`);
  console.error(`Run 'cortex embed' in the source project first, or pass a custom path.`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Model bundled: ${modelName}`);
console.log(`  Source: ${sourceDir}`);
console.log(`  Target: ${targetDir}`);
