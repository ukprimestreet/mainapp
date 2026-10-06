import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { csvCell } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorised", { status: 401 });
  const rows = await db.newsletterSubscriber.findMany({ where: { status: "ACTIVE" }, orderBy: { confirmedAt: "asc" } });
  const csv = ["email,confirmed_at,source", ...rows.map((r) => [r.email, r.confirmedAt?.toISOString() ?? "", r.source ?? ""].map(csvCell).join(","))].join("\n") + "\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="subscribers.csv"', "Cache-Control": "no-store" } });
}
