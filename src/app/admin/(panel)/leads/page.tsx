import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { adminCan, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { demandWithoutSupply, leadCounts, providersFor, URGENCY } from "@/lib/leads";
import { LEAD_CLOSE_REASONS } from "@/lib/reasons";
import { closeLead, reopenLead, revealCustomer } from "../../lead-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — Admin", robots: { index: false, follow: false } };

const STATUS = {
  NEW: { label: "new", tone: "review" as const },
  UNASSIGNED: { label: "nobody to send it to", tone: "bad" as const },
  ESCALATED: { label: "escalated", tone: "bad" as const },
  SENT: { label: "sent", tone: "live" as const },
  CLOSED: { label: "closed", tone: "quiet" as const },
} as const;

/**
 * Customer job requests.
 *
 * Every request appears here the moment it exists, including the ones nobody can service — especially those.
 * Matching and assignment are Phase D; until then this is where a person picks up the work by hand, which is
 * the honest state of the system rather than a queue that silently fills.
 *
 * Contact details are not on the page. They are revealed one request at a time, through an audited action,
 * because `leads.customer_contact` is a permission and not a layout decision.
 */
export default async function Leads({ searchParams }: { searchParams: Promise<{ msg?: string; reveal?: string; show?: string }> }) {
  await requirePermission("leads.view");
  const { msg, reveal, show } = await searchParams;
  const all = show === "all";
  const maySeeContact = await adminCan("leads.customer_contact");
  const mayAssign = await adminCan("leads.assign");

  const [rows, counts, gaps] = await Promise.all([
    db.jobRequest.findMany({
      where: all ? {} : { status: { not: "CLOSED" } },
      orderBy: { createdAt: "asc" }, // oldest first: a queue sorted newest-first abandons its oldest items
      include: { category: { select: { name: true } }, place: { select: { label: true } } },
      take: 200,
    }),
    leadCounts(),
    demandWithoutSupply(8),
  ]);

  // Only on an explicit, audited reveal, and only ever one person's details at a time.
  const revealed = reveal && maySeeContact
    ? await db.jobRequest.findUnique({ where: { id: reveal }, include: { category: { select: { name: true } }, place: { select: { label: true } } } })
    : null;

  // Supply is re-counted now, not read from the row: `providersAtCreation` is a record of that moment, and
  // somebody may have registered since.
  const supplyNow = new Map(
    await Promise.all(rows.slice(0, 50).map(async (r) => [r.id, await providersFor(r.categoryId, r.placeId)] as const)),
  );

  const open = rows.filter((r) => r.status !== "CLOSED");
  const oldest = open[0];
  const waitingHours = oldest ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 3600_000) : 0;

  return (
    <>
      <PageHead
        title="Leads"
        subtitle="What customers have asked for. Nothing is matched automatically yet, so every one of these is waiting on a person."
        actions={<Link href={all ? "/admin/leads" : "/admin/leads?show=all"} className={btn("ghost")}>{all ? "Open only" : "Show closed too"}</Link>}
      />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow>
        <Metric label="Open" value={open.length} icon="inbox" tone={open.length ? "accent" : "plain"} />
        <Metric label="Nobody to send to" value={counts.unassigned} icon="shield" tone={counts.unassigned ? "warn" : "plain"} hint={counts.unassigned ? "A customer is waiting on supply we do not have" : "All serviceable"} />
        <Metric label="Last 24 hours" value={counts.today} icon="bolt" />
        <Metric label="Last 7 days" value={counts.week} icon="chart" hint={`${counts.total} all told`} />
      </MetricRow>

      {waitingHours >= 24 && (
        <Notice tone="warn" title="The oldest open request has been waiting more than a day">
          The form tells customers they will usually hear from a business within a working day. That promise is
          on the site, so it is ours to keep.
        </Notice>
      )}

      {gaps.length > 0 && (
        <Card title="Demand we could not service" description="Requests that arrived with nobody covering the area. Each row is a customer we disappointed — and the clearest signal of where recruiting a business pays for itself.">
          <Table head={["Trade", "Area", "Requests"]}>
            {gaps.map((g, i) => (
              <Row key={i}>
                <Cell><strong>{g.category}</strong></Cell>
                <Cell>{g.place}</Cell>
                <Cell className="tabular-nums">{g.requests}</Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      {revealed && (
        <Card title={`Customer — ${revealed.reference}`} description="This view has been recorded in the audit log, with your name against it. Close the page when you are done.">
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <div><dt className="font-bold">Name</dt><dd>{revealed.name}</dd></div>
            <div><dt className="font-bold">Phone</dt><dd className="font-mono">{revealed.phone}</dd></div>
            <div><dt className="font-bold">Email</dt><dd className="[overflow-wrap:anywhere]">{revealed.email}</dd></div>
            <div><dt className="font-bold">Best time to call</dt><dd>{revealed.contactTime ?? "Not given"}</dd></div>
            <div><dt className="font-bold">Postcode</dt><dd>{revealed.postcode ?? "Not given"}</dd></div>
            <div><dt className="font-bold">Marketing</dt><dd>{revealed.marketingOptIn ? "Opted in" : "Not opted in — do not email them anything else"}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold">The job</dt><dd className="whitespace-pre-line">{revealed.description}</dd></div>
            <div className="sm:col-span-2 text-[13px] text-grey">
              Consent recorded {fmtDate(revealed.consentAt)} against privacy notice version {revealed.consentVersion}.
            </div>
          </dl>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty title={all ? "No requests yet" : "Nothing open"} icon="check">
          {all
            ? "Nobody has used the quote form yet. It is live at /get-quotes."
            : "Every request has been dealt with."}
        </Empty>
      ) : (
        <div className="space-y-6">
          {rows.map((r) => {
            const status = STATUS[r.status as keyof typeof STATUS] ?? { label: r.status.toLowerCase(), tone: "quiet" as const };
            const now = supplyNow.get(r.id);
            return (
              <Card
                key={r.id}
                title={`${r.category.name} — ${r.place.label}`}
                description={`${r.reference} · received ${fmtDate(r.createdAt)}`}
              >
                <div className="flex flex-wrap gap-2">
                  <Chip tone={status.tone}>{status.label}</Chip>
                  <Chip tone={r.urgency === "EMERGENCY" ? "bad" : "quiet"}>{URGENCY[r.urgency as keyof typeof URGENCY] ?? r.urgency}</Chip>
                  <Chip tone={r.providersAtCreation ? "good" : "bad"}>
                    {r.providersAtCreation} covering when it arrived
                  </Chip>
                  {now !== undefined && now !== r.providersAtCreation && (
                    <Chip tone={now ? "good" : "bad"}>{now} covering now</Chip>
                  )}
                  {r.closedReason && <Chip tone="quiet">{LEAD_CLOSE_REASONS[r.closedReason as keyof typeof LEAD_CLOSE_REASONS] ?? r.closedReason}</Chip>}
                </div>

                <p className="mt-4 whitespace-pre-line text-[15px]">{r.description}</p>

                {r.providersAtCreation === 0 && now === 0 && r.status !== "CLOSED" && (
                  <p className="mt-4 text-[14px] text-grey">
                    Still nobody covering this. The customer was told as much on the form, so they are not
                    waiting on a promise — but they are waiting.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  {maySeeContact ? (
                    <form action={revealCustomer}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className={btn("ghost")}>Show customer details</button>
                    </form>
                  ) : (
                    <p className="text-[13px] text-grey">You do not have permission to see customer contact details.</p>
                  )}

                  {mayAssign && r.status !== "CLOSED" && (
                    <form action={closeLead} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="sr-only" htmlFor={`reason-${r.id}`}>Why are you closing {r.reference}?</label>
                      <select id={`reason-${r.id}`} name="reason" className={field} defaultValue="NO_PROVIDER">
                        {Object.entries(LEAD_CLOSE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className={btn("ghost")}>Close</button>
                    </form>
                  )}

                  {mayAssign && r.status === "CLOSED" && (
                    <form action={reopenLead}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className={btn("ghost")}>Reopen</button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
