# Cortex Enterprise Connected

## What it is

Cortex Enterprise Connected gives your organization centralized control over how AI coding agents behave across all your repositories. Every developer runs Cortex locally on their machine. A lightweight cloud layer ties it all together with shared rules, usage analytics, and a full audit trail.

No source code ever leaves the developer's machine.

---

## How it works

```
Your organization
==========================================

  Cortex Cloud (hosted)
  +-----------------------------------------+
  |                                         |
  |  Policy Rules    Analytics    Auth      |
  |  "No agent may   Token ROI   SSO/SAML  |
  |   touch /auth    per team    login      |
  |   without ADR"   per repo               |
  |                                         |
  +-----^-----------^-----------+-----------+
        |           |           |
        |telemetry  |telemetry  | rules
        |           |           v
  +-----+---+ +----+----+ +----+----+
  | Dev A    | | Dev B   | | Dev C   |
  | laptop   | | laptop  | | laptop  |
  |          | |         | |         |
  | Cortex   | | Cortex  | | Cortex  |
  | (local)  | | (local) | | (local) |
  +----------+ +---------+ +---------+

  Code stays    Code stays    Rules flow
  on laptop     on laptop     down to all
==========================================
```

### Step by step

1. **Install** -- Each developer installs Cortex and the enterprise plugin from a private npm registry using a company auth token.

2. **Authenticate** -- Developers log in through your existing identity provider (SSO/SAML). No separate passwords.

3. **Rules sync automatically** -- An admin creates organization-wide rules in the Cortex Cloud dashboard. These rules push down to every developer's local Cortex automatically (on startup + every 4 hours). Local project rules still work and are merged in, but org rules always take priority.

4. **AI agents follow the rules** -- When an AI agent (Claude Code, Copilot, Cursor) asks Cortex for context, the rules engine decides what gets returned. For example: deprecated code is filtered out, source-of-truth files get priority, and certain areas can be locked behind ADR approval.

5. **Usage data flows up (anonymized)** -- Cortex sends lightweight metrics to the cloud: how many searches, how many tokens saved, index freshness. Never source code, never file contents, never embeddings.

6. **Everything is audited** -- Every tool call is logged: what was asked, what was returned, which rules applied. Audit logs are stored locally and optionally pushed to the cloud for centralized review.

---

## What gets sent to the cloud

| Sent | Never sent |
|------|------------|
| Search count | Source code |
| Token savings estimate | File contents |
| Index freshness percentage | Embeddings |
| Policy sync requests | Graph data |
| Auth tokens (SSO) | Search queries (unless opt-in) |

---

## What the admin sees

- **Analytics dashboard** -- Aggregated token savings, search frequency, and index freshness across all repos and teams.
- **Policy management** -- Create, edit, and push rules to all repos from one place.
- **Audit trail** -- Search what any agent did, when, and which rules governed the response. Exportable for SOC2/ISO 27001 compliance.
- **Role management** -- Assign roles: admin (manage policies), developer (use tools), readonly (view dashboards).

---

## Configuration

The developer's machine needs one file: `.context/enterprise.yaml`

```yaml
telemetry:
  enabled: true
  endpoint: https://cloud.cortex.dev/api/telemetry
  api_key: ctx_live_abc123
  interval_minutes: 60

audit:
  enabled: true
  retention_days: 90

policy:
  enabled: true
  endpoint: https://cloud.cortex.dev/api/policies
  api_key: ctx_live_abc123
  sync_interval_minutes: 240

rbac:
  enabled: true
  default_role: developer
```

That's it. Everything else is automatic.

---

## Installation

```bash
# One-time npm auth setup
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc

# Install
npm i -g @danielblomma/cortex-enterprise --registry=https://npm.pkg.github.com
```

Updates happen automatically through the same registry.

---

## Who is this for

- Tech companies with 50-500+ developers
- Organizations that need governance over AI agent behavior
- Teams that want ROI data to justify AI tooling investment
- Companies required to demonstrate audit trails for compliance (SOC2, ISO 27001)

---

## Pricing

~$30 per developer per month.

Includes: cloud dashboard, policy sync, analytics, audit trail, SSO/SAML, and priority support.

---

## Summary

| | |
|---|---|
| Internet required | Yes (minimal, metadata only) |
| Source code leaves machine | Never |
| Authentication | SSO/SAML via your identity provider |
| Rules management | Centralized cloud dashboard |
| Analytics | Aggregated dashboard across all repos |
| Audit trail | Local + cloud, exportable |
| Updates | Automatic via npm registry |
| Typical customer | SaaS, consultancy, tech company |
