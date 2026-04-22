import test from "node:test";
import assert from "node:assert/strict";

const {
  OUTBOUND_DATA_BOUNDARY,
  buildTelemetryPushPayload,
  sanitizeAuditEntryForPush,
} = await import("../dist/privacy/boundary.js");

test("telemetry payload includes only whitelisted aggregated fields", () => {
  const payload = buildTelemetryPushPayload(
    {
      period_start: "2026-04-21T10:00:00Z",
      period_end: "2026-04-21T10:10:00Z",
      total_tool_calls: 5,
      successful_tool_calls: 4,
      failed_tool_calls: 1,
      total_duration_ms: 1000,
      session_starts: 1,
      session_ends: 1,
      session_duration_ms_total: 600000,
      searches: 2,
      related_lookups: 1,
      caller_lookups: 0,
      trace_lookups: 0,
      impact_analyses: 0,
      rule_lookups: 1,
      reloads: 0,
      total_results_returned: 12,
      estimated_tokens_saved: 5000,
      estimated_tokens_total: 6200,
      client_version: "0.9.1",
      instance_id: "abcdef1234567890",
      tool_metrics: {
        "context.search": {
          calls: 2,
          failures: 0,
          total_duration_ms: 50,
          total_results_returned: 12,
          estimated_tokens_saved: 5000,
        },
      },
      accidental_field: "should-not-leave-machine",
    },
    { session_id: "session_12345678" },
  );

  assert.equal("accidental_field" in payload, false);
  assert.equal(payload.session_id, "session_12345678");
  assert.deepEqual(
    Object.keys(payload).sort(),
    [...OUTBOUND_DATA_BOUNDARY.telemetry.allowed_fields].sort(),
  );
});

test("audit payload redacts raw prompt and query-like strings", () => {
  const entry = sanitizeAuditEntryForPush({
    timestamp: "2026-04-21T10:00:00Z",
    tool: "context.search",
    input: {
      query: "find all auth tokens in src/auth.ts",
      top_k: 5,
      filters: ["src/auth.ts", "src/lib.ts"],
    },
    result_count: 3,
    entities_returned: ["src/auth.ts"],
    rules_applied: [],
    duration_ms: 15,
    event_type: "tool_call",
    evidence_level: "diagnostic",
    metadata: {
      prompt: "show me the code",
      query_length: 34,
      nested: {
        content: "secret text",
      },
    },
  });

  assert.deepEqual(entry.input.query, {
    type: "string",
    length: "find all auth tokens in src/auth.ts".length,
    redacted: true,
  });
  assert.equal(entry.input.top_k, 5);
  assert.equal(entry.metadata.query_length, 34);
  assert.deepEqual(entry.metadata.prompt, {
    type: "string",
    length: "show me the code".length,
    redacted: true,
  });
  assert.deepEqual(entry.metadata.nested.content, {
    type: "string",
    length: "secret text".length,
    redacted: true,
  });
});
