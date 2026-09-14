import { db, type NewsPost, rows } from "@/lib/db";
import { nl2brSafe } from "@/lib/format";

export default function NewsPage() {
  const posts = rows<NewsPost>(db.prepare("SELECT * FROM news ORDER BY id DESC").all());

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">お知らせ</h1>
      {posts.length === 0 && <p className="text-neutral-500">お知らせはまだありません。</p>}
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id} className="rounded border border-neutral-200 p-4">
            <p className="text-xs text-neutral-400">
              {new Date(post.created_at).toLocaleDateString("ja-JP")}
            </p>
            <h2 className="text-lg font-semibold">{post.title}</h2>
            <div
              className="mt-2 text-neutral-700"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: body is HTML-escaped by nl2brSafe first, only <br /> is real markup
              dangerouslySetInnerHTML={{ __html: nl2brSafe(post.body) }}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
