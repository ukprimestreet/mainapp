import Link from "next/link";
import { db } from "@/lib/db";
import { deleteAuthor } from "../../article-actions";

export default async function Authors({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const authors = await db.author.findMany({ include: { _count: { select: { articles: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-3xl font-extrabold">Authors</h1><Link href="/admin/authors/new" className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold">+ New author</Link></div>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <ul className="divide-y divide-line">{authors.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><Link href={`/admin/authors/${a.id}`} className="font-bold underline">{a.name}</Link><span className="ml-2 text-sm text-grey">{a.role} · {a._count.articles} articles · /authors/{a.slug}</span></div>
          <form action={deleteAuthor}><input type="hidden" name="id" value={a.id} /><button className="text-sm font-bold text-red-700 underline">Delete</button></form></li>))}</ul>
    </>
  );
}
