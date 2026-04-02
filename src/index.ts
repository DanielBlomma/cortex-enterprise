import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const name = "cortex-enterprise";
export const version = "0.1.0";

export async function register(server: McpServer): Promise<void> {
  // Enterprise tools will be registered here as they are built:
  // - license/check.ts   → Offline license validation
  // - telemetry/sync.ts  → Anonymous stats push (connected edition)
  // - policy/push.ts     → Org-wide rules sync
  // - tools/enterprise.ts → Enterprise-specific MCP tools

  process.stderr.write(`[cortex-enterprise] v${version} registered\n`);
}
