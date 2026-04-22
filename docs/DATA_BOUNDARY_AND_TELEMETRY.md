# Data Boundary And Telemetry

This document defines what Cortex Enterprise may send to `cortex-web` during Step 6 of the compliance roadmap.

## Outbound Rule

Outbound telemetry and audit payloads are limited to counts, identifiers, timestamps, and redacted metadata summaries.

The following must not leave the developer machine by default:

- source code
- raw prompts
- raw search queries
- embeddings
- graph data
- full file contents

## Telemetry

Telemetry is aggregate-only.

Allowed outbound telemetry fields:

- `period_start`
- `period_end`
- `total_tool_calls`
- `successful_tool_calls`
- `failed_tool_calls`
- `total_duration_ms`
- `session_starts`
- `session_ends`
- `session_duration_ms_total`
- `searches`
- `related_lookups`
- `caller_lookups`
- `trace_lookups`
- `impact_analyses`
- `rule_lookups`
- `reloads`
- `total_results_returned`
- `estimated_tokens_saved`
- `estimated_tokens_total`
- `client_version`
- `instance_id`
- `session_id`
- `tool_metrics`

Telemetry retention target:

- 30 days in `cortex-web`

## Audit

Audit events are allowed to leave the machine only after redaction.

Outbound audit rules:

- raw string values are summarized to type and length
- sensitive keys such as `query`, `prompt`, `content`, `code`, `diff`, `patch`, `body`, `embedding`, and `graph` are redacted
- numeric counters, booleans, timestamps, tool names, ids, and summarized key counts may be retained

Audit retention targets:

- required evidence: 365 days
- diagnostic evidence: 30 days

## Review Notes

- Local `.context` data may contain richer developer-local evidence than the cloud payload.
- `cortex-web` validators reject unexpected telemetry fields and reject audit payloads that still contain disallowed raw-content keys.
- Compliance claims for data boundary behavior should be reviewed against both the code and these tests before release.
