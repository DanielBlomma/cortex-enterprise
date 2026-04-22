# Compliance Control Mapping

This document describes how Cortex Enterprise evidence maps to enterprise control areas.

It is intentionally conservative.

- `covered` means the product generates direct supporting evidence for the control area.
- `partial` means the product helps materially, but a reviewer would still expect additional process or evidence.
- `manual` means the responsibility remains primarily outside the product.

This mapping supports:

- ISO 27001
- ISO 42001
- SOC 2 Type II

It does not claim that using Cortex Enterprise alone makes a customer certified.

## Control Areas

### GOV-001 Policy Governance And Organizational Rules

Product evidence:

- dashboard-managed policies
- enforcement mode
- policy sync to enterprise clients
- policy metadata in compliance reports

Framework areas:

- ISO 27001: A.5 information security policies
- ISO 42001: policy and AI governance direction
- SOC 2 Type II: CC1 control environment

Typical status logic:

- `covered` when active and enforced policies exist
- `partial` when policies exist but enforcement is not yet strong enough
- `manual` when policy governance is only documented outside the product

### ACC-001 Access Control And Accountability

Product evidence:

- organization-bound API keys
- environment attribution
- revocation history
- audit evidence for key use

Framework areas:

- ISO 27001: A.9 access control
- ISO 42001: accountability and role assignment
- SOC 2 Type II: CC6 logical access

### OPS-001 Operational Logging And Monitoring

Product evidence:

- telemetry pushes
- audit trail
- policy violations
- tool and session activity

Framework areas:

- ISO 27001: A.12 logging and monitoring
- ISO 42001: operational monitoring of AI-assisted work
- SOC 2 Type II: CC7 system operations

### WF-001 Governed Development Workflow

Product evidence:

- persisted workflow snapshots
- plan/review/approval state
- machine-readable review results

Framework areas:

- ISO 27001: controlled change and secure development evidence
- ISO 42001: AI lifecycle oversight and human review
- SOC 2 Type II: CC1 / CC7 change governance evidence

### AI-001 AI Data Boundary And Transparency

Product evidence:

- documented outbound telemetry boundary
- documented audit boundary
- strict validators rejecting raw-content telemetry/audit payloads
- retention metadata for telemetry and audit evidence

Framework areas:

- ISO 27001: information transfer and data minimization
- ISO 42001: AI transparency, oversight, and data handling
- SOC 2 Type II: confidentiality and system-boundary controls

## Residual Customer Responsibilities

The customer still owns:

- certification scope and auditor engagement
- statement of applicability and formal control narratives
- identity governance outside Cortex
- incident response and escalation workflows
- exception management and risk acceptance
- policy authoring decisions and review expectations
- legal, regulatory, and contractual interpretation

## Review Guidance

When reviewing the control matrix in `cortex-web`, apply a skeptical standard:

- ask whether the selected period contains direct evidence
- avoid treating product capability as the same thing as organizational compliance
- downgrade to `partial` or `manual` whenever the evidence is missing, thin, or process-dependent
