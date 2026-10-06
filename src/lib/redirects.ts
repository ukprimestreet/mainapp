import { permanentRedirect } from "next/navigation";
import { SITE } from "./constants";
import { db } from "./db";

const RESERVED = ["/admin", "/owner", "/_next", "/api", "/claim/status", "/reviews/manage"];

/** Canonical form used as the redirect key: leading slash, no query/hash, no trailing slash, lower-case. */
export function normalisePath(input: string): string {
  let p = input.trim();
  try { if (/^https?:\/\//i.test(p)) { const u = new URL(p); if (u.host !== new URL(SITE.url).host) return ""; p = u.pathname; } } catch { return ""; }
  p = p.split("#")[0].split("?")[0].replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.toLowerCase();
}

export type RedirectCheck = { ok: true; from: string; to: string } | { ok: false; error: string };
/** Validates a redirect. Only same-site targets are allowed (no open redirects); loops and self-redirects are refused. */
export async function checkRedirect(fromRaw: string, toRaw: string): Promise<RedirectCheck> {
  const from = normalisePath(fromRaw), to = normalisePath(toRaw);
  if (!from || from === "/") return { ok: false, error: "“From” must be a path on this site, e.g. /old-page" };
  if (!to) return { ok: false, error: "“To” must be a path on this site (external URLs aren't allowed)" };
  if (RESERVED.some((r) => from === r || from.startsWith(r + "/"))) return { ok: false, error: "That path can't be redirected" };
  if (from === to) return { ok: false, error: "A page can't redirect to itself" };
  // loop detection: follow the chain from `to`
  let cur = to;
  for (let i = 0; i < 10; i++) {
    if (cur === from) return { ok: false, error: "That would create a redirect loop" };
    const next = await db.redirect.findUnique({ where: { fromPath: cur } });
    if (!next) break;
    cur = next.toPath;
  }
  return { ok: true, from, to };
}

/** Creates/updates a redirect and collapses chains (anything that pointed at `from` now points straight at `to`). */
export async function createRedirect(fromRaw: string, toRaw: string, note?: string): Promise<RedirectCheck> {
  const c = await checkRedirect(fromRaw, toRaw);
  if (!c.ok) return c;
  await db.$transaction([
    db.redirect.upsert({ where: { fromPath: c.from }, create: { fromPath: c.from, toPath: c.to, note: note || null }, update: { toPath: c.to, note: note || null } }),
    db.redirect.updateMany({ where: { toPath: c.from }, data: { toPath: c.to } }),
  ]);
  return c;
}

/** Final destination for a path if it has been moved (follows chains, max 5 hops). */
export async function resolveRedirect(pathRaw: string): Promise<string | null> {
  let cur = normalisePath(pathRaw), hit: string | null = null;
  for (let i = 0; i < 5; i++) {
    const r = await db.redirect.findUnique({ where: { fromPath: cur } });
    if (!r) break;
    hit = r.toPath; cur = r.toPath;
  }
  return hit && hit !== normalisePath(pathRaw) ? hit : null;
}

/** Call right before notFound(): if the URL was moved, send a permanent redirect (308) instead of a 404. */
export async function redirectIfMoved(path: string) {
  const to = await resolveRedirect(path);
  if (!to) return;
  await db.redirect.update({ where: { fromPath: normalisePath(path) }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {});
  permanentRedirect(to);
}
