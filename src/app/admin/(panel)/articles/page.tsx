import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { ARTICLE_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { FOUNDER_SHARE_LIMIT, founderShare } from "@/lib/editorial";

type SP = { searchParams: Promise<{ msg?: string; type?: string; status?: string; q?: string }> };

export default async function ArticlesAdmin({ searchParams }: SP) {
  const { msg, type = "", status = "", q = "" } = await searchParams;
  const now = new Date();
  const where = {
    ...(type ? { type } : {}), ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "draft" ? { status: "DRAFT" } : status === "live" ? { status: "PUBLISHED", publishedAt: { lte: now } } : status === "scheduled" ? { status: "PUBLISHED", publishedAt: { gt: now } } : {}),
  };
  const [items, bal] = await Promise.all([
    db.article.findMany({ where, include: { author: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    founderShare(),
  ]);
  const label = (a: (typeof items)[number]) => (a.status === "DRAFT" ? "Draft" : a.publishedAt && a.publishedAt > now ? `Scheduled ${fmtDate(a.publishedAt)}` : "Live");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Articles</h1>
        <div className="flex gap-2"><Link href="/admin/articles/new" className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold">+ New article</Link><Link href="/admin/authors" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Authors</Link></div></div>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      {bal.total >= 4 && bal.share > FOUNDER_SHARE_LIMIT && (
        <p role="alert" className="mb-4 rounded-lg border-2 border-red-700 p-3 text-sm font-bold">⚠ Editorial balance: {bal.founder} of the last {bal.total} published pieces feature founder-owned businesses ({Math.round(bal.share * 100)}%; limit {FOUNDER_SHARE_LIMIT * 100}%). Cover a wider range of businesses.</p>
      )}
      <form className="mb-5 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <label className="sr-only" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Search titles" className="min-h-11 rounded-lg border-2 border-line px-3" />
        <label className="sr-only" htmlFor="type">Type</label><select id="type" name="type" defaultValue={type} className="min-h-11 rounded-lg border-2 border-line px-3"><option value="">All types</option>{Object.entries(ARTICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <label className="sr-only" htmlFor="status">Status</label><select id="status" name="status" defaultValue={status} className="min-h-11 rounded-lg border-2 border-line px-3"><option value="">Any status</option><option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="live">Live</option></select>
        <button className="min-h-11 rounded-full bg-ink px-5 font-bold text-white">Filter</button>
      </form>
      {items.length === 0 ? <p className="text-grey">No articles match.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Title</th><th>Type</th><th>Status</th><th>Author</th><th>Disclosure</th></tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id} className="border-b border-line align-top"><td className="py-2 font-bold"><Link className="underline" href={`/admin/articles/${a.id}`}>{a.title || "(untitled)"}</Link>{a.isSample && <span className="ml-2 text-xs text-grey">sample</span>}</td>
              <td>{ARTICLE_TYPES[a.type as keyof typeof ARTICLE_TYPES]?.label ?? a.type}</td><td>{label(a)}</td><td>{a.author.name}</td><td>{a.disclosure}</td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
