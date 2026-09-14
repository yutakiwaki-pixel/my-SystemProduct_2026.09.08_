import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/session";

export default async function AdminDashboardPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">管理画面</h1>
        <form action="/api/admin/logout" method="post">
          <button type="submit" className="text-sm text-neutral-500 underline">
            ログアウト
          </button>
        </form>
      </div>
      <p className="text-neutral-600">{admin.email} でログイン中です。</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/news" className="rounded border px-4 py-2 hover:bg-neutral-50">
          お知らせの投稿・一覧
        </Link>
        <Link href="/admin/contacts" className="rounded border px-4 py-2 hover:bg-neutral-50">
          問い合わせ一覧
        </Link>
      </div>
    </main>
  );
}
