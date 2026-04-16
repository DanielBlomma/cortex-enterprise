import { statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { registerValidator, type ValidatorContext, type ValidatorResult } from "./engine.js";

// ── max-file-size ──

registerValidator({
  policyId: "max-file-size",
  async check(ctx: ValidatorContext, options: Record<string, unknown>): Promise<ValidatorResult> {
    const maxBytes = typeof options.max_bytes === "number" ? options.max_bytes : 500_000;
    const files = ctx.changedFiles ?? [];

    if (files.length === 0) {
      return { pass: true, severity: "info", message: "No changed files to check" };
    }

    const violations: string[] = [];
    for (const file of files) {
      const abs = join(ctx.projectRoot, file);
      try {
        const stat = statSync(abs);
        if (stat.size > maxBytes) {
          violations.push(`${file} (${formatBytes(stat.size)} > ${formatBytes(maxBytes)})`);
        }
      } catch {
        // File may have been deleted
      }
    }

    if (violations.length === 0) {
      return { pass: true, severity: "info", message: `All ${files.length} files within size limit (${formatBytes(maxBytes)})` };
    }

    return {
      pass: false,
      severity: "warning",
      message: `${violations.length} file${violations.length > 1 ? "s" : ""} exceed${violations.length === 1 ? "s" : ""} max size (${formatBytes(maxBytes)})`,
      detail: violations.join("\n"),
    };
  },
});

// ── require-test-coverage ──

registerValidator({
  policyId: "require-test-coverage",
  async check(ctx: ValidatorContext, options: Record<string, unknown>): Promise<ValidatorResult> {
    const threshold = typeof options.threshold === "number" ? options.threshold : 80;
    const coveragePath = typeof options.coverage_path === "string"
      ? options.coverage_path
      : "coverage/coverage-summary.json";

    const abs = join(ctx.projectRoot, coveragePath);
    if (!existsSync(abs)) {
      return {
        pass: false,
        severity: "warning",
        message: `Coverage report not found at ${coveragePath}`,
        detail: "Run your test suite with coverage enabled (e.g. npm test -- --coverage) and retry.",
      };
    }

    try {
      const raw = readFileSync(abs, "utf8");
      const report = JSON.parse(raw);
      const total = report?.total;
      if (!total) {
        return { pass: false, severity: "warning", message: "Coverage report missing 'total' key" };
      }

      // istanbul/nyc format: total.lines.pct, total.branches.pct, etc.
      const linePct = typeof total.lines?.pct === "number" ? total.lines.pct : null;
      const branchPct = typeof total.branches?.pct === "number" ? total.branches.pct : null;
      const overall = linePct ?? branchPct ?? null;

      if (overall === null) {
        return { pass: false, severity: "warning", message: "Could not parse coverage percentage from report" };
      }

      const pass = overall >= threshold;
      return {
        pass,
        severity: pass ? "info" : "error",
        message: pass
          ? `Coverage ${overall.toFixed(1)}% meets threshold (${threshold}%)`
          : `Coverage ${overall.toFixed(1)}% below threshold (${threshold}%)`,
        detail: [
          linePct !== null ? `Lines: ${linePct.toFixed(1)}%` : null,
          branchPct !== null ? `Branches: ${branchPct.toFixed(1)}%` : null,
        ].filter(Boolean).join(", "),
      };
    } catch {
      return { pass: false, severity: "warning", message: `Failed to parse coverage report at ${coveragePath}` };
    }
  },
});

// ── no-external-api-calls ──

registerValidator({
  policyId: "no-external-api-calls",
  async check(ctx: ValidatorContext, options: Record<string, unknown>): Promise<ValidatorResult> {
    const patterns = Array.isArray(options.patterns)
      ? options.patterns.filter((p): p is string => typeof p === "string")
      : ["fetch(", "axios.", "http.get", "http.post", "https.get", "https.request"];

    const files = ctx.changedFiles ?? [];
    if (files.length === 0) {
      return { pass: true, severity: "info", message: "No changed files to scan" };
    }

    const hits: string[] = [];
    for (const file of files) {
      const abs = join(ctx.projectRoot, file);
      try {
        const content = readFileSync(abs, "utf8");
        for (const pattern of patterns) {
          if (content.includes(pattern)) {
            hits.push(`${file}: ${pattern}`);
          }
        }
      } catch {
        // File may be deleted or binary
      }
    }

    if (hits.length === 0) {
      return { pass: true, severity: "info", message: `No external API call patterns found in ${files.length} changed files` };
    }

    return {
      pass: false,
      severity: "warning",
      message: `Found ${hits.length} external API call pattern${hits.length > 1 ? "s" : ""} in changed files`,
      detail: hits.slice(0, 20).join("\n") + (hits.length > 20 ? `\n... and ${hits.length - 20} more` : ""),
    };
  },
});

// ── require-code-review ──

registerValidator({
  policyId: "require-code-review",
  async check(ctx: ValidatorContext, _options: Record<string, unknown>): Promise<ValidatorResult> {
    // Check for a review-status file set by the /review command or CI
    const statusPath = join(ctx.contextDir, "review-status.json");
    if (!existsSync(statusPath)) {
      return {
        pass: false,
        severity: "warning",
        message: "No code review recorded for current changes",
        detail: "Run /review to perform a code review, or ensure your CI writes .context/review-status.json.",
      };
    }

    try {
      const raw = readFileSync(statusPath, "utf8");
      const status = JSON.parse(raw);
      const reviewed = status?.reviewed === true;
      const reviewer = typeof status?.reviewer === "string" ? status.reviewer : "unknown";
      const timestamp = typeof status?.timestamp === "string" ? status.timestamp : "unknown";

      return {
        pass: reviewed,
        severity: reviewed ? "info" : "warning",
        message: reviewed
          ? `Code review completed by ${reviewer} at ${timestamp}`
          : "Code review recorded but not approved",
        detail: reviewed ? undefined : JSON.stringify(status, null, 2),
      };
    } catch {
      return { pass: false, severity: "warning", message: "Failed to parse review-status.json" };
    }
  },
});

// ── helpers ──

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)}KB`;
  return `${bytes}B`;
}
