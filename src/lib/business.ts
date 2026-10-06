import { db } from "./db";

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Normalised name used for duplicate detection: lowercase, no punctuation, no legal suffixes. */
export const normName = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/\b(ltd|limited|llp|plc|london|the)\b/g, " ").replace(/[^a-z0-9]+/g, "");

export function websiteHost(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

export const normPhone = (p?: string | null) => (p ?? "").replace(/[^\d]/g, "").replace(/^(44|0044)/, "0");

/** Only http(s) URLs are ever stored/rendered as links. */
export function safeUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null; // "javascript:1" must not parse as host:port
    return u.toString();
  } catch { return null; }
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "business";
  let slug = base, n = 2;
  while (await db.business.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

export type DupeProbe = { name: string; locationId: string; phone?: string | null; website?: string | null };
/** Returns the existing business that looks like the same one, if any. */
export async function findDuplicate(p: DupeProbe) {
  const host = websiteHost(p.website);
  const phone = normPhone(p.phone);
  const byName = await db.business.findFirst({ where: { normName: normName(p.name), locationId: p.locationId } });
  if (byName) return { business: byName, reason: "same name in same area" };
  if (host) {
    const b = await db.business.findFirst({ where: { websiteHost: host } });
    if (b) return { business: b, reason: `same website (${host})` };
  }
  if (phone.length >= 9) {
    const cands = await db.business.findMany({ where: { phone: { not: null } }, select: { id: true, name: true, phone: true, slug: true } });
    const hit = cands.find((c) => normPhone(c.phone) === phone);
    if (hit) return { business: hit, reason: "same phone number" };
  }
  return null;
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "yahoo.com", "yahoo.co.uk", "icloud.com", "live.com", "live.co.uk", "aol.com", "proton.me", "protonmail.com", "btinternet.com", "sky.com"]);
/** True when the claimant's email is on the business's own website domain (a proof of control, not a free-mail address). */
export function domainMatches(email: string, host: string | null | undefined) {
  const dom = email.split("@")[1]?.toLowerCase();
  return !!(dom && host && !FREE_MAIL.has(dom) && (dom === host || dom.endsWith(`.${host}`)));
}
