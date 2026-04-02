import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LicenseInfo } from "@danielblomma/cortex-core/license/check";
import type { EnterpriseConfig } from "@danielblomma/cortex-core/config";
import type { TelemetryCollector } from "@danielblomma/cortex-core/telemetry/collector";
import type { AuditWriter } from "@danielblomma/cortex-core/audit/writer";
import type { PolicyStore } from "@danielblomma/cortex-core/policy/store";
import { getLastPush } from "../telemetry/sync.js";
import { syncFromCloud, syncFromLocal, getLastSync } from "../policy/sync.js";
import { queryAuditLog } from "@danielblomma/cortex-core/audit/query";
import { checkAccess, getAccessDeniedMessage, type Role } from "@danielblomma/cortex-core/rbac/check";

type ToolPayload = Record<string, unknown>;

const VALID_ROLES = new Set<Role>(["admin", "developer", "readonly"]);

function buildToolResult(data: ToolPayload) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function accessDenied(role: Role, action: string) {
  return buildToolResult({
    error: getAccessDeniedMessage(role, action),
    role,
    action,
  });
}

export function registerEnterpriseTools(
  server: McpServer,
  license: LicenseInfo,
  collector: TelemetryCollector,
  auditWriter: AuditWriter | null,
  config: EnterpriseConfig,
  contextDir: string,
  policyStore: PolicyStore,
  version: string,
): void {
  const roleCandidate = config.rbac.enabled ? config.rbac.default_role : "admin";
  const role: Role = VALID_ROLES.has(roleCandidate as Role)
    ? (roleCandidate as Role)
    : "readonly";
  if (!VALID_ROLES.has(roleCandidate as Role) && config.rbac.enabled) {
    process.stderr.write(`[cortex-enterprise] Invalid RBAC role '${roleCandidate}', falling back to 'readonly'\n`);
  }

  // ── license.status ──
  server.registerTool(
    "license.status",
    {
      description: "Return current Cortex Enterprise license information, validity and expiry.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "license.status")) {
        return accessDenied(role, "license.status");
      }

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "license.status",
        input: {},
        result_count: 1,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        customer: license.customer,
        edition: license.edition,
        valid: license.valid,
        issued: license.issued,
        expires: license.expires,
        days_until_expiry: license.daysUntilExpiry,
        max_repos: license.max_repos,
        features: license.features,
        warning: license.warning ?? null,
      });
    },
  );

  // ── telemetry.status ──
  server.registerTool(
    "telemetry.status",
    {
      description: "Return telemetry configuration and current aggregated metrics.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "telemetry.status")) {
        return accessDenied(role, "telemetry.status");
      }

      const metrics = collector.getMetrics();
      const lastPush = getLastPush();

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "telemetry.status",
        input: {},
        result_count: 1,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        enabled: config.telemetry.enabled,
        endpoint: config.telemetry.endpoint || null,
        interval_minutes: config.telemetry.interval_minutes,
        metrics,
        last_push: lastPush,
      });
    },
  );

  // ── audit.query ──
  server.registerTool(
    "audit.query",
    {
      description: "Search the enterprise audit log by date range, tool name, and limit.",
      inputSchema: z.object({
        from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        to: z.string().optional().describe("End date (YYYY-MM-DD)"),
        tool: z.string().optional().describe("Filter by tool name"),
        limit: z.number().int().positive().max(500).default(50),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "audit.query")) {
        return accessDenied(role, "audit.query");
      }

      const parsed = z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        tool: z.string().optional(),
        limit: z.number().int().positive().max(500).default(50),
      }).parse(input ?? {});

      const entries = queryAuditLog(contextDir, parsed);

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "audit.query",
        input: parsed as Record<string, unknown>,
        result_count: entries.length,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        count: entries.length,
        entries,
      });
    },
  );

  // ── policy.list ──
  server.registerTool(
    "policy.list",
    {
      description: "List all active policies (org + local merged). Org rules override local rules with same ID.",
      inputSchema: z.object({
        source: z.enum(["all", "org", "local"]).default("all").describe("Filter by policy source"),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "policy.list")) {
        return accessDenied(role, "policy.list");
      }

      const parsed = z.object({
        source: z.enum(["all", "org", "local"]).default("all"),
      }).parse(input ?? {});

      let policies = policyStore.getMergedPolicies();

      if (parsed.source !== "all") {
        policies = policies.filter(p => p.source === parsed.source);
      }

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "policy.list",
        input: parsed as Record<string, unknown>,
        result_count: policies.length,
        entities_returned: policies.map(p => p.id),
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        count: policies.length,
        policies: policies.map(p => ({
          id: p.id,
          description: p.description,
          priority: p.priority,
          scope: p.scope,
          enforce: p.enforce,
          source: p.source,
        })),
      });
    },
  );

  // ── policy.sync ──
  server.registerTool(
    "policy.sync",
    {
      description: "Trigger manual policy sync. Connected: pulls from cloud API. Air-gapped: reloads local org-rules.yaml.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "policy.sync")) {
        return accessDenied(role, "policy.sync");
      }

      let result;
      if (config.policy.endpoint && config.policy.api_key) {
        result = await syncFromCloud(config.policy.endpoint, config.policy.api_key, policyStore);
      } else {
        result = syncFromLocal(policyStore);
      }

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "policy.sync",
        input: {},
        result_count: result.synced,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult(result as unknown as ToolPayload);
    },
  );

  // ── enterprise.status ──
  server.registerTool(
    "enterprise.status",
    {
      description: "Return Cortex Enterprise overview: edition, license, and feature status.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "enterprise.status")) {
        return accessDenied(role, "enterprise.status");
      }

      const lastSyncResult = getLastSync();
      const policies = policyStore.getMergedPolicies();

      return buildToolResult({
        edition: "enterprise",
        version,
        license: {
          valid: license.valid,
          customer: license.customer,
          expires: license.expires,
          days_until_expiry: license.daysUntilExpiry,
          warning: license.warning ?? null,
        },
        features: {
          telemetry: config.telemetry.enabled ? "active" : "disabled",
          policy_sync: config.policy.enabled ? "active" : "disabled",
          audit_log: config.audit.enabled ? "active" : "disabled",
          rbac: config.rbac.enabled ? `active (role: ${role})` : "disabled",
        },
        policies: {
          total: policies.length,
          org: policies.filter(p => p.source === "org").length,
          local: policies.filter(p => p.source === "local").length,
          last_sync: lastSyncResult,
        },
      });
    },
  );
}
