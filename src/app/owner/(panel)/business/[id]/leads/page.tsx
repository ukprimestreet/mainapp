import { OwnerTabs } from "@/components/OwnerTabs";
import { fmtDate } from "@/components/Cards";
import { isPremium } from "@/lib/commerce";
import { creditBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { URGENCY } from "@/lib/leads";
import { RESPONSES } from "@/lib/lead-response";
import { assignmentsForBusiness, markDelivered } from "@/lib/matching";
import { requireBusiness } from "@/lib/owner";
import { answerJobRequest } from "../../../../business-actions";
import { setLeadStatus } from "../../../../commerce-actions";

/** Assignments are marked as opened the moment this page renders, so it must never be cached. */
export const dynamic = "force-dynamic";

/**
 * What has come in: job requests PrimeStreet passed to this business, and direct messages from its profile.
 *
 * The job requests come first and carry the customer's contact details in full. The business paid a credit
 * for this; hiding the phone number behind another click would be charging for something and then making it
 * awkward to use.
 *
 * Opening this page is what marks an assignment as seen. That is the honest definition — the business can
 * read the customer's number from here — and it is what makes "they were sent it and never looked" a fact
 * rather than a guess when somebody complains.
 */
export default async function Leads({ params }: { params: Promise<{ id: string }> }) {
  const { business: b } = await requireBusiness((await params).id);
  const [premium, leads, jobs, credits] = await Promise.all([
    isPremium(b.id),
    db.lead.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    assignmentsForBusiness(b.id),
    creditBalance(b.id),
  ]);

  // Sequential rather than parallel: these are tiny updates and a stampede of them is not worth the risk.
  for (const j of jobs) if (!j.deliveredAt) await markDelivered(j.id);

  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="leads" />

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl font-extrabold">Job requests</h2>
          <p className="text-sm text-grey">
            <strong>{credits}</strong> lead credit{credits === 1 ? "" : "s"} left.{" "}
            {credits === 0 && "While it is zero, new job requests go to somebody else."}
          </p>
        </div>
        <p className="mb-5 text-[15px] text-grey">
          Customers who asked for work in the areas you cover. We send each job to a maximum of two
          businesses, so you are not racing ten others. One credit per job, and nothing is charged for a job
          you were not sent.
        </p>

        {jobs.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line p-5 text-[15px] text-grey">
            Nothing yet. Requests reach you when a customer asks for work you offer, in an area you said you
            cover — so it is worth keeping both up to date.
          </p>
        ) : (
          <ul className="space-y-4">
            {jobs.map((a) => (
              <li key={a.id} className="rounded-2xl border-2 border-ink p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg font-extrabold">
                    {a.jobRequest.category.name} — {a.jobRequest.place.label}
                  </p>
                  <span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">
                    {a.kind === "SPONSORED" ? "free — on us" : "1 credit"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-grey">
                  {a.jobRequest.reference} · {fmtDate(a.jobRequest.createdAt)} ·{" "}
                  {URGENCY[a.jobRequest.urgency as keyof typeof URGENCY] ?? a.jobRequest.urgency}
                  {a.jobRequest.postcode ? ` · ${a.jobRequest.postcode}` : ""}
                </p>

                <p className="mt-3 whitespace-pre-wrap text-[15px] [overflow-wrap:anywhere]">{a.jobRequest.description}</p>

                <dl className="mt-4 grid gap-2 text-[15px] sm:grid-cols-2">
                  <div><dt className="font-bold">Customer</dt><dd>{a.jobRequest.name}</dd></div>
                  <div>
                    <dt className="font-bold">Phone</dt>
                    <dd><a href={`tel:${a.jobRequest.phone.replace(/\s+/g, "")}`} className="underline">{a.jobRequest.phone}</a></dd>
                  </div>
                  <div>
                    <dt className="font-bold">Email</dt>
                    <dd><a href={`mailto:${a.jobRequest.email}`} className="underline [overflow-wrap:anywhere]">{a.jobRequest.email}</a></dd>
                  </div>
                  <div><dt className="font-bold">Best time to call</dt><dd>{a.jobRequest.contactTime ?? "Any time"}</dd></div>
                </dl>

                {a.respondedAt ? (
                  <p className="mt-4 text-[14px] font-bold">
                    {a.responseKind === "DECLINED"
                      ? "You told us you could not take this one."
                      : "You told us you have contacted this customer."}
                  </p>
                ) : (
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    {/* The same two answers as the email, because a business should not have to find the
                        email again to tell us something it is sitting in front of. */}
                    <form action={answerJobRequest}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input type="hidden" name="kind" value="CALLED" />
                      <button className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow transition hover:bg-charcoal">
                        {RESPONSES.CALLED}
                      </button>
                    </form>
                    <form action={answerJobRequest}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input type="hidden" name="kind" value="DECLINED" />
                      <button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold transition hover:bg-mist">
                        {RESPONSES.DECLINED}
                      </button>
                    </form>
                  </div>
                )}

                <p className="mt-4 text-[13px] text-grey">
                  Please use these details for this job only. If the customer asks you not to contact them
                  again, stop — and tell us, so we can act on it too. Telling us you cannot take a job puts
                  the credit back and passes it on — it costs you nothing.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-extrabold">Messages from your profile</h2>
        {!premium && (
          <p role="note" className="mb-6 rounded-xl border-2 border-dashed border-line p-4">
            The enquiry form on your profile is a Premium feature. {leads.length > 0 ? "Your earlier enquiries are kept below." : ""}
          </p>
        )}
        {leads.length === 0 ? <p className="text-grey">No messages yet.</p> : (
          <ul className="space-y-4">{leads.map((l) => (
            <li key={l.id} className="rounded-2xl border border-line p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-extrabold">{l.name}</p><span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{l.status}</span></div>
              <p className="text-sm text-grey">{fmtDate(l.createdAt)} · <a className="underline" href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ""}</p>
              <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{l.message}</p>
              <form action={setLeadStatus} className="mt-3 flex gap-3 text-sm font-bold"><input type="hidden" name="leadId" value={l.id} />
                {l.status !== "READ" && <button name="status" value="READ" className="underline">Mark read</button>}{l.status !== "ARCHIVED" && <button name="status" value="ARCHIVED" className="underline">Archive</button>}{l.status !== "NEW" && <button name="status" value="NEW" className="underline">Mark new</button>}</form></li>))}</ul>
        )}
      </section>
    </>
  );
}
