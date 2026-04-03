import fs from "node:fs";
import path from "node:path";

import {
  CACHE_DIR,
  MAX_BODY_CHARS,
  REPO_ROOT,
  RULE_KEYWORD_LIMIT,
  STOP_WORDS,
  DEFAULT_CHUNK_WINDOW_LINES,
  DEFAULT_CHUNK_OVERLAP_LINES,
  DEFAULT_CHUNK_MAX_WINDOWS
} from "./constants.mjs";

import {
  toPosixPath,
  tokenizeKeywords,
  uniqueSorted,
  parsePositiveIntegerEnv,
  parseNonNegativeIntegerEnv
} from "./utils.mjs";

import {
  readJsonlSafe,
  uniqueRelations,
  relationKey,
  checksum,
  normalizeWhitespace
} from "./discovery.mjs";

import {
  isProjectDefinitionFile,
  parseSolutionProject,
  parseDotNetProject
} from "./dotnet.mjs";

// ---------------------------------------------------------------------------
// Project / module generation and chunk utilities
// ---------------------------------------------------------------------------

function generateProjects(fileRecords) {
  const indexedFileIds = new Set(fileRecords.map((record) => record.id));
  const projectRecords = [];
  const includesFileRelations = [];
  const referencesProjectRelations = [];
  const includeKeys = new Set();
  const referenceKeys = new Set();

  for (const fileRecord of fileRecords) {
    if (!isProjectDefinitionFile(fileRecord.path)) {
      continue;
    }

    const ext = path.extname(fileRecord.path).toLowerCase();
    const parsed =
      ext === ".sln"
        ? parseSolutionProject(fileRecord, indexedFileIds)
        : parseDotNetProject(fileRecord, indexedFileIds);

    projectRecords.push(parsed.project);

    for (const relation of parsed.includesFileRelations) {
      const key = relationKey(relation.from, relation.to);
      if (includeKeys.has(key)) {
        continue;
      }
      includeKeys.add(key);
      includesFileRelations.push(relation);
    }

    for (const relation of parsed.referencesProjectRelations) {
      const key = relationKey(relation.from, relation.to, relation.note);
      if (referenceKeys.has(key)) {
        continue;
      }
      referenceKeys.add(key);
      referencesProjectRelations.push(relation);
    }
  }

  projectRecords.sort((a, b) => a.path.localeCompare(b.path));
  includesFileRelations.sort((a, b) => relationKey(a.from, a.to).localeCompare(relationKey(b.from, b.to)));
  referencesProjectRelations.sort((a, b) =>
    relationKey(a.from, a.to, a.note).localeCompare(relationKey(b.from, b.to, b.note))
  );

  return {
    projects: projectRecords,
    includesFileRelations,
    referencesProjectRelations
  };
}

function removeChunkStateForFile(fileId, chunkRecordMap, definesRelationMap, callsRelationMap, importsRelationMap, callsSqlRelationMap) {
  const removedChunkIds = new Set();

  for (const [chunkId, chunkRecord] of chunkRecordMap.entries()) {
    if (chunkRecord.file_id === fileId) {
      removedChunkIds.add(chunkId);
      chunkRecordMap.delete(chunkId);
    }
  }

  if (removedChunkIds.size === 0) {
    return;
  }

  for (const [key, relation] of definesRelationMap.entries()) {
    if (relation.from === fileId || removedChunkIds.has(relation.to)) {
      definesRelationMap.delete(key);
    }
  }

  for (const [key, relation] of callsRelationMap.entries()) {
    if (removedChunkIds.has(relation.from) || removedChunkIds.has(relation.to)) {
      callsRelationMap.delete(key);
    }
  }

  for (const [key, relation] of importsRelationMap.entries()) {
    if (removedChunkIds.has(relation.from)) {
      importsRelationMap.delete(key);
    }
  }

  for (const [key, relation] of callsSqlRelationMap.entries()) {
    if (relation.from === fileId || removedChunkIds.has(relation.to)) {
      callsSqlRelationMap.delete(key);
    }
  }
}

function hydrateIncrementalChunkState(fileRecords) {
  const fileIdSet = new Set(fileRecords.map((record) => record.id));
  const chunkRecordMap = new Map();
  const definesRelationMap = new Map();
  const callsRelationMap = new Map();
  const importsRelationMap = new Map();
  const callsSqlRelationMap = new Map();

  for (const record of readJsonlSafe(path.join(CACHE_DIR, "entities.chunk.jsonl"))) {
    if (!record || typeof record !== "object") continue;
    const chunkId = String(record.id ?? "");
    const fileId = String(record.file_id ?? "");
    if (!chunkId || !fileIdSet.has(fileId)) {
      continue;
    }
    chunkRecordMap.set(chunkId, {
      ...record,
      id: chunkId,
      file_id: fileId
    });
  }

  const chunkIdSet = new Set(chunkRecordMap.keys());

  for (const record of readJsonlSafe(path.join(CACHE_DIR, "relations.defines.jsonl"))) {
    if (!record || typeof record !== "object") continue;
    const from = String(record.from ?? "");
    const to = String(record.to ?? "");
    if (!fileIdSet.has(from) || !chunkIdSet.has(to)) {
      continue;
    }
    definesRelationMap.set(relationKey(from, to), { from, to });
  }

  for (const record of readJsonlSafe(path.join(CACHE_DIR, "relations.calls.jsonl"))) {
    if (!record || typeof record !== "object") continue;
    const from = String(record.from ?? "");
    const to = String(record.to ?? "");
    const callType = String(record.call_type ?? "direct");
    if (!chunkIdSet.has(from) || !chunkIdSet.has(to)) {
      continue;
    }
    callsRelationMap.set(relationKey(from, to, callType), {
      from,
      to,
      call_type: callType
    });
  }

  for (const record of readJsonlSafe(path.join(CACHE_DIR, "relations.imports.jsonl"))) {
    if (!record || typeof record !== "object") continue;
    const from = String(record.from ?? "");
    const to = String(record.to ?? "");
    const importName = String(record.import_name ?? "");
    if (!chunkIdSet.has(from) || !fileIdSet.has(to)) {
      continue;
    }
    importsRelationMap.set(relationKey(from, to, importName), {
      from,
      to,
      import_name: importName
    });
  }

  for (const record of readJsonlSafe(path.join(CACHE_DIR, "relations.calls_sql.jsonl"))) {
    if (!record || typeof record !== "object") continue;
    const from = String(record.from ?? "");
    const to = String(record.to ?? "");
    const note = String(record.note ?? "");
    if (!fileIdSet.has(from) || !chunkIdSet.has(to)) {
      continue;
    }
    callsSqlRelationMap.set(relationKey(from, to, note), {
      from,
      to,
      note
    });
  }

  return {
    chunkRecordMap,
    definesRelationMap,
    callsRelationMap,
    importsRelationMap,
    callsSqlRelationMap
  };
}

function normalizeRuleTokens(ruleRecord) {
  const idParts = ruleRecord.id.split(/[._-]+/g);
  const descriptionTokens = tokenizeKeywords(ruleRecord.body);
  const rawKeywords = [...idParts, ...descriptionTokens];
  const normalized = rawKeywords
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  return uniqueSorted(normalized).slice(0, RULE_KEYWORD_LIMIT);
}

function fileTokenSet(fileRecord) {
  const tokenSource = `${fileRecord.path}\n${fileRecord.content.slice(0, 12000)}`;
  return new Set(tokenizeKeywords(tokenSource));
}

function chunkIdFor(filePath, chunk) {
  const startLine = Number.isFinite(chunk.startLine) ? chunk.startLine : 0;
  const endLine = Number.isFinite(chunk.endLine) ? chunk.endLine : startLine;
  return `chunk:${filePath}:${chunk.name}:${startLine}-${endLine}`;
}

function generateChunkDescription(chunk) {
  const parts = [chunk.kind];
  if (chunk.exported) parts.push("exported");
  if (chunk.async) parts.push("async");
  parts.push(chunk.signature);

  if (typeof chunk.description === "string" && chunk.description.trim().length > 10) {
    parts.push(normalizeWhitespace(chunk.description).slice(0, 200));
  }

  // Extract leading JSDoc/comment from body
  // Match leading JSDoc (/** */), block (/* */) and line (//) comments
  const commentMatch = chunk.body.match(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)[\s\n]*)+/);
  if (commentMatch) {
    const cleaned = commentMatch[0]
      .replace(/\/\*\*|\*\/|\*|\/\//g, "")
      .replace(/\s+/g, " ").trim()
      .slice(0, 200);
    if (cleaned.length > 10) parts.push(cleaned);
  }

  return parts.join(". ") + ".";
}

function generateModuleSummary(dir, files, exportNames, repoRoot = REPO_ROOT) {
  // Check for README.md in directory
  const readmePath = path.join(repoRoot, dir, "README.md");
  if (fs.existsSync(readmePath)) {
    try {
      const content = fs.readFileSync(readmePath, "utf8");
      // Skip first heading line, take first 300 chars
      const lines = content.split(/\r?\n/);
      const startIdx = lines.findIndex(l => !l.startsWith("#") && l.trim().length > 0);
      if (startIdx >= 0) {
        const excerpt = lines.slice(startIdx).join(" ").trim().slice(0, 300);
        if (excerpt.length > 20) return excerpt;
      }
    } catch {
      // fall through to auto-generated summary
    }
  }

  const name = path.basename(dir);
  const codeFiles = files.filter(f => f.kind === "CODE");
  const docFiles = files.filter(f => f.kind !== "CODE");

  const parts = [`Module ${name}`];
  parts.push(`Contains ${files.length} files (${codeFiles.length} code, ${docFiles.length} docs)`);

  // Detect common file extension pattern
  const exts = new Set(codeFiles.map(f => path.extname(f.path).toLowerCase()));
  if (exts.size === 1) {
    const ext = [...exts][0];
    const extNames = { ".ts": "TypeScript", ".js": "JavaScript", ".mjs": "JavaScript (ESM)", ".tsx": "TypeScript React" };
    if (extNames[ext]) parts.push(`${extNames[ext]} source files`);
  }

  if (exportNames.length > 0) {
    parts.push(`Key exports: ${exportNames.slice(0, 5).join(", ")}`);
  }

  return parts.join(". ") + ".";
}

function generateModules(fileRecords, chunkRecords) {
  const dirFiles = new Map();
  const dirChunks = new Map();
  const fileById = new Map(fileRecords.map(f => [f.id, f]));

  for (const file of fileRecords) {
    const dir = path.dirname(file.path);
    if (!dirFiles.has(dir)) dirFiles.set(dir, []);
    dirFiles.get(dir).push(file);
  }

  for (const chunk of chunkRecords) {
    if (!chunk.exported || isWindowChunkId(chunk.id)) continue;
    const file = fileById.get(chunk.file_id);
    if (!file) continue;
    const dir = path.dirname(file.path);
    if (!dirChunks.has(dir)) dirChunks.set(dir, []);
    dirChunks.get(dir).push(chunk);
  }

  const modules = [];
  const containsRelations = [];
  const containsModuleRelations = [];
  const exportsRelations = [];

  const MIN_MODULE_FILES = 2;

  for (const [dir, files] of dirFiles) {
    if (files.length < MIN_MODULE_FILES) continue;

    const exports = dirChunks.get(dir) || [];
    const exportNames = [...new Set(exports.slice(0, 20).map(c => c.name))];
    const moduleId = `module:${dir}`;

    modules.push({
      id: moduleId,
      path: dir,
      name: path.basename(dir),
      summary: generateModuleSummary(dir, files, exportNames),
      file_count: files.length,
      exported_symbols: exportNames.join(", "),
      updated_at: files.reduce((latest, f) => f.updated_at > latest ? f.updated_at : latest, ""),
      source_of_truth: false,
      trust_level: 75,
      status: "active"
    });

    // CONTAINS: Module -> File
    for (const file of files) {
      containsRelations.push({ from: moduleId, to: file.id });
    }

    // EXPORTS: Module -> Chunk
    for (const chunk of exports) {
      exportsRelations.push({ from: moduleId, to: chunk.id });
    }
  }

  // CONTAINS_MODULE: parent Module -> child Module
  const moduleDirs = new Set(modules.map(m => m.path));
  for (const dir of moduleDirs) {
    const parent = path.dirname(dir);
    if (parent !== dir && moduleDirs.has(parent)) {
      containsModuleRelations.push({
        from: `module:${parent}`,
        to: `module:${dir}`
      });
    }
  }

  return { modules, containsRelations, containsModuleRelations, exportsRelations };
}

function isWindowChunkId(chunkId) {
  return typeof chunkId === "string" && chunkId.includes(":window:");
}

function splitChunkIntoWindows(chunkRecord, options) {
  const { windowLines, overlapLines, splitMinLines, maxWindows, chunkBody } = options;
  const sourceBody = typeof chunkBody === "string" ? chunkBody : chunkRecord.body;
  const lines = sourceBody.split(/\r?\n/);
  const totalLines = lines.length;
  if (totalLines < splitMinLines || totalLines <= windowLines) {
    return [];
  }

  const windows = [];
  const safeOverlap = Math.max(0, Math.min(overlapLines, windowLines - 1));
  let start = 0;
  let windowIndex = 1;

  while (start < totalLines && windows.length < maxWindows) {
    const isLastAllowedWindow = windows.length + 1 >= maxWindows;
    const end = isLastAllowedWindow ? totalLines : Math.min(totalLines, start + windowLines);
    const windowStartLine = chunkRecord.start_line + start;
    const windowEndLine = chunkRecord.start_line + Math.max(0, end - 1);
    const windowBody = lines.slice(start, end).join("\n");
    const persistedBody = isLastAllowedWindow ? windowBody : windowBody.slice(0, MAX_BODY_CHARS);
    windows.push({
      id: `${chunkRecord.id}:window:${windowIndex}:${windowStartLine}-${windowEndLine}`,
      file_id: chunkRecord.file_id,
      name: `${chunkRecord.name}#window${windowIndex}`,
      kind: chunkRecord.kind,
      signature: `${chunkRecord.signature} [window ${windowIndex}]`,
      body: persistedBody,
      description: chunkRecord.description || "",
      start_line: windowStartLine,
      end_line: windowEndLine,
      language: chunkRecord.language,
      exported: chunkRecord.exported || false,
      checksum: checksum(Buffer.from(windowBody)),
      updated_at: chunkRecord.updated_at,
      trust_level: chunkRecord.trust_level,
      status: chunkRecord.status,
      source_of_truth: chunkRecord.source_of_truth
    });

    if (end >= totalLines) {
      break;
    }

    start = end - safeOverlap;
    windowIndex += 1;
  }

  return windows;
}

export {
  generateProjects,
  removeChunkStateForFile,
  hydrateIncrementalChunkState,
  normalizeRuleTokens,
  fileTokenSet,
  chunkIdFor,
  generateChunkDescription,
  generateModuleSummary,
  generateModules,
  isWindowChunkId,
  splitChunkIntoWindows
};
