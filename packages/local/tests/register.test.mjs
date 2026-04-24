import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { register, shutdown } = await import("../dist/index.js");

class FakeServer {
  tools = [];
  handlers = new Map();

  registerTool(name, _definition, handler) {
    this.tools.push(name);
    this.handlers.set(name, handler);
  }
}

function makeTempProject(config = "") {
  const dir = mkdtempSync(join(tmpdir(), "cortex-register-"));
  const contextDir = join(dir, ".context");
  mkdirSync(contextDir, { recursive: true });
  if (config) {
    writeFileSync(join(contextDir, "enterprise.yaml"), config);
  }
  return dir;
}

test("register exposes local tools without enterprise activation", async () => {
  const projectRoot = makeTempProject(`telemetry:
  enabled: false
audit:
  enabled: false
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let logs = "";

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  process.stderr.write = ((chunk, ...args) => {
    logs += String(chunk);
    return originalWrite(chunk, ...args);
  });

  try {
    await register(server);
  } finally {
    shutdown();
    process.stderr.write = originalWrite;
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }

  assert.ok(server.tools.includes("enterprise.status"));
  assert.ok(server.tools.includes("telemetry.status"));
  assert.ok(server.tools.includes("policy.sync"));
  assert.ok(server.tools.includes("workflow.status"));
  assert.match(logs, /\[cortex-enterprise\] cloud features inactive: missing_api_key/);
  assert.equal(existsSync(join(projectRoot, ".context", "telemetry", "metrics.json")), false);
  const removedTool = "lic" + "ense.status";
  assert.ok(!server.tools.includes(removedTool));
  const legacyHints = ["Lic" + "ense invalid", "lic" + "ensed to", "cortex" + ".lic"];
  for (const hint of legacyHints) {
    assert.equal(logs.includes(hint), false);
  }
});

test("register supports legacy policy-only config without enterprise activation", async () => {
  const projectRoot = makeTempProject(`policy:
  endpoint: https://policy.example.com
  api_key: ctx_Abcdef1234567890
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalWrite = process.stderr.write.bind(process.stderr);
  const originalFetch = globalThis.fetch;
  let logs = "";
  const calls = [];

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ rules: [] }), { status: 200 });
  };
  process.stderr.write = ((chunk, ...args) => {
    logs += String(chunk);
    return originalWrite(chunk, ...args);
  });

  try {
    await register(server);
  } finally {
    shutdown();
    globalThis.fetch = originalFetch;
    process.stderr.write = originalWrite;
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }

  assert.ok(server.tools.includes("enterprise.status"));
  assert.ok(server.tools.includes("policy.sync"));
  assert.ok(calls.some((call) => call.url === "https://policy.example.com"));
  assert.match(logs, /\[cortex-enterprise\] cloud features inactive: missing_api_key/);
});

test("register activates enterprise tools with valid enterprise config", async () => {
  const projectRoot = makeTempProject(`enterprise:
  endpoint: https://enterprise.example.com
  api_key: ctx_Abcdef1234567890
telemetry:
  enabled: false
audit:
  enabled: false
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let logs = "";

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  process.stderr.write = ((chunk, ...args) => {
    logs += String(chunk);
    return originalWrite(chunk, ...args);
  });

  try {
    await register(server);
  } finally {
    shutdown();
    process.stderr.write = originalWrite;
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }

  assert.ok(server.tools.includes("enterprise.status"));
  assert.ok(server.tools.includes("telemetry.status"));
  assert.ok(server.tools.includes("policy.sync"));
  assert.ok(server.tools.includes("workflow.status"));
  assert.ok(server.tools.includes("workflow.plan"));
  assert.ok(server.tools.includes("workflow.approve"));
  assert.match(logs, /\[cortex-enterprise\] v/);
});

test("register schedules compliance flushing even when telemetry is disabled", async () => {
  const projectRoot = makeTempProject(`policy:
  enabled: true
  endpoint: https://policy.example.com/api/v1/policies/sync
  api_key: ctx_Abcdef1234567890
  sync_interval_minutes: 7
telemetry:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const scheduled = [];

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  globalThis.fetch = async () => new Response(JSON.stringify({ rules: [] }), { status: 200 });
  globalThis.setInterval = ((fn, ms, ...args) => {
    const timer = {
      fn,
      ms,
      args,
      unref() {},
    };
    scheduled.push(timer);
    return timer;
  });
  globalThis.clearInterval = () => {};

  try {
    await register(server);
  } finally {
    shutdown();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }

  assert.equal(
    scheduled.filter((timer) => timer.ms === 7 * 60_000).length,
    2,
    "expected both policy sync and compliance flush timers when telemetry is disabled",
  );
});

test("context.review skips non-executable policies and writes review marker", async () => {
  const projectRoot = makeTempProject(`telemetry:
  enabled: false
audit:
  enabled: false
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  writeFileSync(
    join(projectRoot, ".context", "rules.yaml"),
    `rules:
  - id: no-secrets-in-code
    description: "No secrets"
    priority: 90
    scope: global
    enforce: true

  - id: rule.source_of_truth
    description: "Context rule"
    priority: 100
    scope: global
    enforce: true
`,
  );
  writeFileSync(join(projectRoot, "app.ts"), "export const value = 1;\n");

  try {
    await register(server);
    const review = server.handlers.get("context.review");
    assert.ok(review, "expected context.review handler to be registered");

    const result = await review({ scope: "changed", include_passed: true });
    const payload = result.structuredContent;

    assert.equal(payload.summary.total, 1);
    assert.equal(payload.summary.skipped, 1);
    assert.ok(Array.isArray(payload.results));
    assert.ok(payload.results.some((entry) => entry.policy_id === "no-secrets-in-code"));
    assert.ok(Array.isArray(payload.skipped_policies));
    assert.ok(
      payload.skipped_policies.some((entry) => entry.policy_id === "rule.source_of_truth"),
      "expected missing context rule to be surfaced as skipped",
    );

    const status = JSON.parse(readFileSync(join(projectRoot, ".context", "review-status.json"), "utf8"));
    assert.equal(status.reviewed, true);
    assert.equal(status.reviewer, "context.review");
  } finally {
    shutdown();
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }
});

test("context.review skips require-code-review during the review run", async () => {
  const projectRoot = makeTempProject(`telemetry:
  enabled: false
audit:
  enabled: false
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  writeFileSync(
    join(projectRoot, ".context", "rules.yaml"),
    `rules:
  - id: require-code-review
    description: "Require a completed review"
    priority: 100
    scope: global
    enforce: true
`,
  );

  try {
    await register(server);
    const review = server.handlers.get("context.review");
    assert.ok(review, "expected context.review handler to be registered");

    const result = await review({ scope: "changed", include_passed: true });
    const payload = result.structuredContent;

    assert.equal(payload.summary.total, 0);
    assert.equal(payload.summary.skipped, 1);
    assert.deepEqual(payload.results, []);
    assert.ok(
      payload.skipped_policies.some((entry) => entry.policy_id === "require-code-review"),
      "expected require-code-review to be skipped while context.review is recording the review",
    );

    const status = JSON.parse(readFileSync(join(projectRoot, ".context", "review-status.json"), "utf8"));
    assert.equal(status.reviewed, true);
    assert.equal(status.reviewer, "context.review");
  } finally {
    shutdown();
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }
});
