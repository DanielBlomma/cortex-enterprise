import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TelemetryCollector } from "../dist/telemetry/collector.js";

function makeTempContext() {
  return mkdtempSync(join(tmpdir(), "cortex-telem-"));
}

test("new collector starts with zero metrics", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  const m = c.getMetrics();

  assert.equal(m.searches, 0);
  assert.equal(m.related_lookups, 0);
  assert.equal(m.rule_lookups, 0);
  assert.equal(m.reloads, 0);
  assert.equal(m.total_results_returned, 0);
  assert.equal(m.estimated_tokens_saved, 0);
});

test("record increments correct counters", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);

  c.record("context.search", 5, 100);
  c.record("context.search", 3, 50);
  c.record("context.get_related", 2, 30);
  c.record("context.get_rules", 1, 10);
  c.record("context.reload", 0, 0);

  const m = c.getMetrics();
  assert.equal(m.searches, 2);
  assert.equal(m.related_lookups, 1);
  assert.equal(m.rule_lookups, 1);
  assert.equal(m.reloads, 1);
  assert.equal(m.total_results_returned, 11);
  assert.equal(m.estimated_tokens_saved, 190);
});

test("unknown tool name does not crash", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  c.record("unknown.tool", 1, 10);
  const m = c.getMetrics();
  assert.equal(m.total_results_returned, 1);
  assert.equal(m.estimated_tokens_saved, 10);
});

test("flush writes metrics to disk", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  c.record("context.search", 1, 10);
  c.flush();

  const metricsPath = join(dir, "telemetry", "metrics.json");
  assert.ok(existsSync(metricsPath));

  const saved = JSON.parse(readFileSync(metricsPath, "utf8"));
  assert.equal(saved.searches, 1);
  assert.equal(saved.estimated_tokens_saved, 10);
});

test("flush is a no-op when nothing recorded", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  c.flush();

  const metricsPath = join(dir, "telemetry", "metrics.json");
  assert.equal(existsSync(metricsPath), false);
});

test("collector loads existing metrics from disk", () => {
  const dir = makeTempContext();

  // Create first collector and write metrics
  const c1 = new TelemetryCollector(dir);
  c1.record("context.search", 5, 100);
  c1.flush();

  // New collector should load saved metrics
  const c2 = new TelemetryCollector(dir);
  const m = c2.getMetrics();
  assert.equal(m.searches, 1);
  assert.equal(m.total_results_returned, 5);
  assert.equal(m.estimated_tokens_saved, 100);
});

test("reset clears all metrics", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  c.record("context.search", 5, 100);
  c.reset();

  const m = c.getMetrics();
  assert.equal(m.searches, 0);
  assert.equal(m.total_results_returned, 0);
});

test("getMetrics returns a copy", () => {
  const dir = makeTempContext();
  const c = new TelemetryCollector(dir);
  c.record("context.search", 1, 10);
  const m1 = c.getMetrics();
  m1.searches = 999;
  const m2 = c.getMetrics();
  assert.equal(m2.searches, 1);
});
