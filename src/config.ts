import { readFileSync } from "node:fs";
import { join } from "node:path";

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

export type EnterpriseConfig = {
  telemetry: TelemetryConfig;
  audit: AuditConfig;
};

const DEFAULTS: EnterpriseConfig = {
  telemetry: {
    enabled: false,
    endpoint: "",
    api_key: "",
    interval_minutes: 60,
  },
  audit: {
    enabled: true,
    retention_days: 90,
  },
};

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
      result[`${section}.${kvMatch[1]}`] = kvMatch[2];
      continue;
    }

    // Top-level key-value
    const topMatch = trimmed.match(/^(\w+):\s*(.+?)\s*$/);
    if (topMatch) {
      result[topMatch[1]] = topMatch[2];
    }
  }
  return result;
}

export function loadEnterpriseConfig(contextDir: string): EnterpriseConfig {
  const configPath = join(contextDir, "enterprise.yaml");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return DEFAULTS;
  }

  const fields = parseSimpleYaml(raw);

  return {
    telemetry: {
      enabled: fields["telemetry.enabled"] === "true",
      endpoint: fields["telemetry.endpoint"] ?? DEFAULTS.telemetry.endpoint,
      api_key: fields["telemetry.api_key"] ?? DEFAULTS.telemetry.api_key,
      interval_minutes: parseInt(fields["telemetry.interval_minutes"] ?? "", 10) || DEFAULTS.telemetry.interval_minutes,
    },
    audit: {
      enabled: fields["audit.enabled"] !== "false",
      retention_days: parseInt(fields["audit.retention_days"] ?? "", 10) || DEFAULTS.audit.retention_days,
    },
  };
}
