import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type TelemetryMetrics = {
  period_start: string;
  period_end: string;
  searches: number;
  related_lookups: number;
  caller_lookups: number;
  trace_lookups: number;
  impact_analyses: number;
  rule_lookups: number;
  reloads: number;
  total_results_returned: number;
  estimated_tokens_saved: number;
  estimated_tokens_total: number;
  client_version: string;
};

const AVG_TOKENS_PER_RESULT = 400;

function emptyMetrics(clientVersion: string): TelemetryMetrics {
  const now = new Date().toISOString();
  return {
    period_start: now,
    period_end: now,
    searches: 0,
    related_lookups: 0,
    caller_lookups: 0,
    trace_lookups: 0,
    impact_analyses: 0,
    rule_lookups: 0,
    reloads: 0,
    total_results_returned: 0,
    estimated_tokens_saved: 0,
    estimated_tokens_total: 0,
    client_version: clientVersion,
  };
}

export class TelemetryCollector {
  private metrics: TelemetryMetrics;
  private readonly metricsPath: string;
  private readonly clientVersion: string;
  private dirty = false;

  constructor(contextDir: string, clientVersion = "unknown") {
    this.clientVersion = clientVersion;
    const telemetryDir = join(contextDir, "telemetry");
    this.metricsPath = join(telemetryDir, "metrics.json");

    // Load existing metrics or start fresh
    try {
      const raw = readFileSync(this.metricsPath, "utf8");
      this.metrics = JSON.parse(raw);
      // Ensure client_version is current
      this.metrics.client_version = clientVersion;
    } catch {
      this.metrics = emptyMetrics(clientVersion);
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
      case "context.find_callers":
        this.metrics.caller_lookups++;
        break;
      case "context.trace_calls":
        this.metrics.trace_lookups++;
        break;
      case "context.impact_analysis":
        this.metrics.impact_analyses++;
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
    this.metrics.estimated_tokens_total += tokensSaved + resultCount * AVG_TOKENS_PER_RESULT;
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
    this.metrics = emptyMetrics(this.clientVersion);
    this.dirty = true;
  }
}
