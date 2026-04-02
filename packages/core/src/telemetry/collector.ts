import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type TelemetryMetrics = {
  period_start: string;
  period_end: string;
  searches: number;
  related_lookups: number;
  rule_lookups: number;
  reloads: number;
  total_results_returned: number;
  estimated_tokens_saved: number;
};

function emptyMetrics(): TelemetryMetrics {
  const now = new Date().toISOString();
  return {
    period_start: now,
    period_end: now,
    searches: 0,
    related_lookups: 0,
    rule_lookups: 0,
    reloads: 0,
    total_results_returned: 0,
    estimated_tokens_saved: 0,
  };
}

export class TelemetryCollector {
  private metrics: TelemetryMetrics;
  private readonly metricsPath: string;
  private dirty = false;

  constructor(contextDir: string) {
    const telemetryDir = join(contextDir, "telemetry");
    this.metricsPath = join(telemetryDir, "metrics.json");

    // Load existing metrics or start fresh
    try {
      const raw = readFileSync(this.metricsPath, "utf8");
      this.metrics = JSON.parse(raw);
    } catch {
      this.metrics = emptyMetrics();
    }
  }

  record(toolName: string, resultCount: number, tokensSaved: number): void {
    switch (toolName) {
      case "context.search":
        this.metrics.searches++;
        break;
      case "context.get_related":
        this.metrics.related_lookups++;
        break;
      case "context.get_rules":
        this.metrics.rule_lookups++;
        break;
      case "context.reload":
        this.metrics.reloads++;
        break;
    }

    this.metrics.total_results_returned += resultCount;
    this.metrics.estimated_tokens_saved += tokensSaved;
    this.metrics.period_end = new Date().toISOString();
    this.dirty = true;
  }

  getMetrics(): TelemetryMetrics {
    return { ...this.metrics };
  }

  flush(): void {
    if (!this.dirty) return;

    try {
      const dir = join(this.metricsPath, "..");
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
      this.dirty = false;
    } catch {
      process.stderr.write("[cortex-enterprise] Failed to flush telemetry metrics\n");
    }
  }

  reset(): void {
    this.metrics = emptyMetrics();
    this.dirty = true;
  }
}
