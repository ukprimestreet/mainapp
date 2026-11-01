import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { adminCan, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { providersFor, URGENCY } from "@/lib/leads";
import { assignmentsFor, decisionsFor, MAX_PAID } from "@/lib/matching";
import { LEAD_CLOSE_REASONS } from "@/lib/reasons";
import { assignLead, closeLead, rematchLead, reopenLead, reverseLeadAssignment, revealCustomer } from "../../../lead-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead — Admin", robots: { index: false, follow: false } };

const OUTCOME = {
  ASSIGNED: "live" as const,
  CONSIDERED: "quiet" as const,
  EXCLUDED: "bad" as const,
  SKIPPED: "draft" as const,
};

/**
 * One job request, and every decision made about it.
 *
 * The point of this page is that matching is **answerable**. When a business asks why it did not get a job,
 * or a customer asks why nobody rang, the answer is on this page as a row with a reason and a timestamp —
 * not something anybody has to reconstruct from the code.
 */
export default async function Lead({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; reveal?: string }>;
}) {
  await requirePermission("leads.view");
  const { id } = await params;
  const { msg, reveal } = await searchParams;
  const maySeeContact = await adminCan("leads.customer_contact");
  const mayAssign = await adminCan("leads.assign");

  const job = await db.jobRequest.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } }, place: { include: { parent: true } } },
  });
  if (!job) notFound();

  const [assignments, decisions, supplyNow] = await Promise.all([
    assignmentsFor(job.id),
    decisionsFor(job.id),
    providersFor(job.categoryId, job.placeId),
  ]);

  const live = assignments.filter((a) => a.status !== "REVERSED");
  const paidTaken = live.filter((a) => a.paidSlot !== null).length;

  // Candidates for a manual assignment: businesses that offer this trade, with their balance, so an
  // administrator is never choosing blind between somebody who can pay and somebody who cannot.
  const candidates = mayAssign
    ? await db.business.findMany({
        where: { published: true, isSample: false, categories: { some: { categoryId: job.categoryId } }, id: { notIn: live.map((a) => a.businessId) } },
        orderBy: { name: "asc" }, take: 100,
        select: { id: true, name: true, creditAccount: { select: { balance: true } } },
      })
    : [];

  // Grouped by run, so a re-run reads as a second attempt rather than being interleaved with the first.
  const runs = new Map<string, typeof decisions>();
  for (const d of decisions) runs.set(d.runId, [...(runs.get(d.runId) ?? []), d]);

  return (
    <>
      <PageHead
        title={`${job.category.name} — ${job.place.label}`}
        subtitle={`${job.reference} · received ${fmtDate(job.createdAt)} · ${URGENCY[job.urgency as keyof typeof URGENCY] ?? job.urgency}`}
        actions={<Link href="/admin/leads" className={btn("ghost")}>All leads</Link>}
      />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow>
        <Metric label="Paid places filled" value={`${paidTaken} of ${MAX_PAID}`} icon="users" tone={paidTaken >= MAX_PAID ? "dark" : paidTaken ? "accent" : "warn"} />
        <Metric label="Covering it now" value={supplyNow} icon="shop" hint={`${job.providersAtCreation} when it arrived`} tone={supplyNow ? "plain" : "warn"} />
        <Metric label="Status" value={job.status.toLowerCase().replace("_", " ")} icon="bolt" />
        <Metric label="Decisions recorded" value={decisions.length} icon="shield" hint={`${runs.size} matching ${runs.size === 1 ? "run" : "runs"}`} />
      </MetricRow>

      {job.customerNotifiedAt && (
        <Notice tone="warn" title="The customer has been told we could not find anyone">
          Emailed {fmtDate(job.customerNotifiedAt)}, and advised not to wait on us if the job is urgent. If
          you assign somebody now, they may already have booked elsewhere — worth saying so to the business.
        </Notice>
      )}

      {job.status === "CLOSED" && (
        <Notice tone="info" title="This request is closed">
          {job.closedReason ? LEAD_CLOSE_REASONS[job.closedReason as keyof typeof LEAD_CLOSE_REASONS] ?? job.closedReason : "No reason was recorded."}
          {" "}Matching does not run on a closed request. Reopen it first.
        </Notice>
      )}

      <Card title="The job" description="As the customer described it.">
        <p className="whitespace-pre-line text-[15px]">{job.description}</p>
        <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-3">
          <div><dt className="font-bold">Area</dt><dd>{job.place.label}{job.place.parent ? ` · ${job.place.parent.name}` : ""}</dd></div>
          <div><dt className="font-bold">Postcode</dt><dd>{job.postcode ?? "Not given"}</dd></div>
          <div><dt className="font-bold">Consent</dt><dd>{fmtDate(job.consentAt)}, notice {job.consentVersion}</dd></div>
        </dl>
      </Card>

      {reveal === job.id && maySeeContact ? (
        <Card title="Customer" description="This view has been recorded in the audit log, with your name against it.">
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <div><dt className="font-bold">Name</dt><dd>{job.name}</dd></div>
            <div><dt className="font-bold">Phone</dt><dd className="font-mono">{job.phone}</dd></div>
            <div><dt className="font-bold">Email</dt><dd className="[overflow-wrap:anywhere]">{job.email}</dd></div>
            <div><dt className="font-bold">Best time to call</dt><dd>{job.contactTime ?? "Not given"}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold">Marketing</dt><dd>{job.marketingOptIn ? "Opted in" : "Not opted in — do not email them anything else"}</dd></div>
          </dl>
        </Card>
      ) : (
        <Card title="Customer" description="Contact details are revealed one request at a time, and every reveal is recorded.">
          {maySeeContact ? (
            <form action={revealCustomer}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="to" value={`/admin/leads/${job.id}`} />
              <button className={btn("ghost")}>Show customer details</button>
            </form>
          ) : (
            <p className="text-[15px] text-grey">You do not have permission to see customer contact details.</p>
          )}
        </Card>
      )}

      <Card
        title="Who has it"
        description={`At most ${MAX_PAID} businesses pay for a job. A sponsored assignment costs the business nothing and takes neither place.`}
        action={mayAssign && job.status !== "CLOSED" ? (
          <form action={rematchLead}>
            <input type="hidden" name="id" value={job.id} />
            <button className={btn("ghost")}>Run matching again</button>
          </form>
        ) : undefined}
      >
        {assignments.length === 0 ? (
          <Empty title="Nobody has it yet" icon="inbox">
            {supplyNow === 0
              ? "No business covers this trade in this area. Recruiting one is the only fix; matching cannot invent supply."
              : "Businesses cover this area, so run matching again or assign one by hand — the reasons below say what stopped it."}
          </Empty>
        ) : (
          <Table head={["Business", "How", "Credit", "Status", ""]}>
            {assignments.map((a) => (
              <Row key={a.id}>
                <Cell>
                  <Link href={`/admin/businesses?q=${encodeURIComponent(a.business.name)}`} className="font-bold hover:underline">{a.business.name}</Link>
                  <p className="text-[12px] text-grey">{a.reason}</p>
                </Cell>
                <Cell>
                  <Chip tone={a.kind === "SPONSORED" ? "draft" : "live"}>{a.kind === "SPONSORED" ? "sponsored" : `paid place ${a.paidSlot ?? "—"}`}</Chip>
                  <p className="mt-1 text-[12px] text-grey">{a.stage.toLowerCase().replace("_", " ")}{a.assignedById ? " · by hand" : ""}</p>
                </Cell>
                <Cell>{a.creditCharged ? "1 charged" : a.kind === "SPONSORED" ? "none" : "not charged"}</Cell>
                <Cell>
                  {a.status === "REVERSED" ? <Chip tone="bad">reversed</Chip> : a.deliveredAt ? <Chip tone="good">opened</Chip> : <Chip tone="review">not opened yet</Chip>}
                  {/* Whether they were actually told is a different fact from whether they looked, and the
                      one that decides whether silence is their fault or ours. */}
                  {a.status !== "REVERSED" && (
                    <p className="mt-1 text-[12px] text-grey">
                      {a.notifiedAt ? `emailed ${fmtDate(a.notifiedAt)}` : "not emailed yet"}
                      {a.remindedAt ? " · chased" : ""}
                      {/* What they SAID, which is the thing escalation acts on — not whether they happened to
                          open a dashboard. */}
                      {a.respondedAt
                        ? ` · ${a.responseKind === "DECLINED" ? "said they cannot take it" : "said they contacted the customer"}`
                        : " · no word from them"}
                    </p>
                  )}
                  {a.failedReason && <p className="mt-1 text-[12px] text-grey">{a.failedReason}</p>}
                </Cell>
                <Cell>
                  {mayAssign && a.status !== "REVERSED" && (
                    <form action={reverseLeadAssignment} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={job.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <label className="sr-only" htmlFor={`rev-${a.id}`}>Why are you taking this back?</label>
                      <input id={`rev-${a.id}`} name="reason" required minLength={5} placeholder="Why?" className={`${field} max-w-[14rem]`} />
                      <button className={btn("ghost")}>Take back</button>
                    </form>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {mayAssign && job.status !== "CLOSED" && (
        <Card title="Assign by hand" description="A reason is required, and the two-place limit still applies — a sponsored assignment is the way round it, not a loophole in it.">
          {candidates.length === 0 ? (
            <p className="text-[15px] text-grey">No other published business offers {job.category.name.toLowerCase()}.</p>
          ) : (
            <form action={assignLead} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={job.id} />
              <div>
                <label htmlFor="businessId" className={labelCls}>Business</label>
                <select id="businessId" name="businessId" required className={field}>
                  <option value="">Choose…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.creditAccount?.balance ?? 0} credit{(c.creditAccount?.balance ?? 0) === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="kind" className={labelCls}>Charge</label>
                <select id="kind" name="kind" className={field} defaultValue="PAID">
                  <option value="PAID">Paid — takes a place and one credit</option>
                  <option value="SPONSORED">Sponsored — free, takes no place</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="reason" className={labelCls}>Why this business?</label>
                <input id="reason" name="reason" required minLength={5} className={field} placeholder="They rang us about this job" />
                <p className="mt-1.5 text-[13px] text-grey">Recorded against the lead and in the audit log. Write it as though the business will read it.</p>
              </div>
              <div className="sm:col-span-2">
                <button className={btn()} disabled={paidTaken >= MAX_PAID && candidates.length === 0}>Assign</button>
                {paidTaken >= MAX_PAID && <p className="mt-2 text-[13px] text-grey">Both paid places are taken. A paid assignment will be refused; sponsored will work.</p>}
              </div>
            </form>
          )}
        </Card>
      )}

      <Card title="Every decision" description="Each matching run, in order, with the reason for every inclusion and exclusion. This is the answer to “why did I not get that job?”.">
        {decisions.length === 0 ? (
          <p className="text-[15px] text-grey">Matching has not run on this request yet.</p>
        ) : (
          <div className="space-y-6">
            {[...runs.entries()].map(([runId, rows], i) => (
              <div key={runId}>
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-grey">
                  Run {i + 1} · {fmtDate(rows[0].createdAt)}
                </p>
                <Table head={["Stage", "Business", "Outcome", "Reason"]}>
                  {rows.map((d) => (
                    <Row key={d.id}>
                      <Cell>{d.stage.toLowerCase().replace("_", " ")}</Cell>
                      <Cell>{d.business?.name ?? <span className="text-grey">the run</span>}</Cell>
                      <Cell><Chip tone={OUTCOME[d.outcome as keyof typeof OUTCOME] ?? "quiet"}>{d.outcome.toLowerCase()}</Chip></Cell>
                      <Cell>{d.reason}</Cell>
                    </Row>
                  ))}
                </Table>
              </div>
            ))}
          </div>
        )}
      </Card>

      {mayAssign && (
        <Card title={job.status === "CLOSED" ? "Reopen" : "Close this request"}>
          {job.status === "CLOSED" ? (
            <form action={reopenLead}>
              <input type="hidden" name="id" value={job.id} />
              <button className={btn("ghost")}>Put it back in the queue</button>
            </form>
          ) : (
            <form action={closeLead} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={job.id} />
              <div>
                <label htmlFor="closeReason" className={labelCls}>Why?</label>
                <select id="closeReason" name="reason" className={field} defaultValue="NO_PROVIDER">
                  {Object.entries(LEAD_CLOSE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button className={btn("ghost")}>Close</button>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
