import { NextResponse } from "next/server";
import { recordCampaignClick } from "@/lib/commerce";
import { db } from "@/lib/db";
import { safeUrl } from "@/lib/business";
import { bizPath } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Click tracker for paid placements. The destination is read from OUR database by campaign id — never from a URL parameter —
 * so this can't be used as an open redirect. Bots aren't counted. Ended/unknown campaigns send people home (or to the profile).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const home = new URL("/", req.url);
  const c = await db.campaign.findUnique({ where: { id: (await params).id }, include: { business: { include: { category: true, city: true } } } });
  if (!c) return NextResponse.redirect(home, 302);
  const live = c.status === "ACTIVE" && c.endsAt >= new Date();
  if (live) await recordCampaignClick(c.id, req.headers.get("user-agent"));
  if (c.kind === "FEATURED" && c.business) return NextResponse.redirect(new URL(bizPath(c.business), req.url), 302);
  const dest = live ? safeUrl(c.linkUrl) : null;
  return NextResponse.redirect(dest && dest.startsWith("https://") ? dest : home, 302);
}
