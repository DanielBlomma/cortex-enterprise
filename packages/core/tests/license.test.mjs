import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLicense } from "../dist/license/check.js";

function makeTempContext(licenseContent) {
  const dir = mkdtempSync(join(tmpdir(), "cortex-lic-"));
  if (licenseContent !== undefined) {
    writeFileSync(join(dir, "cortex.lic"), licenseContent);
  }
  return dir;
}

test("missing license file returns error", () => {
  const dir = makeTempContext();
  const lic = loadLicense(dir);
  assert.equal(lic.valid, false);
  assert.ok(lic.error);
  assert.match(lic.error, /not found|no license/i);
});

test("empty license file returns error", () => {
  const lic = loadLicense(makeTempContext(""));
  assert.equal(lic.valid, false);
  assert.ok(lic.error);
});

test("license without separator returns error", () => {
  const lic = loadLicense(makeTempContext("customer: Acme\nexpires: 2030-01-01"));
  assert.equal(lic.valid, false);
  assert.ok(lic.error);
});

test("license with separator but no signature returns error", () => {
  const lic = loadLicense(makeTempContext("customer: Acme\n---\n"));
  assert.equal(lic.valid, false);
  assert.ok(lic.error);
});

test("license with invalid signature returns error", () => {
  const payload = "customer: Acme Corp\nedition: connected\nexpires: 2030-12-31\nissued: 2024-01-01";
  const fakeSignature = Buffer.from("invalid-signature-data").toString("base64");
  const content = `${payload}\n---\n${fakeSignature}`;

  const lic = loadLicense(makeTempContext(content));
  assert.equal(lic.valid, false);
  assert.ok(lic.error);
});

test("license result has expected shape on failure", () => {
  const lic = loadLicense(makeTempContext());
  assert.equal(typeof lic.valid, "boolean");
  assert.equal(typeof lic.error, "string");
  assert.equal(lic.customer, "");
  assert.equal(lic.edition, "");
});
