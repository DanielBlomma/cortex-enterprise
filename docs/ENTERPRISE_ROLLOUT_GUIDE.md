# Cortex Enterprise Rollout Guide

This guide is the Step 8 operating playbook for rolling Cortex Enterprise out to real teams.

## 1. Rollout objective

The product is ready for enterprise rollout only when all of the following are true:

- admins can issue environment-scoped keys from `cortex-web`
- at least one enterprise instance is reporting telemetry
- active policies are syncing from the dashboard
- developers are using the governed workflow
- review and audit evidence are visible in the dashboard

## 2. Connected rollout sequence

### Phase 1: Admin setup

1. Create the organization and confirm the correct package plan.
2. Issue at least one production API key from `/dashboard/api-keys`.
3. Create or import the first active policies in `/dashboard/policies`.
4. Confirm the dashboard shows a non-empty operational health view on `/dashboard`.

### Phase 2: Pilot team onboarding

1. Install `cortex-enterprise` on 3 to 10 developer machines.
2. Configure `.context/enterprise.yaml` with:
   - policy sync endpoint
   - telemetry push endpoint
   - audit push endpoint when connected mode is enabled
3. Verify the first policy sync and telemetry push succeed.
4. Run one end-to-end workflow session:
   - plan
   - review plan
   - implement
   - review code
   - approve
5. Confirm the dashboard receives:
   - telemetry
   - workflow snapshots
   - review results
   - audit events

### Phase 3: Controlled expansion

1. Add one team or business unit at a time.
2. Watch `/dashboard` for:
   - policy health
   - sync freshness
   - telemetry freshness
   - review coverage
3. Do not expand rollout while those signals are stale or missing.

## 3. Role-specific operating model

### Admins / platform team

- Own API keys, package tier, environments, and policy publication.
- Review operational health weekly.
- Rotate keys and revoke stale environments.
- Treat failed sync or stale telemetry as rollout blockers.

### Developers

- Use the governed workflow, not ad hoc AI-only edits.
- Keep source code local; only approved metadata leaves the machine.
- Treat failed review or blocking policy results as stop conditions.

### Compliance / security teams

- Review audit trail, review evidence, and compliance reports from the dashboard.
- Confirm the control mapping reflects current product behavior.
- Record residual customer responsibilities for controls that remain manual.

## 4. Rollout readiness checklist

Use this checklist before widening deployment:

- active policies exist and are enforced
- policy sync happened in the last 24 hours
- telemetry is fresh for at least one connected instance per environment
- workflow sessions include review evidence
- required audit events are present in the last 30 days
- the compliance report reflects current control coverage and residual responsibilities

## 5. Air-gapped notes

Air-gapped customers use the same workflow and policy concepts, but they operate without the cloud control plane:

- policies are distributed as signed local files
- telemetry and audit evidence remain local unless exported manually
- version and package upgrades must be handled through secure artifact delivery

## 6. Exit criteria for enterprise rollout

Do not claim enterprise readiness until:

- rollout health is visible in the dashboard
- policy sync and telemetry freshness are stable
- governed workflow adoption is visible in review coverage
- auditors can trace evidence from workflow to review to audit to report
