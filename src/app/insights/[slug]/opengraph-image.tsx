import { db } from "@/lib/db";
import { ARTICLE_TYPES } from "@/lib/constants";
import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "PrimeStreet article";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = await db.article.findUnique({ where: { slug: (await params).slug } });
  if (!a || a.status !== "PUBLISHED") return ogCard({ title: "PrimeStreet" });
  return ogCard({ kicker: ARTICLE_TYPES[a.type as keyof typeof ARTICLE_TYPES]?.label ?? "PrimeStreet", title: a.title, badge: a.disclosure === "EDITORIAL" ? undefined : a.disclosure[0] + a.disclosure.slice(1).toLowerCase() });
}
