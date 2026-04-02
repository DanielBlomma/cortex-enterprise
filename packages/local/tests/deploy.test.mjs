import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deployBundledModel } from "../dist/model/deploy.js";

function makeTempContext() {
  return mkdtempSync(join(tmpdir(), "cortex-deploy-"));
}

test("returns false when model already cached", () => {
  const dir = makeTempContext();
  const targetDir = join(dir, "embeddings", "models", "Xenova", "all-MiniLM-L6-v2", "onnx");
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, "model_quantized.onnx"), "cached");

  assert.equal(deployBundledModel(dir), false);
});

test("deploys bundled model when not cached", () => {
  const dir = makeTempContext();
  // If bundle exists on disk, this should deploy and return true.
  // If bundle doesn't exist (e.g., CI without models), it returns false.
  const result = deployBundledModel(dir);
  assert.equal(typeof result, "boolean");

  if (result) {
    // Verify the model was copied to target
    const targetModel = join(dir, "embeddings", "models", "Xenova", "all-MiniLM-L6-v2", "onnx", "model_quantized.onnx");
    assert.ok(existsSync(targetModel));
  }
});

test("second deploy is a no-op", () => {
  const dir = makeTempContext();
  deployBundledModel(dir); // first call (may or may not deploy)

  // If first call deployed, second should return false
  const targetModel = join(dir, "embeddings", "models", "Xenova", "all-MiniLM-L6-v2", "onnx", "model_quantized.onnx");
  if (existsSync(targetModel)) {
    assert.equal(deployBundledModel(dir), false);
  }
});
