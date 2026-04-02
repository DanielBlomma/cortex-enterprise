import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_KEY } from "./public-key.js";

export type LicenseInfo = {
  valid: boolean;
  customer: string;
  edition: string;
  issued: string;
  expires: string;
  max_repos: number;
  features: string[];
  daysUntilExpiry: number;
  error?: string;
  warning?: string;
};

const EMPTY_LICENSE: LicenseInfo = {
  valid: false,
  customer: "",
  edition: "",
  issued: "",
  expires: "",
  max_repos: 0,
  features: [],
  daysUntilExpiry: 0,
};

function parsePayload(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of payload.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

export function loadLicense(contextDir: string): LicenseInfo {
  const licPath = join(contextDir, "cortex.lic");

  let raw: string;
  try {
    raw = readFileSync(licPath, "utf8");
  } catch {
    return { ...EMPTY_LICENSE, error: "license file not found" };
  }

  const separatorIdx = raw.indexOf("\n---\n");
  if (separatorIdx === -1) {
    return { ...EMPTY_LICENSE, error: "invalid license format: missing --- separator" };
  }

  const payload = raw.slice(0, separatorIdx);
  const signatureBase64 = raw.slice(separatorIdx + 5).trim();

  if (!signatureBase64) {
    return { ...EMPTY_LICENSE, error: "invalid license format: missing signature" };
  }

  // Verify Ed25519 signature
  try {
    const publicKey = createPublicKey(PUBLIC_KEY);
    const signature = Buffer.from(signatureBase64, "base64");
    const isValid = verify(null, Buffer.from(payload), publicKey, signature);
    if (!isValid) {
      return { ...EMPTY_LICENSE, error: "invalid signature" };
    }
  } catch {
    return { ...EMPTY_LICENSE, error: "signature verification failed" };
  }

  // Parse fields
  const fields = parsePayload(payload);

  const customer = fields["customer"] ?? "";
  const edition = fields["edition"] ?? "";
  const issued = fields["issued"] ?? "";
  const expires = fields["expires"] ?? "";
  const maxRepos = parseInt(fields["max_repos"] ?? "0", 10);
  const features = (fields["features"] ?? "").split(",").map(f => f.trim()).filter(Boolean);

  if (!customer || !expires) {
    return { ...EMPTY_LICENSE, error: "license missing required fields (customer, expires)" };
  }

  // Check expiry
  const expiryDate = new Date(expires);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) {
    return {
      ...EMPTY_LICENSE,
      customer,
      edition,
      issued,
      expires,
      max_repos: maxRepos,
      features,
      daysUntilExpiry,
      error: "license expired",
    };
  }

  const warning = daysUntilExpiry <= 30
    ? `license expires in ${daysUntilExpiry} days`
    : undefined;

  return {
    valid: true,
    customer,
    edition,
    issued,
    expires,
    max_repos: maxRepos,
    features,
    daysUntilExpiry,
    warning,
  };
}
