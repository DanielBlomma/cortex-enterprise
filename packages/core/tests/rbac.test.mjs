import test from "node:test";
import assert from "node:assert/strict";
import { checkAccess, getAccessDeniedMessage } from "../dist/rbac/check.js";

test("admin can access all actions", () => {
  const actions = [
    "policy.write", "policy.sync", "telemetry.configure",
    "audit.query", "policy.list", "telemetry.status",
    "enterprise.status",
  ];
  for (const action of actions) {
    assert.equal(checkAccess("admin", action), true, `admin should access ${action}`);
  }
});

test("developer can access developer+all actions", () => {
  const allowed = ["audit.query", "policy.list", "telemetry.status", "enterprise.status"];
  for (const action of allowed) {
    assert.equal(checkAccess("developer", action), true, `developer should access ${action}`);
  }
});

test("developer cannot access admin-only actions", () => {
  const denied = ["policy.write", "policy.sync", "telemetry.configure"];
  for (const action of denied) {
    assert.equal(checkAccess("developer", action), false, `developer should not access ${action}`);
  }
});

test("readonly can only access all-role actions", () => {
  const allowed = ["enterprise.status"];
  const denied = [
    "policy.write", "policy.sync", "telemetry.configure",
    "audit.query", "policy.list", "telemetry.status",
  ];
  for (const action of allowed) {
    assert.equal(checkAccess("readonly", action), true, `readonly should access ${action}`);
  }
  for (const action of denied) {
    assert.equal(checkAccess("readonly", action), false, `readonly should not access ${action}`);
  }
});

test("unknown action is denied for all roles", () => {
  assert.equal(checkAccess("admin", "nonexistent.action"), false);
  assert.equal(checkAccess("developer", "nonexistent.action"), false);
  assert.equal(checkAccess("readonly", "nonexistent.action"), false);
});

test("getAccessDeniedMessage formats correctly", () => {
  const msg = getAccessDeniedMessage("readonly", "policy.write");
  assert.equal(msg, "Access denied: role 'readonly' cannot perform 'policy.write'");
});
