import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LicenseInfo } from "../license/check.js";

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

export function registerEnterpriseTools(server: McpServer, license: LicenseInfo): void {
  server.registerTool(
    "license.status",
    {
      description: "Return current Cortex Enterprise license information, validity and expiry.",
      inputSchema: z.object({}),
    },
    async () => buildToolResult({
      customer: license.customer,
      edition: license.edition,
      valid: license.valid,
      issued: license.issued,
      expires: license.expires,
      days_until_expiry: license.daysUntilExpiry,
      max_repos: license.max_repos,
      features: license.features,
      warning: license.warning ?? null,
    }),
  );

  server.registerTool(
    "enterprise.status",
    {
      description: "Return Cortex Enterprise overview: edition, license, and feature status.",
      inputSchema: z.object({}),
    },
    async () => buildToolResult({
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
        telemetry: "not_configured",
        policy_sync: "not_configured",
        audit_log: "not_configured",
      },
    }),
  );
}
