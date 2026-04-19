import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import builtins to register validators
import "../dist/validators/builtins.js";
import {
  runValidators,
  getRegisteredPolicyIds,
  getRegisteredEvaluatorTypes,
} from "../dist/validators/engine.js";
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

// --- generic evaluator dispatcher (M2) ---

test("builtins register regex evaluator type", () => {
  const types = getRegisteredEvaluatorTypes();
  assert.ok(types.includes("regex"));
});

test("runValidators dispatches to generic evaluator when policy has type", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "app.ts"), "const x = 1; // FIXME: urgent\n");
    const output = await runValidators(
      [
        {
          id: "custom:no-fixme",
          type: "regex",
          config: {
            pattern: "FIXME",
            severity: "error",
            message: "FIXME marker found",
          },
        },
      ],
      { contextDir, projectRoot, changedFiles: ["app.ts"] },
      {},
    );
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].policy_id, "custom:no-fixme");
    assert.equal(output.results[0].pass, false);
    assert.equal(output.results[0].severity, "error");
    assert.match(output.results[0].message, /FIXME marker found/);
    assert.match(output.results[0].detail ?? "", /app\.ts:1/);
  } finally {
    cleanup(projectRoot);
  }
});

test("regex evaluator respects file_pattern filter", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "app.ts"), "TODO: refactor\n");
    fs.writeFileSync(path.join(projectRoot, "README.md"), "TODO: document\n");
    const output = await runValidators(
      [
        {
          id: "custom:todo-in-code",
          type: "regex",
          config: {
            pattern: "TODO",
            file_pattern: "\\.ts$",
          },
        },
      ],
      { contextDir, projectRoot, changedFiles: ["app.ts", "README.md"] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /app\.ts/);
    assert.doesNotMatch(output.results[0].detail ?? "", /README\.md/);
  } finally {
    cleanup(projectRoot);
  }
});

test("regex evaluator passes when no changed files match pattern", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.writeFileSync(path.join(projectRoot, "clean.ts"), "const ok = 1;\n");
    const output = await runValidators(
      [
        { id: "custom:no-fixme", type: "regex", config: { pattern: "FIXME" } },
      ],
      { contextDir, projectRoot, changedFiles: ["clean.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("regex evaluator errors on invalid regex config", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      [
        { id: "custom:broken", type: "regex", config: { pattern: "[unclosed" } },
      ],
      { contextDir, projectRoot, changedFiles: ["any.ts"] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.equal(output.results[0].severity, "error");
    assert.match(output.results[0].message, /Invalid regex config/);
  } finally {
    cleanup(projectRoot);
  }
});

test("engine warns when policy type has no registered evaluator", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      [
        { id: "custom:future", type: "some_future_type", config: {} },
      ],
      { contextDir, projectRoot, changedFiles: [] },
      {},
    );
    assert.equal(output.results[0].pass, false);
    assert.equal(output.results[0].severity, "warning");
    assert.match(output.results[0].message, /No evaluator registered for type/);
  } finally {
    cleanup(projectRoot);
  }
});

test("engine falls back to name-based registry when policy has no type", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      [{ id: "require-code-review" }],
      { contextDir, projectRoot },
      {},
    );
    // No review-status.json → require-code-review should fail with its own
    // message, confirming dispatch went to the name-based validator.
    assert.equal(output.results[0].policy_id, "require-code-review");
    assert.equal(output.results[0].pass, false);
    assert.doesNotMatch(output.results[0].message, /No validator implementation/);
  } finally {
    cleanup(projectRoot);
  }
});

test("runValidators accepts Set<string> for backcompat", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const output = await runValidators(
      new Set(["require-code-review"]),
      { contextDir, projectRoot },
      {},
    );
    assert.equal(output.results[0].policy_id, "require-code-review");
  } finally {
    cleanup(projectRoot);
  }
});

// --- code_comments evaluator (M3) ---

test("builtins register code_comments evaluator type", () => {
  const types = getRegisteredEvaluatorTypes();
  assert.ok(types.includes("code_comments"));
});

async function runCodeComments(projectRoot, contextDir, filename, content, config = {}) {
  fs.writeFileSync(path.join(projectRoot, filename), content);
  return runValidators(
    [{ id: "custom:code-comments", type: "code_comments", config: { min_lines: 6, ...config } }],
    { contextDir, projectRoot, changedFiles: [filename] },
    {},
  );
}

const LONG_BODY = Array.from({ length: 8 }, (_, i) => `  const v${i} = ${i};`).join("\n");
const LONG_BODY_PY = Array.from({ length: 8 }, (_, i) => `    v${i} = ${i}`).join("\n");

test("code_comments flags undocumented long TypeScript function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `function doWork() {\n${LONG_BODY}\n  return 0;\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.ts", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.ts:1 — doWork/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments passes when TypeScript function has leading comment", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `// computes the work\nfunction doWork() {\n${LONG_BODY}\n  return 0;\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.ts", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments ignores short TypeScript function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = "function tiny() {\n  return 1;\n}\n";
    const output = await runCodeComments(projectRoot, contextDir, "a.ts", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments flags undocumented long Python function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `def do_work():\n${LONG_BODY_PY}\n    return 0\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.py", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.py:1 — do_work/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments accepts Python docstring as documentation", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `def do_work():\n    """Does work."""\n${LONG_BODY_PY}\n    return 0\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.py", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments flags undocumented long Go function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `func DoWork() int {\n${LONG_BODY}\n  return 0\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.go", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.go:1 — DoWork/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments passes commented Go function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `// DoWork does the work.\nfunc DoWork() int {\n${LONG_BODY}\n  return 0\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.go", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments flags undocumented long Rust function", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `pub fn do_work() -> i32 {\n${LONG_BODY}\n  0\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.rs", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.rs:1 — do_work/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments flags undocumented long C# method", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `public class Svc {\n  public int DoWork() {\n${LONG_BODY}\n    return 0;\n  }\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.cs", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.cs:2 — DoWork/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments passes C# method with /// doc comment", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `public class Svc {\n  /// <summary>Does the work.</summary>\n  public int DoWork() {\n${LONG_BODY}\n    return 0;\n  }\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.cs", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments flags undocumented long Java method", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = `public class Svc {\n  public int doWork() {\n${LONG_BODY}\n    return 0;\n  }\n}\n`;
    const output = await runCodeComments(projectRoot, contextDir, "a.java", content);
    assert.equal(output.results[0].pass, false);
    assert.match(output.results[0].detail ?? "", /a\.java:2 — doWork/);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments respects allowlist paths (tests/)", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    fs.mkdirSync(path.join(projectRoot, "tests"), { recursive: true });
    const content = `function doWork() {\n${LONG_BODY}\n  return 0;\n}\n`;
    const output = await runCodeComments(
      projectRoot,
      contextDir,
      "tests/helpers.ts",
      content,
    );
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});

test("code_comments skips unsupported file extensions", async () => {
  const { projectRoot, contextDir } = makeTempProject();
  try {
    const content = "some content that would match loosely";
    const output = await runCodeComments(projectRoot, contextDir, "a.md", content);
    assert.equal(output.results[0].pass, true);
  } finally {
    cleanup(projectRoot);
  }
});
