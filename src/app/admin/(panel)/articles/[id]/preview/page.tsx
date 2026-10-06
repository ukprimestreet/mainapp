import { notFound } from "next/navigation";
import { ArticleView, articleInclude } from "@/components/ContentPages";
import { db } from "@/lib/db";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const a = await db.article.findUnique({ where: { id: (await params).id }, include: articleInclude });
  if (!a) notFound();
  const state = a.status === "DRAFT" ? "Draft" : a.publishedAt && a.publishedAt > new Date() ? "Scheduled" : "Live";
  return (
    <>
      <p role="status" className="-mt-8 mb-6 bg-yellow px-4 py-2 text-center text-sm font-extrabold">PREVIEW — {state}. Readers {state === "Live" ? "can" : "cannot"} see this page. Noindex.</p>
      <ArticleView a={a} preview />
    </>
  );
}
