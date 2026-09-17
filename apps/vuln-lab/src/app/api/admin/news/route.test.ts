import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdminMock } = vi.hoisted(() => ({
  getCurrentAdminMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentAdmin: getCurrentAdminMock,
}));

import { db } from "@/lib/db";
import { POST } from "./route";

function insertAdmin() {
  const email = `test-admin-${crypto.randomUUID()}@example.com`;
  const result = db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, 'x')").run(email);
  return {
    id: Number(result.lastInsertRowid),
    email,
    password_hash: "x",
  };
}

function newsForm(title: string) {
  const form = new FormData();
  form.append("title", title);
  form.append("body", "CSRF経由のお知らせ投稿");
  return form;
}

function countNewsByTitle(title: string): number {
  const result = db.prepare("SELECT COUNT(*) as count FROM news WHERE title = ?").get(title) as {
    count: number;
  };
  return result.count;
}

describe("POST /api/admin/news", () => {
  beforeEach(() => {
    getCurrentAdminMock.mockReset();
  });

  it("rejects a cross-site form submission even with a valid session cookie (CSRF regression)", async () => {
    const admin = insertAdmin();
    getCurrentAdminMock.mockResolvedValue(admin);
    const title = `csrf-test-${crypto.randomUUID()}`;

    // Simulates the PoC from docs/journal-drafts/010-csrf-admin-news-post.md: the admin's
    // session cookie is valid, but the request is coming from a different origin, as reflected
    // by the Origin header a browser attaches to the cross-site POST.
    const request = new Request("http://localhost:3100/api/admin/news", {
      method: "POST",
      headers: { origin: "http://evil.example.com" },
      body: newsForm(title),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(countNewsByTitle(title)).toBe(0);
  });

  it("rejects a request with neither an Origin nor a Referer header (fail closed)", async () => {
    const admin = insertAdmin();
    getCurrentAdminMock.mockResolvedValue(admin);
    const title = `csrf-test-${crypto.randomUUID()}`;

    const request = new Request("http://localhost:3100/api/admin/news", {
      method: "POST",
      body: newsForm(title),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(countNewsByTitle(title)).toBe(0);
  });

  it("accepts a normal same-site form submission", async () => {
    const admin = insertAdmin();
    getCurrentAdminMock.mockResolvedValue(admin);
    const title = `csrf-test-${crypto.randomUUID()}`;

    const request = new Request("http://localhost:3100/api/admin/news", {
      method: "POST",
      headers: { origin: "http://localhost:3100" },
      body: newsForm(title),
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/admin/news");
    expect(countNewsByTitle(title)).toBe(1);
  });
});
