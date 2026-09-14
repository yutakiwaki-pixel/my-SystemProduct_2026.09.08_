import { describe, expect, it } from "vitest";
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
});
