import { redirect } from "next/navigation";
import { db, type NewsPost, rows } from "@/lib/db";
import { nl2br } from "@/lib/format";
import { getCurrentAdmin } from "@/lib/session";

export default async function AdminNewsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const posts = rows<NewsPost>(db.prepare("SELECT * FROM news ORDER BY id DESC").all());

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">お知らせ管理</h1>

      <form action="/api/admin/news" method="post" className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">タイトル</span>
          <input name="title" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">本文</span>
          <textarea name="body" required rows={5} className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          投稿する
        </button>
      </form>

      <h2 className="text-lg font-semibold">投稿済みのお知らせ</h2>
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id} className="rounded border border-neutral-200 p-4">
            <p className="text-xs text-neutral-400">
              {new Date(post.created_at).toLocaleString("ja-JP")}
            </p>
            <h3 className="font-semibold">{post.title}</h3>
            <div
              className="mt-2 text-neutral-700"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: renders admin-authored line breaks as-is (no output escaping)
              dangerouslySetInnerHTML={{ __html: nl2br(post.body) }}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
