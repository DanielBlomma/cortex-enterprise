import { statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { registerValidator, type ValidatorContext, type ValidatorResult } from "./engine.js";
// Side-effect imports: register generic evaluators (type-based dispatch)
// alongside the name-based validators defined below.
import "./evaluators/regex.js";

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

// ── no-secrets-in-code ──

// `placeholderAware` patterns capture a user-provided value (password, API
// key, etc.) where a placeholder ("changeme", "<password>") is an acceptable
// match. Opaque token patterns (AWS keys, GitHub PATs, private keys) are
// shape-based — no placeholder filtering, since the shape itself is
// effectively never a placeholder.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp; placeholderAware: boolean }> = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/, placeholderAware: false },
  { name: "GitHub PAT", re: /\bghp_[A-Za-z0-9]{36}\b/, placeholderAware: false },
  { name: "GitHub OAuth", re: /\bgho_[A-Za-z0-9]{36}\b/, placeholderAware: false },
  { name: "GitHub refresh", re: /\bghr_[A-Za-z0-9]{36}\b/, placeholderAware: false },
  { name: "GitHub app", re: /\bghs_[A-Za-z0-9]{36}\b/, placeholderAware: false },
  { name: "Slack token", re: /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/, placeholderAware: false },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/, placeholderAware: false },
  { name: "Stripe key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/, placeholderAware: false },
  { name: "Bearer token", re: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}={0,2}\b/, placeholderAware: false },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, placeholderAware: false },
  { name: "Hardcoded password", re: /\b(?:password|passwd|pwd)\s*[=:]\s*["'][^"'\s<>{}]{4,}["']/i, placeholderAware: true },
  { name: "Hardcoded API key", re: /\b(?:api[-_]?key|apikey|secret|auth[-_]?token)\s*[=:]\s*["'][^"'\s<>{}]{8,}["']/i, placeholderAware: true },
  { name: "Connection string password", re: /\b(?:password|pwd)\s*=\s*[^;'"<>\s]{4,}(?:;|$)/i, placeholderAware: true },
];

// Heuristic placeholder values — matched as whole-token, not substring,
// so a real secret like "Sup3rSecret!" doesn't get filtered by the
// placeholder "secret". Compared case-insensitively after stripping
// surrounding quotes, braces, angle brackets, and whitespace.
const PLACEHOLDER_VALUES = new Set([
  "changeme", "change-me", "changethis", "todo",
  "password", "passwd", "pwd", "password123", "secret", "example",
  "your-password-here", "yourpasswordhere", "your-api-key", "yourapikey",
  "xxx", "xxxx", "xxxxxx", "redacted", "hidden",
]);

function extractSecretValue(match: string): string {
  // Strip a leading "name=" or "name:" prefix, surrounding quotes/braces/angles.
  const afterAssign = match.replace(/^[^=:]*[=:]\s*/, "");
  return afterAssign
    .trim()
    .replace(/^["'`<{]+|["'`>};]+$/g, "")
    .toLowerCase();
}

const TEXT_FILE_RES = /\.(?:json|ya?ml|toml|ini|env|config|xml|properties|tf|tfvars|sh|ps1|py|js|mjs|cjs|ts|tsx|jsx|cs|vb|java|go|rs|rb|php|sql|md|txt)$/i;
const BINARY_SNIFF_BYTES = 512;

registerValidator({
  policyId: "no-secrets-in-code",
  async check(ctx: ValidatorContext, options: Record<string, unknown>): Promise<ValidatorResult> {
    const files = ctx.changedFiles ?? [];
    if (files.length === 0) {
      return { pass: true, severity: "info", message: "No changed files to scan for secrets" };
    }

    const allowlist = Array.isArray(options.allowlist_paths)
      ? options.allowlist_paths.filter((p): p is string => typeof p === "string")
      : ["tests/", "test/", "__tests__/", "fixtures/", "mocks/", "docs/"];

    const maxBytes = typeof options.max_scan_bytes === "number" ? options.max_scan_bytes : 2_000_000;

    const hits: string[] = [];
    let scanned = 0;

    for (const file of files) {
      if (allowlist.some((p) => file.includes(p))) continue;
      if (!TEXT_FILE_RES.test(file) && !/(?:^|\/)\.env(?:\.|$)|(?:^|\/)appsettings/i.test(file)) continue;

      const abs = join(ctx.projectRoot, file);
      try {
        const stat = statSync(abs);
        if (stat.size > maxBytes) continue;

        const buf = readFileSync(abs);
        // Skip binaries: null byte in sniff region → binary.
        const sniff = buf.subarray(0, Math.min(buf.length, BINARY_SNIFF_BYTES));
        if (sniff.includes(0)) continue;

        const content = buf.toString("utf8");
        scanned += 1;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          for (const { name, re, placeholderAware } of SECRET_PATTERNS) {
            const match = line.match(re);
            if (!match) continue;
            if (placeholderAware) {
              const value = extractSecretValue(match[0]);
              if (PLACEHOLDER_VALUES.has(value)) continue;
            }
            hits.push(`${file}:${i + 1} — ${name}`);
          }
        }
      } catch {
        // Unreadable file — skip
      }
    }

    if (hits.length === 0) {
      return {
        pass: true,
        severity: "info",
        message: `No secret patterns detected in ${scanned} changed file${scanned === 1 ? "" : "s"}`,
      };
    }

    return {
      pass: false,
      severity: "error",
      message: `${hits.length} potential secret${hits.length === 1 ? "" : "s"} detected in changed files`,
      detail: hits.slice(0, 30).join("\n") + (hits.length > 30 ? `\n... and ${hits.length - 30} more` : ""),
    };
  },
});

// ── no-env-in-prompts ──

// Lines that both reference an env var AND contain prompt-like signals.
const ENV_ACCESS_RES: RegExp[] = [
  /\bprocess\.env\.[A-Z][A-Z0-9_]*/,
  /\bprocess\.env\[\s*['"][A-Z][A-Z0-9_]*['"]\s*\]/,
  /\bos\.environ\[\s*['"][A-Z][A-Z0-9_]*['"]\s*\]/,
  /\bos\.getenv\(\s*['"][A-Z][A-Z0-9_]*['"]/,
];

const PROMPT_CONTEXT_RES = /\b(?:prompt|system[_ -]?message|instructions?|role\s*[:=]\s*["'](?:system|user|assistant)["']|you\s+are\s+(?:a|an|the)\b|respond\s+with|answer\s+as|act\s+as)\b/i;

const PROMPT_VAR_NAMES_RES = /\b(?:prompt|system[_ -]?prompt|instructions?|messages?|content|completion[_ -]?input)\s*[:=]/i;

registerValidator({
  policyId: "no-env-in-prompts",
  async check(ctx: ValidatorContext, options: Record<string, unknown>): Promise<ValidatorResult> {
    const files = ctx.changedFiles ?? [];
    if (files.length === 0) {
      return { pass: true, severity: "info", message: "No changed files to scan" };
    }

    const allowlist = Array.isArray(options.allowlist_paths)
      ? options.allowlist_paths.filter((p): p is string => typeof p === "string")
      : ["tests/", "test/", "__tests__/", "fixtures/", "docs/"];

    const hits: string[] = [];
    let scanned = 0;

    for (const file of files) {
      if (allowlist.some((p) => file.includes(p))) continue;
      if (!/\.(?:ts|tsx|js|mjs|cjs|jsx|py)$/i.test(file)) continue;

      const abs = join(ctx.projectRoot, file);
      try {
        const content = readFileSync(abs, "utf8");
        scanned += 1;
        const lines = content.split("\n");

        // Track a small rolling window so env access and prompt signal can live
        // on adjacent lines (template literals spanning lines etc.).
        const WINDOW = 3;
        for (let i = 0; i < lines.length; i += 1) {
          const windowStart = Math.max(0, i - WINDOW);
          const windowEnd = Math.min(lines.length, i + WINDOW + 1);
          const window = lines.slice(windowStart, windowEnd).join("\n");

          const envMatch = ENV_ACCESS_RES.find((re) => re.test(lines[i]));
          if (!envMatch) continue;

          const looksLikePrompt = PROMPT_CONTEXT_RES.test(window) || PROMPT_VAR_NAMES_RES.test(window);
          if (!looksLikePrompt) continue;

          const envName = lines[i].match(envMatch)?.[0] ?? "env var";
          hits.push(`${file}:${i + 1} — ${envName.trim()} used in prompt context`);
        }
      } catch {
        // unreadable — skip
      }
    }

    if (hits.length === 0) {
      return {
        pass: true,
        severity: "info",
        message: `No env-in-prompt patterns detected in ${scanned} changed file${scanned === 1 ? "" : "s"}`,
      };
    }

    return {
      pass: false,
      severity: "error",
      message: `${hits.length} env-in-prompt violation${hits.length === 1 ? "" : "s"} detected`,
      detail: hits.slice(0, 20).join("\n") + (hits.length > 20 ? `\n... and ${hits.length - 20} more` : ""),
    };
  },
});

// ── helpers ──

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)}KB`;
  return `${bytes}B`;
}
