import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { resolveRange } from "@/lib/growth";
import { ordersCsv, expensesCsv } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** CSV export for /admin/finance. Server action would also work, but a GET keeps "open in a new tab" simple. */
export async function GET(req: Request) {
  await requirePermission("money.view");
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "expenses" ? "expenses" : "orders";
  const range = resolveRange({ range: url.searchParams.get("range") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  const csv = kind === "expenses" ? await expensesCsv(range.from, range.to) : await ordersCsv(range.from, range.to);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${range.key}.csv"` } });
}
