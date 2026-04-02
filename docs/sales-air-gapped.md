# Cortex Enterprise Air-Gapped

## What it is

Cortex Enterprise Air-Gapped is the fully offline edition for organizations where no data may leave the network. Everything runs on the developer's machine with zero internet dependency. No cloud, no phone-home, no external API calls. Not even during installation.

---

## How it works

```
Developer's machine (fully offline)
==========================================

  +---------------------------------------+
  |                                       |
  |  Cortex (local)                       |
  |  +----------------------------------+ |
  |  |                                  | |
  |  |  Ingest        Reads your code,  | |
  |  |                builds the index  | |
  |  |                                  | |
  |  |  Embeddings    Bundled AI model, | |
  |  |  (bundled)     no download needed| |
  |  |                                  | |
  |  |  Graph         Knowledge graph   | |
  |  |                of your codebase  | |
  |  |                                  | |
  |  |  Rules         Local YAML files  | |
  |  |  Engine        govern all output | |
  |  |                                  | |
  |  |  MCP Server    Connects to your  | |
  |  |                AI coding agent   | |
  |  |                                  | |
  |  |  Audit Log     Full trail of     | |
  |  |                every action      | |
  |  |                                  | |
  |  |  Dashboard     Usage stats and   | |
  |  |                ROI metrics       | |
  |  +----------------------------------+ |
  |                                       |
  |  License file (.lic)                  |
  |  Signed offline, no network check     |
  |                                       |
  |  Network: OFF                         |
  +---------------------------------------+

==========================================
```

### Step by step

1. **Deliver the package** -- We provide a pre-built `.tgz` file (or Docker image) containing Cortex, the enterprise plugin, and a bundled embedding model. Delivery happens through your secure channel: USB drive, internal portal, or approved file transfer.

2. **Install offline** -- The developer installs from the local file. No npm registry, no internet.
   ```bash
   npm i -g danielblomma-cortex-enterprise-0.3.0.tgz
   ```

3. **Place the license file** -- A signed `.lic` file goes in `.context/cortex.lic`. This file contains your organization name, expiry date, and allowed features. It is cryptographically signed using Ed25519. Verification uses a public key embedded in the software. No network call is made.

4. **Place the rules files** -- Organization-wide rules go in `.context/policies/org-rules.yaml`. These are plain YAML files that your security or platform team distributes through internal channels (git, USB, internal portal). Per-project rules go in `.context/rules.yaml`.

5. **Cortex starts and validates** -- On startup, Cortex reads the license file, verifies the signature offline, loads all rules, and registers enterprise tools. If the license is valid, it shows `[Enterprise]` in the dashboard. If not, it falls back to community mode silently.

6. **AI agents follow the rules** -- When an AI coding agent asks Cortex for context, the rules engine applies all active rules. Org rules override local rules when they share the same ID. Rules are sorted by priority and enforced in order.

7. **Everything is audited locally** -- Every tool call is logged to `.context/audit/` as daily JSONL files. Your compliance team can export these for review. Nothing is sent anywhere.

---

## What gets sent over the network

Nothing. Zero network traffic. Verified by running with network disabled.

---

## The license file

The license file is a signed text document. No license server, no activation, no phone-home.

```
customer: ACME Corp
edition: air-gapped
issued: 2026-04-02
expires: 2027-04-02
max_repos: 50
features: audit_log,policy_local,bundled_embeddings
---
<base64-encoded Ed25519 signature>
```

How validation works:

1. Cortex reads the file and splits it at the `---` separator
2. The payload (above the line) is verified against the signature (below the line) using an Ed25519 public key that is embedded in the software
3. If the signature matches and the expiry date hasn't passed, the license is valid
4. If the license expires within 30 days, a warning is shown
5. If the license is invalid or expired, enterprise features are disabled and Cortex falls back to community mode

Renewal: you receive a new `.lic` file through your secure channel. Replace the old file. No downtime.

---

## The rules files

### Organization-wide rules (distributed by your security/platform team)

File: `.context/policies/org-rules.yaml`

```yaml
rules:
  - id: rule.no_secrets_in_code
    description: "Secrets must never appear in source files."
    priority: 100
    scope: global
    enforce: true

  - id: rule.auth_adr_required
    description: "No agent may modify /auth without ADR approval."
    priority: 100
    scope: api
    enforce: true

  - id: rule.migration_review
    description: "Database migrations require data team review."
    priority: 95
    scope: global
    enforce: true
```

### Per-project rules (managed by the project team)

File: `.context/rules.yaml`

```yaml
rules:
  - id: rule.source_of_truth
    description: "Source-of-truth entities get priority in search results."
    priority: 100
    scope: global
    enforce: true

  - id: rule.deprecated_filter
    description: "Deprecated entities are excluded unless explicitly requested."
    priority: 95
    scope: global
    enforce: true
```

### How merge works

Org rules always win. If an org rule and a local rule have the same `id`, the org rule replaces the local one. All rules are then sorted by priority (highest first) and applied in that order.

---

## Audit trail

Every action is logged to `.context/audit/YYYY-MM-DD.jsonl`:

```json
{
  "timestamp": "2026-04-02T14:32:01.000Z",
  "tool": "context.search",
  "input": { "query": "authentication flow" },
  "result_count": 5,
  "entities_returned": ["src/auth/login.ts", "src/auth/session.ts"],
  "rules_applied": ["rule.source_of_truth", "rule.deprecated_filter"],
  "duration_ms": 42
}
```

These files are plain text (one JSON object per line). Export them, archive them, feed them into your SIEM. They never leave the machine unless you move them.

Default retention: 90 days (configurable).

---

## Configuration

Minimal config for air-gapped. File: `.context/enterprise.yaml`

```yaml
telemetry:
  enabled: false

audit:
  enabled: true
  retention_days: 90

policy:
  enabled: true

rbac:
  enabled: false
  default_role: developer
```

No endpoints, no API keys. Everything is local.

---

## Installation

```bash
# Delivered via secure channel (USB, internal portal, approved file transfer)
npm i -g danielblomma-cortex-enterprise-0.3.0.tgz

# Or via Docker
docker load < cortex-enterprise-0.3.0.tar
docker run cortex-enterprise
```

Updates: we deliver a new `.tgz` or Docker image through the same secure channel. Replace the old package.

---

## What is included in the package

| Component | Description |
|-----------|-------------|
| Cortex core | Ingest, graph, search, MCP server, dashboard |
| Enterprise plugin | License validation, policy engine, audit log, RBAC |
| Embedding model | Bundled AI model for generating code embeddings (no HuggingFace download) |
| All dependencies | Fully self-contained, no post-install downloads |

---

## Who is this for

- Banks and financial institutions
- Defense and intelligence organizations
- Government agencies
- Healthcare organizations handling patient data
- Any environment where data must not leave the network

---

## Pricing

Annual site license, ~$50,000-200,000/year depending on scale.

Includes: pre-built packages, license file, bundled embedding model, offline documentation, and dedicated support channel.

---

## Summary

| | |
|---|---|
| Internet required | No. Zero network traffic. |
| Source code leaves machine | Never |
| Authentication | Signed license file (Ed25519, offline) |
| Rules management | YAML files distributed via internal channels |
| Analytics | Local dashboard on each machine |
| Audit trail | Local JSONL files, exportable |
| Updates | New package delivered via secure channel |
| Typical customer | Bank, defense, government, healthcare |
