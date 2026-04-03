// ---------------------------------------------------------------------------
// pipeline.mjs — main orchestration pipeline for cortex-enterprise ingest
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

import {
  REPO_ROOT,
  CONTEXT_DIR,
  CACHE_DIR,
  DB_IMPORT_DIR,
  MAX_FILE_BYTES,
  MAX_CONTENT_CHARS,
  MAX_BODY_CHARS,
  STRUCTURED_NON_CODE_CHUNK_EXTENSIONS,
  DEFAULT_CHUNK_SPLIT_MIN_LINES,
  DEFAULT_CHUNK_WINDOW_LINES,
  DEFAULT_CHUNK_OVERLAP_LINES,
  DEFAULT_CHUNK_MAX_WINDOWS,
} from "./constants.mjs";

import {
  parseArgs,
  ensureDirectory,
  isTextFile,
  isBinaryBuffer,
  toPosixPath,
  parseSourcePaths,
  parseRules,
  parsePositiveIntegerEnv,
  parseNonNegativeIntegerEnv,
  normalizeToken,
} from "./utils.mjs";

import {
  collectCandidateFiles,
  detectKind,
  getChunkParserForExtension,
  trustLevelForKind,
  checksum,
  normalizeWhitespace,
  extractTitle,
  parseDecisionDate,
  adrTokens,
  findSupersedesReferences,
  writeJsonl,
  writeTsv,
  readJsonlSafe,
  relationKey,
  uniqueRelations,
  hasSourcePrefix,
  resolveRelativeImportTargetId,
} from "./discovery.mjs";

import {
  buildSqlResourceReferenceMap,
  extractSqlObjectReferencesFromContent,
  generateNamedResourceRelations,
  generateConfigIncludeRelations,
  generateMachineConfigRelations,
  generateSectionHandlerRelations,
  generateConfigTransformKeyRelations,
  generateConfigTransformRelations,
  shouldExtractSqlReferences,
  sqlChunkAliases,
  configChunkAliases,
  namedEntryChunkAliases,
  extractSqlResourceKeyReferences,
  extractConfigKeyReferences,
  shouldExtractNamedResourceReferences,
} from "./dotnet.mjs";

import {
  generateProjects,
  removeChunkStateForFile,
  hydrateIncrementalChunkState,
  normalizeRuleTokens,
  fileTokenSet,
  chunkIdFor,
  generateChunkDescription,
  generateModules,
  splitChunkIntoWindows,
} from "./modules.mjs";

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function main() {
  const { mode, verbose } = parseArgs(process.argv);
  const configPath = path.join(CONTEXT_DIR, "config.yaml");
  const rulesPath = path.join(CONTEXT_DIR, "rules.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Missing rules: ${rulesPath}`);
  }

  ensureDirectory(CACHE_DIR);
  ensureDirectory(DB_IMPORT_DIR);

  const configText = fs.readFileSync(configPath, "utf8");
  const sourcePaths = parseSourcePaths(configText);
  if (sourcePaths.length === 0) {
    throw new Error("No source_paths found in .context/config.yaml");
  }

  const rules = parseRules(fs.readFileSync(rulesPath, "utf8"));
  const { candidates, incrementalMode, deletedRelPaths } = collectCandidateFiles(sourcePaths, mode);
  const chunkWindowLines = parsePositiveIntegerEnv(
    "CORTEX_CHUNK_WINDOW_LINES",
    DEFAULT_CHUNK_WINDOW_LINES
  );
  const chunkOverlapLines = Math.max(
    0,
    Math.min(
      chunkWindowLines - 1,
      parseNonNegativeIntegerEnv("CORTEX_CHUNK_OVERLAP_LINES", DEFAULT_CHUNK_OVERLAP_LINES)
    )
  );
  const chunkSplitMinLines = Math.max(
    chunkWindowLines + 1,
    parsePositiveIntegerEnv("CORTEX_CHUNK_SPLIT_MIN_LINES", DEFAULT_CHUNK_SPLIT_MIN_LINES)
  );
  const chunkMaxWindows = parsePositiveIntegerEnv(
    "CORTEX_CHUNK_MAX_WINDOWS",
    DEFAULT_CHUNK_MAX_WINDOWS
  );

  const fileRecordMap = new Map();
  const adrRecordMap = new Map();
  const skipped = {
    unsupported: 0,
    tooLarge: 0,
    binary: 0
  };

  if (incrementalMode) {
    const existingFiles = readJsonlSafe(path.join(CACHE_DIR, "entities.file.jsonl"));
    for (const record of existingFiles) {
      if (!record || typeof record !== "object") continue;
      const filePath = toPosixPath(String(record.path ?? ""));
      if (!filePath || !hasSourcePrefix(filePath, sourcePaths)) {
        continue;
      }
      const absolutePath = path.resolve(REPO_ROOT, filePath);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }
      fileRecordMap.set(String(record.id ?? `file:${filePath}`), {
        ...record,
        id: String(record.id ?? `file:${filePath}`),
        path: filePath,
        kind: String(record.kind ?? detectKind(filePath)),
        content: String(record.content ?? "")
      });
    }

    const existingAdrs = readJsonlSafe(path.join(CACHE_DIR, "entities.adr.jsonl"));
    for (const adr of existingAdrs) {
      if (!adr || typeof adr !== "object") continue;
      const adrPath = toPosixPath(String(adr.path ?? ""));
      if (!adrPath || !hasSourcePrefix(adrPath, sourcePaths)) {
        continue;
      }
      if (!fs.existsSync(path.resolve(REPO_ROOT, adrPath))) {
        continue;
      }
      adrRecordMap.set(String(adr.id ?? ""), {
        ...adr,
        id: String(adr.id ?? ""),
        path: adrPath
      });
    }
  }

  for (const relPath of deletedRelPaths) {
    fileRecordMap.delete(`file:${relPath}`);
    const relPrefix = relPath.endsWith("/") ? relPath : `${relPath}/`;
    for (const [fileId, fileRecord] of fileRecordMap.entries()) {
      if (String(fileRecord.path ?? "").startsWith(relPrefix)) {
        fileRecordMap.delete(fileId);
      }
    }

    for (const [adrId, adrRecord] of adrRecordMap.entries()) {
      if (adrRecord.path === relPath || String(adrRecord.path ?? "").startsWith(relPrefix)) {
        adrRecordMap.delete(adrId);
      }
    }
  }

  for (const absolutePath of [...candidates].sort()) {
    const relPath = toPosixPath(path.relative(REPO_ROOT, absolutePath));
    if (!isTextFile(relPath)) {
      skipped.unsupported += 1;
      if (verbose) console.log(`[ingest] skip unsupported: ${relPath}`);
      continue;
    }

    const stats = fs.statSync(absolutePath);
    if (stats.size > MAX_FILE_BYTES) {
      skipped.tooLarge += 1;
      if (verbose) console.log(`[ingest] skip large: ${relPath}`);
      continue;
    }

    const buffer = fs.readFileSync(absolutePath);
    if (isBinaryBuffer(buffer)) {
      skipped.binary += 1;
      if (verbose) console.log(`[ingest] skip binary: ${relPath}`);
      continue;
    }

    const content = buffer.toString("utf8");
    const kind = detectKind(relPath);
    const id = `file:${relPath}`;
    const updatedAt = stats.mtime.toISOString();
    const sourceOfTruth = kind === "ADR";
    const trustLevel = trustLevelForKind(kind);

    const fileRecord = {
      id,
      path: relPath,
      kind,
      checksum: checksum(buffer),
      updated_at: updatedAt,
      source_of_truth: sourceOfTruth,
      trust_level: trustLevel,
      status: "active",
      size_bytes: stats.size,
      excerpt: normalizeWhitespace(content).slice(0, 500),
      content: content.slice(0, MAX_CONTENT_CHARS)
    };
    fileRecordMap.set(fileRecord.id, fileRecord);

    if (kind === "ADR") {
      const title = extractTitle(content, path.basename(relPath, path.extname(relPath)));
      const adrRecord = {
        id: `adr:${path.basename(relPath, path.extname(relPath)).toLowerCase()}`,
        path: relPath,
        title,
        body: content.slice(0, MAX_BODY_CHARS),
        decision_date: parseDecisionDate(content, updatedAt),
        supersedes_id: "",
        source_of_truth: true,
        trust_level: 95,
        status: "active"
      };
      adrRecordMap.set(adrRecord.id, adrRecord);
    } else {
      for (const [adrId, adrRecord] of adrRecordMap.entries()) {
        if (adrRecord.path === relPath) {
          adrRecordMap.delete(adrId);
        }
      }
    }
  }

  const fileRecords = [...fileRecordMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const adrRecords = [...adrRecordMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const indexedFileIds = new Set(fileRecords.map((record) => record.id));
  const changedFileIds = new Set(
    [...candidates].map((absolutePath) => `file:${toPosixPath(path.relative(REPO_ROOT, absolutePath))}`)
  );

  const {
    chunkRecordMap,
    definesRelationMap,
    callsRelationMap,
    importsRelationMap,
    callsSqlRelationMap
  } = incrementalMode
    ? hydrateIncrementalChunkState(fileRecords)
    : {
        chunkRecordMap: new Map(),
        definesRelationMap: new Map(),
        callsRelationMap: new Map(),
        importsRelationMap: new Map(),
        callsSqlRelationMap: new Map()
      };

  const cachedChunkFileIds = new Set(
    [...chunkRecordMap.values()].map((record) => String(record.file_id ?? "")).filter(Boolean)
  );
  const cachedSqlReferenceFileIds = new Set(
    [...callsSqlRelationMap.values()].map((record) => String(record.from ?? "")).filter(Boolean)
  );
  const usesConfigKeyRelationMap = new Map();
  const usesResourceKeyRelationMap = new Map();
  const usesSettingKeyRelationMap = new Map();

  // Extract chunks from changed or uncached code files
  let windowedChunkCount = 0;
  const sqlChunkIdsByAlias = new Map();
  const configChunkIdsByAlias = new Map();
  const resourceChunkIdsByAlias = new Map();
  const settingChunkIdsByAlias = new Map();
  const deferredSqlCallEdges = [];

  for (const fileRecord of fileRecords) {
    const ext = path.extname(fileRecord.path).toLowerCase();
    const parser = getChunkParserForExtension(ext);
    const isStructuredNonCodeChunk = STRUCTURED_NON_CODE_CHUNK_EXTENSIONS.has(ext);
    if (fileRecord.kind !== "CODE" && !isStructuredNonCodeChunk) continue;
    if (!parser) continue;
    if (typeof parser.isAvailable === "function" && !parser.isAvailable()) continue;

    const shouldParseFile =
      !incrementalMode || changedFileIds.has(fileRecord.id) || !cachedChunkFileIds.has(fileRecord.id);
    if (!shouldParseFile) {
      continue;
    }

    removeChunkStateForFile(
      fileRecord.id,
      chunkRecordMap,
      definesRelationMap,
      callsRelationMap,
      importsRelationMap,
      callsSqlRelationMap
    );

    try {
      const parseResult = parser.parse(fileRecord.content, fileRecord.path, parser.language);

      if (parseResult.errors.length > 0 && verbose) {
        console.log(`[ingest] parse errors in ${fileRecord.path}:`, parseResult.errors[0].message);
      }

      const parsedChunks = [];
      const chunkIdsByName = new Map();

      for (const chunk of parseResult.chunks) {
        const chunkId = chunkIdFor(fileRecord.path, chunk);
        parsedChunks.push({ chunk, chunkId });
        if (!chunkIdsByName.has(chunk.name)) {
          chunkIdsByName.set(chunk.name, []);
        }
        chunkIdsByName.get(chunk.name).push(chunkId);
        if (parser.language === "sql") {
          for (const alias of sqlChunkAliases(chunk.name)) {
            if (!sqlChunkIdsByAlias.has(alias)) {
              sqlChunkIdsByAlias.set(alias, []);
            }
            sqlChunkIdsByAlias.get(alias).push(chunkId);
          }
          deferredSqlCallEdges.push({
            chunkId,
            calls: Array.isArray(chunk.calls) ? chunk.calls : []
          });
        } else if (parser.language === "config") {
          for (const alias of configChunkAliases(chunk)) {
            if (!configChunkIdsByAlias.has(alias)) {
              configChunkIdsByAlias.set(alias, []);
            }
            configChunkIdsByAlias.get(alias).push(chunkId);
          }
          deferredSqlCallEdges.push({
            chunkId,
            calls: Array.isArray(chunk.calls) ? chunk.calls : []
          });
        } else if (parser.language === "resource") {
          for (const alias of namedEntryChunkAliases(chunk)) {
            if (!resourceChunkIdsByAlias.has(alias)) {
              resourceChunkIdsByAlias.set(alias, []);
            }
            resourceChunkIdsByAlias.get(alias).push(chunkId);
          }
          deferredSqlCallEdges.push({
            chunkId,
            calls: Array.isArray(chunk.calls) ? chunk.calls : []
          });
        } else if (parser.language === "settings") {
          for (const alias of namedEntryChunkAliases(chunk)) {
            if (!settingChunkIdsByAlias.has(alias)) {
              settingChunkIdsByAlias.set(alias, []);
            }
            settingChunkIdsByAlias.get(alias).push(chunkId);
          }
          deferredSqlCallEdges.push({
            chunkId,
            calls: Array.isArray(chunk.calls) ? chunk.calls : []
          });
        }

        const chunkRecord = {
          id: chunkId,
          file_id: fileRecord.id,
          name: chunk.name,
          kind: chunk.kind,
          signature: chunk.signature,
          body: chunk.body.slice(0, MAX_BODY_CHARS), // Limit chunk body size
          description: generateChunkDescription(chunk),
          start_line: chunk.startLine,
          end_line: chunk.endLine,
          language: chunk.language,
          exported: Boolean(chunk.exported),
          checksum: checksum(Buffer.from(chunk.body)),
          updated_at: fileRecord.updated_at,
          trust_level: fileRecord.trust_level,
          status:
            typeof fileRecord.status === "string" && fileRecord.status.trim().length > 0
              ? fileRecord.status
              : "active",
          source_of_truth: Boolean(fileRecord.source_of_truth)
        };
        chunkRecordMap.set(chunkId, chunkRecord);

        // DEFINES relation: File -> Chunk
        definesRelationMap.set(relationKey(fileRecord.id, chunkId), {
          from: fileRecord.id,
          to: chunkId
        });

        const windows = splitChunkIntoWindows(chunkRecord, {
          windowLines: chunkWindowLines,
          overlapLines: chunkOverlapLines,
          splitMinLines: chunkSplitMinLines,
          maxWindows: chunkMaxWindows,
          chunkBody: chunk.body
        });
        if (windows.length > 0) {
          windowedChunkCount += windows.length;
          for (const windowChunk of windows) {
            chunkRecordMap.set(windowChunk.id, windowChunk);
            definesRelationMap.set(relationKey(fileRecord.id, windowChunk.id), {
              from: fileRecord.id,
              to: windowChunk.id
            });
          }
        }

        // IMPORTS relations: Chunk -> File
        for (const importPath of chunk.imports || []) {
          const targetFileId = resolveRelativeImportTargetId(fileRecord.path, importPath, indexedFileIds);
          if (!targetFileId) {
            continue;
          }

          importsRelationMap.set(relationKey(chunkId, targetFileId, importPath), {
            from: chunkId,
            to: targetFileId,
            import_name: importPath
          });
        }
      }

      const seenCallEdges = new Set();
      for (const { chunk, chunkId } of parsedChunks) {
        // CALLS relations: Chunk -> Chunk (within same file)
        for (const calledName of chunk.calls || []) {
          const targetChunkIds = chunkIdsByName.get(calledName) || [];
          for (const targetChunkId of targetChunkIds) {
            const callKey = `${chunkId}|${targetChunkId}|direct`;
            if (seenCallEdges.has(callKey)) {
              continue;
            }
            seenCallEdges.add(callKey);
            callsRelationMap.set(relationKey(chunkId, targetChunkId, "direct"), {
              from: chunkId,
              to: targetChunkId,
              call_type: "direct"
            });
          }
        }
      }
    } catch (error) {
      if (verbose) {
        console.log(`[ingest] failed to parse ${fileRecord.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const chunkRecords = [...chunkRecordMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // Filter CALLS relations to only valid targets (chunks that actually exist)
  const chunkIdSet = new Set(chunkRecords.map(c => c.id));
  const validDefinesRelations = [...definesRelationMap.values()].filter(
    (rel) => indexedFileIds.has(rel.from) && chunkIdSet.has(rel.to)
  );
  const totalCallsRelations = callsRelationMap.size;
  for (const edge of deferredSqlCallEdges) {
    for (const calledName of edge.calls) {
      for (const alias of sqlChunkAliases(calledName)) {
        const targetChunkIds = sqlChunkIdsByAlias.get(alias) || [];
        for (const targetChunkId of targetChunkIds) {
          if (targetChunkId === edge.chunkId) {
            continue;
          }
          callsRelationMap.set(relationKey(edge.chunkId, targetChunkId, "sql_reference"), {
            from: edge.chunkId,
            to: targetChunkId,
            call_type: "sql_reference"
          });
        }
      }
    }
  }
  const validCallsRelations = [...callsRelationMap.values()].filter(
    (rel) => chunkIdSet.has(rel.from) && chunkIdSet.has(rel.to)
  );
  const validImportsRelations = [...importsRelationMap.values()].filter(
    (rel) => chunkIdSet.has(rel.from) && indexedFileIds.has(rel.to)
  );
  const sqlDefinitionsChanged =
    incrementalMode &&
    fileRecords.some(
      (fileRecord) =>
        changedFileIds.has(fileRecord.id) && path.extname(fileRecord.path).toLowerCase() === ".sql"
    );
  const sqlResourceReferenceMap = buildSqlResourceReferenceMap(fileRecords);
  for (const fileRecord of fileRecords) {
    if (!shouldExtractSqlReferences(fileRecord.path)) {
      continue;
    }

    const shouldAnalyzeFile =
      !incrementalMode ||
      sqlDefinitionsChanged ||
      changedFileIds.has(fileRecord.id) ||
      !cachedSqlReferenceFileIds.has(fileRecord.id);
    if (!shouldAnalyzeFile) {
      continue;
    }

    for (const [key, relation] of callsSqlRelationMap.entries()) {
      if (relation.from === fileRecord.id) {
        callsSqlRelationMap.delete(key);
      }
    }

    for (const refName of extractSqlObjectReferencesFromContent(
      fileRecord.content,
      fileRecord.path,
      sqlResourceReferenceMap
    )) {
      for (const alias of sqlChunkAliases(refName)) {
        const targetChunkIds = sqlChunkIdsByAlias.get(alias) || [];
        for (const targetChunkId of targetChunkIds) {
          callsSqlRelationMap.set(relationKey(fileRecord.id, targetChunkId, refName), {
            from: fileRecord.id,
            to: targetChunkId,
            note: refName
          });
        }
      }
    }
  }
  const validCallsSqlRelations = [...callsSqlRelationMap.values()].filter(
    (rel) => indexedFileIds.has(rel.from) && chunkIdSet.has(rel.to)
  );
  for (const fileRecord of fileRecords) {
    if (!shouldExtractNamedResourceReferences(fileRecord.path)) {
      continue;
    }

    for (const key of extractSqlResourceKeyReferences(fileRecord.content)) {
      for (const targetChunkId of resourceChunkIdsByAlias.get(key) ?? []) {
        usesResourceKeyRelationMap.set(relationKey(fileRecord.id, targetChunkId, key), {
          from: fileRecord.id,
          to: targetChunkId,
          note: key
        });
      }
      for (const targetChunkId of settingChunkIdsByAlias.get(key) ?? []) {
        usesSettingKeyRelationMap.set(relationKey(fileRecord.id, targetChunkId, key), {
          from: fileRecord.id,
          to: targetChunkId,
          note: key
        });
      }
    }

    for (const key of extractConfigKeyReferences(fileRecord.content)) {
      for (const targetChunkId of configChunkIdsByAlias.get(key) ?? []) {
        usesConfigKeyRelationMap.set(relationKey(fileRecord.id, targetChunkId, key), {
          from: fileRecord.id,
          to: targetChunkId,
          note: key
        });
      }
    }
  }
  for (const relation of generateConfigTransformKeyRelations(fileRecords, chunkRecords)) {
    usesConfigKeyRelationMap.set(relationKey(relation.from, relation.to, relation.note), relation);
  }
  const validUsesConfigKeyRelations = [...usesConfigKeyRelationMap.values()].filter(
    (rel) => indexedFileIds.has(rel.from) && chunkIdSet.has(rel.to)
  );
  const validUsesResourceKeyRelations = [...usesResourceKeyRelationMap.values()].filter(
    (rel) => indexedFileIds.has(rel.from) && chunkIdSet.has(rel.to)
  );
  const validUsesSettingKeyRelations = [...usesSettingKeyRelationMap.values()].filter(
    (rel) => indexedFileIds.has(rel.from) && chunkIdSet.has(rel.to)
  );

  if (verbose && chunkRecords.length > 0) {
    console.log(`[ingest] extracted ${chunkRecords.length} chunks from ${fileRecords.filter(f => f.kind === "CODE").length} code files`);
    if (windowedChunkCount > 0) {
      console.log(
        `[ingest] overlap windows added=${windowedChunkCount} (window_lines=${chunkWindowLines}, overlap_lines=${chunkOverlapLines}, max_windows=${chunkMaxWindows})`
      );
    }
    console.log(`[ingest] ${validCallsRelations.length} call relations (${totalCallsRelations - validCallsRelations.length} filtered)`);
    if (validCallsSqlRelations.length > 0) {
      console.log(`[ingest] sql call links=${validCallsSqlRelations.length}`);
    }
    if (validUsesConfigKeyRelations.length > 0) {
      console.log(`[ingest] uses_config_key=${validUsesConfigKeyRelations.length}`);
    }
    if (validUsesResourceKeyRelations.length > 0 || validUsesSettingKeyRelations.length > 0) {
      console.log(
        `[ingest] uses_resource_key=${validUsesResourceKeyRelations.length} uses_setting_key=${validUsesSettingKeyRelations.length}`
      );
    }
  }

  // Generate Module entities and relations
  const moduleResult = generateModules(fileRecords, chunkRecords);
  const moduleRecords = moduleResult.modules;
  const moduleContainsRelations = moduleResult.containsRelations;
  const moduleContainsModuleRelations = moduleResult.containsModuleRelations;
  const moduleExportsRelations = moduleResult.exportsRelations;
  const projectResult = generateProjects(fileRecords);
  const projectRecords = projectResult.projects;
  const projectIncludesFileRelations = projectResult.includesFileRelations;
  const projectReferencesProjectRelations = projectResult.referencesProjectRelations;
  const namedResourceRelationResult = generateNamedResourceRelations(fileRecords);
  const usesResourceRelations = namedResourceRelationResult.usesResourceRelations;
  const usesSettingRelations = namedResourceRelationResult.usesSettingRelations;
  const configIncludeRelations = generateConfigIncludeRelations(fileRecords);
  const machineConfigRelations = generateMachineConfigRelations(fileRecords);
  const sectionHandlerRelations = generateSectionHandlerRelations(fileRecords);
  const usesConfigRelations = uniqueRelations([
    ...namedResourceRelationResult.usesConfigRelations,
    ...configIncludeRelations,
    ...machineConfigRelations,
    ...sectionHandlerRelations
  ]);
  const configTransformRelations = generateConfigTransformRelations(fileRecords);

  if (verbose && moduleRecords.length > 0) {
    console.log(`[ingest] modules=${moduleRecords.length} contains=${moduleContainsRelations.length} contains_module=${moduleContainsModuleRelations.length} exports=${moduleExportsRelations.length}`);
  }
  if (verbose && projectRecords.length > 0) {
    console.log(
      `[ingest] projects=${projectRecords.length} includes_file=${projectIncludesFileRelations.length} references_project=${projectReferencesProjectRelations.length}`
    );
  }
  if (
    verbose &&
    (
      usesResourceRelations.length > 0 ||
      usesSettingRelations.length > 0 ||
      usesConfigRelations.length > 0 ||
      configTransformRelations.length > 0
    )
  ) {
    console.log(
      `[ingest] uses_resource=${usesResourceRelations.length} uses_setting=${usesSettingRelations.length} uses_config=${usesConfigRelations.length} transforms_config=${configTransformRelations.length}`
    );
  }

  const ruleRecords = rules.map((rule) => ({
    id: rule.id,
    title: rule.id,
    body: rule.description,
    scope: "global",
    updated_at: new Date().toISOString(),
    source_of_truth: true,
    trust_level: 95,
    status: rule.enforce ? "active" : "draft",
    priority: rule.priority
  }));

  const adrTokenIndex = new Map();
  for (const adrRecord of adrRecords) {
    for (const token of adrTokens(adrRecord)) {
      if (!adrTokenIndex.has(token)) {
        adrTokenIndex.set(token, adrRecord.id);
      }
    }
  }

  const supersedesRelations = [];
  for (const adrRecord of adrRecords) {
    const refs = findSupersedesReferences(adrRecord.body);
    for (const ref of refs) {
      const target = adrTokenIndex.get(normalizeToken(ref));
      if (!target || target === adrRecord.id) {
        continue;
      }
      adrRecord.supersedes_id = target;
      supersedesRelations.push({
        from: adrRecord.id,
        to: target,
        reason: `Supersedes ${ref}`
      });
    }
  }

  const constrainsRelations = [];
  const implementsRelations = [];
  const constrainsSeen = new Set();
  const implementsSeen = new Set();
  const lowerContentByFileId = new Map(
    fileRecords.map((fileRecord) => [fileRecord.id, fileRecord.content.toLowerCase()])
  );
  const tokenByFileId = new Map(fileRecords.map((fileRecord) => [fileRecord.id, fileTokenSet(fileRecord)]));

  for (const ruleRecord of ruleRecords) {
    const needle = ruleRecord.id.toLowerCase();
    const ruleKeywords = normalizeRuleTokens(ruleRecord);

    for (const fileRecord of fileRecords) {
      const lower = lowerContentByFileId.get(fileRecord.id) ?? "";
      const explicitMention = lower.includes(needle);
      const tokens = tokenByFileId.get(fileRecord.id) ?? new Set();
      const matchedKeywords = ruleKeywords.filter((keyword) => tokens.has(keyword));
      const minimumMatches = fileRecord.kind === "CODE" ? 1 : 2;
      const keywordMatch = matchedKeywords.length >= Math.min(minimumMatches, Math.max(1, ruleKeywords.length));

      if (!explicitMention && !keywordMatch) {
        continue;
      }

      const constrainsKey = `${ruleRecord.id}|${fileRecord.id}`;
      if (!constrainsSeen.has(constrainsKey)) {
        constrainsSeen.add(constrainsKey);
        constrainsRelations.push({
          from: ruleRecord.id,
          to: fileRecord.id,
          note: explicitMention
            ? `Mentions ${ruleRecord.id}`
            : `Keyword match ${matchedKeywords.slice(0, 5).join(", ")}`
        });
      }

      if (fileRecord.kind === "CODE") {
        const implementsKey = `${fileRecord.id}|${ruleRecord.id}`;
        if (!implementsSeen.has(implementsKey)) {
          implementsSeen.add(implementsKey);
          implementsRelations.push({
            from: fileRecord.id,
            to: ruleRecord.id,
            note: explicitMention
              ? `Code references ${ruleRecord.id}`
              : `Code keywords ${matchedKeywords.slice(0, 5).join(", ")}`
          });
        }
      }
    }
  }

  writeJsonl(path.join(CACHE_DIR, "documents.jsonl"), fileRecords);
  writeJsonl(path.join(CACHE_DIR, "entities.file.jsonl"), fileRecords);
  writeJsonl(path.join(CACHE_DIR, "entities.adr.jsonl"), adrRecords);
  writeJsonl(path.join(CACHE_DIR, "entities.rule.jsonl"), ruleRecords);
  writeJsonl(path.join(CACHE_DIR, "entities.chunk.jsonl"), chunkRecords);
  writeJsonl(path.join(CACHE_DIR, "relations.supersedes.jsonl"), supersedesRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.constrains.jsonl"), constrainsRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.implements.jsonl"), implementsRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.defines.jsonl"), validDefinesRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.calls.jsonl"), validCallsRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.imports.jsonl"), validImportsRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.calls_sql.jsonl"), validCallsSqlRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_config_key.jsonl"), validUsesConfigKeyRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_resource_key.jsonl"), validUsesResourceKeyRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_setting_key.jsonl"), validUsesSettingKeyRelations);
  writeJsonl(path.join(CACHE_DIR, "entities.module.jsonl"), moduleRecords);
  writeJsonl(path.join(CACHE_DIR, "relations.contains.jsonl"), moduleContainsRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.contains_module.jsonl"), moduleContainsModuleRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.exports.jsonl"), moduleExportsRelations);
  writeJsonl(path.join(CACHE_DIR, "entities.project.jsonl"), projectRecords);
  writeJsonl(path.join(CACHE_DIR, "relations.includes_file.jsonl"), projectIncludesFileRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_resource.jsonl"), usesResourceRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_setting.jsonl"), usesSettingRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.uses_config.jsonl"), usesConfigRelations);
  writeJsonl(path.join(CACHE_DIR, "relations.transforms_config.jsonl"), configTransformRelations);
  writeJsonl(
    path.join(CACHE_DIR, "relations.references_project.jsonl"),
    projectReferencesProjectRelations
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "file_nodes.tsv"),
    [
      "id",
      "path",
      "kind",
      "excerpt",
      "checksum",
      "updated_at",
      "source_of_truth",
      "trust_level",
      "status"
    ],
    fileRecords.map((record) => [
      record.id,
      record.path,
      record.kind,
      record.excerpt,
      record.checksum,
      record.updated_at,
      record.source_of_truth,
      record.trust_level,
      record.status
    ])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "rule_nodes.tsv"),
    [
      "id",
      "title",
      "body",
      "scope",
      "priority",
      "updated_at",
      "source_of_truth",
      "trust_level",
      "status"
    ],
    ruleRecords.map((record) => [
      record.id,
      record.title,
      record.body,
      record.scope,
      record.priority,
      record.updated_at,
      record.source_of_truth,
      record.trust_level,
      record.status
    ])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "adr_nodes.tsv"),
    [
      "id",
      "path",
      "title",
      "body",
      "decision_date",
      "supersedes_id",
      "source_of_truth",
      "trust_level",
      "status"
    ],
    adrRecords.map((record) => [
      record.id,
      record.path,
      record.title,
      record.body,
      record.decision_date,
      record.supersedes_id,
      record.source_of_truth,
      record.trust_level,
      record.status
    ])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "constrains_rel.tsv"),
    ["from", "to", "note"],
    constrainsRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "implements_rel.tsv"),
    ["from", "to", "note"],
    implementsRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "supersedes_rel.tsv"),
    ["from", "to", "reason"],
    supersedesRelations.map((record) => [record.from, record.to, record.reason])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "chunk_nodes.tsv"),
    [
      "id",
      "file_id",
      "name",
      "kind",
      "signature",
      "body",
      "start_line",
      "end_line",
      "language",
      "checksum",
      "updated_at",
      "trust_level"
    ],
    chunkRecords.map((record) => [
      record.id,
      record.file_id,
      record.name,
      record.kind,
      record.signature,
      record.body,
      record.start_line,
      record.end_line,
      record.language,
      record.checksum,
      record.updated_at,
      record.trust_level
    ])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "defines_rel.tsv"),
    ["from", "to"],
    validDefinesRelations.map((record) => [record.from, record.to])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "calls_rel.tsv"),
    ["from", "to", "call_type"],
    validCallsRelations.map((record) => [record.from, record.to, record.call_type])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "imports_rel.tsv"),
    ["from", "to", "import_name"],
    validImportsRelations.map((record) => [record.from, record.to, record.import_name])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "calls_sql_rel.tsv"),
    ["from", "to", "note"],
    validCallsSqlRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_config_key_rel.tsv"),
    ["from", "to", "note"],
    validUsesConfigKeyRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_resource_key_rel.tsv"),
    ["from", "to", "note"],
    validUsesResourceKeyRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_setting_key_rel.tsv"),
    ["from", "to", "note"],
    validUsesSettingKeyRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "project_nodes.tsv"),
    [
      "id",
      "path",
      "name",
      "kind",
      "language",
      "target_framework",
      "summary",
      "file_count",
      "updated_at",
      "source_of_truth",
      "trust_level",
      "status"
    ],
    projectRecords.map((record) => [
      record.id,
      record.path,
      record.name,
      record.kind,
      record.language,
      record.target_framework,
      record.summary,
      record.file_count,
      record.updated_at,
      record.source_of_truth,
      record.trust_level,
      record.status
    ])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "includes_file_rel.tsv"),
    ["from", "to"],
    projectIncludesFileRelations.map((record) => [record.from, record.to])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "references_project_rel.tsv"),
    ["from", "to", "note"],
    projectReferencesProjectRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_resource_rel.tsv"),
    ["from", "to", "note"],
    usesResourceRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_setting_rel.tsv"),
    ["from", "to", "note"],
    usesSettingRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "uses_config_rel.tsv"),
    ["from", "to", "note"],
    usesConfigRelations.map((record) => [record.from, record.to, record.note])
  );

  writeTsv(
    path.join(DB_IMPORT_DIR, "transforms_config_rel.tsv"),
    ["from", "to", "note"],
    configTransformRelations.map((record) => [record.from, record.to, record.note])
  );

  const manifest = {
    generated_at: new Date().toISOString(),
    mode,
    source_paths: sourcePaths,
    counts: {
      files: fileRecords.length,
      adrs: adrRecords.length,
      rules: ruleRecords.length,
      chunks: chunkRecords.length,
      relations_constrains: constrainsRelations.length,
      relations_implements: implementsRelations.length,
      relations_supersedes: supersedesRelations.length,
      relations_defines: validDefinesRelations.length,
      relations_calls: validCallsRelations.length,
      relations_imports: validImportsRelations.length,
      relations_calls_sql: validCallsSqlRelations.length,
      relations_uses_config_key: validUsesConfigKeyRelations.length,
      relations_uses_resource_key: validUsesResourceKeyRelations.length,
      relations_uses_setting_key: validUsesSettingKeyRelations.length,
      modules: moduleRecords.length,
      relations_contains: moduleContainsRelations.length,
      relations_contains_module: moduleContainsModuleRelations.length,
      relations_exports: moduleExportsRelations.length,
      projects: projectRecords.length,
      relations_includes_file: projectIncludesFileRelations.length,
      relations_references_project: projectReferencesProjectRelations.length,
      relations_uses_resource: usesResourceRelations.length,
      relations_uses_setting: usesSettingRelations.length,
      relations_uses_config: usesConfigRelations.length,
      relations_transforms_config: configTransformRelations.length
    },
    skipped,
    incremental_mode: incrementalMode,
    changed_candidates: candidates.size,
    deleted_paths: deletedRelPaths.length
  };

  fs.writeFileSync(path.join(CACHE_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[ingest] mode=${mode}`);
  if (incrementalMode) {
    console.log(
      `[ingest] incremental changed_candidates=${manifest.changed_candidates} deleted_paths=${manifest.deleted_paths}`
    );
  } else if (mode === "changed") {
    console.log("[ingest] incremental diff unavailable; processed full source set");
  }
  console.log(`[ingest] files=${manifest.counts.files} adrs=${manifest.counts.adrs} rules=${manifest.counts.rules} chunks=${manifest.counts.chunks}`);
  console.log(
    `[ingest] rels constrains=${manifest.counts.relations_constrains} implements=${manifest.counts.relations_implements} supersedes=${manifest.counts.relations_supersedes}`
  );
  console.log(
    `[ingest] rels defines=${manifest.counts.relations_defines} calls=${manifest.counts.relations_calls} imports=${manifest.counts.relations_imports} calls_sql=${manifest.counts.relations_calls_sql} uses_config_key=${manifest.counts.relations_uses_config_key} uses_resource_key=${manifest.counts.relations_uses_resource_key} uses_setting_key=${manifest.counts.relations_uses_setting_key}`
  );
  console.log(
    `[ingest] rels contains=${manifest.counts.relations_contains} contains_module=${manifest.counts.relations_contains_module} exports=${manifest.counts.relations_exports} includes_file=${manifest.counts.relations_includes_file} references_project=${manifest.counts.relations_references_project} uses_resource=${manifest.counts.relations_uses_resource} uses_setting=${manifest.counts.relations_uses_setting} uses_config=${manifest.counts.relations_uses_config} transforms_config=${manifest.counts.relations_transforms_config}`
  );
  console.log(
    `[ingest] skipped unsupported=${skipped.unsupported} too_large=${skipped.tooLarge} binary=${skipped.binary}`
  );
  console.log(`[ingest] wrote cache + db import files under .context/`);
}

export { main };
