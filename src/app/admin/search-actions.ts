"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { geocodePending } from "@/lib/geo-db";
import { syncIndex } from "@/lib/search";

const back = (m: string): never => redirect(`/admin/search?msg=${encodeURIComponent(m)}`);

export async function reindexNow() {
  await requireAdmin();
  const r = await syncIndex({ force: true });
  await db.auditLog.create({ data: { action: "SEARCH_REINDEX", targetType: "Search", targetId: "*", detail: `${r.changed} documents` } });
  back(`Rebuilt the search index (${r.changed} documents)`);
}

export async function geocodeAll() {
  await requireAdmin();
  const r = await geocodePending();
  await db.auditLog.create({ data: { action: "GEOCODE_BUSINESSES", targetType: "Business", targetId: "*", detail: `${r.found}/${r.tried}` } });
  back(r.tried ? `Geocoded ${r.found} of ${r.tried} businesses with a postcode${r.found < r.tried ? " (the rest have invalid postcodes or the lookup service was unreachable)" : ""}` : "Every business with a postcode already has coordinates");
}

export async function purgeSearchLog() {
  await requireAdmin();
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const r = await db.searchTerm.deleteMany({ where: { day: { lt: cutoff } } });
  back(`Deleted ${r.count} search-log rows older than 90 days`);
}
