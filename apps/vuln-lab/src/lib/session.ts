import { cookies } from "next/headers";
import type { Admin, Member } from "@/lib/db";
import { db, row } from "@/lib/db";

export const MEMBER_COOKIE = "member_session";
export const ADMIN_COOKIE = "admin_session";

export async function getCurrentMember(): Promise<Member | null> {
  const store = await cookies();
  const token = store.get(MEMBER_COOKIE)?.value;
  if (!token) return null;

  const session = row<{ member_id: number }>(
    db.prepare("SELECT member_id FROM member_sessions WHERE token = ?").get(token),
  );
  if (!session) return null;

  const member = row<Member>(
    db.prepare("SELECT * FROM members WHERE id = ?").get(session.member_id),
  );
  return member ?? null;
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const session = row<{ admin_id: number }>(
    db.prepare("SELECT admin_id FROM admin_sessions WHERE token = ?").get(token),
  );
  if (!session) return null;

  const admin = row<Admin>(db.prepare("SELECT * FROM admins WHERE id = ?").get(session.admin_id));
  return admin ?? null;
}
