import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LicenseInfo } from "../license/check.js";
import type { EnterpriseConfig } from "../config.js";
import type { TelemetryCollector } from "../telemetry/collector.js";
import type { AuditWriter } from "../audit/writer.js";
import { getLastPush } from "../telemetry/sync.js";
import { queryAuditLog } from "../audit/query.js";

type ToolPayload = Record<string, unknown>;

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

export function registerEnterpriseTools(
  server: McpServer,
  license: LicenseInfo,
  collector: TelemetryCollector,
  auditWriter: AuditWriter | null,
  config: EnterpriseConfig,
  contextDir: string,
): void {
  // ── license.status ──
  server.registerTool(
    "license.status",
    {
      description: "Return current Cortex Enterprise license information, validity and expiry.",
      inputSchema: z.object({}),
    },
    async () => {
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

  // ── enterprise.status ──
  server.registerTool(
    "enterprise.status",
    {
      description: "Return Cortex Enterprise overview: edition, license, and feature status.",
      inputSchema: z.object({}),
    },
    async () => {
      return buildToolResult({
        edition: "enterprise",
        version: "0.1.0",
        license: {
          valid: license.valid,
          customer: license.customer,
          expires: license.expires,
          days_until_expiry: license.daysUntilExpiry,
          warning: license.warning ?? null,
        },
        features: {
          telemetry: config.telemetry.enabled ? "active" : "disabled",
          policy_sync: "not_configured",
          audit_log: config.audit.enabled ? "active" : "disabled",
        },
      });
    },
  );
}
