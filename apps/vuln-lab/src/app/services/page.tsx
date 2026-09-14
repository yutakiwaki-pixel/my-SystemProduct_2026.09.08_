const menu = [
  { name: "ブレンドコーヒー", price: "¥480" },
  { name: "カフェラテ", price: "¥550" },
  { name: "本日のケーキセット", price: "¥780" },
  { name: "焼き菓子(お持ち帰り)", price: "¥350〜" },
];

export default function ServicesPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">メニュー</h1>
      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
        {menu.map((item) => (
          <li key={item.name} className="flex items-center justify-between p-4">
            <span>{item.name}</span>
            <span className="text-neutral-600">{item.price}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-500">
        店内でのご予約は
        <a className="underline" href="/mypage">
          マイページ
        </a>
        からどうぞ。
      </p>
    </main>
  );
}
