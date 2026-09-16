import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentMemberMock } = vi.hoisted(() => ({
  getCurrentMemberMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentMember: getCurrentMemberMock,
}));

import { db } from "@/lib/db";
import { POST } from "./route";

function insertMember() {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const result = db
    .prepare("INSERT INTO members (email, password_hash, name, created_at) VALUES (?, 'x', 'x', ?)")
    .run(email, new Date().toISOString());
  return {
    id: Number(result.lastInsertRowid),
    email,
    password_hash: "x",
    name: "x",
    created_at: "",
  };
}

function reservationForm() {
  const form = new FormData();
  form.append("menu", "CSRF-PoC");
  form.append("reservedAt", "2026-12-01T10:00");
  form.append("partySize", "1");
  form.append("note", "CSRF経由の予約");
  return form;
}

function countReservationsFor(memberId: number): number {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM reservations WHERE member_id = ?")
    .get(memberId) as { count: number };
  return result.count;
}

describe("POST /api/reservations", () => {
  beforeEach(() => {
    getCurrentMemberMock.mockReset();
  });

  it("rejects a cross-site form submission even with a valid session cookie (CSRF regression)", async () => {
    const member = insertMember();
    getCurrentMemberMock.mockResolvedValue(member);

    // Simulates the PoC: an authenticated member's session cookie is valid, but the request
    // is coming from a different origin (e.g. an attacker's file:// / cross-site page), as
    // reflected by the Origin header a browser attaches to the cross-site POST.
    const request = new Request("http://localhost:3100/api/reservations", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
      body: reservationForm(),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(countReservationsFor(member.id)).toBe(0);
  });

  it("rejects a request with neither an Origin nor a Referer header (fail closed)", async () => {
    const member = insertMember();
    getCurrentMemberMock.mockResolvedValue(member);

    const request = new Request("http://localhost:3100/api/reservations", {
      method: "POST",
      body: reservationForm(),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(countReservationsFor(member.id)).toBe(0);
  });

  it("accepts a normal same-site form submission", async () => {
    const member = insertMember();
    getCurrentMemberMock.mockResolvedValue(member);

    const request = new Request("http://localhost:3100/api/reservations", {
      method: "POST",
      headers: { origin: "http://localhost:3100" },
      body: reservationForm(),
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/mypage");
    expect(countReservationsFor(member.id)).toBe(1);
  });
});
