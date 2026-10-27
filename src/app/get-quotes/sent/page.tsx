import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { jobByReference, MAX_RECIPIENTS } from "@/lib/leads";
import { assignmentsFor } from "@/lib/matching";

export const dynamic = "force-dynamic";
/** Nothing here should ever be indexed: it is one person's enquiry. */
export const metadata: Metadata = { title: "Your request has been sent", robots: { index: false, follow: false } };

/**
 * Confirmation.
 *
 * Deliberately shows the job and the reference, and **not** the name, email or phone that were submitted.
 * The reference is short enough to read down a phone line, which also means it is short enough to guess, so
 * nothing personal hangs off knowing one.
 */
export default async function Sent({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const job = ref ? await jobByReference(ref) : null;
  // What actually happened, rather than what usually happens. The names of the businesses are shown because
  // they are about to ring: a customer who knows who is calling is a customer who answers.
  const assignments = job ? (await assignmentsFor(job.id)).filter((a) => a.status !== "REVERSED") : [];

  return (
    <>
      <PageHeader kicker="Thank you" title="Your request is in" />
      <Container className="max-w-2xl py-10">
        {job ? (
          <div className="rounded-2xl border-2 border-ink p-6">
            <p className="text-[15px]">
              <strong>{job.category.name}</strong> in <strong>{job.place.label}</strong>.
            </p>
            <p className="mt-3 text-[15px]">
              Your reference is <strong className="font-display text-xl">{job.reference}</strong>. Keep it —
              quote it if you email us about this job.
            </p>

            {assignments.length > 0 ? (
              <>
                <p className="mt-5 text-[15px]">
                  {assignments.length === 1 ? "It has gone to" : "It has gone to"}{" "}
                  <strong>{assignments.map((a) => a.business.name).join(" and ")}</strong>
                  {assignments.length === 1 ? ", who covers" : ", who cover"} {job.place.label}. Expect them to
                  contact you directly, usually within a working day.
                </p>
                <p className="mt-2 text-[15px]">
                  {assignments.length < MAX_RECIPIENTS
                    ? `Only ${assignments.length === 1 ? "one business" : `${assignments.length} businesses`} so far — we would rather send you one that turns up than two that do not.`
                    : `That is the maximum. Nobody else will be given your details.`}
                </p>
              </>
            ) : job.providersAtCreation === 0 ? (
              <p className="mt-5 text-[15px]">
                Being straight with you: we do not yet have anyone listed for this kind of work in your area.
                We have your request and a person will look at it, but we cannot promise a quote. If you need
                it done soon, do not wait on us.
              </p>
            ) : (
              <p className="mt-5 text-[15px]">
                We have your request and a person is looking at it now. We will pass it to no more
                than {MAX_RECIPIENTS} businesses who cover {job.place.label} — and if we cannot, we will
                tell you rather than leave you waiting.
              </p>
            )}

            <p className="mt-5 text-[14px] text-grey">
              Your details go to those businesses and nobody else. We do not sell them on, and you can ask us
              to delete them at any time — see our <Link href="/privacy" className="underline">privacy notice</Link>.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-ink p-6">
            <p className="text-[15px]">
              Your request has been sent. If you were given a reference, keep it for any emails about this job.
            </p>
            <p className="mt-4"><Link href="/get-quotes" className="font-bold underline">Send another request</Link></p>
          </div>
        )}
      </Container>
    </>
  );
}
