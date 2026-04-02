import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadEnterpriseConfig } from "./config.js";
import { loadLicense } from "./license/check.js";
import { deployBundledModel } from "./model/deploy.js";
import { TelemetryCollector } from "./telemetry/collector.js";
import { pushMetrics } from "./telemetry/sync.js";
import { AuditWriter } from "./audit/writer.js";
import { registerEnterpriseTools } from "./tools/enterprise.js";

export const name = "cortex-enterprise";
export const version = "0.2.0";

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

  // Initialize telemetry collector
  const collector = new TelemetryCollector(contextDir);

  // Initialize audit writer if enabled
  const auditWriter = config.audit.enabled ? new AuditWriter(contextDir) : null;

  if (license.valid) {
    registerEnterpriseTools(server, license, collector, auditWriter, config, contextDir);
    process.stderr.write(`[cortex-enterprise] v${version} — licensed to: ${license.customer}\n`);
  } else {
    process.stderr.write(`[cortex-enterprise] License invalid: ${license.error}\n`);
  }

  if (license.warning) {
    process.stderr.write(`[cortex-enterprise] Warning: ${license.warning}\n`);
  }

  // Log active features
  if (config.telemetry.enabled) {
    process.stderr.write(`[cortex-enterprise] Telemetry: active (push every ${config.telemetry.interval_minutes}m)\n`);
  }
  if (config.audit.enabled) {
    process.stderr.write(`[cortex-enterprise] Audit log: active (retention ${config.audit.retention_days}d)\n`);
  }

  // Schedule telemetry flush + push
  if (config.telemetry.enabled) {
    const intervalMs = config.telemetry.interval_minutes * 60000;
    const timer = setInterval(async () => {
      collector.flush();
      if (config.telemetry.endpoint) {
        await pushMetrics(collector.getMetrics(), config.telemetry.endpoint, config.telemetry.api_key);
      }
    }, intervalMs);
    timer.unref(); // don't block process exit
  }

  // Flush telemetry on exit
  process.on("beforeExit", () => collector.flush());
}
