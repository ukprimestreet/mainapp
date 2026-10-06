import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { db } from "@/lib/db";
import { bizPath, businessInclude } from "@/lib/queries";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write a review", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const b = await db.business.findFirst({ where: { slug: (await params).slug, published: true }, include: businessInclude });
  if (!b) notFound();
  return (
    <>
      <PageHeader kicker="Review" title={`Review ${b.name}`} intro="Honest, first-hand reviews help other Londoners. Every review is verified by email and moderated before it appears." crumbs={[{ name: "Home", href: "/" }, { name: b.name, href: bizPath(b) }, { name: "Write a review" }]} />
      <Container className="max-w-2xl py-10">
        {b.isSample ? <p role="note" className="rounded-xl border-2 border-dashed border-line p-6">{b.name} is a sample business used for demonstration, so it can&apos;t be reviewed.</p> : <ReviewForm slug={b.slug} formToken={formToken()} />}
      </Container>
    </>
  );
}
