import Link from "next/link";
import { redirect } from "next/navigation";
import { db, type Reservation, rows } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";

export default async function MyPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login");
  }

  const reservations = rows<Reservation>(
    db.prepare("SELECT * FROM reservations WHERE member_id = ? ORDER BY id DESC").all(member.id),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">マイページ</h1>
        <form action="/api/logout" method="post">
          <button type="submit" className="text-sm text-neutral-500 underline">
            ログアウト
          </button>
        </form>
      </div>
      <p className="text-neutral-600">{member.name} 様、こんにちは。</p>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ご予約履歴</h2>
        <Link href="/mypage/new" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
          新しく予約する
        </Link>
      </div>

      {reservations.length === 0 && <p className="text-neutral-500">まだご予約はありません。</p>}
      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{reservation.menu}</p>
              <p className="text-sm text-neutral-500">
                {reservation.reserved_at} / {reservation.party_size}名
              </p>
            </div>
            <Link href={`/mypage/reservations/${reservation.id}`} className="text-sm underline">
              詳細を見る
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
