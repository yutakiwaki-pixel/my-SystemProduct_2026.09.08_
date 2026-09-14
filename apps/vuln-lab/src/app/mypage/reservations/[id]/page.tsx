import { notFound, redirect } from "next/navigation";
import { db, type Reservation, row } from "@/lib/db";
import { nl2br } from "@/lib/format";
import { getCurrentMember } from "@/lib/session";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login");
  }

  const { id } = await params;

  // Loads whichever reservation matches the id in the URL. Logged-in members can view any
  // reservation this way, not just their own — see apps/vuln-lab/CLAUDE.md.
  const reservation = row<Reservation>(
    db.prepare("SELECT * FROM reservations WHERE id = ?").get(id),
  );

  if (!reservation) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">予約詳細 #{reservation.id}</h1>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded border border-neutral-200 p-4 sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold text-neutral-600">メニュー</dt>
        <dd>{reservation.menu}</dd>
        <dt className="font-semibold text-neutral-600">希望日時</dt>
        <dd>{reservation.reserved_at}</dd>
        <dt className="font-semibold text-neutral-600">人数</dt>
        <dd>{reservation.party_size}名</dd>
        <dt className="font-semibold text-neutral-600">備考</dt>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: renders member-authored line breaks as-is (no output escaping) */}
        <dd dangerouslySetInnerHTML={{ __html: nl2br(reservation.note) }} />
      </dl>
      <a href="/mypage" className="text-sm underline">
        マイページに戻る
      </a>
    </main>
  );
}
