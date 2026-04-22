# Cortex Enterprise — Strategy

## Business Model: Open Core

Core (public, MIT) remains free. Enterprise is a paid plugin layer.

| Community (free) | Enterprise (paid) |
|---|---|
| Local ingest + search | Centralized org-index (multi-repo) |
| Local embeddings | Managed embedding API |
| CLI + MCP server | Admin dashboard (web) |
| Single repo | Team-shared knowledge graph |
| `.context/rules.yaml` | Policy-as-Code with org-wide enforcement |
| No auth | SSO/SAML + RBAC |

---

## Enterprise Edition

### Connected

**Target:** Tech companies, consultancies, SaaS — want oversight and governance.

```
┌─────────────────────────────────────────────┐
│           Cortex Cloud (web app)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │   Auth    │ │Analytics │ │  Policy  │    │
│  │ SSO/SAML │ │ Token ROI│ │  Rules   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│         ▲            ▲           │          │
└─────────┼────────────┼───────────┼──────────┘
          │            │           ▼
    ┌─────┴─────┐ ┌────┴────┐ ┌────────┐
    │ Dev A     │ │ Dev B   │ │ Dev C   │
    │ Cortex    │ │ Cortex  │ │ Cortex  │
    │ (local)   │ │ (local) │ │ (local) │
    └───────────┘ └─────────┘ └────────┘
```

**Sent up:** Anonymized telemetry (token savings, search count, freshness), policy sync, auth tokens.

**NEVER sent up:** Source code, search queries (opt-in only), embeddings, graph data.

**Access model:** install the enterprise package, then activate it with an API key issued from Cortex Cloud.

**Pricing:** ~$30/dev/month.

---

## Three Enterprise Products

### A. Cortex Cloud — Org-wide Knowledge Graph

- Central API aggregating graphs from all repos
- Cross-repo impact analysis
- Org-wide rules/policies pushed down to each repo
- **Pricing:** Per seat/month or per indexed repo

### B. Cortex Governance — Policy Engine

- Enterprise controls how AI agents behave in their codebase
- Rules become org-policies: "agents may NEVER modify `/core/auth` without ADR-47"
- Audit trail: which agent changed what, what context was given, which rules applied
- Compliance reports (SOC2, ISO 27001)
- **Pricing:** Per repo/month, tiered

### C. Cortex Analytics — AI Agent Observability

- Aggregated token savings dashboards
- ROI dashboards for AI agent investments
- Anomaly detection: "repo X has 0% freshness for 2 weeks"
- **Pricing:** Usage-based

---

## Technical Roadmap

### Phase 1 — Foundation (1-2 months)

- Enterprise activation gate (`api_key` + endpoint required)
- Entitlement validation API
- Auth layer (API keys → SSO/SAML)
- Telemetry module (opt-in usage tracking)
- REST/gRPC API wrapper around MCP tools
- Multi-repo registry (central manifest)

### Phase 2 — Governance (2-3 months)

- Org-wide rules push/pull
- Policy evaluation API ("may agent X do Y?")
- Audit log (who asked what, what context was returned)
- RBAC (admin, developer, readonly)

### Phase 3 — Cloud (3-4 months)

- Cross-repo graph merge
- Managed embeddings (GPU-backed, faster models)
- Web dashboard (admin + analytics)
- Org-wide search ("search across all 50 repos")

### Phase 4 — Analytics (ongoing)

- Token savings aggregation
- Agent effectiveness metrics
- Freshness alerts
- Integrations: Datadog, Grafana, Slack

---

## Go-to-Market

1. Make dashboard ROI numbers shareable (export to PDF/Slack)
2. Build a "Cortex for Teams" pilot with 2-3 companies (free, for case studies)
3. Publish content around "AI Agent Governance" — own the category name
4. Sell: Pilot → POC with IT security/compliance → Enterprise rollout

---

## Future Vision

As models improve and code review becomes unnecessary, Cortex shifts from "help agents find code" to "the single source of truth that governs autonomous agents."

- **Rules become the product** — not code
- **The graph becomes more important than code** — impact analysis at business level
- **Trust scores become critical** — which agent's output is authoritative?
- **Audit trail becomes the core feature** — intent → rule → agent decision → generated code

Positioning shifts from "save tokens" (efficiency) to "the only source of truth governing your autonomous agents" (control).
