import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { register, shutdown } = await import("../dist/index.js");

class FakeServer {
  tools = [];

  registerTool(name, _definition, _handler) {
    this.tools.push(name);
  }
}

function makeTempProject(config = "") {
  const dir = mkdtempSync(join(tmpdir(), "cortex-register-"));
  const contextDir = join(dir, ".context");
  mkdirSync(contextDir, { recursive: true });
  if (config) {
    writeFileSync(join(contextDir, "enterprise.yaml"), config);
  }
  return dir;
}

test("register works without legacy activation artifacts", async () => {
  const projectRoot = makeTempProject(`telemetry:
  enabled: false
audit:
  enabled: false
policy:
  enabled: false
`);
  const server = new FakeServer();
  const previousRoot = process.env.CORTEX_PROJECT_ROOT;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let logs = "";

  process.env.CORTEX_PROJECT_ROOT = projectRoot;
  process.stderr.write = ((chunk, ...args) => {
    logs += String(chunk);
    return originalWrite(chunk, ...args);
  });

  try {
    await register(server);
  } finally {
    shutdown();
    process.stderr.write = originalWrite;
    if (previousRoot === undefined) {
      delete process.env.CORTEX_PROJECT_ROOT;
    } else {
      process.env.CORTEX_PROJECT_ROOT = previousRoot;
    }
  }

  assert.ok(server.tools.includes("enterprise.status"));
  assert.ok(server.tools.includes("telemetry.status"));
  assert.ok(server.tools.includes("policy.sync"));
  const removedTool = "lic" + "ense.status";
  assert.ok(!server.tools.includes(removedTool));
  assert.match(logs, /\[cortex-enterprise\] v/);
  const legacyHints = ["Lic" + "ense invalid", "lic" + "ensed to", "cortex" + ".lic"];
  for (const hint of legacyHints) {
    assert.equal(logs.includes(hint), false);
  }
});
