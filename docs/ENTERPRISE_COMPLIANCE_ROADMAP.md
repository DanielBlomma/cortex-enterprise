# Cortex Enterprise Compliance Roadmap

**Status:** Draft  
**Scope:** `cortex`, `cortex-enterprise` (`core` + `local`), `cortex-web`  
**Execution rule:** Complete, review, and approve each step before starting the next one.

---

## 1. Goal

Make Cortex the governance layer for AI-assisted development in larger companies:

- `cortex` remains the open-source context engine that improves retrieval quality and reduces noise.
- `cortex-enterprise` becomes the closed-source governance layer that controls activation, workflow, review, policy enforcement, and evidence collection.
- `cortex-web` becomes the control plane for API keys, rule/policy management in the dashboard, audit evidence, reporting, and organization-wide rollout.

The target outcome is a product that helps enterprises operate AI coding tools in a way that is compatible with:

- ISO 27001
- ISO 42001
- SOC 2

This is not only about search quality. It is about making developers follow a governed workflow:

1. plan
2. review the plan
3. implement
4. review the code
5. iterate until approved
6. then commit

---

## 2. Product Principles

- Fail closed: enterprise features must never activate unless entitlement is valid.
- Keep source code local by default: do not send code, embeddings, or graph data unless a feature explicitly requires it and the boundary is documented.
- Make governance usable for developers: the workflow should feel helpful, not bureaucratic.
- Treat review and policy checks as first-class product features, not side effects.
- Produce auditable evidence that can be exported and mapped to compliance controls.
- Separate community and enterprise concerns cleanly so community behavior is never broken by enterprise logic.

---

## 3. Step-by-Step Roadmap

## Step 1: Activation and Entitlement Foundation

**Goal:** Enterprise mode must be explicitly activated and remain inert otherwise.

**Repos touched:**
- `cortex`
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`
- `cortex-web`

**Deliverables:**
- Fix the small `cortex` dashboard runtime issue.
- Require explicit `enterprise.endpoint` and `enterprise.api_key`.
- Add startup entitlement validation against the web/cloud side.
- Keep enterprise tools, timers, audit, telemetry, and policy sync disabled until validation succeeds.
- Add `enterprise.status` with active/inactive state and reason.

**Why it matters for compliance:**
- Prevents accidental activation.
- Creates a clear trust boundary between community and enterprise behavior.
- Supports controlled access and deployment.

**Review gate:**
- Review the activation flow end to end before moving to workflow features.

---

## Step 1B: Core Instrumentation Hooks in `cortex`

**Goal:** Expand the open-source `cortex` hook surface so enterprise can collect granular telemetry and audit evidence without guessing from coarse events.

**Why this is needed:**
- The current hook surface is too thin:
  - `onToolCall(toolName, resultCount, tokensSaved)`
  - `onSessionEnd(calls)`
- That is enough for basic counters, but not enough for:
  - precise audit logs
  - richer telemetry dimensions
  - per-tool latency and outcome tracking
  - policy/review/workflow evidence

**Repos touched:**
- `cortex`
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`

**Deliverables:**
- Define a richer plugin hook contract in `cortex`.
- Add hook events for at least:
  - session start
  - tool call start
  - tool call success
  - tool call failure
  - session end
- Include richer event fields where safe and appropriate:
  - tool name
  - timestamp
  - duration
  - result count
  - estimated tokens saved
  - error state
  - sanitized query metadata
  - request/response size metadata where useful
- Keep the payload privacy-safe by design:
  - no raw code
  - no embeddings
  - no full prompt capture by default
- Make enterprise telemetry and audit writers consume the richer hooks instead of inferring everything from a single post-call callback.

**Examples of enterprise features unlocked by this:**
- More granular telemetry per tool and per outcome
- Better audit evidence for what the developer actually did
- Stronger review/compliance reporting
- Easier correlation between workflow steps, policy checks, and tool usage

**Review gate:**
- Review the hook API carefully before implementation.
- The hook surface belongs to open-source `cortex`, so it must stay stable, minimal, and privacy-safe.

---

## Step 2: Identity, Access Control, and Tenant Boundaries

**Goal:** Every enterprise action must be attributable to an organization, a key, and a role.

**Repos touched:**
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`
- `cortex-web`

**Deliverables:**
- API key lifecycle in `cortex-web` with creation, revoke, last-used tracking, and scopes.
- Bind keys to organization and environment.
- RBAC for admin, developer, and readonly roles.
- Enforce role checks for sensitive enterprise tools.
- Record which org/key/session performed policy sync, telemetry push, and review actions.

**Why it matters for compliance:**
- ISO 27001 / SOC 2 access control.
- ISO 42001 accountability for AI system operation.

**Review gate:**
- Review threat model and role boundaries before enabling more automation.

---

## Step 3: Governed Developer Workflow

**Goal:** Turn planning, implementation, review, and iteration into a guided product workflow.

**Repos touched:**
- `cortex-enterprise/packages/local`
- `cortex-enterprise/packages/core`
- `cortex-web`

**Deliverables:**
- Define the canonical workflow:
  - plan
  - review plan
  - implement
  - review code
  - iterate
  - approve
  - commit
- Add or refine command surfaces for plan, todo, note, update, review, and clean review.
- Persist workflow state and review state in `.context`.
- Make review results machine-readable so policy checks and dashboards can consume them.
- Ensure failed review or failed policy blocks approval state.

**Why it matters for compliance:**
- Makes the development process explicit and repeatable.
- Gives auditors a governed workflow rather than ad hoc AI usage.

**Review gate:**
- Review the developer experience carefully; this step will define product adoption.

---

## Step 4: Policy Model and Enforcement Engine

**Goal:** Organizations must be able to define rules that actually affect AI-assisted work.

**Repos touched:**
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`
- `cortex-web`

**Deliverables:**
- Org-wide rule/policy CRUD in the `cortex-web` dashboard.
- Clear model for how dashboard-managed rules map to synced enterprise policies.
- Dashboard UX for listing, creating, editing, enabling, disabling, prioritizing, and deleting policies.
- Clear distinction between:
  - reusable predefined rules
  - organization policies built from those rules
  - custom policies created directly by the customer
- Sync API from web to enterprise.
- Merge cloud policies with local policies.
- Validator framework for code review, test coverage, file size, external API restrictions, secrets, documentation, and custom regex/code-comment checks.
- Consistent enforcement model: warn, block, or require approval.
- Surface active policies to both the developer and the reviewer.

**Why it matters for compliance:**
- Converts governance policy into enforceable controls.
- Creates the core control layer needed for enterprise rollout.

**Review gate:**
- Review policy semantics and precedence before expanding the rule catalog.

---

### Step 4A: Dashboard Policy Model

**Goal:** Define one consistent model in `cortex-web` for rules, policies, and synced enforcement.

**Web model to standardize:**
- `predefined rules`
  - built-in rule types supported by enterprise validators
  - examples: `require-code-review`, `no-secrets-in-code`, `require-test-coverage`
- `organization policies`
  - customer-owned policy records created from predefined rules
  - include scope, priority, enforce/warn mode, and rule-specific parameters
- `custom policies`
  - customer-defined policies that are not limited to the predefined catalog
  - examples: regex checks, path-based restrictions, documentation requirements

**Data model decisions to lock down:**
- Stable policy id vs stable rule id
- Whether one rule can back many policies
- How custom policy types are versioned
- How rule-specific config is stored and validated
- How policy status is represented:
  - draft
  - active
  - disabled
  - archived
- How severity is represented:
  - info
  - warning
  - error
  - block

**Sync contract requirements:**
- The dashboard model can be richer than the client sync model.
- The sync payload to `cortex-enterprise` must stay minimal, stable, and backwards-compatible.
- Policy export must map cleanly into enterprise validator input.

**Review gate:**
- Review the policy schema and sync contract before expanding the UI.

---

### Step 4B: Dashboard Policy UX

**Goal:** Make rule/policy management understandable for admins without making the UI feel like raw database CRUD.

**Target dashboard area:**
- `/dashboard/policies`

**UX requirements:**
- Card/list view for available predefined rules
- Separate but adjacent view for active organization policies
- Clear selected state
- Fast create/edit flow in modal or side panel
- No unnecessary “new policy” intermediate page if the main dashboard surface can handle it
- Clear visibility of:
  - scope
  - priority
  - enforcement mode
  - current status
  - last updated
- Strong empty states and defaults for first-time setup

**Admin actions that should be first-class:**
- Create policy from predefined rule
- Create fully custom policy
- Edit parameters
- Enable / disable
- Change priority
- Delete / archive
- Preview synced effect

**Developer-facing visibility:**
- Developers should be able to see what policies are active even if they cannot edit them.
- Review output should reference the same names and descriptions used in the dashboard.

**Review gate:**
- Review the UX against real admin workflows before implementation spreads across multiple pages.

---

### Step 4C: Policy-to-Workflow Integration

**Goal:** Policies should shape the developer workflow, not sit passively in the dashboard.

**Integration points:**
- plan review
- code review
- validator execution
- approval state
- compliance reporting

**Required behaviors:**
- Policies can require a review before approval.
- Policies can block approval or produce warnings.
- Review outputs and compliance reports use the same policy identity and terminology as the dashboard.
- Dashboard should show whether policies are:
  - configured only
  - synced
  - actively enforced
  - recently triggered

**Review gate:**
- Review one full end-to-end example:
  - admin creates policy in dashboard
  - client syncs it
  - developer hits it in review
  - result appears in audit/compliance evidence

---

## Step 5: Audit Trail and Evidence Capture

**Goal:** Preserve enough evidence to explain what happened, why it happened, and under which controls.

**Repos touched:**
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`
- `cortex-web`

**Deliverables:**
- Audit every relevant MCP tool call and enterprise workflow transition.
- Record applied rules, review outcomes, policy failures, and approvals.
- Push or export audit events to `cortex-web`.
- Add searchable audit views and retention rules.
- Define which events are required evidence versus optional diagnostics.

**Why it matters for compliance:**
- Directly supports auditability, traceability, and control evidence.
- Needed for SOC 2 and ISO 27001 reviews.
- Needed for ISO 42001 oversight of AI-assisted work.

**Review gate:**
- Review evidence completeness and sensitive-data boundaries before scaling telemetry.

---

## Step 6: Data Boundary, Telemetry, and Sensitive Data Controls

**Goal:** Prove what data is and is not sent outside the developer machine.

**Repos touched:**
- `cortex-enterprise/packages/core`
- `cortex-enterprise/packages/local`
- `cortex-web`

**Deliverables:**
- Clear telemetry schema for counts and metadata only.
- Explicit exclusion of source code, embeddings, graph data, and raw prompts unless intentionally allowed.
- `telemetry.status` and related transparency tools.
- Retention and redaction rules for telemetry and audit data.
- Tests and docs for allowed outbound payloads.

**Why it matters for compliance:**
- Supports least disclosure and privacy/security expectations.
- Makes the product easier to defend in procurement and audit conversations.

**Review gate:**
- Review actual outbound payloads and docs before claiming compliance posture.

---

## Step 7: Compliance Mapping and Reporting

**Goal:** Turn product evidence into something security and compliance teams can actually use.

**Repos touched:**
- `cortex-enterprise/docs`
- `cortex-web`

**Deliverables:**
- Define a control mapping from product capabilities to:
  - ISO 27001
  - ISO 42001
  - SOC 2
- Expand the compliance report surface in `cortex-web`.
- Show which controls are covered, partially covered, or still manual.
- Export reports with policy governance, access control, logging, audit trail, and review evidence.
- Document residual responsibilities that still belong to the customer.

**Why it matters for compliance:**
- Evidence without control mapping is weak.
- This is the layer that turns product capability into enterprise buying confidence.

**Review gate:**
- Review control mappings with a skeptical lens; avoid overstating compliance claims.

---

## Step 8: Enterprise Rollout and Productization

**Goal:** Make the whole system operable at scale for real companies.

**Repos touched:**
- `cortex`
- `cortex-enterprise`
- `cortex-web`

**Deliverables:**
- Installation and onboarding flow for enterprise customers.
- Operational dashboarding for policy health, sync status, telemetry health, and review coverage.
- Documentation for admins, developers, and compliance teams.
- Versioning and migration strategy for enterprise configs, policies, and reports.
- Pricing/packaging alignment between product behavior and enterprise promises.

**Why it matters for compliance:**
- A compliant design still fails if rollout and operations are inconsistent.

**Review gate:**
- Final product review before broader customer rollout.

---

## Step 9: Launch Readiness and Support Operations

**Goal:** Turn rollout health into a durable operating surface for the product team and enterprise customers.

**Repos touched:**
- `cortex-enterprise`
- `cortex-web`

**Deliverables:**
- Dedicated rollout/readiness view in the dashboard, separate from the high-level overview.
- Explicit launch gate showing whether expansion should stay in pilot or move to broader rollout.
- Environment-aware operator view for API keys and rollout actions.
- Product docs that define what “ready to expand” means operationally.

**Why it matters for compliance and adoption:**
- Enterprise customers need a stable operating surface after implementation, not only a feature checklist.
- Rollout decisions should be backed by live health signals, not tribal knowledge.

**Review gate:**
- Review launch-readiness signals and supportability before claiming GA-style enterprise readiness.

---

## 4. Immediate Next Sequence

The roadmap steps above are now implemented in the current dirty worktree.

The sensible near-term order from here is:

1. Review each completed step as its own slice.
   - activation and entitlement
   - hook surface and telemetry
   - identity / RBAC
   - governed workflow
   - policy model and enforcement
   - audit and evidence
   - data boundary controls
   - compliance mapping
   - rollout and launch readiness
2. Fix any findings before commit.
   - prefer narrow fixes with a fresh review after each one
3. Commit in reviewable batches.
   - avoid one giant enterprise commit if possible
4. Run a pilot rollout.
   - validate policy sync freshness
   - validate telemetry freshness
   - validate review coverage
   - validate audit evidence end to end

That keeps the implementation disciplined and makes enterprise readiness a product claim backed by reviewed evidence.

---

## 5. What Must Be True Before Claiming Enterprise Readiness

- Enterprise activation is explicit and validated.
- Access control is enforced, not implied.
- The developer workflow is documented and observable.
- Review and policy failures are captured as evidence.
- Data egress boundaries are documented and tested.
- Compliance reports are backed by real product evidence, not only marketing language.
