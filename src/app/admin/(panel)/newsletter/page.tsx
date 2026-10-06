import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { createDigest, deleteIssue } from "../../newsletter-actions";

export default async function NewsletterAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [counts, subs, issues] = await Promise.all([
    db.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.newsletterIssue.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const n = (st: string) => counts.find((c) => c.status === st)?._count._all ?? 0;
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Newsletter</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <dl className="mb-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Active subscribers</dt><dd className="font-display text-3xl font-extrabold">{n("ACTIVE")}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Awaiting confirmation</dt><dd className="font-display text-3xl font-extrabold">{n("PENDING")}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Unsubscribed</dt><dd className="font-display text-3xl font-extrabold">{n("UNSUBSCRIBED")}</dd></div></dl>
      <div className="mb-8 flex flex-wrap gap-3"><form action={createDigest}><button className="min-h-11 rounded-full bg-yellow px-5 font-bold">+ Build this week&apos;s digest</button></form>
        <a href="/admin/newsletter/export" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Export active subscribers (CSV)</a></div>
      <p className="mb-8 max-w-3xl text-sm text-grey">Digests are assembled from <strong>real</strong> published content only (never sample data). Sending requires a working email provider (see Admin → Outbox); until then messages are recorded but not delivered.</p>

      <h2 className="mb-3 text-xl font-extrabold">Issues</h2>
      {issues.length === 0 ? <p className="mb-8 text-grey">None yet.</p> : (
        <ul className="mb-10 space-y-2">{issues.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><span><Link className="font-bold underline" href={`/admin/newsletter/${i.id}`}>{i.subject}</Link> <span className="text-sm text-grey">· {i.sentAt ? `sent ${fmtDate(i.sentAt)} to ${i.recipients}` : "draft"}</span></span>
          {!i.sentAt && <form action={deleteIssue}><input type="hidden" name="id" value={i.id} /><button className="text-sm font-bold text-red-700 underline">Delete draft</button></form>}</li>)}</ul>
      )}

      <h2 className="mb-3 text-xl font-extrabold">Latest sign-ups</h2>
      {subs.length === 0 ? <p className="text-grey">No one yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Email</th><th>Status</th><th>Source</th><th>Signed up</th></tr></thead>
          <tbody>{subs.map((x) => <tr key={x.id} className="border-b border-line"><td className="py-2 [overflow-wrap:anywhere]">{x.email}</td><td>{x.status}</td><td>{x.source ?? "—"}</td><td>{fmtDate(x.createdAt)}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
