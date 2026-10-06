// Saved + recently viewed businesses. Stored in first-party *functional* cookies (a list of business ids) so pages can render
// server-side. No account, no tracking, no analytics: the ids never leave the visitor's browser except as the cookie sent to our own pages.
export const SAVED_COOKIE = "ps_saved", RECENT_COOKIE = "ps_recent";
export const MAX_SAVED = 50, MAX_RECENT = 12;
const ID_RE = /^[a-z0-9]{20,32}$/;

export function parseIds(raw: string | undefined | null, max: number): string[] {
  if (!raw) return [];
  return [...new Set(decodeURIComponent(raw).split(",").map((s) => s.trim()).filter((s) => ID_RE.test(s)))].slice(0, max);
}
export const serialiseIds = (ids: string[]) => encodeURIComponent(ids.join(","));

// ---- client-side helpers (only call in the browser) ----
export function readCookie(name: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.slice(name.length + 1);
}
export function writeCookie(name: string, ids: string[]) {
  document.cookie = `${name}=${serialiseIds(ids)}; Max-Age=${365 * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
export const getSaved = () => parseIds(readCookie(SAVED_COOKIE), MAX_SAVED);
export function toggleSaved(id: string): boolean {
  const cur = getSaved();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, MAX_SAVED);
  writeCookie(SAVED_COOKIE, next);
  return next.includes(id);
}
export function pushRecent(id: string) {
  const cur = parseIds(readCookie(RECENT_COOKIE), MAX_RECENT).filter((x) => x !== id);
  writeCookie(RECENT_COOKIE, [id, ...cur].slice(0, MAX_RECENT));
}
