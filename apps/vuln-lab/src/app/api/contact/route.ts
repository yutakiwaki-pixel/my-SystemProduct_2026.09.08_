import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const message = String(form.get("message") ?? "");

    db.prepare("INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, ?)").run(
      name,
      email,
      message,
      new Date().toISOString(),
    );

    return NextResponse.redirect(new URL("/contact?sent=1", request.url), 303);
  } catch (err) {
    // Surfaces the raw error to the client — handy while building, not so handy in
    // production. See apps/vuln-lab/CLAUDE.md.
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
