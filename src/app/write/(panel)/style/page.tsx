import Link from "next/link";
import { Card, Notice, PageHead } from "@/components/Dash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Style guide — PrimeStreet", robots: { index: false, follow: false } };

/**
 * Craft, not rules. The author terms say what you must do; this says how PrimeStreet sounds when you do it.
 */
export default function StyleGuide() {
  return (
    <>
      <PageHead
        title="Style guide"
        subtitle="The terms are the rules. This is the craft: how PrimeStreet sounds, and the formats we use again and again."
      />

      <Notice tone="info" title="The short version">
        Write for a busy person who runs a business and has fifteen minutes. Be specific, be useful, and never pad.
        If a sentence does not tell the reader something, cut it.
      </Notice>

      <Card title="Voice">
        <ul className="space-y-3 text-[15px]">
          <li><strong>Plain, not chatty.</strong> We are not their mate and we are not a press release. Say the thing.</li>
          <li><strong>Specific beats general.</strong> &ldquo;£12,000 rateable value&rdquo; not &ldquo;a low threshold&rdquo;. Numbers, dates, names.</li>
          <li><strong>Admit the limits.</strong> If something is unclear or we could not verify it, say so in the piece. Readers trust a writer who marks their own uncertainty.</li>
          <li><strong>No hype.</strong> Nothing is a game-changer, a secret weapon or a must-have.</li>
          <li><strong>British English</strong>, Oxford comma off, single quotes inside double only when nesting.</li>
        </ul>
      </Card>

      <Card title="Structure that works here">
        <ul className="space-y-3 text-[15px]">
          <li><strong>Headline:</strong> what the reader gets, not a pun. &ldquo;Five checks before you pay a deposit&rdquo; beats &ldquo;Trade secrets&rdquo;.</li>
          <li><strong>Standfirst:</strong> one or two sentences on why this matters now. Never repeat the headline.</li>
          <li><strong>First paragraph:</strong> the point. Do not warm up.</li>
          <li><strong>Sub-headings every 200–300 words.</strong> Most people scan before they read.</li>
          <li><strong>End with what to do</strong>, or with the honest answer that there is nothing to do yet.</li>
        </ul>
      </Card>

      <Card title="Numbers, money and dates">
        <ul className="space-y-3 text-[15px]">
          <li>Money: £29, £1,250, £1.2m. Always say whether a figure includes VAT.</li>
          <li>Dates: 6 October 2026. Never 6/10/26.</li>
          <li>Percentages: 33%, not thirty-three per cent, except at the start of a sentence.</li>
          <li>Any figure that can change — a threshold, a price, a rate — gets the date you checked it.</li>
        </ul>
      </Card>

      <Card title="Sourcing, in practice">
        <ul className="space-y-3 text-[15px]">
          <li><strong>Link the primary source</strong>, not a news story about it. GOV.UK over a summary of GOV.UK.</li>
          <li><strong>Quote the source exactly</strong> when the precise wording matters, and put it in quotation marks.</li>
          <li><strong>Every piece ends with its sources</strong> and the date they were checked. Use the same &ldquo;How we checked this&rdquo; block as the existing guides.</li>
          <li><strong>If you cannot verify it, leave it out.</strong> An accurate short piece beats a plausible long one.</li>
        </ul>
      </Card>

      <Card title="Writing about businesses">
        <ul className="space-y-3 text-[15px]">
          <li>Use the name the business uses for itself, then the borough: &ldquo;e5 Bakehouse in Hackney&rdquo;.</li>
          <li>Do not describe a business from its own marketing copy. Say what it does, in your words.</li>
          <li>Criticism must be specific, fair, and put to them for a response before publication.</li>
          <li>Never imply a business paid for coverage, and never let one think it can.</li>
        </ul>
      </Card>

      <Card title="Formats we use">
        <ul className="space-y-3 text-[15px]">
          <li><strong>Guide</strong> — a practical how-to with numbered checks. The most useful thing we publish.</li>
          <li><strong>Insight</strong> — analysis of how something works, grounded in a document or a dataset.</li>
          <li><strong>Story</strong> — a person and a business, reported with at least one interview.</li>
          <li><strong>Interview</strong> — their words, lightly edited for length, with edits marked.</li>
          <li><strong>News</strong> — something that happened, with a date and a primary source.</li>
        </ul>
      </Card>

      <Card title="Before you submit">
        <ul className="space-y-3 text-[15px]">
          <li>Every link works and goes where the text says it goes.</li>
          <li>Every image has alt text describing what is in it.</li>
          <li>Every figure has a source and a date.</li>
          <li>Names and job titles are spelled as those people spell them.</li>
          <li>Read it aloud. Anything you stumble on, rewrite.</li>
        </ul>
        <p className="mt-4 text-[14px] text-grey">
          The rules you agreed to are in the <Link href="/write/terms" className="font-bold underline">author terms</Link>.
        </p>
      </Card>
    </>
  );
}
