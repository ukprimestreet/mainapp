import { NextResponse } from "next/server";
import { recordBusinessClick } from "@/lib/commerce";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Beacon for phone-number taps (a tel: link can't be redirected). Same-origin only; always 204. */
export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) return done;
    const b = (await req.json().catch(() => null)) as { id?: unknown; kind?: unknown } | null;
    if (!b || typeof b.id !== "string" || b.kind !== "phone") return done;
    const biz = await db.business.findFirst({ where: { id: b.id, published: true, phone: { not: null } }, select: { id: true } });
    if (biz) await recordBusinessClick(biz.id, "phone", req.headers.get("user-agent"));
  } catch { /* never fail the page */ }
  return done;
}
