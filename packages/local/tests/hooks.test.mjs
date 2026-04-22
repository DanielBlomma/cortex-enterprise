import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { register, shutdown, onSessionEnd, onToolEvent, onSessionEvent } = await import("../dist/index.js");
const { queueViolation } = await import("../dist/violations/push.js");
const { queueReviewResult } = await import("../dist/reviews/push.js");

class FakeServer {
  tools = [];

  registerTool(name, _definition, _handler) {
    this.tools.push(name);
  }
}

function makeTempProject(config = "") {
  const dir = mkdtempSync(join(tmpdir(), "cortex-hooks-"));
  const contextDir = join(dir, ".context");
  mkdirSync(contextDir, { recursive: true });
  if (config) {
    writeFileSync(join(contextDir, "enterprise.yaml"), config);
  }
  return dir;
}

test("tool and session events write hook-driven audit entries", async () => {
  const projectRoot = makeTempProject(`enterprise:
  endpoint: https://enterprise.example.com
  api_key: ctx_Abcdef1234567890
telemetry:
  enabled: false
audit:
  enabled: true
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  process.env.CORTEX_PROJECT_ROOT = projectRoot;

  try {
    await register(server);

    onToolEvent({
      phase: "success",
      tool: "context.search",
      timestamp: "2026-04-21T08:30:00.000Z",
      input: { query: "auth flow" },
      query: "auth flow",
      query_length: 9,
      result_count: 3,
      estimated_tokens_saved: 2400,
      entities_returned: ["file:src/auth.ts"],
      rules_applied: ["rule.auth_review"],
      duration_ms: 12,
    });

    await onSessionEvent({
      phase: "end",
      timestamp: "2026-04-21T08:31:00.000Z",
      duration_ms: 60000,
      tool_calls: 1,
      successful_tool_calls: 1,
      failed_tool_calls: 0,
      calls: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    const auditFile = join(projectRoot, ".context", "audit", "2026-04-21.jsonl");
    assert.equal(existsSync(auditFile), true);

    const lines = readFileSync(auditFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.ok(lines.some((entry) => entry.tool === "context.search" && entry.status === "success"));
    assert.ok(lines.some((entry) => entry.tool === "session.summary"));
  } finally {
    shutdown();
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }
});

test("session summary is included in shutdown audit push when end event is recorded first", async () => {
  const projectRoot = makeTempProject(`enterprise:
  endpoint: https://enterprise.example.com
  api_key: ctx_Abcdef1234567890
telemetry:
  enabled: false
audit:
  enabled: true
policy:
  enabled: true
  endpoint: https://enterprise.example.com/api/v1/policies/sync
  api_key: ctx_Abcdef1234567890
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalFetch = globalThis.fetch;
  const pushedBodies = [];
  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  globalThis.fetch = async (_url, init) => {
    pushedBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await register(server);

    await onSessionEvent({
      phase: "end",
      timestamp: "2026-04-21T08:31:00.000Z",
      duration_ms: 60000,
      tool_calls: 1,
      successful_tool_calls: 1,
      failed_tool_calls: 0,
      calls: [],
    });

    await onSessionEnd();

    assert.equal(pushedBodies.length, 1);
    assert.ok(
      pushedBodies[0].events.some((entry) => entry.tool === "session.summary"),
      "expected shutdown audit push to include session.summary",
    );
  } finally {
    globalThis.fetch = originalFetch;
    shutdown();
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }
});

test("shutdown flushes queued reviews and violations when telemetry is disabled", async () => {
  const projectRoot = makeTempProject(`enterprise:
  endpoint: https://enterprise.example.com
  api_key: ctx_Abcdef1234567890
telemetry:
  enabled: false
audit:
  enabled: true
policy:
  enabled: true
  endpoint: https://enterprise.example.com/api/v1/policies/sync
  api_key: ctx_Abcdef1234567890
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalFetch = globalThis.fetch;
  const pushedUrls = [];
  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  globalThis.fetch = async (url, init) => {
    pushedUrls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await register(server);

    queueViolation({
      rule_id: "prompt-injection-defense",
      severity: "error",
      message: "Prompt injection detected",
      occurred_at: "2026-04-21T08:31:00.000Z",
    });
    queueReviewResult({
      policy_id: "max-file-size",
      pass: false,
      severity: "warning",
      message: "File too large",
      reviewed_at: "2026-04-21T08:31:00.000Z",
    });

    await onSessionEnd();

    assert.ok(
      pushedUrls.includes("https://enterprise.example.com/api/v1/violations/push"),
      "expected shutdown to flush queued violations",
    );
    assert.ok(
      pushedUrls.includes("https://enterprise.example.com/api/v1/reviews/push"),
      "expected shutdown to flush queued review results",
    );
  } finally {
    globalThis.fetch = originalFetch;
    shutdown();
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }
});
