import { db } from "./db";
import { normalisePostcode } from "./geo";
import type { Address } from "./address";

/**
 * Turns a postcode into a place in our tree — as a SUGGESTION the user confirms, never a silent assignment.
 *
 * Two sources, each doing only what it is good at:
 *   - postcodes.io (free)        -> the GSS codes. Everything matches on those, because one in five English
 *                                   place names is ambiguous and a name is not an identifier.
 *   - Ideal Postcodes (paid)     -> the list of real addresses. Called separately, by lib/address.ts.
 *
 * The locality is the hard part and is treated as such: postcodes.io returns a WARD, not a neighbourhood.
 * For RM10 7AA it gives "Eastbrook & Rush Green", not "Dagenham Dock". So the ward is used for the
 * administrative chain, and nearby settlements are offered as CANDIDATES ranked by distance for the person
 * to pick from. Nothing infers a locality from postcode text.
 */

const PC_BASE = () => (process.env.POSTCODES_API_BASE ?? "https://api.postcodes.io").replace(/\/$/, "");

/**
 * ONS spells four local authorities in a way Royal Mail PAF will not reproduce. Hand-checked against the
 * imported tree; used only by the name-matching fallback, never by the GSS path.
 */
export const LAD_NAME_ALIASES: Record<string, string> = {
  "Bristol": "Bristol, City of",
  "City of Bristol": "Bristol, City of",
  "Herefordshire": "Herefordshire, County of",
  "Kingston upon Hull": "Kingston upon Hull, City of",
  "Hull": "Kingston upon Hull, City of",
  "Bournemouth": "Bournemouth, Christchurch and Poole",
  "Christchurch": "Bournemouth, Christchurch and Poole",
  "Poole": "Bournemouth, Christchurch and Poole",
};

export type PlaceRef = { id: string; name: string; label: string; kind: string; gssCode: string | null };
export type Resolution = {
  postcode: string;
  /** Country -> region -> county -> authority -> ward, as far as we could establish it. Matched on GSS codes. */
  chain: PlaceRef[];
  /** The authority, which is what service areas and matching actually hang off. */
  authority: PlaceRef | null;
  ward: PlaceRef | null;
  /** Settlements near the postcode, nearest first, for the person to choose from. Never auto-selected. */
  localityCandidates: (PlaceRef & { distanceKm: number; population: number | null })[];
  lat: number | null;
  lng: number | null;
  /** How the authority was established. "gss" is trustworthy; "name" is a fallback; "none" means ask. */
  via: "gss" | "name" | "none";
  warnings: string[];
};

const ref = (p: { id: string; name: string; label: string; kind: string; gssCode: string | null }): PlaceRef =>
  ({ id: p.id, name: p.name, label: p.label, kind: p.kind, gssCode: p.gssCode });

type PostcodeIo = {
  country?: string; region?: string; admin_district?: string; admin_ward?: string;
  longitude?: number; latitude?: number;
  codes?: { admin_district?: string; admin_ward?: string; admin_county?: string };
};

async function postcodesIo(postcode: string): Promise<PostcodeIo | null> {
  try {
    const r = await fetch(`${PC_BASE()}/postcodes/${encodeURIComponent(postcode)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: PostcodeIo };
    return j.result ?? null;
  } catch { return null; }
}

/** Walks up the tree so the chain can be shown to a person in full. */
async function ancestry(placeId: string): Promise<PlaceRef[]> {
  const chain: PlaceRef[] = [];
  let id: string | null = placeId;
  for (let depth = 0; id && depth < 8; depth++) {
    const p: { id: string; name: string; label: string; kind: string; gssCode: string | null; parentId: string | null } | null =
      await db.place.findUnique({ where: { id }, select: { id: true, name: true, label: true, kind: true, gssCode: true, parentId: true } });
    if (!p) break;
    chain.unshift(ref(p));
    id = p.parentId;
  }
  return chain;
}

const EARTH = 6371;
const toRad = (x: number) => (x * Math.PI) / 180;
const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
};

/**
 * `address` is optional: when a business has already picked one from the paid lookup, its district and ward
 * sharpen the result and its coordinates are the building rather than the postcode centroid.
 */
export async function resolvePostcode(input: string, address?: Address | null): Promise<Resolution | null> {
  const postcode = normalisePostcode(input);
  if (!postcode) return null;

  const io = await postcodesIo(postcode);
  const warnings: string[] = [];

  let authority: PlaceRef | null = null;
  let via: Resolution["via"] = "none";

  // 1. GSS code. The only trustworthy route.
  const ladCode = io?.codes?.admin_district;
  if (ladCode && ladCode !== "E99999999") {
    const p = await db.place.findFirst({ where: { gssCode: ladCode }, select: { id: true, name: true, label: true, kind: true, gssCode: true } });
    if (p) { authority = ref(p); via = "gss"; }
    else warnings.push(`The postcode resolves to authority ${ladCode}, which is not in our geography yet.`);
  }

  // 2. Fallback: match the authority NAME, applying the four hand-checked ONS spellings. Lower confidence,
  //    and recorded as such, because a name is not an identifier.
  if (!authority) {
    const raw = address?.district || io?.admin_district || "";
    const name = LAD_NAME_ALIASES[raw] ?? raw;
    if (name) {
      const p = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name }, select: { id: true, name: true, label: true, kind: true, gssCode: true } });
      if (p) {
        authority = ref(p); via = "name";
        warnings.push(`Matched "${name}" by name because no official code was available. Please confirm it is right.`);
      }
    }
  }

  // 3. Ward, only ever inside an identified authority: 6,428 distinct names across 6,834 wards, so a ward
  //    name on its own does not identify anything.
  let ward: PlaceRef | null = null;
  const wardCode = io?.codes?.admin_ward;
  if (wardCode && wardCode !== "E99999999") {
    const w = await db.place.findFirst({ where: { gssCode: wardCode }, select: { id: true, name: true, label: true, kind: true, gssCode: true } });
    if (w) ward = ref(w);
  }
  if (!ward && authority && (address?.ward || io?.admin_ward)) {
    const w = await db.place.findFirst({
      where: { kind: "WARD", name: address?.ward || io?.admin_ward || "", parentId: authority.id },
      select: { id: true, name: true, label: true, kind: true, gssCode: true },
    });
    if (w) ward = ref(w);
  }

  const lat = address?.lat ?? io?.latitude ?? null;
  const lng = address?.lng ?? io?.longitude ?? null;

  // 4. Localities as CANDIDATES, nearest first. The brief is explicit that a locality must not be inferred,
  //    and postcodes.io gives a ward rather than a neighbourhood, so this is a list to choose from.
  let localityCandidates: Resolution["localityCandidates"] = [];
  if (lat != null && lng != null) {
    // A coarse bounding box first so this is an index-friendly query rather than a scan of 43,000 rows.
    const dLat = 0.09; // ~10km
    const dLng = 0.09 / Math.max(0.2, Math.cos(toRad(lat)));
    const near = await db.place.findMany({
      where: {
        kind: { in: ["TOWN", "SUBURB", "LOCALITY"] }, active: true,
        lat: { gte: lat - dLat, lte: lat + dLat },
        lng: { gte: lng - dLng, lte: lng + dLng },
        ...(authority ? { OR: [{ parentId: authority.id }, {}] } : {}),
      },
      select: { id: true, name: true, label: true, kind: true, gssCode: true, lat: true, lng: true, population: true, parentId: true },
      take: 400,
    });
    localityCandidates = near
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ ...ref(p), distanceKm: Math.round(distanceKm(lat, lng, p.lat!, p.lng!) * 10) / 10, population: p.population, inAuthority: p.parentId === authority?.id }))
      .sort((a, b) =>
        // Inside the identified authority first, then nearest, then larger.
        Number(b.inAuthority) - Number(a.inAuthority) || a.distanceKm - b.distanceKm || (b.population ?? 0) - (a.population ?? 0))
      .slice(0, 8)
      .map(({ inAuthority: _drop, ...rest }) => rest);
  }

  if (!authority) warnings.push("We could not work out which council area this postcode is in. Please choose your area by hand.");
  if (localityCandidates.length === 0) warnings.push("We found no nearby named areas to suggest. Please choose yours by hand.");

  return {
    postcode,
    chain: authority ? await ancestry(ward?.id ?? authority.id) : [],
    authority, ward, localityCandidates, lat, lng, via, warnings,
  };
}
