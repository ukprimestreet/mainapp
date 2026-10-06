import Link from "next/link";
import { db } from "@/lib/db";
import { normalisePath } from "@/lib/redirects";
import { SeoPageForm } from "./SeoPageForm";

export default async function EditSeo({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const path = normalisePath((await searchParams).path ?? "");
  if (!path) return <p>Choose a page from the <Link className="underline" href="/admin/seo">SEO list</Link>.</p>;
  const o = await db.seoPage.findUnique({ where: { path } });
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/seo" className="underline">← SEO &amp; index health</Link></p>
      <h1 className="mb-1 text-3xl font-extrabold">Page SEO</h1>
      <p className="mb-6 font-mono text-sm text-grey">{path}</p>
      <SeoPageForm path={path} initial={{ title: o?.title ?? "", description: o?.description ?? "", intro: o?.intro ?? "", robots: o?.robots ?? "AUTO" }} exists={!!o} />
    </>
  );
}
