import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { URGENCY } from "@/lib/leads";
import { RESPONSES, assignmentForResponse, responseTokenValid } from "@/lib/lead-response";
import { respondToLead } from "./actions";

export const dynamic = "force-dynamic";
/** One business's job. Never indexed, never followed. */
export const metadata: Metadata = { title: "Your job request", robots: { index: false, follow: false } };

const btn = "min-h-12 rounded-full px-6 font-bold transition disabled:opacity-60";

/**
 * "What are you doing about this job?", asked in one click from the email.
 *
 * No sign-in, deliberately: a sign-in wall is the reason nobody tells us anything, and this is the one
 * question whose answer decides whether we take the job off them. The token is an HMAC of the assignment id,
 * so the link cannot be guessed, and the worst a leaked one can do is answer a question on one job.
 *
 * **Nothing changes on GET.** Email clients and security scanners prefetch links; a GET that acted would
 * have mail software declining jobs on people's behalf. This page shows the question; the buttons POST.
 */
export default async function LeadResponse({ params, searchParams }: {
  params: Promise<{ id: string; token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id, token } = await params;
  const { done } = await searchParams;
  if (!responseTokenValid(id, decodeURIComponent(token))) notFound();

  const a = await assignmentForResponse(id);
  if (!a) notFound();
  const job = a.jobRequest;

  // ---- after answering
  if (done) {
    const declined = done === "declined";
    return (
      <>
        <PageHeader kicker="Thank you" title={declined ? "Passed on to somebody else" : "Noted — thank you"} />
        <Container className="max-w-2xl py-10">
          <div className="rounded-2xl border-2 border-ink p-6 text-[15px]">
            {declined ? (
              <>
                <p>
                  We have taken <strong>{job.reference}</strong> off you and are offering it to another
                  business, so the customer is not left waiting.
                </p>
                <p className="mt-3">
                  <strong>Your credit has been put back.</strong> You have not paid for this one.
                </p>
                <p className="mt-3">
                  If jobs keep arriving that you cannot take, the areas and trades you cover are yours to
                  change — that is usually the fix.
                </p>
              </>
            ) : (
              <>
                <p>
                  Thanks for telling us. We will not chase you about <strong>{job.reference}</strong> again,
                  and nobody else will be given it unless you tell us otherwise.
                </p>
                <p className="mt-3">
                  If it turns out you cannot take it after all, come back to this page and say so — we would
                  far rather pass it on than leave the customer waiting.
                </p>
              </>
            )}
            <p className="mt-5">
              <Link href={`/owner/business/${a.businessId}/leads`} className="font-bold underline">
                See all your job requests
              </Link>
            </p>
          </div>
        </Container>
      </>
    );
  }

  // ---- already answered, or no longer theirs
  if (a.status === "REVERSED" || a.respondedAt) {
    const declined = a.responseKind === "DECLINED";
    return (
      <>
        <PageHeader kicker={job.reference} title="Nothing more to do" />
        <Container className="max-w-2xl py-10">
          <div className="rounded-2xl border-2 border-ink p-6 text-[15px]">
            <p>
              {a.status === "REVERSED"
                ? "This job is no longer yours — it has been passed to another business, and any credit charged for it has been put back."
                : declined
                  ? "You have already told us you cannot take this one. It has been passed on and your credit returned."
                  : "You have already told us you contacted the customer. We will not chase you about it."}
            </p>
            <p className="mt-5">
              <Link href={`/owner/business/${a.businessId}/leads`} className="font-bold underline">
                See all your job requests
              </Link>
            </p>
          </div>
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker={a.business.name}
        title="What is happening with this job?"
        intro="One click. It decides whether we keep it with you or pass it to somebody else."
      />
      <Container className="max-w-2xl py-10">
        <div className="rounded-2xl border-2 border-ink p-6">
          <p className="font-display text-xl font-extrabold">{job.category.name} — {job.place.label}</p>
          <p className="mt-1 text-[14px] text-grey">
            {job.reference} · {URGENCY[job.urgency as keyof typeof URGENCY] ?? job.urgency}
            {job.postcode ? ` · ${job.postcode}` : ""} · {job.name}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <form action={respondToLead}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="kind" value="CALLED" />
              <button className={`${btn} bg-ink text-yellow hover:bg-charcoal`}>{RESPONSES.CALLED}</button>
            </form>
            <form action={respondToLead}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="kind" value="DECLINED" />
              <button className={`${btn} border-2 border-ink hover:bg-mist`}>{RESPONSES.DECLINED}</button>
            </form>
          </div>

          <p className="mt-6 text-[14px] text-grey">
            Saying you cannot take it costs you nothing: <strong>the credit goes back</strong> and we offer the
            job to another business straight away. It is a better answer than silence, for you and for the
            customer.
          </p>
        </div>
      </Container>
    </>
  );
}
