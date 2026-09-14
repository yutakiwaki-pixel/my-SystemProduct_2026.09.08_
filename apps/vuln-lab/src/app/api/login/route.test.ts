import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { POST } from "./route";

function loginRequest(email: string, password: string) {
  const form = new FormData();
  form.append("email", email);
  form.append("password", password);
  return new Request("http://localhost:3100/api/login", { method: "POST", body: form });
}

describe("POST /api/login", () => {
  it("does not let a SQL-injection payload bypass authentication (SQLi regression)", async () => {
    const response = await POST(loginRequest("' OR '1'='1' -- ", "anything"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/login?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("logs the seeded member in with the correct credentials", async () => {
    const response = await POST(loginRequest("sato@example.com", "password123"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/mypage");
    expect(response.headers.get("set-cookie")).toContain("member_session=");
  });

  it("locks a member out after repeated failed attempts, even with the correct password afterwards (rate-limit regression)", async () => {
    const email = `ratelimit-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = "correct-horse-battery-staple";
    db.prepare(
      "INSERT INTO members (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
    ).run(email, hashPassword(password), "Rate Limit Test", new Date().toISOString());

    for (let i = 0; i < 5; i++) {
      await POST(loginRequest(email, "wrong-password"));
    }

    const response = await POST(loginRequest(email, password));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/login?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
