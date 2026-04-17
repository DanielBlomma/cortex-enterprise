export type ValidatorContext = {
  contextDir: string;
  projectRoot: string;
  changedFiles?: string[];
};

export type ValidatorResult = {
  pass: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

export type ValidatorDef = {
  policyId: string;
  check: (ctx: ValidatorContext, options: Record<string, unknown>) => Promise<ValidatorResult>;
};

const registry = new Map<string, ValidatorDef>();

export function registerValidator(def: ValidatorDef): void {
  registry.set(def.policyId, def);
}

export function getValidator(policyId: string): ValidatorDef | undefined {
  return registry.get(policyId);
}

export function getRegisteredPolicyIds(): string[] {
  return [...registry.keys()];
}

export type ReviewResult = {
  policy_id: string;
  pass: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

export type ReviewSummary = {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
};

export type ReviewOutput = {
  results: ReviewResult[];
  summary: ReviewSummary;
};

/**
 * Run all validators whose policyId appears in the given set of enforced policy IDs.
 */
export async function runValidators(
  enforcedPolicyIds: Set<string>,
  ctx: ValidatorContext,
  validatorConfigs: Record<string, Record<string, unknown>>,
): Promise<ReviewOutput> {
  const results: ReviewResult[] = [];

  for (const [policyId, def] of registry) {
    if (!enforcedPolicyIds.has(policyId)) continue;

    const options = validatorConfigs[policyId] ?? {};
    try {
      const result = await def.check(ctx, options);
      results.push({
        policy_id: policyId,
        pass: result.pass,
        severity: result.severity,
        message: result.message,
        detail: result.detail,
      });
    } catch (err) {
      results.push({
        policy_id: policyId,
        pass: false,
        severity: "error",
        message: `Validator error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const summary: ReviewSummary = {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass && r.severity === "error").length,
    warnings: results.filter((r) => !r.pass && r.severity === "warning").length,
  };

  return { results, summary };
}
