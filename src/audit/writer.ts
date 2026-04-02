import { appendFile, mkdir } from "node:fs/promises";
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
  private initialized = false;

  constructor(contextDir: string) {
    this.auditDir = join(contextDir, "audit");
  }

  log(entry: AuditEntry): void {
    const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    const filePath = join(this.auditDir, `${date}.jsonl`);
    const line = JSON.stringify(entry) + "\n";

    // Fire-and-forget async write — don't block the tool handler
    this.writeAsync(filePath, line).catch(() => {
      process.stderr.write("[cortex-enterprise] Failed to write audit entry\n");
    });
  }

  private async writeAsync(filePath: string, line: string): Promise<void> {
    if (!this.initialized) {
      await mkdir(this.auditDir, { recursive: true });
      this.initialized = true;
    }
    await appendFile(filePath, line);
  }
}
