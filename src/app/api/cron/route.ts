import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ensureAutomations, runAllEnabled } from "@/lib/automations";
import { runLeadNotifications } from "@/lib/lead-notify";
import { ftsPrune } from "@/lib/search/fts";
import { encryptionStatus } from "@/lib/secretbox";
import { mailConfigured, SUPPORT_EMAIL } from "@/lib/mail";

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

  /**
   * Lead notification and escalation. **Not** gated on the automation toggles above: these are
   * transactional. A business that has paid for a job must be told it has one, and a customer waiting on a
   * tradesperson must be told where they stand, whether or not anybody has switched a marketing rule on.
   *
   * Wrapped in its own catch so a failure here cannot stop the housekeeping below, or vice versa.
   */
  const leads = await runLeadNotifications().catch((e) => {
    errors.push(`leadNotifications: ${String(e)}`);
    return null;
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
        detail: [
          `${results.length} automation(s), ${sent} sent, ${skipped} skipped`,
          leads ? `leads: ${leads.notified.sent} notified, ${leads.chased.sent} chased, ${leads.escalated.taken} taken back (${leads.escalated.reassigned} reassigned), ${leads.customers.sent} customers told` : "leads: failed",
          `${pruned} search rows pruned`,
          errors.length ? `${errors.length} error(s)` : null,
        ].filter(Boolean).join(" · "),
      },
    })
    .catch(() => {});

  return NextResponse.json({
    ok: errors.length === 0,
    ms: Date.now() - started,
    // Configuration an operator otherwise has no way to check: this route is the only authenticated endpoint
    // reachable without the admin password. No secret is echoed — only whether each one is usable.
    config: { encryption: encryptionStatus(), email: mailConfigured() ? "configured" : "records only", support: SUPPORT_EMAIL() },
    sent,
    skipped,
    pruned,
    leads,
    automations: results.map((r) => ({ key: r.key, sent: r.sent, skipped: r.skipped, error: r.error })),
    errors,
  });
}
