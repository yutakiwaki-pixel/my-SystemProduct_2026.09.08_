export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">会員登録</h1>
      {error && (
        <p className="rounded bg-red-50 p-3 text-red-700">
          登録に失敗しました。すでに登録済みのメールアドレスかもしれません。
        </p>
      )}
      <form action="/api/register" method="post" className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">お名前</span>
          <input name="name" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">メールアドレス</span>
          <input type="email" name="email" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">パスワード</span>
          <input type="password" name="password" required className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          登録する
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        すでに会員の方は
        <a className="underline" href="/login">
          ログイン
        </a>
        へ。
      </p>
    </main>
  );
}
