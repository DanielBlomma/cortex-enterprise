# Cortex Enterprise — Handbook

A complete guide to every feature in the system, what it does, and how it fits together.

---

## Table of contents

1. [What is Cortex Enterprise?](#1-what-is-cortex-enterprise)
2. [The big picture](#2-the-big-picture)
3. [Editions](#3-editions)
4. [Features overview](#4-features-overview)
5. [Ingestion — how Cortex reads your code](#5-ingestion--how-cortex-reads-your-code)
6. [The knowledge graph — how Cortex understands your code](#6-the-knowledge-graph--how-cortex-understands-your-code)
7. [Search — how AI assistants ask questions](#7-search--how-ai-assistants-ask-questions)
8. [Rules — how you control what AI sees](#8-rules--how-you-control-what-ai-sees)
9. [Enterprise startup — how activation works](#9-enterprise-startup--how-activation-works)
10. [Usage tracking — measuring AI value](#10-usage-tracking--measuring-ai-value)
11. [Audit logging — the compliance trail](#11-audit-logging--the-compliance-trail)
12. [Access control — who can do what](#12-access-control--who-can-do-what)
13. [The tools — what commands are available](#13-the-tools--what-commands-are-available)
14. [The dashboard](#14-the-dashboard)
15. [The embedding model — understanding code meaning](#15-the-embedding-model--understanding-code-meaning)
16. [Background monitoring — keeping the index fresh](#16-background-monitoring--keeping-the-index-fresh)
17. [Notes and TODOs — capturing knowledge](#17-notes-and-todos--capturing-knowledge)
18. [Configuration reference](#18-configuration-reference)
19. [How everything connects](#19-how-everything-connects)

---

## 1. What is Cortex Enterprise?

Cortex is a system that sits between your codebase and AI coding assistants (like Claude Code, Copilot, or Cursor). It reads and understands your code, then provides the AI with the right context — filtered through your organization's rules.

Without Cortex, an AI assistant sees whatever files happen to be open or nearby. With Cortex, it sees a curated, governed view of your entire codebase — the important files first, deprecated code filtered out, architectural decisions highlighted, and sensitive areas protected.

The enterprise edition adds organizational control: centralized rules, usage analytics, audit trails, and role-based access.

---

## 2. The big picture

Cortex works in four stages:

```
Stage 1: INGEST          Stage 2: UNDERSTAND
Your source code    -->   A knowledge graph of your
files, configs,           codebase: what calls what,
docs, ADRs                what depends on what,
                          what's important

Stage 3: GOVERN           Stage 4: SERVE
Your rules filter    -->  AI assistants get the
what's visible:           right context, automatically.
hide deprecated,          Every interaction is logged.
prioritize docs,
protect sensitive areas
```

**Stage 1 — Ingest:** Cortex scans your source code, configuration files, documentation, and architecture decision records (ADRs). It breaks them down into entities (files, functions, modules) and discovers the relationships between them (what calls what, what imports what, what configures what).

**Stage 2 — Understand:** The results are stored in a knowledge graph — a map of your codebase that understands not just what exists, but how things connect. Cortex also generates embeddings (mathematical representations of meaning) so it can find relevant code even when the search terms don't match exactly.

**Stage 3 — Govern:** Before any results are returned, your rules are applied. Organization-wide rules set the guardrails. Project-level rules add local customization. Rules control what gets prioritized, what gets filtered out, and what gets flagged.

**Stage 4 — Serve:** When an AI coding assistant asks "what do I need to know?", Cortex answers through the MCP protocol (Model Context Protocol) — an open standard for connecting AI tools to data sources. Every question and answer is logged for audit.

---

## 3. Editions

### Community (free, open-source)

Everything a single developer needs: ingestion, search, the knowledge graph, embeddings, the MCP server, and a local dashboard. Works on one repository at a time.

### Enterprise Connected (paid, internet required)

Adds centralized control for organizations. Rules sync from a cloud dashboard. Usage analytics aggregate across all teams. Audit logs can be pushed to a central location. Developers authenticate with SSO.

### Enterprise Air-Gapped (paid, no internet)

The same enterprise features, but everything runs offline. Rules are distributed as local files. A bundled AI model means nothing is downloaded. Zero network traffic.

---

## 4. Features overview

| Feature | Community | Connected | Air-Gapped |
|---|---|---|---|
| Code ingestion and indexing | Yes | Yes | Yes |
| Knowledge graph | Yes | Yes | Yes |
| Semantic search | Yes | Yes | Yes |
| MCP server (connects to AI tools) | Yes | Yes | Yes |
| Local dashboard | Yes | Yes | Yes |
| Local project rules | Yes | Yes | Yes |
| Organization-wide rules | -- | Yes (from cloud) | Yes (from files) |
| Rule merge (org overrides local) | -- | Yes | Yes |
| Usage tracking | -- | Yes (cloud + local) | Yes (local only) |
| Audit logging | -- | Yes (cloud + local) | Yes (local only) |
| Role-based access control | -- | Yes | Yes |
| SSO / Single sign-on | -- | Yes | -- |
| Cloud analytics dashboard | -- | Yes | -- |
| Bundled embedding model | -- | -- | Yes |
| Works without internet | -- | -- | Yes |

---

## 5. Ingestion — how Cortex reads your code

Ingestion is the process of scanning your codebase and building an index that Cortex can search.

### What gets indexed

Cortex reads your source files and extracts several types of entities:

| Entity type | What it is | Example |
|---|---|---|
| **Files** | Source code, configs, and documentation | `src/auth/login.ts`, `README.md` |
| **Chunks** | Individual functions, classes, or code blocks within files | `function validateToken()` |
| **Modules** | Packages or logical groupings of code | `src/auth/`, `@company/utils` |
| **Projects** | Top-level workspaces or sub-projects | `frontend`, `api-server` |
| **ADRs** | Architecture Decision Records — documented design choices | `ADR-012: Use JWT for auth` |
| **Rules** | Policy rules that govern behavior | `rule.deprecated_filter` |

### What relationships are discovered

Cortex doesn't just index individual entities — it maps how they connect. It discovers 25 types of relationships:

| Relationship | What it means | Example |
|---|---|---|
| **Calls** | One function calls another | `login()` calls `validateToken()` |
| **Imports** | One module imports another | `auth.ts` imports `crypto` |
| **Calls SQL** | Code executes a database query | `getUser()` calls `SELECT * FROM users` |
| **Uses config** | Code reads a configuration value | `server.ts` reads `DATABASE_URL` |
| **Part of** | A chunk belongs to a file | `validateToken` is part of `auth.ts` |
| **Supersedes** | A newer decision replaces an older one | `ADR-015` supersedes `ADR-008` |
| **Constrains** | A rule applies to an entity | `rule.auth_review` constrains `src/auth/` |
| **Implements** | Code fulfills a rule | `auth.ts` implements `rule.jwt_tokens` |

And 17 more relationship types covering configuration, resources, settings, exports, and cross-project references.

### How to run ingestion

Ingestion is triggered through the main Cortex command. You can run a full scan or an incremental update that only processes changed files. There's also a watch mode that keeps the index up to date automatically in the background.

### Where the index lives

All indexed data is stored locally in the `.context/` directory inside your project. Nothing is sent externally. The index includes:
- Cached entity data (one file per entity type)
- Cached relationship data (one file per relationship type)
- A manifest summarizing what was indexed and when

---

## 6. The knowledge graph — how Cortex understands your code

After ingestion, Cortex loads everything into a knowledge graph — a database that stores entities as nodes and relationships as edges.

### Why a graph?

A traditional search index can find files that contain a keyword. A knowledge graph can answer questions like:

- "What would break if I changed this function?"
- "What other files depend on this configuration?"
- "What's the chain of calls from the API endpoint to the database?"

This is possible because the graph stores not just what exists, but how things are connected.

### What's in the graph

- **Nodes:** Every entity (file, function, module, project, ADR, rule) becomes a node with properties like trust level, status, whether it's a source of truth, and when it was last updated.
- **Edges:** Every relationship becomes a directional edge connecting two nodes. Each edge has a type (calls, imports, uses config, etc.).

### How it's used

When an AI assistant asks Cortex a question, the search engine uses both the graph and semantic similarity to find relevant results. The graph contributes a "connectivity score" — entities with more relationships to the search topic score higher because they're more central to that area of the codebase.

For impact analysis ("what would break if I change X?"), the graph is the primary tool. Cortex walks outward from the changed entity, following relationship edges, to find everything that could be affected.

---

## 7. Search — how AI assistants ask questions

When an AI coding assistant needs context about your codebase, it sends a search query to Cortex through the MCP protocol. Cortex returns the most relevant results, ranked by a scoring system.

### How ranking works

Every search result gets a score based on four factors:

| Factor | Weight | What it measures |
|---|---|---|
| **Semantic relevance** | 40% | How closely the content matches the meaning of the query (not just keywords) |
| **Graph connectivity** | 25% | How connected the entity is to other relevant parts of the codebase |
| **Trust level** | 20% | How reliable or authoritative the entity is (source-of-truth files score higher) |
| **Recency** | 15% | How recently the entity was updated (newer is better) |

On top of these base scores, Cortex applies boosts for special cases:
- **Source-of-truth entities** get a bonus to ensure official documentation ranks above random code
- **Domain-specific matches** get bonuses when the query clearly targets a specific area (like database queries, configuration, or connection strings)

### Search types

Cortex combines two search techniques:

1. **Semantic search** — Uses the embedding model to understand the meaning of the query. This finds relevant results even when the exact words don't match. For example, searching for "authentication" would also find code about "login", "credentials", and "session management".

2. **Lexical search** — Traditional keyword matching. Fast and precise when you know the exact term you're looking for.

The two are combined: semantic search contributes 75% and lexical search contributes 25% of the relevance score.

### Result filtering

Before results are returned, the rules engine filters them:
- Deprecated entities are removed (unless explicitly requested)
- Results are capped at a configurable limit (default: 5 results)
- Entities that violate active rules are excluded

---

## 8. Rules — how you control what AI sees

Rules are the core governance mechanism. They let you define what AI assistants can see, what gets prioritized, and what's off-limits.

### Rule properties

Every rule has five properties:

| Property | What it means |
|---|---|
| **ID** | A unique name for the rule (e.g., "rule.deprecated_filter") |
| **Description** | What the rule does, in plain language |
| **Priority** | A number from 0 to 1000. Higher priority rules are applied first. |
| **Scope** | Where the rule applies: "global" (everywhere) or a specific area (e.g., "api") |
| **Enforce** | Whether the rule is active (true) or advisory only (false) |

### Two levels of rules

**Organization-wide rules** — Written by your security or platform team. These apply to every project in the organization. They represent your company's non-negotiable standards.

**Project-level rules** — Written by each project team. These handle local concerns specific to one codebase.

### How merge works

When both levels exist, Cortex merges them:
1. Load all project-level rules
2. Load all organization-wide rules
3. If an org rule and a project rule have the same ID, the org rule wins
4. Sort all rules by priority (highest first)
5. Apply in order

This ensures central governance while allowing teams to add their own rules.

### Built-in rules

Cortex ships with five default rules:

| Rule | Priority | What it does |
|---|---|---|
| **Source of truth** | 100 | Source-of-truth entities (official docs, key files) always get priority in results |
| **Deprecated filter** | 95 | Deprecated entities are hidden unless the user specifically asks for them |
| **ADR recency** | 90 | When two architecture decisions conflict, the newer one wins |
| **Conflict flag** | 90 | When information conflicts, Cortex flags it for the user instead of guessing |
| **Context budget** | 80 | Results are limited to a maximum count to avoid overwhelming the AI |

### Adding your own rules

Rules are written as simple text files in YAML format. For organization-wide rules, your security team writes them and distributes them through your internal channels (in Connected edition, this happens automatically through the cloud). For project rules, the team edits a file in the project directory.

---

## 9. Enterprise startup — how activation works

Enterprise features activate when the enterprise package is installed and the relevant configuration is present.

### Connected edition

Connected setups use `.context/enterprise.yaml` to point Cortex at the cloud endpoints for telemetry and policy sync. If those endpoints or API keys are missing, the plugin still starts, but the related cloud features stay disabled.

### Air-gapped edition

Air-gapped setups use the same package, but keep everything local. Rules are distributed as files, audit logs stay on disk, and the bundled embedding model avoids any external download.

### Failure behavior

Cortex is designed to degrade feature-by-feature, not fail wholesale. If telemetry push fails, policy sync is unavailable, or audit logging is disabled, the rest of the system keeps running and the core search experience remains available.

---

## 10. Usage tracking — measuring AI value

Usage tracking collects simple metrics about how Cortex is being used. This data helps you measure the ROI of your AI coding tools.

### What's tracked

| Metric | What it measures |
|---|---|
| **Searches** | How many times AI assistants asked Cortex for context |
| **Related lookups** | How many times AI assistants explored relationships in the graph |
| **Rule lookups** | How many times the rules engine was consulted |
| **Reloads** | How many times the index was refreshed |
| **Total results returned** | The sum of all results across all queries |
| **Estimated tokens saved** | An estimate of how many AI tokens were saved by providing focused context instead of raw files |

### Where the data goes

- **Connected edition:** Metrics are stored locally and periodically pushed to the cloud dashboard (default: every 60 minutes). Only numbers are sent — never code, file contents, or search queries.
- **Air-gapped edition:** Metrics are stored locally only. Your team can review them on the local dashboard.

### How token savings are estimated

When Cortex returns 5 focused results instead of letting the AI read entire files, the token difference is the estimated savings. Over time, this adds up to a measurable cost reduction that you can report to leadership.

---

## 11. Audit logging — the compliance trail

Every interaction between an AI assistant and Cortex is recorded in the audit log.

### What's logged

For every interaction, the audit log records:

| Field | What it captures |
|---|---|
| **Timestamp** | Exactly when it happened |
| **Tool** | Which tool was used (search, related lookup, impact analysis, etc.) |
| **Input** | What was asked |
| **Result count** | How many results were returned |
| **Entities returned** | Which specific entities were included in the response |
| **Rules applied** | Which rules affected the results |
| **Duration** | How long the operation took |

### Where logs are stored

Logs are saved as daily files in the `.context/audit/` directory on the developer's machine. One file per day, plain text format (one log entry per line).

- **Connected edition:** Logs can optionally be pushed to the cloud dashboard for centralized review.
- **Air-gapped edition:** Logs stay on the machine. Your compliance team collects them through your existing processes.

### Retention

Logs are kept for 90 days by default. This is configurable.

### Why this matters for compliance

When an auditor asks "how do you govern your AI coding tools?", you can show them:
- Exactly what each AI assistant asked for
- Exactly what context it received
- Which organization rules were applied
- A complete timeline of every AI-assisted interaction

This supports compliance frameworks like SOC2, ISO 27001, and internal security policies.

---

## 12. Access control — who can do what

Role-based access control (RBAC) defines what each person can do within Cortex Enterprise.

### Three roles

| Role | Who it's for | What they can do |
|---|---|---|
| **Admin** | Platform leads, security officers | Everything: manage rules, sync policies, configure tracking, view all data |
| **Developer** | Engineers using AI tools daily | Use all search and context tools, view rules, query audit logs, check system status |
| **Read-only** | Managers, observers | View system status only |

### Detailed permissions

| Action | Admin | Developer | Read-only |
|---|---|---|---|
| Create and edit rules | Yes | -- | -- |
| Sync rules from cloud | Yes | -- | -- |
| Configure usage tracking | Yes | -- | -- |
| Query audit logs | Yes | Yes | -- |
| List active rules | Yes | Yes | -- |
| View usage metrics | Yes | Yes | -- |
| Check system status | Yes | Yes | Yes |

### Default behavior

RBAC is disabled by default. When disabled, everyone has admin access. When enabled, a default role is assigned (configurable — usually "developer") and admins are designated separately.

---

## 13. The tools — what commands are available

Cortex provides two sets of tools: context tools (available in all editions) and enterprise tools (available when the enterprise add-on is installed).

### Context tools (all editions)

These are the tools that AI coding assistants use to get information about your codebase.

| Tool | What it does |
|---|---|
| **Search** | Finds the most relevant entities for a given query. Combines semantic understanding with graph connectivity, trust scores, and recency. Returns ranked results filtered by your rules. |
| **Get related** | Given a specific entity (like a file or function), finds everything connected to it in the knowledge graph. You can control how deep the exploration goes (1 to 3 levels of connections). |
| **Impact analysis** | Answers "what would be affected if I changed this?" Walks the knowledge graph outward from a starting point and scores each connected entity by how likely it is to be impacted. Supports filtering by domain (code, config, SQL, etc.) and relationship type. |
| **Get rules** | Lists all active rules, optionally filtered by scope. Shows what governance is in effect. |
| **Reload** | Forces Cortex to reconnect to the knowledge graph. Useful after you've re-indexed the codebase. |

### Enterprise tools

These are management and monitoring tools added by the enterprise edition.

| Tool | What it does |
|---|---|
| **Usage status** | Shows current usage metrics: how many searches, how many tokens saved, whether cloud push is enabled, and the result of the last push. |
| **Audit query** | Searches the audit log. You can filter by date range, by tool name, and limit the number of results. Returns entries newest-first. |
| **Policy list** | Lists all active rules from both org and local sources. You can filter to see only org rules, only local rules, or both merged together. |
| **Policy sync** | Manually triggers a rule sync. In Connected edition, this pulls the latest rules from the cloud. In Air-Gapped edition, this reloads from the local org-rules file. |
| **Enterprise status** | A single overview of everything: which features are active, how many rules are loaded (org vs local), and the result of the last policy sync. This is the "health check" command. |

---

## 14. The dashboard

Cortex includes a local dashboard that shows the state of your index and usage metrics.

### What it shows

- **Index health** — How many entities are indexed, when the last scan happened, how fresh the data is
- **Usage metrics** — Search count, token savings, results returned
- **Edition indicator** — Shows **[Community]** or **[Enterprise]** in the header

### How to access it

The dashboard runs as a live terminal interface. It auto-refreshes on a configurable interval.

---

## 15. The embedding model — understanding code meaning

Cortex uses an AI model to understand the meaning of code, not just the keywords. This is what makes semantic search possible.

### What it does

The embedding model converts code and text into mathematical vectors (lists of numbers) that represent meaning. Two pieces of code that do similar things will have similar vectors, even if they use completely different words.

For example, the vectors for "authenticate user" and "verify login credentials" would be close together, even though they share no words in common.

### How it's delivered

- **Community and Connected editions:** The model is downloaded once from the internet on first use, then cached locally.
- **Air-Gapped edition:** The model is bundled inside the package. No download is needed — it works immediately, even on a machine that has never been connected to the internet.

### Technical details (for the curious)

The model produces 384-dimensional vectors. Each entity in the index gets its own vector. At search time, the query is also converted to a vector, and the closest matches are found using cosine similarity — a mathematical measure of how similar two vectors are.

---

## 16. Background monitoring — keeping the index fresh

Cortex can watch your codebase for changes and automatically update the index.

### Watch mode

When watch mode is enabled, Cortex monitors your files for changes. When a file is saved, Cortex waits a short time (to batch rapid changes together) and then re-indexes the affected files.

### Detection methods

Cortex automatically picks the best method for your system:

- **Event-based** — Uses your operating system's file change notifications. Instant detection, minimal resource usage. This is the default on systems that support it.
- **Polling** — Periodically checks for file changes. Used as a fallback on systems without event notification support.

### Configuration

- **Check interval** — How often to poll for changes (default: 45 seconds, only used in polling mode)
- **Debounce window** — How long to wait after a change before re-indexing (default: 8 seconds). This prevents re-indexing on every keystroke.

---

## 17. Notes and TODOs — capturing knowledge

Cortex includes lightweight tools for capturing knowledge that isn't in the code.

### Notes

Sometimes you learn something important that isn't written down anywhere in the codebase — a reason for a design choice, a gotcha that tripped up the team, or context that only exists in someone's head. Notes let you capture this knowledge so Cortex can surface it when relevant.

Notes are stored in `.context/notes/` and become part of the searchable index.

### TODOs

Simple task tracking within the context system. You can add TODOs, list them, mark them done, reopen them, or remove them. These are lightweight — not a replacement for your issue tracker, but useful for quick captures during a coding session.

---

## 18. Configuration reference

### Main configuration — `.context/config.yaml`

Controls what gets indexed and how search results are ranked.

| Setting | What it does |
|---|---|
| **Repository ID** | A name for this repository (used in multi-repo setups) |
| **Source paths** | Which directories to scan |
| **Truth order** | When sources conflict, which type wins (ADR > Rule > Code > Wiki) |
| **Ranking weights** | How much each scoring factor matters (semantic, graph, trust, recency) |
| **Top K** | Default number of results to return (default: 5) |
| **Include uncertainties** | Whether to flag conflicting information instead of hiding it |

### Enterprise configuration — `.context/enterprise.yaml`

Controls enterprise features. Only needed for enterprise editions.

| Section | Setting | What it does | Default |
|---|---|---|---|
| **Telemetry** | Enabled | Whether to collect usage metrics | false |
| | Endpoint | Cloud API URL for pushing metrics (Connected only) | -- |
| | API key | Authentication for cloud push | -- |
| | Interval | How often to push metrics (minutes) | 60 |
| **Audit** | Enabled | Whether to log every interaction | true |
| | Retention days | How long to keep audit logs | 90 |
| **Policy** | Enabled | Whether to enforce rules | true |
| | Endpoint | Cloud API URL for syncing rules (Connected only) | -- |
| | API key | Authentication for cloud sync | -- |
| | Sync interval | How often to sync rules (minutes) | 240 (4 hours) |
| **RBAC** | Enabled | Whether to enforce role-based access | false |
| | Default role | Role assigned when none is specified | developer |

### Rules — `.context/rules.yaml` (local) and `.context/policies/org-rules.yaml` (organization)

Each rule has: ID, description, priority (0-1000), scope (global or specific), and enforce (true/false). See the [Rules section](#8-rules--how-you-control-what-ai-sees) for details.

## 19. How everything connects

Here's the complete picture of how all the pieces work together:

```
YOUR CODEBASE
     |
     | (1) Ingestion scans files, finds entities and relationships
     v
KNOWLEDGE GRAPH + EMBEDDINGS
     |
     | (2) Stored locally in .context/
     v
MCP SERVER (running on developer's machine)
     |
     | (3) AI assistant sends a query via MCP protocol
     v
SEARCH ENGINE
     |
     | (4) Combines semantic search + graph traversal
     |     Scores by: relevance, connectivity, trust, recency
     v
RULES ENGINE
     |
     | (5) Applies organization + project rules
     |     Filters, prioritizes, and flags conflicts
     v
GOVERNED RESULTS returned to the AI assistant
     |
     | (6) Audit log records everything
     | (7) Usage metrics are updated
     v
AI ASSISTANT uses the context to help the developer
```

**For Connected edition**, add:
- Rules sync down from the cloud dashboard (step 5)
- Usage metrics push up to the cloud dashboard (step 7)
- Audit logs optionally push to the cloud (step 6)

**For Air-Gapped edition**, everything stays within the box. No arrows go outside.

---

## Quick reference — where things live

| What | Where |
|---|---|
| Indexed entities | `.context/cache/` |
| Knowledge graph | `.context/db/` |
| Embeddings | `.context/embeddings/` |
| Local rules | `.context/rules.yaml` |
| Organization rules | `.context/policies/org-rules.yaml` |
| Enterprise config | `.context/enterprise.yaml` |
| Audit logs | `.context/audit/` |
| Usage metrics | `.context/telemetry/` |
| Captured notes | `.context/notes/` |
| Ingestion config | `.context/config.yaml` |
