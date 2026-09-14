import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/session";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "");
    const body = String(form.get("body") ?? "");

    db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
      title,
      body,
      new Date().toISOString(),
    );

    return NextResponse.redirect(new URL("/admin/news", request.url), 303);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
