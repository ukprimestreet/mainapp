import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { deleteRedirect } from "../../../seo-actions";
import { RedirectForm } from "./RedirectForm";

export default async function Redirects({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const rows = await db.redirect.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/seo" className="underline">← SEO &amp; index health</Link></p>
      <h1 className="mb-2 text-3xl font-extrabold">Redirects</h1>
      <p className="mb-6 max-w-3xl text-grey">Permanent (308) redirects keep old links and search rankings alive when a URL changes. They are created automatically when you change a business or article slug. Chains are collapsed and loops are refused. Only same-site targets are allowed.</p>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <RedirectForm />
      <h2 className="mb-3 mt-10 text-xl font-extrabold">Active redirects ({rows.length})</h2>
      {rows.length === 0 ? <p className="text-grey">None yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">From</th><th>To</th><th>Hits</th><th>Created</th><th>Note</th><th className="relative"><span className="sr-only">Delete</span></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top"><td className="py-2 font-mono text-xs [overflow-wrap:anywhere]">{r.fromPath}</td><td className="font-mono text-xs [overflow-wrap:anywhere]">{r.toPath}</td><td>{r.hits}</td><td>{fmtDate(r.createdAt)}</td><td>{r.note}</td>
              <td><form action={deleteRedirect}><input type="hidden" name="id" value={r.id} /><button className="font-bold text-red-700 underline">Delete</button></form></td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
