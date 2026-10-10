import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ensureAutomations, runAllEnabled } from "@/lib/automations";
import { ftsPrune } from "@/lib/search/fts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The daily job. It runs only the automations an admin has explicitly switched on, and every one of those has
 * its own per-run cap and its own deduplication, so a cron that fires twice cannot email anyone twice.
 *
 * Authentication: Vercel sends CRON_SECRET as a bearer token. Without that variable set the route refuses to
 * run at all rather than falling back to being open — an open endpoint here would let anyone on the internet
 * trigger a marketing send.
 */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    // Deliberately the same answer whether the secret is wrong or simply not configured.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const started = Date.now();
  const errors: string[] = [];

  await ensureAutomations().catch((e) => errors.push(`ensureAutomations: ${String(e)}`));
  const results = await runAllEnabled("cron").catch((e) => {
    errors.push(`runAllEnabled: ${String(e)}`);
    return [] as Awaited<ReturnType<typeof runAllEnabled>>;
  });

  // Housekeeping that has to happen somewhere: drop search rows whose document is gone.
  const pruned = await ftsPrune().catch((e) => {
    errors.push(`ftsPrune: ${String(e)}`);
    return 0;
  });

  const sent = results.reduce((n, r) => n + r.sent, 0);
  const skipped = results.reduce((n, r) => n + r.skipped, 0);
  for (const r of results) if (r.error) errors.push(`${r.key}: ${r.error}`);

  await db.auditLog
    .create({
      data: {
        action: "Daily job ran",
        targetType: "System",
        targetId: new Date().toISOString().slice(0, 10),
        detail: `${results.length} automation(s), ${sent} sent, ${skipped} skipped, ${pruned} search rows pruned${errors.length ? `, ${errors.length} error(s)` : ""}`,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    ok: errors.length === 0,
    ms: Date.now() - started,
    sent,
    skipped,
    pruned,
    automations: results.map((r) => ({ key: r.key, sent: r.sent, skipped: r.skipped, error: r.error })),
    errors,
  });
}
