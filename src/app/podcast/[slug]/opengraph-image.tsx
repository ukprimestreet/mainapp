import { db } from "@/lib/db";
import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "PrimeStreet podcast episode";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const e = await db.podcastEpisode.findFirst({ where: { slug: (await params).slug, status: "PUBLISHED" } });
  if (!e) return ogCard({ title: "The PrimeStreet Podcast" });
  return ogCard({ kicker: `The PrimeStreet Podcast · Episode ${e.number}`, title: e.title, sub: e.guestName ? `with ${e.guestName}${e.guestRole ? `, ${e.guestRole}` : ""}` : undefined, badge: e.videoUrl ? "Watch" : "Listen" });
}
