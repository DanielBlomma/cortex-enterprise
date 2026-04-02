import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AuditEntry } from "./writer.js";

export type AuditQuery = {
  from?: string;
  to?: string;
  tool?: string;
  limit?: number;
};

export function queryAuditLog(contextDir: string, query: AuditQuery): AuditEntry[] {
  const auditDir = join(contextDir, "audit");
  const limit = query.limit ?? 50;

  let files: string[];
  try {
    files = readdirSync(auditDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }

  // Filter files by date range
  if (query.from) {
    const fromFile = `${query.from}.jsonl`;
    files = files.filter(f => f >= fromFile);
  }
  if (query.to) {
    const toFile = `${query.to}.jsonl`;
    files = files.filter(f => f <= toFile);
  }

  const results: AuditEntry[] = [];

  // Read newest files first
  for (const file of files.reverse()) {
    if (results.length >= limit) break;

    try {
      const raw = readFileSync(join(auditDir, file), "utf8").trim();
      if (!raw) continue;

      const entries: AuditEntry[] = raw
        .split("\n")
        .map(line => {
          try { return JSON.parse(line); }
          catch { return null; }
        })
        .filter(Boolean)
        .reverse(); // newest first within file

      for (const entry of entries) {
        if (results.length >= limit) break;

        // Apply tool filter
        if (query.tool && entry.tool !== query.tool) continue;

        results.push(entry);
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
}
