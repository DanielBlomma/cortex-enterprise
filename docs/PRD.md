# Cortex Enterprise — Product Requirements Document

**Version:** 0.1 (Draft)
**Author:** Daniel Blomma
**Date:** 2026-04-02
**Status:** Planning

---

## 1. Problem Statement

Organizations adopting AI coding agents (Claude Code, Copilot, Cursor) have no way to:

1. **Control** what context agents receive and what actions they may take
2. **Measure** the ROI of AI agent investments across teams
3. **Enforce** architectural rules and policies consistently across repos
4. **Audit** what agents did, why, and based on what context
5. **Comply** with security requirements that prohibit data leaving the network

Cortex Community solves the context quality problem for individual developers. Enterprise extends this to organizational governance, observability, and compliance.

---

## 2. Target Users

### Primary Personas

| Persona | Role | Need |
|---|---|---|
| **Platform Lead** | Manages developer tooling for 50-500 devs | Wants to roll out AI agents safely with guardrails and ROI tracking |
| **Security/Compliance Officer** | Enforces SOC2, ISO 27001, internal policies | Needs audit trails proving AI agents were governed by rules |
| **Engineering Manager** | Owns 5-20 repos with a team of 10-30 devs | Wants org-wide architectural consistency enforced automatically |
| **Developer (air-gapped)** | Works in restricted environment (bank, defense) | Needs full Cortex functionality with zero internet dependency |

### Secondary Personas

| Persona | Role | Need |
|---|---|---|
| **CTO / VP Engineering** | Budget owner | Needs ROI data to justify AI agent spend |
| **Individual Developer** | Uses Cortex daily | Wants enterprise features to "just work" without extra config |

---

## 3. Product Editions

### 3.1 Enterprise Connected

**For:** Organizations with internet access that want centralized governance.

#### Features

| ID | Feature | Priority | Description |
|---|---|---|---|
| EC-01 | SSO/SAML Authentication | P0 | Developers authenticate via existing identity provider |
| EC-02 | Telemetry Dashboard | P0 | Web dashboard showing aggregated token savings, search usage, freshness across all repos |
| EC-03 | Org-wide Policy Sync | P0 | Central rules pushed to all repos; local Cortex enforces them |
| EC-04 | Audit Log | P1 | Records: who searched, what context was returned, which rules applied |
| EC-05 | RBAC | P1 | Roles: admin (manage policies), developer (use), readonly (view dashboards) |
| EC-06 | Multi-repo Search | P2 | Search across all indexed repos from a single query |
| EC-07 | Cross-repo Impact Analysis | P2 | "If we change auth module in repo A, what breaks in repo B?" |
| EC-08 | Freshness Alerts | P2 | Slack/email notification when a repo's index goes stale |
| EC-09 | Managed Embeddings API | P3 | GPU-backed embedding service for faster/better models |
| EC-10 | Integrations | P3 | Datadog, Grafana, Slack, PagerDuty webhooks |

#### Data Flow

```
Developer's machine                    Cortex Cloud
┌──────────────┐                      ┌──────────────────┐
│ Cortex local │──── telemetry ──────►│ Analytics API    │
│              │  (token count,       │                  │
│              │   search count,      ├──────────────────┤
│              │   freshness %)       │ Policy API       │
│              │◄── policy sync ──────│                  │
│              │  (rules, config)     ├──────────────────┤
│              │                      │ Auth API         │
│              │──── auth token ─────►│ (SSO/SAML)       │
└──────────────┘                      └──────────────────┘

NEVER sent: source code, embeddings, graph data, search queries (unless opt-in)
```

### 3.2 Enterprise Air-gapped

**For:** Organizations where no data may leave the network.

#### Features

| ID | Feature | Priority | Description |
|---|---|---|---|
| EA-01 | Offline License Validation | P0 | Signed `.lic` file verified with embedded public key, no phone-home |
| EA-02 | Bundled Embedding Model | P0 | Embedding model shipped inside the package, no HuggingFace download |
| EA-03 | Local Policy Files | P0 | Rules distributed as files (git, USB, internal portal), not via API |
| EA-04 | Tarball Distribution | P0 | `.tgz` package installable without npm registry access |
| EA-05 | Docker Image | P1 | Pre-built Docker image with all dependencies for air-gapped install |
| EA-06 | Local Audit Log | P1 | Audit log written to local files, exportable for compliance review |
| EA-07 | License Dashboard | P2 | Local dashboard showing license status, expiry, usage |
| EA-08 | Offline Update Mechanism | P3 | Delta-update packages for patching without full reinstall |

#### License File Format

```yaml
# .context/cortex.lic
customer: "ACME Corp"
edition: "air-gapped"
issued: "2026-04-02"
expires: "2027-04-02"
max_repos: 50
features:
  - audit_log
  - policy_local
  - bundled_embeddings
signature: "<base64-encoded Ed25519 signature>"
```

Validation: Ed25519 public key embedded in the package verifies the signature. No network call required.

---

## 4. Functional Requirements

### 4.1 Plugin Loader (DONE)

| ID | Requirement | Status |
|---|---|---|
| FR-01 | Public Cortex dynamically imports `@danielblomma/cortex-enterprise` at startup | Done |
| FR-02 | If enterprise package not installed, Cortex runs in community mode silently | Done |
| FR-03 | Enterprise package exports `register(server)` to add tools/hooks | Done |
| FR-04 | Dashboard shows `[Community]` or `[Enterprise]` in header | Done |
| FR-05 | Type declarations allow enterprise to import core types | Done |

### 4.2 License System

| ID | Requirement | Status |
|---|---|---|
| FR-10 | Read `.context/cortex.lic` at startup | Planned |
| FR-11 | Validate Ed25519 signature using embedded public key | Planned |
| FR-12 | Check expiry date; warn 30 days before expiry | Planned |
| FR-13 | Check max_repos limit against active indexed repos | Planned |
| FR-14 | If license invalid/expired: log warning, disable enterprise tools, fall back to community | Planned |
| FR-15 | Expose `license.status` MCP tool returning license info | Planned |

### 4.3 Telemetry (Connected Only)

| ID | Requirement | Status |
|---|---|---|
| FR-20 | Collect anonymized metrics: token savings, search count, freshness %, entity counts | Planned |
| FR-21 | Push metrics to Cortex Cloud API on configurable interval (default: hourly) | Planned |
| FR-22 | Opt-in only; disabled by default until explicitly enabled in config | Planned |
| FR-23 | Never send: source code, embeddings, search queries, file contents | Planned |
| FR-24 | Expose `telemetry.status` MCP tool showing what is being sent | Planned |

### 4.4 Policy Sync (Connected Only)

| ID | Requirement | Status |
|---|---|---|
| FR-30 | Pull org-wide rules from Cortex Cloud API | Planned |
| FR-31 | Merge org rules with local `.context/rules.yaml` (org rules take priority) | Planned |
| FR-32 | Sync interval configurable (default: on startup + every 4 hours) | Planned |
| FR-33 | Offline fallback: use last-synced rules if API unreachable | Planned |
| FR-34 | Expose `policy.sync` MCP tool for manual sync | Planned |

### 4.5 Audit Log

| ID | Requirement | Status |
|---|---|---|
| FR-40 | Log every MCP tool call: timestamp, tool name, input params, result summary | Planned |
| FR-41 | Log which rules were applied to search results | Planned |
| FR-42 | Store in `.context/audit/` as daily JSONL files | Planned |
| FR-43 | Connected: optionally push audit events to Cortex Cloud | Planned |
| FR-44 | Expose `audit.query` MCP tool for searching audit history | Planned |

### 4.6 Enterprise MCP Tools

| ID | Tool Name | Description | Status |
|---|---|---|---|
| FR-50 | `license.status` | Returns license info, validity, expiry | Planned |
| FR-51 | `telemetry.status` | Shows telemetry config and last push | Planned |
| FR-52 | `policy.sync` | Triggers manual policy sync | Planned |
| FR-53 | `policy.list` | Lists all active policies (local + org) | Planned |
| FR-54 | `audit.query` | Search audit log by date range, tool, entity | Planned |
| FR-55 | `enterprise.status` | Overview: edition, license, telemetry, policy health | Planned |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Plugin load time | < 100ms added to server startup |
| NFR-02 | License validation | < 10ms (pure crypto, no I/O beyond file read) |
| NFR-03 | Telemetry payload size | < 1KB per push |
| NFR-04 | Audit log disk usage | < 1MB/month per active repo |
| NFR-05 | Zero source code leakage | No file contents, embeddings, or graph data sent externally |
| NFR-06 | Graceful degradation | If any enterprise feature fails, fall back to community silently |
| NFR-07 | No breaking changes to community | Enterprise plugin must never alter community tool behavior |
| NFR-08 | Air-gapped: zero network calls | Verified by running with network disabled |

---

## 6. Implementation Phases

### Phase 1: Foundation (Target: v0.1.0)

**Goal:** Enterprise plugin loads and license validation works.

- [x] Plugin loader in public Cortex
- [x] Enterprise package scaffolding
- [x] Edition detection in dashboard
- [ ] License file parser and Ed25519 validator
- [ ] `license.status` MCP tool
- [ ] `enterprise.status` MCP tool
- [ ] Bundled embedding model for air-gapped delivery

**Exit criteria:** Customer can install enterprise package with a license file and see "Enterprise" in dashboard.

### Phase 2: Observability (Target: v0.2.0)

**Goal:** Organizations can measure AI agent ROI.

- [ ] Telemetry collector (local metrics aggregation)
- [ ] Telemetry push to cloud API (connected)
- [ ] `telemetry.status` MCP tool
- [ ] Audit log writer (JSONL)
- [ ] `audit.query` MCP tool
- [ ] Token savings export (PDF/CSV)

**Exit criteria:** Platform lead can see aggregated token savings across repos in a dashboard.

### Phase 3: Governance (Target: v0.3.0)

**Goal:** Organizations can enforce rules across all repos.

- [ ] Policy sync from cloud API (connected)
- [ ] Local policy files (air-gapped)
- [ ] Org-rule merge with local rules
- [ ] `policy.sync` and `policy.list` MCP tools
- [ ] RBAC foundation (admin vs developer)

**Exit criteria:** Engineering manager can push a rule to all repos and verify it's enforced.

### Phase 4: Cloud Platform (Target: v0.4.0)

**Goal:** Web-based admin dashboard for enterprise.

- [ ] Cortex Cloud API (auth, telemetry, policy endpoints)
- [ ] Web dashboard (SSO login, analytics views)
- [ ] Multi-repo search API
- [ ] Cross-repo impact analysis
- [ ] Freshness alerts (Slack/email)

**Exit criteria:** Platform lead can log into web dashboard and see all repos' health.

---

## 7. Success Metrics

| Metric | Target (6 months) |
|---|---|
| Pilot customers | 3 organizations |
| Paid customers | 1 enterprise contract signed |
| Repos indexed (enterprise) | 50+ across pilot customers |
| Token savings demonstrated | > 80% reduction documented per customer |
| Policy rules enforced | > 10 org-wide rules active |
| Uptime (cloud) | 99.5% |

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| MCP protocol changes | Enterprise tools break | Pin MCP SDK version, test against new releases before updating |
| Low adoption of enterprise features | No revenue | Start with free pilots, prove ROI before charging |
| Security vulnerability in license validation | License bypass | Use proven crypto (Ed25519), keep validation logic minimal |
| Cloud API becomes bottleneck | Connected edition unreliable | All enterprise features work offline; cloud is enhancement, not dependency |
| Competition from GitHub/JetBrains | They build similar governance | Move fast; own "AI Agent Governance" category before incumbents |

---

## 9. Open Questions

1. **Cloud hosting:** Self-hosted vs managed? Start with managed (Vercel/Railway) or offer both?
2. **Pricing model:** Per seat vs per repo vs hybrid? Need pilot feedback.
3. **SSO provider:** Build own or use Auth0/Clerk/WorkOS?
4. **Audit log retention:** How long should audit logs be kept? Configurable per customer?
5. **Enterprise trial:** Free trial period before requiring license? Duration?
