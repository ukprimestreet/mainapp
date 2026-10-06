import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Admin-only business lookup for the article editor's picker. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const rows = await db.business.findMany({ where: { name: { contains: q, mode: "insensitive" as const } }, include: { location: true, category: true }, take: 8, orderBy: { name: "asc" } });
  return NextResponse.json(rows.map((b) => ({ id: b.id, name: b.name, meta: `${b.category.name} · ${b.location.name}`, founder: b.ownedByFounder })));
}
