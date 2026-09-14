import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  try {
    const form = await request.formData();
    const menu = String(form.get("menu") ?? "");
    const reservedAt = String(form.get("reservedAt") ?? "");
    const partySize = Number(form.get("partySize") ?? 1);
    const note = String(form.get("note") ?? "");

    db.prepare(
      "INSERT INTO reservations (member_id, menu, party_size, reserved_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(member.id, menu, partySize, reservedAt, note, new Date().toISOString());

    return NextResponse.redirect(new URL("/mypage", request.url), 303);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
