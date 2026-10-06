import { db } from "./db";

/**
 * Multi-city support. PrimeStreet launched as a London title, so London stays the default city: its old
 * single-city URLs (/locations/camden) 308-redirect to the city-scoped form (/locations/london/camden).
 * A city is only publicly browsable when active; COMING_SOON cities are never indexed and list no businesses.
 */
export const DEFAULT_CITY = "london";
export const CITY_STATUS = { LIVE: "Live", COMING_SOON: "Coming soon" } as const;
export type CityStatus = keyof typeof CITY_STATUS;
export const EDITOR_ROLES = { EDITOR: "City editor", REPORTER: "Reporter", CONTRIBUTOR: "Contributor" } as const;
export type EditorRole = keyof typeof EDITOR_ROLES;

export type CityLite = { id: string; slug: string; name: string; status: string; active: boolean; intro: string | null; region: string | null };

export const isLive = (c: { status: string; active: boolean }) => c.active && c.status === "LIVE";

/** Every city a visitor may browse, launched first then alphabetical. */
export async function browsableCities() {
  return db.city.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}
export async function liveCities() {
  return db.city.findMany({ where: { active: true, status: "LIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}
/** True once there is more than one city to choose between: the switcher and city filters only appear then. */
export async function multiCity() {
  return (await db.city.count({ where: { active: true } })) > 1;
}
export const cityBySlug = (slug: string) => db.city.findUnique({ where: { slug } });

/** An area within a city. Slugs are unique per city, so the city is always required. */
export const areaBySlug = (cityId: string, slug: string) => db.location.findUnique({ where: { cityId_slug: { cityId, slug } }, include: { city: true, parent: true } });

/** Legacy single-city lookup: used only to 308-redirect pre-multi-city URLs. */
export async function legacyArea(slug: string) {
  return db.location.findFirst({ where: { slug }, include: { city: true }, orderBy: { city: { sortOrder: "asc" } } });
}

export const cityPath = (city: string) => `/locations/${city}`;
export const areaPath = (city: string, area: string) => `/locations/${city}/${area}`;
export const areaCatPath = (city: string, area: string, cat: string) => `/locations/${city}/${area}/${cat}`;

// ---------- postcode → city ----------
export function parsePrefixes(json: string | null | undefined): string[] {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.toUpperCase()) : []; }
  catch { return []; }
}
/** The letter part of a UK outward code: "SW1A 1AA" → "SW". */
export const outwardLetters = (postcode: string) => (postcode.trim().toUpperCase().match(/^([A-Z]{1,2})\d/) ?? [])[1] ?? null;

/** Which city a postcode belongs to. Longer prefixes win ("EC" beats "E"), so prefixes may overlap safely. */
export function cityForPostcode<T extends { postcodePrefixes: string | null }>(postcode: string, cities: T[]): T | null {
  const letters = outwardLetters(postcode);
  if (!letters) return null;
  let best: T | null = null, bestLen = 0;
  for (const c of cities) for (const p of parsePrefixes(c.postcodePrefixes)) {
    if (letters === p && p.length > bestLen) { best = c; bestLen = p.length; }
  }
  return best;
}

// ---------- validation (admin) ----------
export const slugify = (s: string) => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const RESERVED = new Set(["admin", "api", "news", "stories", "interviews", "guides", "insights", "podcast", "search", "saved", "about", "privacy", "advertise", "claim", "owner", "businesses", "locations", "categories", "go", "review", "reviews", "authors", "newsletter", "brand", "sitemap", "robots", "feed", "business-of-the-week"]);

export function validateCity(v: { name: string; slug: string; status: string; intro?: string | null; lat?: string | null; lng?: string | null; prefixes?: string | null }) {
  const errors: Record<string, string> = {};
  const name = v.name.trim(), slug = slugify(v.slug || v.name);
  if (name.length < 2 || name.length > 60) errors.name = "Enter the city name (2–60 characters).";
  if (!slug) errors.slug = "Enter a web address for the city.";
  else if (RESERVED.has(slug)) errors.slug = `"${slug}" is used elsewhere on the site — choose another address.`;
  if (!(v.status in CITY_STATUS)) errors.status = "Choose a status.";
  const num = (s: string | null | undefined, lo: number, hi: number) => {
    if (s == null || s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN;
  };
  const lat = num(v.lat, -90, 90), lng = num(v.lng, -180, 180);
  if (Number.isNaN(lat)) errors.lat = "Latitude must be between -90 and 90.";
  if (Number.isNaN(lng)) errors.lng = "Longitude must be between -180 and 180.";
  if ((lat == null) !== (lng == null)) errors.lat = "Give both a latitude and a longitude, or neither.";
  const prefixes = (v.prefixes ?? "").split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const bad = prefixes.find((p) => !/^[A-Z]{1,2}$/.test(p));
  if (bad) errors.prefixes = `"${bad}" is not a postcode prefix — use one or two letters, e.g. SW or EC.`;
  const intro = (v.intro ?? "").trim();
  return { errors, ok: Object.keys(errors).length === 0, value: { name, slug, status: v.status, intro: intro || null, lat: lat ?? null, lng: lng ?? null, postcodePrefixes: prefixes.length ? JSON.stringify([...new Set(prefixes)]) : null } };
}

export function validateArea(v: { name: string; slug: string; kind: string; intro?: string | null; parentId?: string | null }) {
  const errors: Record<string, string> = {};
  const name = v.name.trim(), slug = slugify(v.slug || v.name);
  if (name.length < 2 || name.length > 60) errors.name = "Enter the area name (2–60 characters).";
  if (!slug) errors.slug = "Enter a web address for the area.";
  if (!["BOROUGH", "NEIGHBOURHOOD"].includes(v.kind)) errors.kind = "Choose borough or neighbourhood.";
  if (v.kind === "NEIGHBOURHOOD" && !v.parentId) errors.parentId = "Choose the borough this neighbourhood sits in.";
  if (v.kind === "BOROUGH" && v.parentId) errors.parentId = "Boroughs don't sit inside another area.";
  return { errors, ok: Object.keys(errors).length === 0, value: { name, slug, kind: v.kind, intro: (v.intro ?? "").trim() || null, parentId: v.kind === "NEIGHBOURHOOD" ? v.parentId! : null } };
}

/** Coverage per city, for the admin dashboard: how much real content exists and how much of it can be indexed. */
export async function cityCoverage() {
  const [cities, areas, biz, arts, team] = await Promise.all([
    browsableCities(),
    db.location.groupBy({ by: ["cityId", "kind"], _count: { _all: true } }),
    db.business.groupBy({ by: ["cityId"], where: { published: true, isSample: false }, _count: { _all: true } }),
    db.article.groupBy({ by: ["cityId"], where: { status: "PUBLISHED", isSample: false }, _count: { _all: true } }),
    db.cityEditor.groupBy({ by: ["cityId"], _count: { _all: true } }),
  ]);
  const withIntro = await db.location.groupBy({ by: ["cityId"], where: { intro: { not: null } }, _count: { _all: true } });
  const n = (rows: { cityId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.cityId === id)?._count._all ?? 0;
  return cities.map((c) => ({
    city: c,
    boroughs: areas.filter((a) => a.cityId === c.id && a.kind === "BOROUGH").reduce((s, a) => s + a._count._all, 0),
    neighbourhoods: areas.filter((a) => a.cityId === c.id && a.kind === "NEIGHBOURHOOD").reduce((s, a) => s + a._count._all, 0),
    areasWithIntro: n(withIntro, c.id),
    businesses: n(biz, c.id),
    articles: n(arts, c.id),
    team: n(team, c.id),
  }));
}
