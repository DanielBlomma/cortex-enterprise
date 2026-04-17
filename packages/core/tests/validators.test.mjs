import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import builtins to register validators
import "../dist/validators/builtins.js";
import { runValidators, getRegisteredPolicyIds } from "../dist/validators/engine.js";
import { parseValidatorsConfig } from "../dist/validators/config.js";

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cortex-val-"));
  const contextDir = path.join(dir, ".context");
  fs.mkdirSync(contextDir, { recursive: true });
  return { projectRoot: dir, contextDir };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- engine ---

test("builtins register 4 validators", () => {
  const ids = getRegisteredPolicyIds();
  assert.ok(ids.includes("max-file-size"));
  assert.ok(ids.includes("require-test-coverage"));
  assert.ok(ids.includes("no-external-api-calls"));
  assert.ok(ids.includes("require-code-review"));
});

test("runValidators skips non-enforced policies", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["max-file-size"]),
      { contextDir, projectRoot, changedFiles: [] },
      {},
    );
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].policy_id, "max-file-size");
  } finally {
    cleanup(projectRoot);
  }
});

test("runValidators returns correct summary", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["max-file-size", "require-code-review"]),
      { contextDir, projectRoot, changedFiles: [] },
      {},
    );
    assert.equal(output.summary.total, 2);
    // max-file-size passes with no changed files, require-code-review fails (no status file)
    assert.equal(output.summary.passed, 1);
  } finally {
    cleanup(projectRoot);
  }
});

// --- max-file-size ---

test("max-file-size passes when all files under limit", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "small.ts"), "x".repeat(100));
    const output = await runValidators(
      new Set(["max-file-size"]),
      { contextDir, projectRoot, changedFiles: ["small.ts"] },
      { "max-file-size": { max_bytes: 1000 } },
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("max-file-size fails when file exceeds limit", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "big.ts"), "x".repeat(2000));
    const output = await runValidators(
      new Set(["max-file-size"]),
      { contextDir, projectRoot, changedFiles: ["big.ts"] },
      { "max-file-size": { max_bytes: 1000 } },
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].message, /exceed/);
  } finally {
    cleanup(projectRoot);
  }
});

// --- require-test-coverage ---

test("require-test-coverage fails when no coverage file", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["require-test-coverage"]),
      { contextDir, projectRoot },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].message, /not found/);
  } finally {
    cleanup(projectRoot);
  }
});

test("require-test-coverage passes when above threshold", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const coverageDir = path.join(projectRoot, "coverage");
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify({ total: { lines: { pct: 92 }, branches: { pct: 85 } } }),
    );
    const output = await runValidators(
      new Set(["require-test-coverage"]),
      { contextDir, projectRoot },
      { "require-test-coverage": { threshold: 80 } },
    );
    assert.equal(output.results[0].pass, true);
    assert.match(output.results[0].message, /92\.0%/);
  } finally {
    cleanup(projectRoot);
  }
});

test("require-test-coverage fails when below threshold", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const coverageDir = path.join(projectRoot, "coverage");
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify({ total: { lines: { pct: 45 }, branches: { pct: 30 } } }),
    );
    const output = await runValidators(
      new Set(["require-test-coverage"]),
      { contextDir, projectRoot },
      { "require-test-coverage": { threshold: 80 } },
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].message, /below/);
  } finally {
    cleanup(projectRoot);
  }
});

// --- no-external-api-calls ---

test("no-external-api-calls passes with clean files", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "clean.ts"), "const x = 1;\nconsole.log(x);\n");
    const output = await runValidators(
      new Set(["no-external-api-calls"]),
      { contextDir, projectRoot, changedFiles: ["clean.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-external-api-calls detects fetch calls", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "api.ts"), 'const res = await fetch("https://api.example.com");\n');
    const output = await runValidators(
      new Set(["no-external-api-calls"]),
      { contextDir, projectRoot, changedFiles: ["api.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail, /fetch\(/);
  } finally {
    cleanup(projectRoot);
  }
});

// --- require-code-review ---

test("require-code-review fails without review-status.json", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["require-code-review"]),
      { contextDir, projectRoot },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].message, /No code review/);
  } finally {
    cleanup(projectRoot);
  }
});

test("require-code-review passes with approved review", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(contextDir, "review-status.json"),
      JSON.stringify({ reviewed: true, reviewer: "alice", timestamp: "2026-04-16T10:00:00Z" }),
    );
    const output = await runValidators(
      new Set(["require-code-review"]),
      { contextDir, projectRoot },
      {},
    );
    assert.equal(output.results[0].pass, true);
    assert.match(output.results[0].message, /alice/);
  } finally {
    cleanup(projectRoot);
  }
});

// --- config parsing ---

test("parseValidatorsConfig extracts nested fields", () => {
  const fields = {
    "validators.max-file-size.max_bytes": "500000",
    "validators.require-test-coverage.threshold": "80",
    "validators.require-test-coverage.coverage_path": "coverage/lcov.json",
    "validators.no-external-api-calls.patterns": '["fetch(", "axios."]',
    "telemetry.enabled": "true",  // should be ignored
  };
  const config = parseValidatorsConfig(fields);
  assert.equal(config["max-file-size"].max_bytes, 500000);
  assert.equal(config["require-test-coverage"].threshold, 80);
  assert.equal(config["require-test-coverage"].coverage_path, "coverage/lcov.json");
  assert.deepEqual(config["no-external-api-calls"].patterns, ["fetch(", "axios."]);
});

test("parseValidatorsConfig returns empty for no validators", () => {
  const config = parseValidatorsConfig({ "telemetry.enabled": "true" });
  assert.deepEqual(config, {});
});
