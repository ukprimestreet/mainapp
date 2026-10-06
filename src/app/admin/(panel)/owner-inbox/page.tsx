import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { resolveChangeRequest, revertOwnerEdit, updateCoverageRequest } from "../../owner-actions";

const input = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function OwnerInbox({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [changes, coverage, edits] = await Promise.all([
    db.profileChangeRequest.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, include: { business: true } }),
    db.coverageRequest.findMany({ where: { status: { in: ["NEW", "CONSIDERING"] } }, orderBy: { createdAt: "asc" }, include: { business: true } }),
    db.businessEditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { business: true } }),
  ]);
  const owners = new Map((await db.owner.findMany({ where: { id: { in: [...changes.map((c) => c.ownerId), ...coverage.map((c) => c.ownerId), ...edits.map((e) => e.ownerId)] } } })).map((o) => [o.id, o]));
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Owner inbox</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}

      <h2 className="mb-3 mt-6 text-xl font-extrabold">Change requests ({changes.length})</h2>
      {changes.length === 0 && <p className="text-grey">None open.</p>}
      <ul className="space-y-4">{changes.map((c) => (
        <li key={c.id} className="rounded-xl border border-line p-4"><p className="font-bold"><Link className="underline" href={`/admin/businesses/${c.business.id}`}>{c.business.name}</Link> <span className="font-normal text-grey">· {owners.get(c.ownerId)?.email} · {fmtDate(c.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.message}</p>
          <form action={resolveChangeRequest} className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} />
            <div className="min-w-56 flex-1"><label htmlFor={`cn-${c.id}`} className="block text-sm font-bold">Note to owner</label><input id={`cn-${c.id}`} name="note" className={input} /></div>
            <button name="decision" value="DONE" className="min-h-10 rounded-full bg-ink px-4 text-sm font-bold text-yellow">Done</button><button name="decision" value="DECLINED" className="min-h-10 rounded-full border-2 border-red-700 px-4 text-sm font-bold text-red-700">Decline</button></form></li>))}</ul>

      <h2 className="mb-3 mt-10 text-xl font-extrabold">Coverage pitches ({coverage.length})</h2>
      {coverage.length === 0 && <p className="text-grey">None open.</p>}
      <ul className="space-y-4">{coverage.map((c) => (
        <li key={c.id} className="rounded-xl border border-line p-4"><p className="font-bold [overflow-wrap:anywhere]">{c.topic}</p><p className="text-sm text-grey">{c.business.name} · {owners.get(c.ownerId)?.email} · {fmtDate(c.createdAt)}</p>
          <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.details}</p>
          <form action={updateCoverageRequest} className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} />
            <div><label htmlFor={`cs-${c.id}`} className="block text-sm font-bold">Status</label><select id={`cs-${c.id}`} name="status" defaultValue={c.status} className={input}><option value="NEW">Received</option><option value="CONSIDERING">Considering</option><option value="COMMISSIONED">Commissioned</option><option value="DECLINED">Declined</option></select></div>
            <div className="min-w-56 flex-1"><label htmlFor={`co-${c.id}`} className="block text-sm font-bold">Note (visible to owner)</label><input id={`co-${c.id}`} name="note" defaultValue={c.adminNote ?? ""} className={input} /></div>
            <button className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Save</button></form></li>))}</ul>

      <h2 className="mb-3 mt-10 text-xl font-extrabold">Recent owner edits</h2>
      {edits.length === 0 && <p className="text-grey">No owner edits yet.</p>}
      <ul className="space-y-3">{edits.map((e) => {
        const ch = JSON.parse(e.changes) as Record<string, { from: unknown; to: unknown }>;
        return (
          <li key={e.id} className="rounded-xl border border-line p-4 text-sm"><p className="font-bold"><Link className="underline" href={`/admin/businesses/${e.business.id}`}>{e.business.name}</Link> <span className="font-normal text-grey">· {owners.get(e.ownerId)?.email} · {fmtDate(e.createdAt)}{e.revertedAt ? " · REVERTED" : ""}</span></p>
            <ul className="mt-1 space-y-0.5">{Object.entries(ch).map(([k, v]) => <li key={k} className="[overflow-wrap:anywhere]"><strong>{k}:</strong> <span className="text-grey line-through">{String(v.from ?? "—").slice(0, 80)}</span> → {String(v.to ?? "—").slice(0, 80)}</li>)}</ul>
            {!e.revertedAt && <form action={revertOwnerEdit} className="mt-2"><input type="hidden" name="id" value={e.id} /><button className="font-bold text-red-700 underline">Revert this edit</button></form>}</li>);
      })}</ul>
    </>
  );
}
