import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditWriter } from "../dist/audit/writer.js";

function makeTempContext() {
  return mkdtempSync(join(tmpdir(), "cortex-audit-"));
}

function makeEntry(overrides = {}) {
  return {
    timestamp: "2025-06-15T10:30:00.000Z",
    tool: "context.search",
    input: { query: "test" },
    result_count: 5,
    entities_returned: ["file:a.ts"],
    rules_applied: [],
    duration_ms: 42,
    ...overrides,
  };
}

test("log creates audit directory and writes entry", async () => {
  const dir = makeTempContext();
  const writer = new AuditWriter(dir);

  writer.log(makeEntry());

  // Wait for async write
  await new Promise((r) => setTimeout(r, 100));

  const auditDir = join(dir, "audit");
  assert.ok(existsSync(auditDir));

  const file = join(auditDir, "2025-06-15.jsonl");
  assert.ok(existsSync(file));

  const content = readFileSync(file, "utf8").trim();
  const parsed = JSON.parse(content);
  assert.equal(parsed.tool, "context.search");
  assert.equal(parsed.result_count, 5);
  assert.equal(parsed.status, undefined);
});

test("log appends multiple entries to same date file", async () => {
  const dir = makeTempContext();
  const writer = new AuditWriter(dir);

  writer.log(makeEntry({ tool: "context.search" }));
  writer.log(makeEntry({ tool: "context.get_related" }));

  await new Promise((r) => setTimeout(r, 150));

  const content = readFileSync(join(dir, "audit", "2025-06-15.jsonl"), "utf8").trim();
  const lines = content.split("\n");
  assert.equal(lines.length, 2);
  const tools = lines.map(l => JSON.parse(l).tool).sort();
  assert.deepEqual(tools, ["context.get_related", "context.search"]);
});

test("log writes to different date files", async () => {
  const dir = makeTempContext();
  const writer = new AuditWriter(dir);

  writer.log(makeEntry({ timestamp: "2025-06-15T10:00:00Z" }));
  writer.log(makeEntry({ timestamp: "2025-06-16T10:00:00Z" }));

  await new Promise((r) => setTimeout(r, 150));

  assert.ok(existsSync(join(dir, "audit", "2025-06-15.jsonl")));
  assert.ok(existsSync(join(dir, "audit", "2025-06-16.jsonl")));
});

test("log forwards entries to onEntry callback", async () => {
  const dir = makeTempContext();
  const seen = [];
  const writer = new AuditWriter(dir, {
    onEntry(entry) {
      seen.push(entry);
    },
  });

  writer.log(makeEntry({ event_type: "workflow_transition", evidence_level: "required" }));

  await new Promise((r) => setTimeout(r, 50));

  assert.equal(seen.length, 1);
  assert.equal(seen[0].event_type, "workflow_transition");
  assert.equal(seen[0].evidence_level, "required");
});
