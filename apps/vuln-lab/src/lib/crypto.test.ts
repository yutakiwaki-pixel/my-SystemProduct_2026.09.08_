import { describe, expect, it, vi } from "vitest";
import { generateToken, hashPassword } from "@/lib/crypto";

describe("hashPassword", () => {
  it("is deterministic for the same input", () => {
    expect(hashPassword("password123")).toBe(hashPassword("password123"));
  });

  it("differs for different input", () => {
    expect(hashPassword("password123")).not.toBe(hashPassword("password124"));
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
