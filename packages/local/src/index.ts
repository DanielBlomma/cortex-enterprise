import path from "node:path";
import { createRequire } from "node:module";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadEnterpriseConfig } from "@danielblomma/cortex-core/config";
import { loadLicense } from "@danielblomma/cortex-core/license/check";
import { deployBundledModel } from "./model/deploy.js";
import { TelemetryCollector } from "@danielblomma/cortex-core/telemetry/collector";
import { pushMetrics } from "./telemetry/sync.js";
import { AuditWriter } from "@danielblomma/cortex-core/audit/writer";
import { PolicyStore } from "@danielblomma/cortex-core/policy/store";
import { syncFromCloud, syncFromLocal } from "./policy/sync.js";
import { registerEnterpriseTools } from "./tools/enterprise.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const name = "cortex-enterprise";
export const version: string = pkg.version;

const timers: NodeJS.Timeout[] = [];

export function shutdown(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}

export async function register(server: McpServer): Promise<void> {
  const projectRoot = process.env.CORTEX_PROJECT_ROOT?.trim() || process.cwd();
  const contextDir = path.join(projectRoot, ".context");

  // Deploy bundled embedding model if not already cached
  const modelDeployed = deployBundledModel(contextDir);
  if (modelDeployed) {
    process.stderr.write(`[cortex-enterprise] Bundled embedding model deployed\n`);
  }

  const license = loadLicense(contextDir);
  const config = loadEnterpriseConfig(contextDir);

  // Initialize subsystems
  const collector = new TelemetryCollector(contextDir);
  const auditWriter = config.audit.enabled ? new AuditWriter(contextDir) : null;
  const policyStore = new PolicyStore(contextDir);

  // Initial policy sync
  if (config.policy.enabled) {
    if (config.policy.endpoint && config.policy.api_key) {
      await syncFromCloud(config.policy.endpoint, config.policy.api_key, policyStore);
      process.stderr.write(`[cortex-enterprise] Policy sync: cloud\n`);
    } else {
      syncFromLocal(policyStore);
      const orgCount = policyStore.loadOrgPolicies().length;
      if (orgCount > 0) {
        process.stderr.write(`[cortex-enterprise] Policy sync: ${orgCount} org rules loaded\n`);
      }
    }
  }

  if (license.valid) {
    registerEnterpriseTools(server, license, collector, auditWriter, config, contextDir, policyStore, version);
    process.stderr.write(`[cortex-enterprise] v${version} — licensed to: ${license.customer}\n`);
  } else {
    process.stderr.write(`[cortex-enterprise] License invalid: ${license.error}\n`);
  }

  if (license.warning) {
    process.stderr.write(`[cortex-enterprise] Warning: ${license.warning}\n`);
  }

  // Log active features
  const features: string[] = [];
  if (config.telemetry.enabled) features.push("telemetry");
  if (config.audit.enabled) features.push("audit");
  if (config.policy.enabled) features.push("policy");
  if (config.rbac.enabled) features.push(`rbac(${config.rbac.default_role})`);
  if (features.length > 0) {
    process.stderr.write(`[cortex-enterprise] Active: ${features.join(", ")}\n`);
  }

  // Schedule telemetry flush + push
  if (config.telemetry.enabled) {
    const intervalMs = config.telemetry.interval_minutes * 60000;
    const timer = setInterval(async () => {
      try {
        collector.flush();
        if (config.telemetry.endpoint) {
          await pushMetrics(collector.getMetrics(), config.telemetry.endpoint, config.telemetry.api_key);
        }
      } catch (err) {
        process.stderr.write(`[cortex-enterprise] Telemetry flush error: ${err}\n`);
      }
    }, intervalMs);
    timer.unref();
    timers.push(timer);
  }

  // Schedule policy sync
  if (config.policy.enabled && config.policy.endpoint && config.policy.api_key) {
    const intervalMs = config.policy.sync_interval_minutes * 60000;
    const timer = setInterval(async () => {
      try {
        await syncFromCloud(config.policy.endpoint, config.policy.api_key, policyStore);
      } catch (err) {
        process.stderr.write(`[cortex-enterprise] Policy sync error: ${err}\n`);
      }
    }, intervalMs);
    timer.unref();
    timers.push(timer);
  }

  // Flush telemetry on exit
  const cleanup = () => {
    shutdown();
    collector.flush();
  };
  process.on("beforeExit", cleanup);
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}
