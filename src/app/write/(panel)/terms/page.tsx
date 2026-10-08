import { DashShell, Notice, Panel, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { acceptTerms } from "../../actions";

export const dynamic = "force-dynamic";
// Author terms are internal: visible only once signed in, and never indexed.
export const metadata = { title: "Author terms — PrimeStreet", robots: { index: false, follow: false } };

export default async function TermsPage() {
  const me = await requireAuthor();
  const accepted = me.acceptedTermsAt;
  return (
    <DashShell title="Author terms" subtitle="The standards every piece published on PrimeStreet is held to.">
      {accepted ? (
        <Notice tone="good" title="Accepted">You accepted these terms on {fmtDate(accepted)}.</Notice>
      ) : (
        <Notice tone="warn">Read these and accept at the bottom. You cannot send work for review until you do.</Notice>
      )}

      <Panel title="1. Everything is real, and sourced">
        <ul className="list-disc space-y-2 pl-5">
          <li>Never invent a business, a person, a quote, a statistic, a review or an event.</li>
          <li>Facts must come from a source you can name: a primary document, an official publication, a company&apos;s own material, or someone you actually spoke to.</li>
          <li>Say where a figure came from and when you checked it. Rules and prices change.</li>
          <li>If you cannot verify something, leave it out. An accurate short piece beats a plausible long one.</li>
        </ul>
      </Panel>

      <Panel title="2. Quotes and interviews">
        <ul className="list-disc space-y-2 pl-5">
          <li>Only quote words that were actually said or written to you, or published elsewhere with the source credited.</li>
          <li>Never paraphrase inside quotation marks, and never assemble a quote from several statements.</li>
          <li>Tell people they are speaking to PrimeStreet for publication before you interview them.</li>
        </ul>
      </Panel>

      <Panel title="3. Other people's work">
        <ul className="list-disc space-y-2 pl-5">
          <li>Write in your own words. Do not copy descriptions, listings, ratings or reviews from Google, Yell, Trustpilot, TripAdvisor or any other directory.</li>
          <li>Do not reproduce another outlet&apos;s reporting as if it were ours. Credit and link to it.</li>
          <li>Only use images you have the right to use, and record the credit.</li>
        </ul>
      </Panel>

      <Panel title="4. Money must be visible">
        <ul className="list-disc space-y-2 pl-5">
          <li>If a piece is paid for, it is labelled Sponsored, Partner or Advertorial and the sponsor is named. No exceptions.</li>
          <li>Tell your editor about any payment, gift, free meal, free stay, equity or personal relationship connected to something you are writing about.</li>
          <li>You may not accept payment from a business in exchange for coverage, a rating or a placement.</li>
          <li>Advertising never affects ratings, reviews, search order or which businesses we cover.</li>
        </ul>
      </Panel>

      <Panel title="5. People and the law">
        <ul className="list-disc space-y-2 pl-5">
          <li>Be fair to anyone criticised in a piece, and give them a real chance to respond before publication.</li>
          <li>Take care with allegations about identifiable people or businesses: defamation is a real risk and it is the publisher&apos;s and the writer&apos;s problem alike.</li>
          <li>Handle personal data carefully. Do not publish private contact details without consent.</li>
          <li>Flag anything legally sensitive to an editor before filing rather than after.</li>
        </ul>
      </Panel>

      <Panel title="6. How publishing works">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your profile must be at least 90% complete before you can send work for review, so readers can see who wrote a piece.</li>
          <li>Drafts are private. Submitting sends the piece to an editor, who either publishes it or returns it with feedback. Every decision comes with a reason.</li>
          <li>An editor may edit for accuracy, clarity, length, style and legal safety. Material changes to your argument will be discussed with you.</li>
          <li>Corrections are normal and nothing to be ashamed of. Tell an editor as soon as you realise something is wrong.</li>
        </ul>
      </Panel>

      <Panel title="7. Your work">
        <ul className="list-disc space-y-2 pl-5">
          <li>You confirm that work you file is yours, original, and not published elsewhere without telling us.</li>
          <li>You keep the credit; PrimeStreet may publish, edit, archive and promote the piece on its own platforms.</li>
          <li>Fees, where agreed, are agreed in writing with an editor before commissioning.</li>
        </ul>
      </Panel>

      {!accepted && (
        <form action={acceptTerms} className="rounded-2xl border-2 border-ink bg-yellow-soft p-6">
          <p className="font-bold">By accepting, you confirm you have read these terms and will work to them.</p>
          <button className={`${btn()} mt-4`}>I accept the author terms</button>
        </form>
      )}
    </DashShell>
  );
}
