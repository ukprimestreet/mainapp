import { db } from "./db";

/**
 * Authors: their own accounts, profiles and social links.
 *
 * A social icon only ever renders when that link is present, so an author who gives only a Facebook page
 * shows exactly one icon. Links are validated against the expected host so a "LinkedIn" field cannot quietly
 * point somewhere else, and a bare handle ("@someone" or "someone") is accepted and expanded to the full URL.
 */
export const SOCIALS = {
  website: { label: "Website", hosts: [], handle: null, icon: "globe" },
  x: { label: "X", hosts: ["x.com", "twitter.com"], handle: "https://x.com/", icon: "x" },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], handle: "https://facebook.com/", icon: "facebook" },
  instagram: { label: "Instagram", hosts: ["instagram.com"], handle: "https://instagram.com/", icon: "instagram" },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"], handle: "https://linkedin.com/in/", icon: "linkedin" },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"], handle: "https://youtube.com/@", icon: "youtube" },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"], handle: "https://tiktok.com/@", icon: "tiktok" },
  threads: { label: "Threads", hosts: ["threads.net", "threads.com"], handle: "https://threads.net/@", icon: "threads" },
  bluesky: { label: "Bluesky", hosts: ["bsky.app"], handle: "https://bsky.app/profile/", icon: "bluesky" },
  mastodon: { label: "Mastodon", hosts: [], handle: null, icon: "mastodon" },
} as const;
export type SocialKey = keyof typeof SOCIALS;
export const SOCIAL_KEYS = Object.keys(SOCIALS) as SocialKey[];

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

/**
 * Normalise one social field. Returns the URL to store, null to clear it, or an error message.
 * Only https is accepted, so a javascript: or data: value can never reach the page.
 */
export function normaliseSocial(key: SocialKey, raw: string): { url: string | null } | { error: string } {
  const v = (raw ?? "").trim();
  if (!v) return { url: null };
  const def = SOCIALS[key];
  if (/^https?:\/\//i.test(v)) {
    if (!/^https:\/\//i.test(v)) return { error: `${def.label} must be an https link.` };
    const host = hostOf(v);
    if (!host) return { error: `${def.label} is not a valid link.` };
    if (def.hosts.length && !def.hosts.some((h) => host === h || host.endsWith("." + h))) {
      return { error: `That doesn't look like a ${def.label} link (expected ${def.hosts[0]}).` };
    }
    return { url: v.replace(/\s+/g, "") };
  }
  // A bare handle, e.g. "@primestreet" or "primestreet"
  if (!def.handle) return { error: `${def.label} needs a full https link.` };
  const handle = v.replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return { error: `${def.label} handle may only contain letters, numbers, dots, dashes and underscores.` };
  return { url: def.handle + handle };
}

/** The links an author has actually given, in display order — the only ones whose icons appear. */
export function activeSocials(a: Partial<Record<SocialKey, string | null>>) {
  return SOCIAL_KEYS.filter((k) => !!a[k]?.trim()).map((k) => ({ key: k, url: a[k]!.trim(), label: SOCIALS[k].label, icon: SOCIALS[k].icon }));
}

export const slugifyName = (s: string) =>
  s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(e);

const MAX_BIO = 1200;
/** Shared validation for the author profile form (used by the author's own panel and by admin). */
export function validateProfile(v: { name: string; role?: string; bio?: string; imageUrl?: string } & Partial<Record<SocialKey, string>>) {
  const errors: Record<string, string> = {};
  const name = (v.name ?? "").trim();
  if (name.length < 2 || name.length > 80) errors.name = "Enter your full name (2–80 characters).";
  const role = (v.role ?? "").trim();
  if (role.length > 80) errors.role = "Keep the job title under 80 characters.";
  const bio = (v.bio ?? "").trim();
  if (bio.length > MAX_BIO) errors.bio = `Keep the biography under ${MAX_BIO} characters.`;
  if (/<[a-z/]/i.test(bio) || /<[a-z/]/i.test(name)) errors.bio = "No HTML, please — plain text only.";

  const image = (v.imageUrl ?? "").trim();
  let imageUrl: string | null = null;
  if (image) {
    if (!/^https:\/\//i.test(image)) errors.imageUrl = "The portrait must be an https image URL.";
    else imageUrl = image;
  }
  const socials: Partial<Record<SocialKey, string | null>> = {};
  for (const k of SOCIAL_KEYS) {
    const r = normaliseSocial(k, (v as Record<string, string>)[k] ?? "");
    if ("error" in r) errors[k] = r.error; else socials[k] = r.url;
  }
  return { errors, ok: Object.keys(errors).length === 0, value: { name, role: role || null, bio: bio || null, imageUrl, ...socials } };
}

/** Authors with at least one published article — the ones whose profile pages are worth indexing. */
export const publishedAuthorWhere = { articles: { some: { status: "PUBLISHED", isSample: false, publishedAt: { lte: new Date() } } } };

export const authorByEmail = (email: string) => db.author.findUnique({ where: { email: normaliseEmail(email) } });

/** A slug that is free, derived from the name (adds -2, -3 … when taken). */
export async function freeSlug(name: string, exceptId?: string) {
  const base = slugifyName(name) || "author";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.author.findUnique({ where: { slug } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}
