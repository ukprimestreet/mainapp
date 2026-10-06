import { OwnerTabs } from "@/components/OwnerTabs";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/owner";
import { CoverageForm } from "./CoverageForm";

const STATUS: Record<string, string> = { NEW: "Received", CONSIDERING: "Under consideration", COMMISSIONED: "We're going to cover it", DECLINED: "Not this time" };

export default async function Coverage({ params }: { params: Promise<{ id: string }> }) {
  const { business: b } = await requireBusiness((await params).id);
  const past = await db.coverageRequest.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="coverage" />
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div><h2 className="mb-2 font-display text-2xl font-extrabold">Tell us your story</h2>
          <p role="note" className="mb-5 rounded-xl border-2 border-ink bg-yellow-soft p-4 text-sm font-semibold">PrimeStreet&apos;s editorial is independent. Pitching is free, we can&apos;t promise coverage, and coverage can never be bought. Paid features are always labelled as Sponsored.</p>
          <CoverageForm id={b.id} /></div>
        <aside><h3 className="mb-2 font-bold">Your pitches</h3>
          {past.length === 0 ? <p className="text-sm text-grey">None yet.</p> : <ul className="space-y-3 text-sm">{past.map((p) => <li key={p.id} className="rounded-lg border border-line p-3"><p className="font-bold [overflow-wrap:anywhere]">{p.topic}</p><p className="text-grey">{fmtDate(p.createdAt)} · {STATUS[p.status] ?? p.status}</p>{p.adminNote && <p className="mt-1">{p.adminNote}</p>}</li>)}</ul>}</aside>
      </div>
    </>
  );
}
