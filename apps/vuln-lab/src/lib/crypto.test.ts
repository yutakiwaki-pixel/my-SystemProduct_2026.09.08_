import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generateToken, hashPassword, verifyPassword } from "@/lib/crypto";

describe("hashPassword", () => {
  it("salts the hash: the same password produces a different stored value each time (weak-password-hashing regression)", () => {
    // The old implementation was `sha256(password)` with no salt, so every user who picked
    // the same plaintext password got byte-for-byte the same password_hash — enabling a
    // rainbow-table/precomputed-dictionary match straight off the DB. A salted KDF must never
    // produce the same output twice for the same input.
    expect(hashPassword("password123")).not.toBe(hashPassword("password123"));
  });

  it("is not a bare sha256 digest of the password (weak-password-hashing regression)", () => {
    // Direct regression for the finding: hashing the known seed password with plain SHA-256
    // (as the old hashPassword did) must no longer appear verbatim in stored output.
    const bareSha256 = createHash("sha256").update("password123").digest("hex");
    expect(hashPassword("password123")).not.toBe(bareSha256);
  });

  it("differs for different input", () => {
    expect(hashPassword("password123")).not.toBe(hashPassword("password124"));
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password against its own hash", () => {
    const stored = hashPassword("password123");
    expect(verifyPassword("password123", stored)).toBe(true);
  });

  it("rejects an incorrect password against a hash of a different password", () => {
    const stored = hashPassword("password123");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("verifies two independently-salted hashes of the same password (salt round-trips correctly)", () => {
    const a = hashPassword("password123");
    const b = hashPassword("password123");
    expect(a).not.toBe(b);
    expect(verifyPassword("password123", a)).toBe(true);
    expect(verifyPassword("password123", b)).toBe(true);
  });

  it("rejects a malformed/foreign stored value instead of throwing", () => {
    const bareSha256 = createHash("sha256").update("password123").digest("hex");
    expect(verifyPassword("password123", bareSha256)).toBe(false);
    expect(verifyPassword("password123", "not-a-hash")).toBe(false);
  });
});

describe("generateToken", () => {
  it("returns a non-empty string", () => {
    expect(generateToken().length).toBeGreaterThan(0);
  });

  it("returns different tokens across calls", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("does not encode the issuance time as a recomputable prefix (predictable-token regression)", () => {
    // The old implementation was `${Date.now().toString(36)}${Math.random()...}`: with
    // Date.now() pinned, two tokens issued "at the same time" shared their entire
    // timestamp-derived prefix, letting an attacker who knows roughly when a token was
    // issued recompute that part instead of guessing it.
    vi.spyOn(Date, "now").mockReturnValue(1732500000000);
    const a = generateToken();
    const b = generateToken();
    vi.restoreAllMocks();

    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
  });

  it("is high-entropy hex output, not a Math.random()-derived base36 string", () => {
    // A CSPRNG-backed token (crypto.randomBytes) is fixed-length hex; the old
    // Date.now()+Math.random() token was variable-length base36 and thus predictable/
    // lower-entropy than its visible length suggested.
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});
