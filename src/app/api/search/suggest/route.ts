import { NextResponse } from "next/server";
import { ipHash } from "@/lib/antispam";
import { suggest } from "@/lib/search";

export const dynamic = "force-dynamic";

// crude per-visitor limiter (single instance): 90 requests / minute
const hits = new Map<string, { n: number; reset: number }>();

export async function GET(req: Request) {
  const key = await ipHash();
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 });
  else if (++h.n > 90) return NextResponse.json([], { status: 429, headers: { "Retry-After": "30" } });
  if (hits.size > 5000) hits.clear();
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  return NextResponse.json(await suggest(q), { headers: { "Cache-Control": "no-store" } });
}
