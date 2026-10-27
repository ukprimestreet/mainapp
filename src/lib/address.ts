import { db } from "./db";
import { isOutcode, normalisePostcode } from "./geo";

/**
 * Ideal Postcodes (Royal Mail PAF): the list of real addresses at a postcode.
 *
 * SERVER ONLY. The key must never reach the browser — it is not URL-restricted, so anyone holding it can
 * spend against the account. Address autocomplete goes through our own route handler for that reason.
 *
 * Every call costs money, so the order of checks here is deliberate: validate the postcode shape locally,
 * then the free test postcodes, then the caps, and only then spend. A lookup that was never going to
 * succeed must not be paid for.
 *
 * PAF is licensed data. We record THAT a lookup happened — never the addresses it returned. Only the
 * address a business actually selects is stored, against that business. See docs/leadgen/ADDRESS_LOOKUP.md.
 */

const BASE = () => (process.env.IDEAL_POSTCODES_BASE ?? "https://api.ideal-postcodes.co.uk/v1").replace(/\/$/, "");
const key = () => process.env.IDEAL_POSTCODES_KEY ?? "";
export const addressLookupConfigured = () => key().length > 10;

/** Their free test postcodes: full schema, no charge. Every test and e2e suite uses these. */
export const TEST_POSTCODES = new Set(["ID1 1QD", "ID1 KFA", "ID1 CLIP", "ID1 UMPRN", "ID1 0LLA"]);

/** Spend controls. Deliberately low; raise them when there is evidence they are too tight. */
export const LOOKUP_CAPS = { perIpPerHour: 20, perIpPerDay: 60, siteWidePerDay: 2000 };

export type Address = {
  id: string;
  line1: string; line2: string; line3: string;
  postTown: string; postcode: string;
  county: string; district: string; ward: string; country: string;
  udprn: string; uprn: string;
  lat: number | null; lng: number | null;
  /** A single line, how a person would write it. */
  summary: string;
};

export type LookupResult =
  | { ok: true; addresses: Address[]; postcode: string; free: boolean }
  | { ok: false; reason: "invalid" | "not-found" | "capped" | "unconfigured" | "error"; message: string };

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toAddress(r: Raw): Address {
  const line1 = str(r.line_1), line2 = str(r.line_2), line3 = str(r.line_3);
  const postTown = str(r.post_town), postcode = str(r.postcode);
  return {
    id: str(r.id) || `udprn_${str(r.udprn)}`,
    line1, line2, line3,
    postTown, postcode,
    county: str(r.county), district: str(r.district), ward: str(r.ward), country: str(r.country),
    udprn: str(r.udprn), uprn: str(r.uprn),
    lat: num(r.latitude), lng: num(r.longitude),
    // Title-case the post town: PAF shouts it ("LONDON"), which looks like an error in a form field.
    summary: [line1, line2, line3, postTown.replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()), postcode]
      .filter(Boolean).join(", "),
  };
}

async function record(postcode: string, ipHash: string, results: number, free: boolean, ok: boolean, error?: string) {
  // Never fail a lookup because the bookkeeping failed.
  await db.addressLookup.create({ data: { postcode, ipHash, results, free, ok, error: error ?? null } }).catch(() => {});
}

/** Have the caps been reached? Checked before spending, not after. */
export async function lookupAllowance(ipHash: string) {
  const now = Date.now();
  let hour = 0, day = 0, site = 0;
  try {
    [hour, day, site] = await Promise.all([
      db.addressLookup.count({ where: { ipHash, free: false, createdAt: { gte: new Date(now - 3600_000) } } }),
      db.addressLookup.count({ where: { ipHash, free: false, createdAt: { gte: new Date(now - 86400_000) } } }),
      db.addressLookup.count({ where: { free: false, createdAt: { gte: new Date(now - 86400_000) } } }),
    ]);
  } catch {
    // The accounting table is unavailable. If spend cannot be counted it is not spent: an uncapped paid API
    // is a bill nobody authorised. The caller offers manual selection instead.
    return { allowed: false as const, reason: "spend cannot be accounted for at the moment" };
  }
  if (hour >= LOOKUP_CAPS.perIpPerHour) return { allowed: false as const, reason: `hourly limit (${LOOKUP_CAPS.perIpPerHour})` };
  if (day >= LOOKUP_CAPS.perIpPerDay) return { allowed: false as const, reason: `daily limit (${LOOKUP_CAPS.perIpPerDay})` };
  if (site >= LOOKUP_CAPS.siteWidePerDay) return { allowed: false as const, reason: `site-wide daily limit (${LOOKUP_CAPS.siteWidePerDay})` };
  return { allowed: true as const, used: { hour, day, site } };
}

/**
 * Addresses at a postcode. `ipHash` is used for the spend caps and is stored; the raw IP never is.
 */
export async function lookupAddresses(input: string, ipHash = ""): Promise<LookupResult> {
  const postcode = normalisePostcode(input);

  // 1. Shape first. An outcode ("E8") has no address list, and neither does a typo — do not pay to find out.
  if (!postcode) {
    const hint = isOutcode(input)
      ? "That is only the first half of a postcode. Enter the full one, for example E8 3AA."
      : "That does not look like a UK postcode.";
    await record(input.slice(0, 12), ipHash, 0, true, false, "invalid shape");
    return { ok: false, reason: "invalid", message: hint };
  }

  if (!addressLookupConfigured()) {
    await record(postcode, ipHash, 0, true, false, "not configured");
    return { ok: false, reason: "unconfigured", message: "Address lookup is not available at the moment. You can choose your area by hand instead." };
  }

  // 2. Free test postcodes bypass the caps: they cost nothing, and tests must not be throttled.
  const free = TEST_POSTCODES.has(postcode);

  // 3. Caps before spending.
  if (!free) {
    const allowance = await lookupAllowance(ipHash);
    if (!allowance.allowed) {
      await record(postcode, ipHash, 0, true, false, `capped: ${allowance.reason}`);
      return { ok: false, reason: "capped", message: "Too many address lookups just now. Please choose your area by hand, or try again later." };
    }
  }

  try {
    const url = `${BASE()}/postcodes/${encodeURIComponent(postcode.replace(/\s/g, ""))}?api_key=${encodeURIComponent(key())}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    const body = (await r.json().catch(() => ({}))) as { code?: number; message?: string; result?: Raw[] };

    // 4040 is their "postcode not found", which is an answer rather than a failure.
    if (body.code === 4040 || (r.status === 404)) {
      await record(postcode, ipHash, 0, free, true, "not found");
      return { ok: false, reason: "not-found", message: `We could not find ${postcode}. Check it, or choose your area by hand.` };
    }
    if (!r.ok || !Array.isArray(body.result)) {
      await record(postcode, ipHash, 0, free, false, `${r.status} ${body.message ?? "unexpected response"}`);
      return { ok: false, reason: "error", message: "Address lookup is not responding. You can choose your area by hand instead." };
    }

    const addresses = body.result.map(toAddress).filter((a) => a.line1);
    await record(postcode, ipHash, addresses.length, free, true);
    return { ok: true, addresses, postcode, free };
  } catch (e) {
    await record(postcode, ipHash, 0, free, false, String(e).slice(0, 180));
    return { ok: false, reason: "error", message: "Address lookup timed out. You can choose your area by hand instead." };
  }
}

/** What we spent, for the admin money screen. */
export async function lookupSpend(days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [paid, free, failed] = await Promise.all([
    db.addressLookup.count({ where: { free: false, createdAt: { gte: since } } }),
    db.addressLookup.count({ where: { free: true, createdAt: { gte: since } } }),
    db.addressLookup.count({ where: { ok: false, createdAt: { gte: since } } }),
  ]);
  return { paid, free, failed, days };
}
