import type { OrgPolicy, PolicyStore } from "./store.js";

export type SyncResult = {
  success: boolean;
  synced: number;
  source: "cloud" | "local";
  timestamp: string;
  error?: string;
};

let lastSync: SyncResult | null = null;

export function getLastSync(): SyncResult | null {
  return lastSync;
}

/**
 * Pull org-wide policies from the Cortex Cloud API (connected edition).
 * The actual cloud API is built in Phase 4 — this sends a GET
 * and expects a JSON array of policy objects.
 */
export async function syncFromCloud(
  endpoint: string,
  apiKey: string,
  store: PolicyStore,
): Promise<SyncResult> {
  if (!endpoint || !apiKey) {
    const result: SyncResult = {
      success: false,
      synced: 0,
      source: "cloud",
      timestamp: new Date().toISOString(),
      error: "endpoint or api_key not configured",
    };
    lastSync = result;
    return result;
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const result: SyncResult = {
        success: false,
        synced: 0,
        source: "cloud",
        timestamp: new Date().toISOString(),
        error: `HTTP ${response.status}`,
      };
      lastSync = result;
      return result;
    }

    const data = await response.json() as { rules?: Array<Omit<OrgPolicy, "source">> };
    const policies: OrgPolicy[] = (data.rules ?? []).map(r => ({ ...r, source: "org" as const }));

    store.writeOrgPolicies(policies);

    const result: SyncResult = {
      success: true,
      synced: policies.length,
      source: "cloud",
      timestamp: new Date().toISOString(),
    };
    lastSync = result;
    return result;
  } catch (err) {
    const result: SyncResult = {
      success: false,
      synced: 0,
      source: "cloud",
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : "unknown error",
    };
    lastSync = result;
    return result;
  }
}

/**
 * For air-gapped: just reload from local org-rules.yaml file.
 * Returns the count of policies found.
 */
export function syncFromLocal(store: PolicyStore): SyncResult {
  const policies = store.loadOrgPolicies();
  const result: SyncResult = {
    success: true,
    synced: policies.length,
    source: "local",
    timestamp: new Date().toISOString(),
  };
  lastSync = result;
  return result;
}
