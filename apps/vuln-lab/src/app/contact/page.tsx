export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">お問い合わせ</h1>
      {sent === "1" && (
        <p className="rounded bg-green-50 p-3 text-green-700">
          お問い合わせを受け付けました。ご連絡ありがとうございます。
        </p>
      )}
      <form action="/api/contact" method="post" className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">お名前</span>
          <input name="name" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">メールアドレス</span>
          <input type="email" name="email" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">お問い合わせ内容</span>
          <textarea name="message" required rows={5} className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          送信する
        </button>
      </form>
    </main>
  );
}
