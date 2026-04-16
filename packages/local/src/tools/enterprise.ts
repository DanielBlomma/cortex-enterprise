import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnterpriseConfig } from "@danielblomma/cortex-core/config";
import type { TelemetryCollector } from "@danielblomma/cortex-core/telemetry/collector";
import type { AuditWriter } from "@danielblomma/cortex-core/audit/writer";
import type { PolicyStore } from "@danielblomma/cortex-core/policy/store";
import { enforceInjectionPolicy, buildViolationPayload } from "@danielblomma/cortex-core/policy/enforce";
import type { InjectionMatch } from "@danielblomma/cortex-core/policy/injection";
import { getLastPush } from "../telemetry/sync.js";
import { syncFromCloud, syncFromLocal, getLastSync } from "../policy/sync.js";
import { queueViolation } from "../violations/push.js";
import { queueReviewResult } from "../reviews/push.js";
import { queryAuditLog } from "@danielblomma/cortex-core/audit/query";
import { checkAccess, getAccessDeniedMessage, type Role } from "@danielblomma/cortex-core/rbac/check";
import { runValidators } from "@danielblomma/cortex-core/validators/engine";
import "@danielblomma/cortex-core/validators/builtins";

type ToolPayload = Record<string, unknown>;

const VALID_ROLES = new Set<Role>(["admin", "developer", "readonly"]);

function buildToolResult(data: ToolPayload) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function accessDenied(role: Role, action: string) {
  return buildToolResult({
    error: getAccessDeniedMessage(role, action),
    role,
    action,
  });
}

export function registerEnterpriseTools(
  server: McpServer,
  collector: TelemetryCollector,
  auditWriter: AuditWriter | null,
  config: EnterpriseConfig,
  contextDir: string,
  policyStore: PolicyStore,
  version: string,
): void {
  const roleCandidate = config.rbac.enabled ? config.rbac.default_role : "admin";
  const role: Role = VALID_ROLES.has(roleCandidate as Role)
    ? (roleCandidate as Role)
    : "readonly";
  if (!VALID_ROLES.has(roleCandidate as Role) && config.rbac.enabled) {
    process.stderr.write(`[cortex-enterprise] Invalid RBAC role '${roleCandidate}', falling back to 'readonly'\n`);
  }

  // ── telemetry.status ──
  server.registerTool(
    "telemetry.status",
    {
      description: "Return telemetry configuration and current aggregated metrics.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "telemetry.status")) {
        return accessDenied(role, "telemetry.status");
      }

      const metrics = collector.getMetrics();
      const lastPush = getLastPush();

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "telemetry.status",
        input: {},
        result_count: 1,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        enabled: config.telemetry.enabled,
        endpoint: config.telemetry.endpoint || null,
        interval_minutes: config.telemetry.interval_minutes,
        metrics,
        last_push: lastPush,
      });
    },
  );

  // ── audit.query ──
  server.registerTool(
    "audit.query",
    {
      description: "Search the enterprise audit log by date range, tool name, and limit.",
      inputSchema: z.object({
        from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        to: z.string().optional().describe("End date (YYYY-MM-DD)"),
        tool: z.string().optional().describe("Filter by tool name"),
        limit: z.number().int().positive().max(500).default(50),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "audit.query")) {
        return accessDenied(role, "audit.query");
      }

      const parsed = z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        tool: z.string().optional(),
        limit: z.number().int().positive().max(500).default(50),
      }).parse(input ?? {});

      const entries = queryAuditLog(contextDir, parsed);

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "audit.query",
        input: parsed as Record<string, unknown>,
        result_count: entries.length,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        count: entries.length,
        entries,
      });
    },
  );

  // ── policy.list ──
  server.registerTool(
    "policy.list",
    {
      description: "List all active policies (org + local merged). Org rules override local rules with same ID.",
      inputSchema: z.object({
        source: z.enum(["all", "org", "local"]).default("all").describe("Filter by policy source"),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "policy.list")) {
        return accessDenied(role, "policy.list");
      }

      const parsed = z.object({
        source: z.enum(["all", "org", "local"]).default("all"),
      }).parse(input ?? {});

      let policies = policyStore.getMergedPolicies();

      if (parsed.source !== "all") {
        policies = policies.filter(p => p.source === parsed.source);
      }

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "policy.list",
        input: parsed as Record<string, unknown>,
        result_count: policies.length,
        entities_returned: policies.map(p => p.id),
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult({
        count: policies.length,
        policies: policies.map(p => ({
          id: p.id,
          description: p.description,
          priority: p.priority,
          scope: p.scope,
          enforce: p.enforce,
          source: p.source,
        })),
      });
    },
  );

  // ── policy.sync ──
  server.registerTool(
    "policy.sync",
    {
      description: "Trigger manual policy sync. Connected: pulls from cloud API. Air-gapped: reloads local org-rules.yaml.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "policy.sync")) {
        return accessDenied(role, "policy.sync");
      }

      let result;
      if (config.policy.endpoint && config.policy.api_key) {
        result = await syncFromCloud(config.policy.endpoint, config.policy.api_key, policyStore);
      } else {
        result = syncFromLocal(policyStore);
      }

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "policy.sync",
        input: {},
        result_count: result.synced,
        entities_returned: [],
        rules_applied: [],
        duration_ms: 0,
      });

      return buildToolResult(result as unknown as ToolPayload);
    },
  );

  // ── enterprise.status ──
  server.registerTool(
    "enterprise.status",
    {
      description: "Return Cortex Enterprise overview: version, feature status, and policy health.",
      inputSchema: z.object({}),
    },
    async () => {
      if (config.rbac.enabled && !checkAccess(role, "enterprise.status")) {
        return accessDenied(role, "enterprise.status");
      }

      const lastSyncResult = getLastSync();
      const policies = policyStore.getMergedPolicies();

      return buildToolResult({
        edition: "enterprise",
        version,
        features: {
          telemetry: config.telemetry.enabled ? "active" : "disabled",
          policy_sync: config.policy.enabled ? "active" : "disabled",
          audit_log: config.audit.enabled ? "active" : "disabled",
          rbac: config.rbac.enabled ? `active (role: ${role})` : "disabled",
        },
        policies: {
          total: policies.length,
          org: policies.filter(p => p.source === "org").length,
          local: policies.filter(p => p.source === "local").length,
          last_sync: lastSyncResult,
        },
      });
    },
  );

  // ── security.scan ──
  server.registerTool(
    "security.scan",
    {
      description:
        "Scan text for prompt injection attempts. Returns a risk score and matched patterns. " +
        "Only active when the prompt-injection-defense policy is enforced.",
      inputSchema: z.object({
        text: z.string().min(1).max(50_000).describe("Text to scan for prompt injection"),
        file_path: z.string().max(500).optional().describe("Source file path (for violation reporting)"),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "policy.list")) {
        return accessDenied(role, "security.scan");
      }

      const parsed = z.object({
        text: z.string().min(1).max(50_000),
        file_path: z.string().max(500).optional(),
      }).parse(input ?? {});

      const policies = policyStore.getMergedPolicies();
      const result = enforceInjectionPolicy(parsed.text, policies, { sanitize: true });

      // Queue violation for push to cortex-web
      if (!result.allowed && result.scan.matches.length > 0) {
        const violation = buildViolationPayload(result.scan.matches, {
          filePath: parsed.file_path,
        });
        queueViolation(violation);
      }

      const rulesApplied = result.allowed ? [] : [result.ruleId];

      auditWriter?.log({
        timestamp: new Date().toISOString(),
        tool: "security.scan",
        input: { text_length: parsed.text.length, file_path: parsed.file_path },
        result_count: result.scan.matches.length,
        entities_returned: [],
        rules_applied: rulesApplied,
        duration_ms: 0,
      });

      return buildToolResult({
        flagged: result.scan.flagged,
        score: result.scan.score,
        allowed: result.allowed,
        policy_active: !result.allowed || result.scan.score > 0 ? true : policies.some(p => p.id === "prompt-injection-defense" && p.enforce),
        matches: result.scan.matches.map((m: InjectionMatch) => ({
          pattern: m.pattern,
          category: m.category,
          matched: m.matched,
          position: m.position,
          weight: m.weight,
        })),
        sanitized: result.sanitized ?? null,
      });
    },
  );

  // ── context.review ──
  server.registerTool(
    "context.review",
    {
      description:
        "Run enterprise policy validators against the current project. " +
        "Checks enforced policies (test coverage, file size, external API calls, code review) " +
        "and returns pass/fail results with actionable details.",
      inputSchema: z.object({
        scope: z.enum(["all", "changed"]).default("changed")
          .describe("'changed' validates only git-modified files; 'all' validates everything"),
        include_passed: z.boolean().default(true)
          .describe("Include passing validators in results"),
      }),
    },
    async (input) => {
      if (config.rbac.enabled && !checkAccess(role, "context.review")) {
        return accessDenied(role, "context.review");
      }

      const parsed = z.object({
        scope: z.enum(["all", "changed"]).default("changed"),
        include_passed: z.boolean().default(true),
      }).parse(input ?? {});

      const projectRoot = process.env.CORTEX_PROJECT_ROOT?.trim() || process.cwd();

      // Collect changed files via git
      let changedFiles: string[] | undefined;
      if (parsed.scope === "changed") {
        try {
          const { execSync } = await import("node:child_process");
          const output = execSync("git diff --name-only HEAD 2>/dev/null || git diff --name-only", {
            cwd: projectRoot,
            encoding: "utf8",
            timeout: 5000,
          });
          changedFiles = output.split("\n").map((f) => f.trim()).filter(Boolean);
        } catch {
          changedFiles = [];
        }
      }

      // Build set of enforced policy IDs
      const policies = policyStore.getMergedPolicies();
      const enforcedIds = new Set(
        policies.filter((p) => p.enforce).map((p) => p.id),
      );

      const output = await runValidators(enforcedIds, {
        contextDir,
        projectRoot,
        changedFiles,
      }, config.validators);

      // Filter out passed if requested
      const results = parsed.include_passed
        ? output.results
        : output.results.filter((r) => !r.pass);

      // Queue failures as violations
      const now = new Date().toISOString();
      for (const r of output.results) {
        if (!r.pass) {
          queueViolation({
            rule_id: r.policy_id,
            severity: r.severity,
            message: r.message.slice(0, 2000),
            metadata: r.detail ? JSON.stringify({ detail: r.detail }).slice(0, 5000) : undefined,
            occurred_at: now,
          });
        }
        queueReviewResult({
          policy_id: r.policy_id,
          pass: r.pass,
          severity: r.severity,
          message: r.message,
          detail: r.detail,
          reviewed_at: now,
        });
      }

      auditWriter?.log({
        timestamp: now,
        tool: "context.review",
        input: parsed as Record<string, unknown>,
        result_count: output.results.length,
        entities_returned: output.results.map((r) => r.policy_id),
        rules_applied: output.results.filter((r) => !r.pass).map((r) => r.policy_id),
        duration_ms: 0,
      });

      return buildToolResult({
        scope: parsed.scope,
        results,
        summary: output.summary,
      });
    },
  );
}
