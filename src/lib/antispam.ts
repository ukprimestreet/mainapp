import { createHash, createHmac, randomBytes } from "crypto";
import { headers } from "next/headers";

const secret = () => process.env.SESSION_SECRET || "dev-only-secret";
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Hash of the client IP (never store raw IPs). */
export async function ipHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
  return sha256(`${secret()}|${ip}`).slice(0, 32);
}

/** Signed render timestamp: submissions that arrive impossibly fast (bots) or stale are refused. */
export function formToken(now = Date.now()) {
  const ts = String(now);
  return `${ts}.${createHmac("sha256", secret()).update(ts).digest("base64url")}`;
}
export function checkFormToken(token: string, opts: { minMs?: number; maxMs?: number; now?: number } = {}): "ok" | "too-fast" | "stale" | "invalid" {
  const { minMs = 4000, maxMs = 4 * 3600_000, now = Date.now() } = opts;
  const [ts, sig] = token.split(".");
  if (!ts || !sig || sig !== createHmac("sha256", secret()).update(ts).digest("base64url")) return "invalid";
  const age = now - Number(ts);
  return age < minMs ? "too-fast" : age > maxMs ? "stale" : "ok";
}

export const newToken = () => randomBytes(24).toString("base64url");

const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "throwawaymail.com", "dispostable.com"]);
export const isDisposableEmail = (email: string) => DISPOSABLE.has(email.split("@")[1]?.toLowerCase() ?? "");
