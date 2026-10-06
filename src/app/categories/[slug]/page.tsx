import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** /categories/{slug} is a friendly alias; the single canonical category page is /businesses/london/{slug} (308 permanent). */
export default async function CategoryAlias({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [cat, city] = await Promise.all([db.category.findUnique({ where: { slug } }), db.city.findFirst({ where: { active: true } })]);
  if (!cat || !city) notFound();
  permanentRedirect(`/businesses/${city.slug}/${cat.slug}`);
}
