import { NextResponse } from "next/server";
import { recordBusinessClick } from "@/lib/commerce";
import { db } from "@/lib/db";
import { safeUrl } from "@/lib/business";

export const dynamic = "force-dynamic";

/** Outbound-click counter for a business's website / directions (so owners can see interest). Destination comes from the DB only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const b = await db.business.findFirst({ where: { id, published: true } });
  if (!b || !["website", "directions"].includes(kind)) return NextResponse.redirect(new URL("/", req.url), 302);
  let dest: string | null = null;
  if (kind === "website") dest = safeUrl(b.website);
  if (kind === "directions") dest = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.address, b.postcode, "London"].filter(Boolean).join(", "))}`;
  if (!dest) return NextResponse.redirect(new URL("/", req.url), 302);
  await recordBusinessClick(b.id, kind, req.headers.get("user-agent"));
  return NextResponse.redirect(dest, 302);
}
