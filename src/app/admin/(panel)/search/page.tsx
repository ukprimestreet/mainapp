import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { indexStats } from "@/lib/search";
import { geocodeAll, purgeSearchLog, reindexNow } from "../../search-actions";

export default async function SearchAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [stats, rows, noGeo, withPc] = await Promise.all([
    indexStats(),
    db.searchTerm.groupBy({ by: ["q"], where: { day: { gte: since } }, _sum: { count: true, zeroCount: true } }),
    db.business.count({ where: { postcode: { not: null }, lat: null } }),
    db.business.count({ where: { postcode: { not: null } } }),
  ]);
  const agg = rows.map((r) => ({ q: r.q, n: r._sum.count ?? 0, zero: r._sum.zeroCount ?? 0 }));
  const top = [...agg].sort((a, b) => b.n - a.n).slice(0, 15);
  const zero = agg.filter((a) => a.zero > 0).sort((a, b) => b.zero - a.zero).slice(0, 15);
  const total = agg.reduce((a, b) => a + b.n, 0);
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Search &amp; discovery</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <dl className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Indexed businesses</dt><dd className="font-display text-3xl font-extrabold">{stats.byKind.BUSINESS ?? 0}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Articles / episodes</dt><dd className="font-display text-3xl font-extrabold">{stats.byKind.ARTICLE ?? 0} / {stats.byKind.EPISODE ?? 0}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Searches (30 days)</dt><dd className="font-display text-3xl font-extrabold">{total}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Last index update</dt><dd className="text-lg font-extrabold">{stats.lastChanged ? fmtDate(new Date(stats.lastChanged)) : "—"}</dd></div>
      </dl>
      <div className="mb-10 flex flex-wrap gap-3">
        <form action={reindexNow}><button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Rebuild search index</button></form>
        <form action={geocodeAll}><button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Geocode postcodes ({noGeo} of {withPc} pending)</button></form>
        <form action={purgeSearchLog}><button className="min-h-11 rounded-full px-5 font-bold text-red-700 underline">Delete search log older than 90 days</button></form>
      </div>
      <p className="mb-8 max-w-3xl text-sm text-grey">The index updates itself within seconds of any change; rebuild only if something looks stale. Coordinates come from postcodes (postcodes.io); businesses without them are placed at their borough&apos;s centre and marked “≈” in near-me results. The search log is anonymous: no IPs or user IDs, and queries that look like emails, phone numbers or links are never stored.</p>
      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="top"><h2 id="top" className="mb-3 text-xl font-extrabold">Top searches</h2>
          {top.length === 0 ? <p className="text-grey">No searches yet.</p> : <table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Query</th><th>Searches</th></tr></thead><tbody>{top.map((t) => <tr key={t.q} className="border-b border-line"><td className="py-2"><Link className="underline" href={`/search?q=${encodeURIComponent(t.q)}`}>{t.q}</Link></td><td>{t.n}</td></tr>)}</tbody></table>}</section>
        <section aria-labelledby="zero"><h2 id="zero" className="mb-1 text-xl font-extrabold">Searches with no results</h2><p className="mb-3 text-sm text-grey">What people want that we don&apos;t have: add these businesses/categories or add synonyms in <code>src/lib/search/text.ts</code>.</p>
          {zero.length === 0 ? <p className="text-grey">None. Nice.</p> : <table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Query</th><th>Times</th></tr></thead><tbody>{zero.map((t) => <tr key={t.q} className="border-b border-line"><td className="py-2">{t.q}</td><td>{t.zero}</td></tr>)}</tbody></table>}</section>
      </div>
    </>
  );
}
