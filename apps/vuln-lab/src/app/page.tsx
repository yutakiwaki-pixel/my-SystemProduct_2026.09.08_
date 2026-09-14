import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">カフェ・ソライロ</h1>
        <p className="text-neutral-600">
          駅から徒歩5分、一杯ずつ丁寧に淹れる自家焙煎コーヒーの小さなカフェです。
        </p>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/services" className="rounded border px-4 py-2 hover:bg-neutral-50">
          メニューを見る
        </Link>
        <Link href="/store" className="rounded border px-4 py-2 hover:bg-neutral-50">
          店舗情報・アクセス
        </Link>
        <Link href="/news" className="rounded border px-4 py-2 hover:bg-neutral-50">
          お知らせ
        </Link>
        <Link
          href="/mypage"
          className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
        >
          ご予約はこちら
        </Link>
      </section>
    </main>
  );
}
