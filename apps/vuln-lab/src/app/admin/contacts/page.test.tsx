import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { redirectMock, getCurrentAdminMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  getCurrentAdminMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getCurrentAdmin: getCurrentAdminMock,
}));

import { db } from "@/lib/db";
import AdminContactsPage from "./page";

function insertContact(message: string) {
  const email = `test-${crypto.randomUUID()}@example.com`;
  db.prepare(
    "INSERT INTO contacts (name, email, message, created_at) VALUES ('テスト太郎', ?, ?, ?)",
  ).run(email, message, new Date().toISOString());
}

describe("AdminContactsPage", () => {
  it("escapes an onerror-based XSS payload in the message body (regression for stored XSS, journal 009)", async () => {
    getCurrentAdminMock.mockResolvedValue({ id: 1, email: "admin@example.com" });
    insertContact("<img src=x onerror=alert(document.cookie)>");

    const ui = await AdminContactsPage();
    const { container } = render(ui);

    // The raw payload must never end up in the DOM as a live element/attribute.
    expect(container.querySelector("img[onerror]")).toBeNull();
    // It should still be visible as inert, escaped text.
    expect(container.textContent).toContain("<img src=x onerror=alert(document.cookie)>");
  });

  it("still renders plain messages with line breaks turned into <br />", async () => {
    getCurrentAdminMock.mockResolvedValue({ id: 1, email: "admin@example.com" });
    insertContact("よろしくお願いします\nありがとうございます");

    const ui = await AdminContactsPage();
    const { container } = render(ui);

    expect(container.innerHTML).toContain("よろしくお願いします<br>ありがとうございます");
  });
});
