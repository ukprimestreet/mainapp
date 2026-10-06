import Link from "next/link";
import { MIN_BUSINESSES, MIN_INTRO_CHARS, seoHealth } from "@/lib/seo-engine";

export default async function SeoHealth({ searchParams }: { searchParams: Promise<{ msg?: string; kind?: string; status?: string }> }) {
  const { msg, kind = "", status = "" } = await searchParams;
  const all = await seoHealth();
  const rows = all.filter((r) => (!kind || r.kind === kind) && (!status || (status === "indexed" ? r.verdict.index : !r.verdict.index)))
    .filter((r) => r.count > 0 || r.kind !== "Area" || kind === "Area" || status !== "")
    .sort((a, b) => Number(b.verdict.index) - Number(a.verdict.index) || b.count - a.count);
  const indexed = all.filter((r) => r.verdict.index).length;
  const close = all.filter((r) => !r.verdict.index && r.count >= MIN_BUSINESSES && r.robots !== "NOINDEX");
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">SEO &amp; index health</h1>
        <Link href="/admin/seo/redirects" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Redirects</Link></div>
      <p className="mb-4 max-w-3xl text-grey">Area, category and area × category pages are only indexed when they have real value: at least <strong className="text-ink">{MIN_BUSINESSES} real businesses</strong> and an <strong className="text-ink">original intro of {MIN_INTRO_CHARS}+ characters</strong> (area × category pages with 5+ businesses are exempt). Sample data never counts. The same rule feeds the sitemap, so they can't disagree.</p>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <dl className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Indexed landing pages</dt><dd className="font-display text-3xl font-extrabold">{indexed}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Have businesses, need an intro</dt><dd className="font-display text-3xl font-extrabold">{close.length}</dd></div>
        <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Pages tracked</dt><dd className="font-display text-3xl font-extrabold">{all.length}</dd></div>
      </dl>
      <form className="mb-5 flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="kind">Page type</label><select id="kind" name="kind" defaultValue={kind} className="min-h-11 rounded-lg border-2 border-line px-3"><option value="">All types</option><option>Area</option><option>Category</option><option>Area × category</option></select>
        <label className="sr-only" htmlFor="status">Status</label><select id="status" name="status" defaultValue={status} className="min-h-11 rounded-lg border-2 border-line px-3"><option value="">Any status</option><option value="indexed">Indexed</option><option value="noindex">Not indexed</option></select>
        <button className="min-h-11 rounded-full bg-ink px-5 font-bold text-white">Filter</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b-2 border-ink"><th className="py-2">Page</th><th>Type</th><th>Real businesses</th><th>Intro</th><th>Status</th><th>Why / what it needs</th><th className="relative"><span className="sr-only">Edit</span></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.path} className="border-b border-line align-top">
            <td className="py-2 font-bold"><Link className="underline" href={r.path}>{r.label}</Link><div className="font-mono text-xs font-normal text-grey">{r.path}</div></td>
            <td>{r.kind}</td><td>{r.count}</td><td>{r.introChars ? `${r.introChars} chars` : "—"}</td>
            <td><span className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-extrabold uppercase">{r.verdict.index ? "✓ Indexed" : "✗ Noindex"}</span>{r.robots !== "AUTO" && <span className="ml-1 text-xs font-bold">({r.robots})</span>}</td>
            <td>{r.verdict.index ? r.verdict.reasons[0] : r.verdict.needs.join(" · ") || r.verdict.reasons[0]}</td>
            <td><Link href={`/admin/seo/edit?path=${encodeURIComponent(r.path)}`} className="font-bold underline">Edit</Link></td>
          </tr>))}</tbody></table></div>
      {rows.length === 0 && <p className="mt-4 text-grey">Nothing matches.</p>}
    </>
  );
}
