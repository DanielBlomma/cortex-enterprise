import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Role, RBACConfig } from "./rbac/check.js";
import { parseValidatorsConfig, type ValidatorsConfig } from "./validators/config.js";

export type TelemetryConfig = {
  enabled: boolean;
  endpoint: string;
  api_key: string;
  interval_minutes: number;
};

export type AuditConfig = {
  enabled: boolean;
  retention_days: number;
};

export type PolicyConfig = {
  enabled: boolean;
  endpoint: string;
  api_key: string;
  sync_interval_minutes: number;
};

export type EnterpriseConfig = {
  telemetry: TelemetryConfig;
  audit: AuditConfig;
  policy: PolicyConfig;
  rbac: RBACConfig;
  validators: ValidatorsConfig;
};

const DEFAULTS: EnterpriseConfig = {
  telemetry: {
    enabled: false,
    endpoint: "",
    api_key: "",
    interval_minutes: 10,
  },
  audit: {
    enabled: true,
    retention_days: 90,
  },
  policy: {
    enabled: true,
    endpoint: "",
    api_key: "",
    sync_interval_minutes: 240,
  },
  rbac: {
    enabled: false,
    default_role: "developer",
  },
  validators: {},
};

const VALID_ROLES: Role[] = ["admin", "developer", "readonly"];

function isValidRole(value: string | undefined): value is Role {
  return VALID_ROLES.includes(value as Role);
}

function stripInlineComment(value: string): string {
  // Strip # comments that aren't inside quotes
  const singleMatch = value.match(/^'([^']*)'(\s*#.*)?$/);
  if (singleMatch) return singleMatch[1];
  const doubleMatch = value.match(/^"([^"]*)"(\s*#.*)?$/);
  if (doubleMatch) return doubleMatch[1];
  // Unquoted: strip from first # preceded by whitespace
  const commentIdx = value.search(/\s+#/);
  return commentIdx >= 0 ? value.slice(0, commentIdx).trimEnd() : value;
}

function parseSimpleYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  let section = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section header (indented key with colon, no value)
    const sectionMatch = trimmed.match(/^(\w+):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    // Key-value pair (possibly indented under a section)
    const kvMatch = trimmed.match(/^\s+(\w+):\s*(.+?)\s*$/);
    if (kvMatch && section) {
      result[`${section}.${kvMatch[1]}`] = stripInlineComment(kvMatch[2]);
      continue;
    }

    // Top-level key-value
    const topMatch = trimmed.match(/^(\w+):\s*(.+?)\s*$/);
    if (topMatch) {
      result[topMatch[1]] = stripInlineComment(topMatch[2]);
    }
  }
  return result;
}

export function loadEnterpriseConfig(contextDir: string): EnterpriseConfig {
  let raw: string;
  try {
    raw = readFileSync(join(contextDir, "enterprise.yml"), "utf8");
  } catch {
    try {
      raw = readFileSync(join(contextDir, "enterprise.yaml"), "utf8");
    } catch {
      return DEFAULTS;
    }
  }

  const fields = parseSimpleYaml(raw);

  return {
    telemetry: {
      endpoint: fields["telemetry.endpoint"] ?? DEFAULTS.telemetry.endpoint,
      api_key: fields["telemetry.api_key"] ?? DEFAULTS.telemetry.api_key,
      enabled: fields["telemetry.enabled"] !== undefined
        ? fields["telemetry.enabled"] === "true"
        : !!(fields["telemetry.endpoint"] && fields["telemetry.api_key"]),
      interval_minutes: parseInt(fields["telemetry.interval_minutes"] ?? "", 10) || DEFAULTS.telemetry.interval_minutes,
    },
    audit: {
      enabled: fields["audit.enabled"] !== "false",
      retention_days: parseInt(fields["audit.retention_days"] ?? "", 10) || DEFAULTS.audit.retention_days,
    },
    policy: {
      enabled: fields["policy.enabled"] !== "false",
      endpoint: fields["policy.endpoint"] ?? DEFAULTS.policy.endpoint,
      api_key: fields["policy.api_key"] ?? DEFAULTS.policy.api_key,
      sync_interval_minutes: parseInt(fields["policy.sync_interval_minutes"] ?? "", 10) || DEFAULTS.policy.sync_interval_minutes,
    },
    rbac: {
      enabled: fields["rbac.enabled"] === "true",
      default_role: isValidRole(fields["rbac.default_role"]) ? fields["rbac.default_role"] : DEFAULTS.rbac.default_role,
    },
    validators: parseValidatorsConfig(fields),
  };
}
