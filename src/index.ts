import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadLicense } from "./license/check.js";
import { deployBundledModel } from "./model/deploy.js";
import { registerEnterpriseTools } from "./tools/enterprise.js";

export const name = "cortex-enterprise";
export const version = "0.1.0";

export async function register(server: McpServer): Promise<void> {
  const projectRoot = process.env.CORTEX_PROJECT_ROOT?.trim() || process.cwd();
  const contextDir = path.join(projectRoot, ".context");

  // Deploy bundled embedding model if not already cached
  const modelDeployed = deployBundledModel(contextDir);
  if (modelDeployed) {
    process.stderr.write(`[cortex-enterprise] Bundled embedding model deployed\n`);
  }

  const license = loadLicense(contextDir);

  if (license.valid) {
    registerEnterpriseTools(server, license);
    process.stderr.write(`[cortex-enterprise] v${version} — licensed to: ${license.customer}\n`);
  } else {
    process.stderr.write(`[cortex-enterprise] License invalid: ${license.error}\n`);
  }

  if (license.warning) {
    process.stderr.write(`[cortex-enterprise] Warning: ${license.warning}\n`);
  }
}
