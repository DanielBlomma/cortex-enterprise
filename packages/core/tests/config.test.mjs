import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnterpriseConfig } from "../dist/config.js";

function makeTempContext(yaml) {
  const dir = mkdtempSync(join(tmpdir(), "cortex-config-"));
  if (yaml !== undefined) {
    writeFileSync(join(dir, "enterprise.yaml"), yaml);
  }
  return dir;
}

test("returns defaults when config file is missing", () => {
  const dir = makeTempContext();
  const config = loadEnterpriseConfig(dir);

  assert.equal(config.telemetry.enabled, false);
  assert.equal(config.telemetry.endpoint, "");
  assert.equal(config.telemetry.interval_minutes, 60);
  assert.equal(config.audit.enabled, true);
  assert.equal(config.audit.retention_days, 90);
  assert.equal(config.policy.enabled, true);
  assert.equal(config.rbac.enabled, false);
  assert.equal(config.rbac.default_role, "developer");
});

test("parses complete config file", () => {
  const yaml = `telemetry:
  enabled: true
  endpoint: https://telemetry.example.com
  api_key: tok_abc123
  interval_minutes: 30
audit:
  enabled: true
  retention_days: 180
policy:
  enabled: true
  endpoint: https://policy.example.com
  api_key: tok_policy
  sync_interval_minutes: 120
rbac:
  enabled: true
  default_role: admin
`;
  const dir = makeTempContext(yaml);
  const config = loadEnterpriseConfig(dir);

  assert.equal(config.telemetry.enabled, true);
  assert.equal(config.telemetry.endpoint, "https://telemetry.example.com");
  assert.equal(config.telemetry.api_key, "tok_abc123");
  assert.equal(config.telemetry.interval_minutes, 30);
  assert.equal(config.audit.retention_days, 180);
  assert.equal(config.policy.endpoint, "https://policy.example.com");
  assert.equal(config.policy.sync_interval_minutes, 120);
  assert.equal(config.rbac.enabled, true);
  assert.equal(config.rbac.default_role, "admin");
});

test("invalid role falls back to developer", () => {
  const yaml = `rbac:
  enabled: true
  default_role: superuser
`;
  const dir = makeTempContext(yaml);
  const config = loadEnterpriseConfig(dir);
  assert.equal(config.rbac.default_role, "developer");
});

test("all three valid roles are accepted", () => {
  for (const role of ["admin", "developer", "readonly"]) {
    const yaml = `rbac:\n  enabled: true\n  default_role: ${role}\n`;
    const config = loadEnterpriseConfig(makeTempContext(yaml));
    assert.equal(config.rbac.default_role, role);
  }
});

test("invalid numbers fall back to defaults", () => {
  const yaml = `telemetry:
  interval_minutes: not_a_number
audit:
  retention_days: abc
`;
  const dir = makeTempContext(yaml);
  const config = loadEnterpriseConfig(dir);
  assert.equal(config.telemetry.interval_minutes, 60);
  assert.equal(config.audit.retention_days, 90);
});

test("telemetry.enabled requires explicit true", () => {
  const yaml = `telemetry:
  enabled: yes
`;
  const config = loadEnterpriseConfig(makeTempContext(yaml));
  assert.equal(config.telemetry.enabled, false);
});

test("audit.enabled defaults to true unless explicitly false", () => {
  const yamlFalse = `audit:\n  enabled: false\n`;
  const yamlOther = `audit:\n  enabled: nope\n`;

  assert.equal(loadEnterpriseConfig(makeTempContext(yamlFalse)).audit.enabled, false);
  assert.equal(loadEnterpriseConfig(makeTempContext(yamlOther)).audit.enabled, true);
});

test("empty config file returns defaults", () => {
  const config = loadEnterpriseConfig(makeTempContext(""));
  assert.equal(config.telemetry.enabled, false);
  assert.equal(config.audit.enabled, true);
});

test("comments are ignored in yaml", () => {
  const yaml = `# This is a comment
telemetry:
  # Another comment
  enabled: true
`;
  const config = loadEnterpriseConfig(makeTempContext(yaml));
  assert.equal(config.telemetry.enabled, true);
});

test("inline comments are stripped from values", () => {
  const yaml = `telemetry:
  endpoint: https://example.com # my endpoint
  interval_minutes: 30 # every 30 min
`;
  const config = loadEnterpriseConfig(makeTempContext(yaml));
  assert.equal(config.telemetry.endpoint, "https://example.com");
  assert.equal(config.telemetry.interval_minutes, 30);
});

test("quoted values are unquoted", () => {
  const yaml = `telemetry:
  endpoint: "https://example.com"
  api_key: 'tok_abc#123'
`;
  const config = loadEnterpriseConfig(makeTempContext(yaml));
  assert.equal(config.telemetry.endpoint, "https://example.com");
  assert.equal(config.telemetry.api_key, "tok_abc#123");
});

test("quoted values with inline comments", () => {
  const yaml = `telemetry:
  endpoint: "https://example.com" # production
`;
  const config = loadEnterpriseConfig(makeTempContext(yaml));
  assert.equal(config.telemetry.endpoint, "https://example.com");
});
