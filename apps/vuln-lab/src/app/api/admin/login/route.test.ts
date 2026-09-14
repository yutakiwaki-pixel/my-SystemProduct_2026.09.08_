import { describe, expect, it } from "vitest";
import { POST } from "./route";

function loginRequest(email: string, password: string) {
  const form = new FormData();
  form.append("email", email);
  form.append("password", password);
  return new Request("http://localhost:3100/api/admin/login", { method: "POST", body: form });
}

describe("POST /api/admin/login", () => {
  it("does not let a SQL-injection payload bypass authentication (SQLi regression)", async () => {
    const response = await POST(loginRequest("' OR '1'='1' -- ", "anything"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/admin/login?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("logs the seeded admin in with the correct credentials", async () => {
    const response = await POST(loginRequest("admin@example.com", "admin123"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/admin");
    expect(response.headers.get("set-cookie")).toContain("admin_session=");
  });
});
