import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type AuditEntry = {
  timestamp: string;
  tool: string;
  input: Record<string, unknown>;
  result_count: number;
  entities_returned: string[];
  rules_applied: string[];
  duration_ms: number;
};

export class AuditWriter {
  private readonly auditDir: string;

  constructor(contextDir: string) {
    this.auditDir = join(contextDir, "audit");
    mkdirSync(this.auditDir, { recursive: true });
  }

  log(entry: AuditEntry): void {
    const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    const filePath = join(this.auditDir, `${date}.jsonl`);

    try {
      appendFileSync(filePath, JSON.stringify(entry) + "\n");
    } catch {
      process.stderr.write("[cortex-enterprise] Failed to write audit entry\n");
    }
  }
}
