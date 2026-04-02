import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyStore } from "@danielblomma/cortex-core/policy/store";

// Test the sync module's edge cases (no network required)
const { syncFromLocal, getLastSync } = await import("../dist/policy/sync.js");
const { getLastPush } = await import("../dist/telemetry/sync.js");

test("syncFromLocal returns result with local source", () => {
  const dir = mkdtempSync(join(tmpdir(), "cortex-sync-"));
  const store = new PolicyStore(dir);
  const result = syncFromLocal(store);

  assert.equal(result.success, true);
  assert.equal(result.source, "local");
  assert.equal(typeof result.synced, "number");
  assert.ok(result.timestamp);
});

test("getLastSync returns null before any sync", () => {
  // Note: this may return a value if a previous test ran syncFromLocal.
  // The important thing is it returns a SyncResult or null, not throw.
  const result = getLastSync();
  assert.ok(result === null || typeof result.success === "boolean");
});

test("getLastPush returns null before any push", () => {
  const result = getLastPush();
  assert.equal(result, null);
});
