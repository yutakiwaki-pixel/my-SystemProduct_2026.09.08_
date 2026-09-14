export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">会員ログイン</h1>
      {error && (
        <p className="rounded bg-red-50 p-3 text-red-700">
          メールアドレスまたはパスワードが正しくありません。
        </p>
      )}
      <form action="/api/login" method="post" className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">メールアドレス</span>
          <input type="email" name="email" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">パスワード</span>
          <input type="password" name="password" required className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          ログイン
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        会員登録がまだの方は
        <a className="underline" href="/register">
          こちら
        </a>
        。
      </p>
    </main>
  );
}
