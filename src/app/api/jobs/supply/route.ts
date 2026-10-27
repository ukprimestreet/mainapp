import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MAX_RECIPIENTS, supplyCheck } from "@/lib/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * How many businesses could take a job of this kind in this area.
 *
 * The form calls this *before* asking for a phone number, so that a customer in an area we do not cover
 * finds out from us rather than from a week of silence. It costs nothing but two database counts — no paid
 * lookup, no personal data in or out — so it is deliberately not rate-limited beyond the platform defaults.
 */
export async function POST(req: Request) {
  let categoryId = "", placeId = "";
  try {
    const body = (await req.json()) as { categoryId?: unknown; placeId?: unknown };
    categoryId = typeof body.categoryId === "string" ? body.categoryId.slice(0, 40) : "";
    placeId = typeof body.placeId === "string" ? body.placeId.slice(0, 40) : "";
  } catch {
    return NextResponse.json({ ok: false, message: "Send a JSON body." }, { status: 400 });
  }
  if (!categoryId || !placeId) return NextResponse.json({ ok: false, message: "Choose what you need and where." }, { status: 400 });

  // Confirm both exist before counting, so a bad id reads as a bad request rather than "nobody covers it".
  const [category, place] = await Promise.all([
    db.category.findUnique({ where: { id: categoryId }, select: { name: true } }),
    db.place.findUnique({ where: { id: placeId }, select: { label: true } }),
  ]);
  if (!category || !place) return NextResponse.json({ ok: false, message: "We do not recognise that choice." }, { status: 404 });

  const supply = await supplyCheck(categoryId, placeId);
  return NextResponse.json({
    ok: true,
    category: category.name,
    place: place.label,
    providers: supply.providers,
    max: MAX_RECIPIENTS,
    // The form shows the customer what this means; it does not decide it for itself.
    state: supply.none ? "none" : supply.thin ? "thin" : "good",
  });
}
