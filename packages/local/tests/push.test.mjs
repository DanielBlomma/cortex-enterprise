import test from "node:test";
import assert from "node:assert/strict";

const {
  pendingCount,
  pushAuditEvents,
  queueAuditEvent,
  setAuditPushContext,
} = await import("../dist/audit/push.js");

function makeEntry(index) {
  return {
    timestamp: "2026-04-21T10:00:00.000Z",
    tool: `context.search.${index}`,
    input: { query: { type: "string", length: 5, redacted: true } },
    result_count: index,
    entities_returned: [],
    rules_applied: [],
    duration_ms: 5,
    status: "success",
    event_type: "tool_call",
    evidence_level: "diagnostic",
  };
}

async function drainQueue() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  try {
    while (pendingCount() > 0) {
      await pushAuditEvents("https://enterprise.example.com/api/v1/policies/sync", "ctx_Abcdef1234567890");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("pushAuditEvents drains all queued audit batches in one call", async () => {
  await drainQueue();

  setAuditPushContext({
    repo: "cortex-enterprise",
    instance_id: "instance-123",
    session_id: "session-123",
  });

  for (let i = 0; i < 205; i++) {
    queueAuditEvent(makeEntry(i));
  }

  const originalFetch = globalThis.fetch;
  const batches = [];
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    batches.push(payload.events.length);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const result = await pushAuditEvents(
      "https://enterprise.example.com/api/v1/policies/sync",
      "ctx_Abcdef1234567890",
    );

    assert.deepEqual(batches, [100, 100, 5]);
    assert.deepEqual(result, { success: true, count: 205 });
    assert.equal(pendingCount(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    await drainQueue();
  }
});
