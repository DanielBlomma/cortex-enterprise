export type Role = "admin" | "developer" | "readonly";

export type RBACConfig = {
  enabled: boolean;
  default_role: Role;
};

const PERMISSIONS: Record<string, Role[]> = {
  // Admin-only actions
  "policy.write":          ["admin"],
  "policy.sync":           ["admin"],
  "telemetry.configure":   ["admin"],
  "license.manage":        ["admin"],

  // Admin + developer
  "audit.query":           ["admin", "developer"],
  "policy.list":           ["admin", "developer"],
  "telemetry.status":      ["admin", "developer"],

  // All roles
  "enterprise.status":     ["admin", "developer", "readonly"],
  "license.status":        ["admin", "developer", "readonly"],
};

export function checkAccess(role: Role, action: string): boolean {
  const allowed = PERMISSIONS[action];
  if (!allowed) return true; // unknown actions allowed by default
  return allowed.includes(role);
}

export function getAccessDeniedMessage(role: Role, action: string): string {
  return `Access denied: role '${role}' cannot perform '${action}'`;
}
