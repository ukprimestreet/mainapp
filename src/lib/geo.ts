// Geography helpers: distance, open-now, UK postcode lookup, area centroids.

export const AREA_CENTROIDS: Record<string, [number, number]> = {
  "barking-and-dagenham": [51.5607, 0.1557], barnet: [51.6252, -0.1517], bexley: [51.4549, 0.1505], brent: [51.5588, -0.2817], bromley: [51.4039, 0.0198], camden: [51.529, -0.1255],
  "city-of-london": [51.5155, -0.0922], croydon: [51.3714, -0.0977], ealing: [51.513, -0.3089], enfield: [51.6538, -0.0799], greenwich: [51.4892, 0.0648], hackney: [51.545, -0.0553],
  "hammersmith-and-fulham": [51.4927, -0.2339], haringey: [51.6, -0.1119], harrow: [51.5898, -0.3346], havering: [51.5779, 0.2121], hillingdon: [51.5441, -0.476], hounslow: [51.4746, -0.368],
  islington: [51.5465, -0.1058], "kensington-and-chelsea": [51.4991, -0.1938], "kingston-upon-thames": [51.4085, -0.3064], lambeth: [51.4571, -0.1231], lewisham: [51.4452, -0.0209],
  merton: [51.4014, -0.1958], newham: [51.5077, 0.0469], redbridge: [51.559, 0.0741], "richmond-upon-thames": [51.4479, -0.326], southwark: [51.5035, -0.0804], sutton: [51.3618, -0.1945],
  "tower-hamlets": [51.5099, -0.0059], "waltham-forest": [51.5908, -0.0134], wandsworth: [51.4567, -0.191], westminster: [51.4973, -0.1372],
};

export type LatLng = { lat: number; lng: number };
export const validLatLng = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 49.5 && lat <= 61 && lng >= -8.7 && lng <= 2; // UK bounding box

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

/** Where a business is: its own coordinates, else its area's centroid (marked approximate). */
export function businessPoint(b: { lat: number | null; lng: number | null; location: { lat: number | null; lng: number | null; slug: string } }): { point: LatLng; approx: boolean } | null {
  if (b.lat != null && b.lng != null) return { point: { lat: b.lat, lng: b.lng }, approx: false };
  const c = b.location.lat != null && b.location.lng != null ? [b.location.lat, b.location.lng] : AREA_CENTROIDS[b.location.slug];
  return c ? { point: { lat: c[0], lng: c[1] }, approx: true } : null;
}

// ---- opening hours (London time) ----
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export function londonNow(now = new Date()): { day: (typeof DAY_KEYS)[number]; minutes: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const wd = p.find((x) => x.type === "weekday")!.value.toLowerCase().slice(0, 3) as (typeof DAY_KEYS)[number];
  return { day: wd, minutes: (Number(p.find((x) => x.type === "hour")!.value) % 24) * 60 + Number(p.find((x) => x.type === "minute")!.value) };
}
/** true/false when hours are known, null when the business hasn't published hours. */
export function isOpenNow(hoursJson: string | null | undefined, now = new Date()): boolean | null {
  if (!hoursJson) return null;
  let h: Record<string, string>;
  try { h = JSON.parse(hoursJson); } catch { return null; }
  if (!h || typeof h !== "object" || !Object.keys(h).length) return null;
  const { day, minutes } = londonNow(now);
  const r = h[day]?.match(/^(\d\d):(\d\d)-(\d\d):(\d\d)$/);
  if (!r) return false;
  return minutes >= Number(r[1]) * 60 + Number(r[2]) && minutes < Number(r[3]) * 60 + Number(r[4]);
}

// ---- UK postcodes (postcodes.io; base URL configurable so tests/dev can point at a mock) ----
const PC_BASE = () => (process.env.POSTCODES_API_BASE ?? "https://api.postcodes.io").replace(/\/$/, "");
const PC_RE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
export function normalisePostcode(input: string): string | null {
  const m = input.trim().toUpperCase().match(PC_RE);
  return m ? `${m[1]} ${m[2]}` : null;
}
export const isOutcode = (s: string) => /^[A-Z]{1,2}\d[A-Z\d]?$/i.test(s.trim());

const cache = new Map<string, { at: number; ttl: number; v: LatLng | null }>();
const DAY = 86400_000, RETRY = 30_000;
async function lookup(path: string, key: string): Promise<LatLng | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.v;
  let v: LatLng | null = null, ttl = RETRY; // unknown (network/5xx) results are only remembered briefly so an outage can't poison the cache
  try {
    const r = await fetch(`${PC_BASE()}${path}`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (r.ok) {
      const j = (await r.json()) as { result?: { latitude?: number; longitude?: number } };
      const lat = j.result?.latitude, lng = j.result?.longitude;
      if (typeof lat === "number" && typeof lng === "number" && validLatLng(lat, lng)) { v = { lat, lng }; ttl = DAY; } else ttl = DAY; // answered but unusable
    } else if (r.status === 404) ttl = DAY; // definitively not a postcode
  } catch { /* network down → retry soon */ }
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), ttl, v });
  return v;
}
/** Full postcode ("E8 3AA") or outcode ("E8") → coordinates, or null. */
export async function lookupPostcode(input: string): Promise<LatLng | null> {
  const pc = normalisePostcode(input);
  if (pc) return lookup(`/postcodes/${encodeURIComponent(pc)}`, pc);
  if (isOutcode(input)) return lookup(`/outcodes/${encodeURIComponent(input.trim().toUpperCase())}`, input.trim().toUpperCase());
  return null;
}
/** Bulk geocode up to 100 full postcodes per call. Returns map normalised-postcode → coordinates. */
export async function bulkGeocode(postcodes: string[]): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>();
  const list = [...new Set(postcodes.map(normalisePostcode).filter(Boolean) as string[])];
  for (let i = 0; i < list.length; i += 100) {
    try {
      const r = await fetch(`${PC_BASE()}/postcodes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postcodes: list.slice(i, i + 100) }), signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { result?: { query: string; result: { latitude: number; longitude: number } | null }[] };
      for (const x of j.result ?? []) if (x.result && validLatLng(x.result.latitude, x.result.longitude)) out.set(normalisePostcode(x.query) ?? x.query, { lat: x.result.latitude, lng: x.result.longitude });
    } catch { /* skip batch */ }
  }
  return out;
}
