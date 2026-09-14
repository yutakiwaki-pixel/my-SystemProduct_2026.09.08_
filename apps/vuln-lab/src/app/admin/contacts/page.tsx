import { redirect } from "next/navigation";
import { type Contact, db, rows } from "@/lib/db";
import { nl2br } from "@/lib/format";
import { getCurrentAdmin } from "@/lib/session";

export default async function AdminContactsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const contacts = rows<Contact>(db.prepare("SELECT * FROM contacts ORDER BY id DESC").all());

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">お問い合わせ一覧</h1>
      {contacts.length === 0 && <p className="text-neutral-500">お問い合わせはまだありません。</p>}
      <ul className="flex flex-col gap-4">
        {contacts.map((contact) => (
          <li key={contact.id} className="rounded border border-neutral-200 p-4">
            <p className="text-xs text-neutral-400">
              {new Date(contact.created_at).toLocaleString("ja-JP")}
            </p>
            <p className="font-semibold">
              {contact.name} 様 &lt;{contact.email}&gt;
            </p>
            <div
              className="mt-2 whitespace-pre-line text-neutral-700"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: renders submitter-authored line breaks as-is (no output escaping)
              dangerouslySetInnerHTML={{ __html: nl2br(contact.message) }}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
