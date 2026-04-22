# Cortex Enterprise Versioning and Migration Strategy

This document defines how enterprise rollout stays stable as the product evolves.

## 1. Versioned surfaces

The product has four separate versioned surfaces:

1. `cortex` hook surface
2. `cortex-enterprise` config, workflow, and local evidence model
3. `cortex-web` policy, reporting, and dashboard APIs
4. compliance control mappings and report exports

These surfaces should not drift independently without an explicit migration path.

## 2. Versioning rules

### Client and plugin versions

- Use semver for `cortex` and `cortex-enterprise`.
- Additive fields in telemetry, workflow, or audit payloads are minor-version changes.
- Required field changes or payload removals are major-version changes.

### Policy model

- Additive policy fields are allowed when old clients can ignore them safely.
- Changes to `status`, `severity`, `enforce`, or sync semantics require migration notes.
- Dashboard exports must remain backward-compatible for one minor release when possible.

### Report model

- Compliance reports must carry a mapping version internally.
- Control coverage claims must only change when evidence or mapping logic changes.
- Historical exports should remain reproducible from the evidence captured at that time.

## 3. Migration process

When a breaking change is required:

1. document the target change
2. add compatibility handling where possible
3. ship migration notes before forcing the change
4. expose rollout health for version drift in the dashboard
5. remove compatibility only after the supported migration window ends

## 4. Supported migration categories

### Enterprise config

Examples:

- moving from legacy `policy.*` or `telemetry.*` activation to explicit `enterprise.*`
- adding new audit or workflow endpoints
- changing default sync intervals

Required action:

- document the new config shape
- provide example YAML
- fail closed when required fields are missing

### Policy model

Examples:

- adding `title`, `kind`, `status`, or `severity`
- changing advisory vs blocking semantics
- adding new validator/evaluator types

Required action:

- define how old policies are normalized
- document any changed enforcement behavior
- keep sync payloads stable until clients are upgraded

### Reporting model

Examples:

- adding new control mappings
- changing evidence aggregation logic
- renaming exported report columns

Required action:

- version exported formats
- record residual customer responsibilities explicitly
- avoid silently inflating compliance claims

## 5. Rollout policy for upgrades

- upgrade pilot teams first
- watch operational health for sync freshness, telemetry freshness, and version drift
- upgrade broader groups only after pilot evidence remains healthy
- keep air-gapped releases as explicit signed bundles with separate release notes

## 6. Non-negotiable rule

Do not merge product changes that affect enterprise config, policy semantics, or compliance claims without:

- an updated migration note
- a clear compatibility story
- an operational-health signal that helps detect failed rollout
