import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

import {
  SKIP_DIRECTORIES,
  REPO_ROOT,
  IMPORT_RESOLUTION_EXTENSIONS,
  IMPORT_RUNTIME_JS_EXTENSIONS,
  IMPORT_RUNTIME_JS_RESOLUTION_EXTENSIONS,
  CPP_IMPORT_RESOLUTION_EXTENSIONS,
  LEGACY_DOTNET_METADATA_EXTENSIONS,
  CODE_FILE_EXTENSIONS,
  CHUNK_PARSERS
} from "./constants.mjs";

import { toPosixPath, normalizeToken } from "./utils.mjs";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walkDirectory(directoryPath, files) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(absolutePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.add(absolutePath);
    }
  }
}

function hasSourcePrefix(relPath, sourcePaths) {
  return sourcePaths.some((sourcePath) => {
    const source = toPosixPath(sourcePath).replace(/\/+$/, "");
    return relPath === source || relPath.startsWith(`${source}/`);
  });
}

function pushImportResolutionCandidate(candidates, seenCandidates, candidatePath) {
  if (!seenCandidates.has(candidatePath)) {
    seenCandidates.add(candidatePath);
    candidates.push(candidatePath);
  }
}

function isCppLikeFilePath(filePath) {
  return [".c", ".h", ".cc", ".cpp", ".hh", ".hpp"].includes(path.posix.extname(filePath).toLowerCase());
}

function resolveRelativeImportTargetId(filePath, importPath, indexedFileIds) {
  const isCppLike = isCppLikeFilePath(filePath);
  const isRelativeImport = importPath.startsWith(".");
  const isLocalCppInclude =
    isCppLike && !path.posix.isAbsolute(importPath) && !/^[A-Za-z]:[\\/]/.test(importPath);

  if (!isRelativeImport && !isLocalCppInclude) {
    return null;
  }

  const basePath = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), importPath));
  const candidates = [];
  const seenCandidates = new Set();
  pushImportResolutionCandidate(candidates, seenCandidates, basePath);

  if (path.posix.extname(basePath) === "") {
    const extensions = isCppLike ? CPP_IMPORT_RESOLUTION_EXTENSIONS : IMPORT_RESOLUTION_EXTENSIONS;
    for (const extension of extensions) {
      pushImportResolutionCandidate(candidates, seenCandidates, `${basePath}${extension}`);
    }
    if (!isCppLike) {
      for (const extension of IMPORT_RESOLUTION_EXTENSIONS) {
        pushImportResolutionCandidate(candidates, seenCandidates, path.posix.join(basePath, `index${extension}`));
      }
    }
  } else if (IMPORT_RUNTIME_JS_EXTENSIONS.has(path.posix.extname(basePath))) {
    const extension = path.posix.extname(basePath);
    const stemPath = basePath.slice(0, -extension.length);
    for (const candidateExtension of IMPORT_RUNTIME_JS_RESOLUTION_EXTENSIONS) {
      pushImportResolutionCandidate(candidates, seenCandidates, `${stemPath}${candidateExtension}`);
    }
  }

  for (const candidate of candidates) {
    const targetFileId = `file:${candidate}`;
    if (indexedFileIds.has(targetFileId)) {
      return targetFileId;
    }
  }

  return null;
}

function getGitChanges() {
  try {
    const output = execSync("git status --porcelain", {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });

    const changed = new Set();
    const deleted = new Set();

    for (const line of output.split(/\r?\n/)) {
      if (!line) continue;
      const status = line.slice(0, 2);
      const payload = line.slice(3).trim();
      if (!payload) continue;

      if (payload.includes(" -> ")) {
        const [fromPath, toPath] = payload.split(" -> ");
        deleted.add(path.resolve(REPO_ROOT, fromPath));
        changed.add(path.resolve(REPO_ROOT, toPath));
        continue;
      }

      const absolutePath = path.resolve(REPO_ROOT, payload);
      if (status.includes("D")) {
        deleted.add(absolutePath);
      } else {
        changed.add(absolutePath);
      }
    }

    return {
      changed: [...changed],
      deleted: [...deleted]
    };
  } catch {
    return {
      changed: [],
      deleted: []
    };
  }
}

function collectCandidateFiles(sourcePaths, mode) {
  const candidates = new Set();
  const deletedRelPaths = new Set();

  if (mode === "changed") {
    const gitChanges = getGitChanges();
    if (gitChanges.changed.length > 0 || gitChanges.deleted.length > 0) {
      for (const absolutePath of gitChanges.changed) {
        if (!fs.existsSync(absolutePath)) {
          continue;
        }

        const stats = fs.statSync(absolutePath);
        if (stats.isFile()) {
          const relPath = toPosixPath(path.relative(REPO_ROOT, absolutePath));
          if (hasSourcePrefix(relPath, sourcePaths)) {
            candidates.add(absolutePath);
          }
          continue;
        }

        if (stats.isDirectory()) {
          const nestedFiles = new Set();
          walkDirectory(absolutePath, nestedFiles);
          for (const nestedPath of nestedFiles) {
            const nestedRelPath = toPosixPath(path.relative(REPO_ROOT, nestedPath));
            if (hasSourcePrefix(nestedRelPath, sourcePaths)) {
              candidates.add(nestedPath);
            }
          }
        }
      }

      for (const deletedPath of gitChanges.deleted) {
        const relPath = toPosixPath(path.relative(REPO_ROOT, deletedPath));
        if (hasSourcePrefix(relPath, sourcePaths)) {
          deletedRelPaths.add(relPath);
        }
      }

      return {
        candidates,
        incrementalMode: true,
        deletedRelPaths: [...deletedRelPaths]
      };
    }
  }

  for (const sourcePath of sourcePaths) {
    const absoluteSourcePath = path.resolve(REPO_ROOT, sourcePath);
    if (!fs.existsSync(absoluteSourcePath)) {
      continue;
    }

    const stats = fs.statSync(absoluteSourcePath);
    if (stats.isFile()) {
      candidates.add(absoluteSourcePath);
      continue;
    }

    if (stats.isDirectory()) {
      walkDirectory(absoluteSourcePath, candidates);
    }
  }

  return {
    candidates,
    incrementalMode: false,
    deletedRelPaths: []
  };
}

// ---------------------------------------------------------------------------
// Classification and IO
// ---------------------------------------------------------------------------

function detectKind(relPath) {
  const lower = relPath.toLowerCase();
  const ext = path.extname(lower);
  const isAdrPath =
    /(^|\/)(adr|adrs|decisions)(\/|$)/.test(lower) ||
    /(^|\/)adr[-_ ]?\d+/.test(path.basename(lower));

  if (isAdrPath) {
    return "ADR";
  }

  if (
    lower.startsWith("docs/") ||
    ext === ".md" ||
    ext === ".mdx" ||
    ext === ".txt" ||
    ext === ".adoc" ||
    ext === ".rst"
  ) {
    return "DOC";
  }

  if (LEGACY_DOTNET_METADATA_EXTENSIONS.has(ext) || !CODE_FILE_EXTENSIONS.has(ext)) {
    return "DOC";
  }

  return "CODE";
}

function getChunkParserForExtension(ext) {
  return CHUNK_PARSERS.get(ext) ?? null;
}

function trustLevelForKind(kind) {
  if (kind === "ADR") return 95;
  if (kind === "CODE") return 80;
  return 70;
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractTitle(content, fallbackTitle) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)\s*$/);
    if (match) return match[1].trim();
  }

  return fallbackTitle;
}

function parseDecisionDate(content, fallbackDate) {
  const datePatterns = [
    /^\s*date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/im,
    /^\s*decision[_\s-]*date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/im
  ];

  for (const pattern of datePatterns) {
    const match = content.match(pattern);
    if (match && !Number.isNaN(Date.parse(match[1]))) {
      return match[1];
    }
  }

  return fallbackDate.slice(0, 10);
}

function adrTokens(adrRecord) {
  const fileBase = path.basename(adrRecord.path).replace(path.extname(adrRecord.path), "");
  const tokens = new Set([
    normalizeToken(adrRecord.id),
    normalizeToken(fileBase),
    normalizeToken(adrRecord.title)
  ]);

  const numberMatch = fileBase.match(/(\d+)/);
  if (numberMatch) {
    tokens.add(normalizeToken(`adr-${numberMatch[1]}`));
    tokens.add(normalizeToken(numberMatch[1]));
  }

  return [...tokens].filter(Boolean);
}

function findSupersedesReferences(content) {
  const refs = new Set();
  const pattern = /(?:supersedes|ersätter)\s*[:\-]?\s*([A-Za-z0-9._/-]+)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    refs.add(match[1]);
  }

  return [...refs];
}

function writeJsonl(filePath, records) {
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
}

function sanitizeTsvCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, headers, rows) {
  const lines = [headers.join("\t")];
  for (const row of rows) {
    lines.push(row.map((value) => sanitizeTsvCell(value)).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function readJsonlSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((record) => record !== null);
}

function relationKey(...parts) {
  return parts.map((part) => String(part ?? "")).join("|");
}

function uniqueRelations(relations) {
  const deduped = new Map();
  for (const relation of relations) {
    const key = relationKey(relation.from, relation.to, relation.note);
    if (!deduped.has(key)) {
      deduped.set(key, relation);
    }
  }
  return [...deduped.values()].sort((a, b) =>
    relationKey(a.from, a.to, a.note).localeCompare(relationKey(b.from, b.to, b.note))
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // File discovery
  walkDirectory,
  hasSourcePrefix,
  pushImportResolutionCandidate,
  isCppLikeFilePath,
  resolveRelativeImportTargetId,
  getGitChanges,
  collectCandidateFiles,

  // Classification and IO
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
  sanitizeTsvCell,
  writeTsv,
  readJsonlSafe,
  relationKey,
  uniqueRelations
};
