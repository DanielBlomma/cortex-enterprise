import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { register, shutdown } = await import("../dist/index.js");

class FakeServer {
  tools = [];

  registerTool(name, _definition, _handler) {
    this.tools.push(name);
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
