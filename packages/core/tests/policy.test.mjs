import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PolicyStore } from "../dist/policy/store.js";

function makeTempContext(orgYaml, localYaml) {
  const dir = mkdtempSync(join(tmpdir(), "cortex-policy-"));
  if (orgYaml !== undefined) {
    mkdirSync(join(dir, "policies"), { recursive: true });
    writeFileSync(join(dir, "policies", "org-rules.yaml"), orgYaml);
  }
  if (localYaml !== undefined) {
    writeFileSync(join(dir, "rules.yaml"), localYaml);
  }
  return dir;
}

const ORG_YAML = `rules:
  - id: rule.no_secrets
    description: Never commit secrets to repository
    priority: 100
    scope: global
    enforce: true
  - id: rule.naming
    description: Use camelCase for variables
    priority: 50
    scope: code
    enforce: false
`;

const LOCAL_YAML = `rules:
  - id: rule.local_lint
    description: Run eslint before commit
    priority: 80
    scope: global
    enforce: true
`;

test("loadOrgPolicies returns empty when no file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cortex-nopol-"));
  const store = new PolicyStore(dir);
  assert.deepEqual(store.loadOrgPolicies(), []);
});

test("loadOrgPolicies parses rules correctly", () => {
  const dir = makeTempContext(ORG_YAML);
  const store = new PolicyStore(dir);
  const policies = store.loadOrgPolicies();

  assert.equal(policies.length, 2);
  assert.equal(policies[0].id, "rule.no_secrets");
  assert.equal(policies[0].priority, 100);
  assert.equal(policies[0].enforce, true);
  assert.equal(policies[0].source, "org");
  assert.equal(policies[1].id, "rule.naming");
  assert.equal(policies[1].priority, 50);
  assert.equal(policies[1].enforce, false);
  assert.equal(policies[1].scope, "code");
});

test("loadLocalPolicies parses rules correctly", () => {
  const dir = makeTempContext(undefined, LOCAL_YAML);
  const store = new PolicyStore(dir);
  const policies = store.loadLocalPolicies();

  assert.equal(policies.length, 1);
  assert.equal(policies[0].id, "rule.local_lint");
  assert.equal(policies[0].source, "local");
});

test("getMergedPolicies merges org and local, sorted by priority desc", () => {
  const dir = makeTempContext(ORG_YAML, LOCAL_YAML);
  const store = new PolicyStore(dir);
  const merged = store.getMergedPolicies();

  assert.ok(merged.length >= 3);
  // Sorted by priority descending
  for (let i = 1; i < merged.length; i++) {
    assert.ok(merged[i - 1].priority >= merged[i].priority,
      `${merged[i - 1].id}(${merged[i - 1].priority}) should be >= ${merged[i].id}(${merged[i].priority})`);
  }
});

test("org policies override local with same id", () => {
  const orgYaml = `rules:
  - id: rule.shared
    description: Org version
    priority: 90
    enforce: true
`;
  const localYaml = `rules:
  - id: rule.shared
    description: Local version
    priority: 50
    enforce: false
`;
  const dir = makeTempContext(orgYaml, localYaml);
  const store = new PolicyStore(dir);
  const merged = store.getMergedPolicies();

  const shared = merged.find(p => p.id === "rule.shared");
  assert.ok(shared);
  assert.equal(shared.description, "Org version");
  assert.equal(shared.source, "org");
});

test("writeOrgPolicies writes and can be re-read", () => {
  const dir = mkdtempSync(join(tmpdir(), "cortex-polwrite-"));
  const store = new PolicyStore(dir);

  const policies = [
    { id: "rule.test", description: "Test rule", priority: 75, scope: "global", enforce: true, source: /** @type {const} */ ("org") },
  ];
  store.writeOrgPolicies(policies);

  const reloaded = store.loadOrgPolicies();
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].id, "rule.test");
  assert.equal(reloaded[0].priority, 75);
});

test("empty rules file returns empty array", () => {
  const dir = makeTempContext("", "");
  const store = new PolicyStore(dir);
  assert.deepEqual(store.loadOrgPolicies(), []);
  assert.deepEqual(store.loadLocalPolicies(), []);
});
