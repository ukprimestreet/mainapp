import { db } from "@/lib/db";
import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Business profile on PrimeStreet";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const b = await db.business.findFirst({ where: { slug: (await params).slug, published: true }, include: { category: true, location: true } });
  if (!b) return ogCard({ title: "PrimeStreet" });
  const badge = b.claimStatus === "VERIFIED" ? "Verified" : b.claimStatus === "CLAIMED" ? "Claimed" : undefined;
  return ogCard({ kicker: `${b.category.name} · ${b.location.name}`, title: b.name, sub: b.ratingCount ? `Rated ${b.ratingAvg?.toFixed(1)} out of 5 from ${b.ratingCount} review${b.ratingCount === 1 ? "" : "s"}` : b.summary, badge });
}
