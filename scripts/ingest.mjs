#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./ingest/pipeline.mjs";

// Re-export public API for external consumers
export { detectKind, getChunkParserForExtension, resolveRelativeImportTargetId } from "./ingest/discovery.mjs";
export {
  buildSqlResourceReferenceMap,
  extractSqlObjectReferencesFromContent,
  generateNamedResourceRelations,
  generateConfigIncludeRelations,
  generateMachineConfigRelations,
  generateConfigTransformKeyRelations,
  generateConfigTransformRelations,
  generateSectionHandlerRelations,
} from "./ingest/dotnet.mjs";
export {
  generateChunkDescription,
  generateModuleSummary,
  generateModules,
  generateProjects,
} from "./ingest/modules.mjs";

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  main();
}
