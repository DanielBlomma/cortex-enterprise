import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { queryAuditLog } from "../dist/audit/query.js";

function makeTempContext(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cortex-auditq-"));
  const auditDir = join(dir, "audit");
  mkdirSync(auditDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(auditDir, name), content);
  }
  return dir;
}

function entry(tool, timestamp) {
  return JSON.stringify({ timestamp, tool, input: {}, result_count: 1, entities_returned: [], rules_applied: [], duration_ms: 10 });
}

test("returns empty when audit dir missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cortex-noaudit-"));
  const results = queryAuditLog(dir, {});
  assert.deepEqual(results, []);
});

test("reads entries from single file", () => {
  const dir = makeTempContext({
    "2025-06-15.jsonl": entry("context.search", "2025-06-15T10:00:00Z"),
  });
  const results = queryAuditLog(dir, {});
  assert.equal(results.length, 1);
  assert.equal(results[0].tool, "context.search");
});

test("filters by date range (from)", () => {
  const dir = makeTempContext({
    "2025-06-14.jsonl": entry("a", "2025-06-14T10:00:00Z"),
    "2025-06-15.jsonl": entry("b", "2025-06-15T10:00:00Z"),
    "2025-06-16.jsonl": entry("c", "2025-06-16T10:00:00Z"),
  });
  const results = queryAuditLog(dir, { from: "2025-06-15" });
  assert.equal(results.length, 2);
  // Newest first
  assert.equal(results[0].tool, "c");
  assert.equal(results[1].tool, "b");
});

test("filters by date range (to)", () => {
  const dir = makeTempContext({
    "2025-06-14.jsonl": entry("a", "2025-06-14T10:00:00Z"),
    "2025-06-15.jsonl": entry("b", "2025-06-15T10:00:00Z"),
    "2025-06-16.jsonl": entry("c", "2025-06-16T10:00:00Z"),
  });
  const results = queryAuditLog(dir, { to: "2025-06-15" });
  assert.equal(results.length, 2);
  assert.equal(results[0].tool, "b");
  assert.equal(results[1].tool, "a");
});

test("filters by tool name", () => {
  const dir = makeTempContext({
    "2025-06-15.jsonl": [
      entry("context.search", "2025-06-15T10:00:00Z"),
      entry("context.get_related", "2025-06-15T11:00:00Z"),
      entry("context.search", "2025-06-15T12:00:00Z"),
    ].join("\n"),
  });
  const results = queryAuditLog(dir, { tool: "context.search" });
  assert.equal(results.length, 2);
});

test("respects limit", () => {
  const lines = Array.from({ length: 10 }, (_, i) =>
    entry("context.search", `2025-06-15T${String(i).padStart(2, "0")}:00:00Z`)
  ).join("\n");
  const dir = makeTempContext({ "2025-06-15.jsonl": lines });

  const results = queryAuditLog(dir, { limit: 3 });
  assert.equal(results.length, 3);
});

test("default limit is 50", () => {
  const lines = Array.from({ length: 60 }, (_, i) =>
    entry("t", `2025-06-15T00:${String(i).padStart(2, "0")}:00Z`)
  ).join("\n");
  const dir = makeTempContext({ "2025-06-15.jsonl": lines });

  const results = queryAuditLog(dir, {});
  assert.equal(results.length, 50);
});

test("invalid date format returns empty", () => {
  const dir = makeTempContext({
    "2025-06-15.jsonl": entry("a", "2025-06-15T10:00:00Z"),
  });
  assert.deepEqual(queryAuditLog(dir, { from: "not-a-date" }), []);
  assert.deepEqual(queryAuditLog(dir, { to: "../../etc" }), []);
  assert.deepEqual(queryAuditLog(dir, { from: "2025/06/15" }), []);
});

test("skips malformed JSON lines", () => {
  const dir = makeTempContext({
    "2025-06-15.jsonl": `${entry("good", "2025-06-15T10:00:00Z")}\n{broken json\n${entry("also-good", "2025-06-15T11:00:00Z")}`,
  });
  const results = queryAuditLog(dir, {});
  assert.equal(results.length, 2);
});
