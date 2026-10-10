import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { RULES, ensureAutomations, manualOnly, runAutomation } from "@/lib/automations";
import { bizById } from "@/lib/email/business-templates";
import { mailConfigured } from "@/lib/mail";
import { db } from "@/lib/db";
import { dryRun, pauseAll, runNow, setCap, toggleAutomation } from "../../automation-actions";

export const dynamic = "force-dynamic";

export default async function Automations({ searchParams }: { searchParams: Promise<{ msg?: string; preview?: string }> }) {
  const { msg, preview } = await searchParams;
  const rows = await ensureAutomations();
  const [recent, totalSent] = await Promise.all([
    db.automationRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    db.automation.aggregate({ _sum: { totalSent: true } }),
  ]);
  const live = rows.filter((r) => r.enabled);
  // Whether anything actually runs on a schedule, rather than only when an admin presses a button.
  const cronReady = (process.env.CRON_SECRET ?? "").length >= 16;
  const lastCron = await db.auditLog.findFirst({ where: { action: "Daily job ran" }, orderBy: { createdAt: "desc" } });
  // A dry run on demand, so the admin can see the actual recipients before switching anything on.
  const previewed = preview ? await runAutomation(preview, { dryRun: true }) : null;

  return (
    <>
      <PageHead
        title="Automations"
        subtitle="The lifecycle programme. Every rule is off until you turn it on, obeys a per-run cap, and never emails the same person the same thing twice."
        actions={live.length > 0 ? <form action={pauseAll}><button className={btn("danger")}>Stop everything</button></form> : undefined}
      />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}
      {!mailConfigured() && (
        <Notice tone="warn" title="Nothing can send yet">
          Email is not configured, so even an enabled automation will only record to the outbox.{" "}
          <Link href="/admin/outbox" className="font-bold underline">See why</Link>.
        </Notice>
      )}

      {!cronReady && (
        <Notice tone="warn" title="Nothing runs on its own yet">
          The daily job at <strong>/api/cron</strong> refuses to run until <strong>CRON_SECRET</strong> is set (32 characters or
          more) in the environment. Until then an enabled automation only sends when you press <em>Run now</em> here. That is a
          deliberate refusal: an unprotected endpoint would let anyone on the internet trigger a send.
        </Notice>
      )}
      {cronReady && lastCron && (
        <Notice tone="good" title="The daily job is running">
          Last run {lastCron.createdAt.toLocaleString("en-GB")} — {lastCron.detail}
        </Notice>
      )}
      {cronReady && !lastCron && (
        <Notice tone="info" title="The daily job is configured but has not run yet">
          It is scheduled for 09:30 UTC. Nothing will send before then unless you run a rule by hand.
        </Notice>
      )}

      <MetricRow cols={4}>
        <Metric label="Rules built" value={RULES.length} icon="bolt" />
        <Metric label="Switched on" value={live.length} icon="check" tone={live.length ? "accent" : "plain"} hint={live.length ? "Sending" : "Nothing is sending"} />
        <Metric label="Sent all time" value={totalSent._sum.totalSent ?? 0} icon="mail" />
        <Metric label="Manual only" value={manualOnly().length} icon="pen" hint="Templates with no rule yet" />
      </MetricRow>

      {previewed && (
        <Card title={`Dry run: ${previewed.key}`} description="Exactly who would receive this. Nothing was sent.">
          {previewed.candidates.length === 0 ? (
            <Empty title="Nobody matches right now" icon="check">That is normal — the conditions simply are not met today.</Empty>
          ) : (
            <Table head={["Would email", "Why they match"]}>
              {previewed.candidates.map((c, i) => (
                <Row key={i}>
                  <Cell className="font-semibold [overflow-wrap:anywhere]">{c.email}</Cell>
                  <Cell className="text-grey">{c.label}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card title="Rules" description="Dry run first. It shows the real recipients without sending anything.">
        <Table head={["Automation", "When it fires", "State", "Cap", "Last run", ""]}>
          {rows.map((r) => {
            const tpl = bizById(r.key);
            return (
              <Row key={r.key}>
                <Cell>
                  <p className="font-semibold">{tpl?.name ?? r.key}</p>
                  <p className="text-[12px] text-grey">{tpl?.goal}</p>
                  {r.lastError && <p className="mt-1 text-[12px] font-bold text-red-800">{r.lastError}</p>}
                </Cell>
                <Cell className="max-w-xs text-grey">{tpl?.trigger}</Cell>
                <Cell>
                  <form action={toggleAutomation}>
                    <input type="hidden" name="key" value={r.key} />
                    <input type="hidden" name="enabled" value={r.enabled ? "0" : "1"} />
                    <button className="inline-flex items-center gap-2">
                      <Chip tone={r.enabled ? "live" : "draft"}>{r.enabled ? "On" : "Off"}</Chip>
                      <span className="text-[12px] font-bold underline">{r.enabled ? "Turn off" : "Turn on"}</span>
                    </button>
                  </form>
                </Cell>
                <Cell>
                  <form action={setCap} className="flex items-center gap-1">
                    <input type="hidden" name="key" value={r.key} />
                    <input name="dailyCap" defaultValue={r.dailyCap} inputMode="numeric" className={`${field} !min-h-9 w-16 !px-2 text-sm`} aria-label={`Send cap for ${tpl?.name ?? r.key}`} />
                    <button className="text-[12px] font-bold underline">Set</button>
                  </form>
                </Cell>
                <Cell className="whitespace-nowrap text-grey">
                  {r.lastRunAt ? <>{fmtDate(r.lastRunAt)}<br /><span className="text-[12px]">{r.lastSent} sent</span></> : "never"}
                </Cell>
                <Cell>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <form action={dryRun}><input type="hidden" name="key" value={r.key} /><button className="font-bold underline">Dry run</button></form>
                    <form action={runNow}><input type="hidden" name="key" value={r.key} /><button className="font-bold underline disabled:opacity-40" disabled={!r.enabled}>Run now</button></form>
                  </div>
                </Cell>
              </Row>
            );
          })}
        </Table>
      </Card>

      {manualOnly().length > 0 && (
        <Card title="Sent by hand" description="Part of the programme, but no rule fires them yet. Listed so the gap is visible rather than forgotten.">
          <ul className="flex flex-wrap gap-2">
            {manualOnly().map((t) => (
              <li key={t.id}><Chip tone="quiet">{t.name}</Chip></li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Run history">
        {recent.length === 0 ? (
          <Empty title="Nothing has run yet" icon="bolt">Dry run a rule to see what it would do.</Empty>
        ) : (
          <Table head={["Automation", "Type", "Sent", "Skipped", "When", "By"]}>
            {recent.map((h) => (
              <Row key={h.id}>
                <Cell className="font-semibold">{bizById(h.key)?.name ?? h.key}</Cell>
                <Cell>{h.dryRun ? <Chip tone="quiet">Dry run</Chip> : <Chip tone="live">Live</Chip>}</Cell>
                <Cell className="font-display font-extrabold tabular-nums">{h.sent}</Cell>
                <Cell className="tabular-nums text-grey">{h.skipped}</Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(h.startedAt)}</Cell>
                <Cell className="text-grey">{h.byAdmin ?? "—"}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
