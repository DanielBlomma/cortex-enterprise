import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type OrgPolicy = {
  id: string;
  description: string;
  priority: number;
  scope: string;
  enforce: boolean;
  source: "org" | "local";
};

/**
 * Parse the simple YAML rules format used by Cortex:
 *
 * rules:
 *   - id: rule.foo
 *     description: "..."
 *     priority: 100
 *     enforce: true
 */
function parseRulesYaml(text: string, source: "org" | "local"): OrgPolicy[] {
  const policies: OrgPolicy[] = [];
  let current: Partial<OrgPolicy> | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // New rule entry
    if (trimmed.startsWith("- id:")) {
      if (current?.id) {
        policies.push(finalize(current, source));
      }
      current = { id: trimmed.slice(5).trim() };
      continue;
    }

    if (!current) continue;

    if (trimmed.startsWith("description:")) {
      current.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("priority:")) {
      current.priority = parseInt(trimmed.slice(9).trim(), 10) || 50;
    } else if (trimmed.startsWith("scope:")) {
      current.scope = trimmed.slice(6).trim();
    } else if (trimmed.startsWith("enforce:")) {
      current.enforce = trimmed.slice(8).trim() === "true";
    }
  }

  if (current?.id) {
    policies.push(finalize(current, source));
  }

  return policies;
}

function finalize(partial: Partial<OrgPolicy>, source: "org" | "local"): OrgPolicy {
  return {
    id: partial.id ?? "",
    description: partial.description ?? "",
    priority: partial.priority ?? 50,
    scope: partial.scope ?? "global",
    enforce: partial.enforce ?? true,
    source,
  };
}

function policiesToYaml(policies: OrgPolicy[]): string {
  const lines = ["rules:"];
  for (const p of policies) {
    lines.push(`  - id: ${p.id}`);
    lines.push(`    description: "${p.description}"`);
    lines.push(`    priority: ${p.priority}`);
    lines.push(`    scope: ${p.scope}`);
    lines.push(`    enforce: ${p.enforce}`);
    lines.push("");
  }
  return lines.join("\n");
}

export class PolicyStore {
  private readonly contextDir: string;
  private readonly orgRulesPath: string;
  private readonly localRulesPath: string;

  constructor(contextDir: string) {
    this.contextDir = contextDir;
    this.orgRulesPath = join(contextDir, "policies", "org-rules.yaml");
    this.localRulesPath = join(contextDir, "rules.yaml");
  }

  loadOrgPolicies(): OrgPolicy[] {
    try {
      const raw = readFileSync(this.orgRulesPath, "utf8");
      return parseRulesYaml(raw, "org");
    } catch {
      return [];
    }
  }

  loadLocalPolicies(): OrgPolicy[] {
    try {
      const raw = readFileSync(this.localRulesPath, "utf8");
      return parseRulesYaml(raw, "local");
    } catch {
      return [];
    }
  }

  /**
   * Merge org + local policies. Org rules override local rules with same ID.
   * Result is sorted by priority (highest first).
   */
  getMergedPolicies(): OrgPolicy[] {
    const orgPolicies = this.loadOrgPolicies();
    const localPolicies = this.loadLocalPolicies();

    const merged = new Map<string, OrgPolicy>();

    // Local first
    for (const p of localPolicies) {
      merged.set(p.id, p);
    }

    // Org overrides
    for (const p of orgPolicies) {
      merged.set(p.id, p);
    }

    return [...merged.values()].sort((a, b) => b.priority - a.priority);
  }

  writeOrgPolicies(policies: OrgPolicy[]): void {
    const dir = join(this.contextDir, "policies");
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.orgRulesPath, policiesToYaml(policies));
  }
}
