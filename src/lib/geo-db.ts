import { db } from "./db";
import { bulkGeocode, lookupPostcode, normalisePostcode } from "./geo";

/** Re-derives a business's coordinates from its postcode (clears them when there is no usable postcode). Best effort. */
export async function refreshGeo(businessId: string) {
  const b = await db.business.findUnique({ where: { id: businessId }, select: { postcode: true } });
  const pc = b?.postcode ? normalisePostcode(b.postcode) : null;
  const pt = pc ? await lookupPostcode(pc) : null;
  await db.business.update({ where: { id: businessId }, data: pt ? { lat: pt.lat, lng: pt.lng, geoSource: "POSTCODE" } : { lat: null, lng: null, geoSource: null } });
  return !!pt;
}

/** Geocodes every business that has a postcode but no coordinates (100 per API call). */
export async function geocodePending(): Promise<{ tried: number; found: number }> {
  const rows = await db.business.findMany({ where: { postcode: { not: null }, lat: null }, select: { id: true, postcode: true } });
  const map = await bulkGeocode(rows.map((r) => r.postcode!));
  let found = 0;
  for (const r of rows) {
    const pt = map.get(normalisePostcode(r.postcode!) ?? "");
    if (pt) { await db.business.update({ where: { id: r.id }, data: { lat: pt.lat, lng: pt.lng, geoSource: "POSTCODE" } }); found++; }
  }
  return { tried: rows.length, found };
}
