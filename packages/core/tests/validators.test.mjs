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

test("builtins register all core validators", () => {
  const ids = getRegisteredPolicyIds();
  assert.ok(ids.includes("max-file-size"));
  assert.ok(ids.includes("require-test-coverage"));
  assert.ok(ids.includes("no-external-api-calls"));
  assert.ok(ids.includes("require-code-review"));
  assert.ok(ids.includes("no-secrets-in-code"));
  assert.ok(ids.includes("no-env-in-prompts"));
});

test("engine reports warning for enforced policy with no registered validator", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["policy-that-does-not-exist"]),
      { contextDir, projectRoot, changedFiles: [] },
      {},
    );
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].policy_id, "policy-that-does-not-exist");
    assert.equal(output.results[0].pass, false);
    assert.equal(output.results[0].severity, "warning");
    assert.match(output.results[0].message, /No validator implementation/);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-secrets-in-code detects AWS access key in JSON config", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(projectRoot, "appsettings.Development.json"),
      JSON.stringify({
        AWS: { AccessKey: "AKIAIOSFODNN7EXAMPLE", Secret: "<redacted>" },
        ConnectionStrings: { Default: "Server=.;Database=app;User=admin;Password=Sup3rSecret!;" },
      }, null, 2),
    );

    const output = await runValidators(
      new Set(["no-secrets-in-code"]),
      { contextDir, projectRoot, changedFiles: ["appsettings.Development.json"] },
      {},
    );
    const result = output.results[0];
    assert.equal(result.pass, false);
    assert.equal(result.severity, "error");
    assert.match(result.detail ?? "", /AWS access key/);
    assert.match(result.detail ?? "", /Connection string password/);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-secrets-in-code scans .env files", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(projectRoot, ".env.production"),
      "API_KEY=\"ghp_1234567890abcdefghijklmnopqrstuvwxyz\"\nDEBUG=false\n",
    );

    const output = await runValidators(
      new Set(["no-secrets-in-code"]),
      { contextDir, projectRoot, changedFiles: [".env.production"] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /GitHub PAT/);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-secrets-in-code ignores obvious placeholders", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(projectRoot, "config.json"),
      JSON.stringify({ password: "<password>", apikey: "changeme" }, null, 2),
    );

    const output = await runValidators(
      new Set(["no-secrets-in-code"]),
      { contextDir, projectRoot, changedFiles: ["config.json"] },
      {},
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-env-in-prompts detects env access inside prompt string", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(projectRoot, "agent.ts"),
      [
        "const systemPrompt = `You are an assistant. Token: ${process.env.API_SECRET}`;",
        "await llm.complete({ messages: [{ role: 'system', content: systemPrompt }] });",
      ].join("\n"),
    );

    const output = await runValidators(
      new Set(["no-env-in-prompts"]),
      { contextDir, projectRoot, changedFiles: ["agent.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /process\.env\.API_SECRET/);
  } finally {
    cleanup(projectRoot);
  }
});

test("no-env-in-prompts ignores env use outside prompt context", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(projectRoot, "server.ts"),
      "const port = Number(process.env.PORT) || 3000;\nconsole.log('listening', port);\n",
    );

    const output = await runValidators(
      new Set(["no-env-in-prompts"]),
      { contextDir, projectRoot, changedFiles: ["server.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
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
