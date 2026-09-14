import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFoundMock, redirectMock, getCurrentMemberMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirectMock: vi.fn(),
  getCurrentMemberMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getCurrentMember: getCurrentMemberMock,
}));

import { db } from "@/lib/db";
import ReservationDetailPage from "./page";

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

function insertReservation(memberId: number, menu: string) {
  const result = db
    .prepare(
      "INSERT INTO reservations (member_id, menu, party_size, reserved_at, note, created_at) VALUES (?, ?, 1, '2026-01-01', '', ?)",
    )
    .run(memberId, menu, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

describe("ReservationDetailPage", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("404s when the reservation belongs to a different member (IDOR regression)", async () => {
    const owner = insertMember();
    const attacker = insertMember();
    const reservationId = insertReservation(owner.id, "カット");
    getCurrentMemberMock.mockResolvedValue(attacker);

    await expect(
      ReservationDetailPage({ params: Promise.resolve({ id: String(reservationId) }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("renders the reservation when it belongs to the current member", async () => {
    const owner = insertMember();
    const reservationId = insertReservation(owner.id, "カット + カラー");
    getCurrentMemberMock.mockResolvedValue(owner);

    const ui = await ReservationDetailPage({
      params: Promise.resolve({ id: String(reservationId) }),
    });
    render(ui);

    expect(screen.getByText("カット + カラー")).toBeInTheDocument();
  });
});
