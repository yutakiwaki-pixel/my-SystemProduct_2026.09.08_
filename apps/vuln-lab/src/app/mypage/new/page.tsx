import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";

export default async function NewReservationPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">ご予約</h1>
      <form action="/api/reservations" method="post" className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">メニュー</span>
          <input name="menu" required className="rounded border p-2" placeholder="例: カット" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">希望日時</span>
          <input type="datetime-local" name="reservedAt" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">人数</span>
          <input
            type="number"
            name="partySize"
            min={1}
            defaultValue={1}
            required
            className="rounded border p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">備考(任意)</span>
          <textarea name="note" rows={3} className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          予約する
        </button>
      </form>
    </main>
  );
}
