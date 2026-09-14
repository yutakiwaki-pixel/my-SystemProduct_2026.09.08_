export default function StorePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">店舗情報</h1>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold text-neutral-600">住所</dt>
        <dd>東京都文京区○○1-2-3</dd>
        <dt className="font-semibold text-neutral-600">営業時間</dt>
        <dd>平日 10:00〜19:00 / 土日祝 9:00〜18:00（水曜定休）</dd>
        <dt className="font-semibold text-neutral-600">アクセス</dt>
        <dd>○○駅 東口より徒歩5分</dd>
        <dt className="font-semibold text-neutral-600">電話番号</dt>
        <dd>03-0000-0000</dd>
      </dl>
    </main>
  );
}
