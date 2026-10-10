import Link from "next/link";
import { Card, Notice, PageHead } from "@/components/Dash";
import { SUPPORT_EMAIL } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help — PrimeStreet", robots: { index: false, follow: false } };

/** Straight answers, including the ones a business may not want to hear. */
export default function Help() {
  const support = SUPPORT_EMAIL();
  return (
    <>
      <PageHead title="Help" subtitle="Straight answers about how PrimeStreet works — including the parts you may not like." />

      <Notice tone="info" title="A real person reads this">
        Email <strong>{support}</strong> and someone will answer. Every other address we send from is unattended.
      </Notice>

      <Card title="Your listing">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">Why is my business listed when I never signed up?</dt>
            <dd className="mt-1 text-grey">We build listings from public information so the directory is useful from day one. Until you claim it, the profile is marked <strong>unclaimed</strong>, which tells readers the details have not been checked by you. Claiming is free.</dd>
          </div>
          <div>
            <dt className="font-bold">Can I have my listing removed?</dt>
            <dd className="mt-1 text-grey">Yes. Email {support} from an address connected to the business and we will take it down. We will not argue with you about it.</dd>
          </div>
          <div>
            <dt className="font-bold">Something on my profile is wrong.</dt>
            <dd className="mt-1 text-grey">If you manage the listing, edit it yourself. If you do not, claim it or send us the correction and we will fix it quickly.</dd>
          </div>
        </dl>
      </Card>

      <Card title="Reviews">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">Can I have a bad review taken down?</dt>
            <dd className="mt-1 text-grey">Not for being bad. We remove reviews that break our guidelines — abuse, naming staff, things that are not about a real experience, or anything we believe is fake. A genuine unhappy customer stays, and no amount of money changes that.</dd>
          </div>
          <div>
            <dt className="font-bold">What should I do about one, then?</dt>
            <dd className="mt-1 text-grey">Reply publicly. A calm, specific reply to a fair criticism does more for you than the review does against you. Readers notice who answers.</dd>
          </div>
          <div>
            <dt className="font-bold">Can I buy reviews or a better rating?</dt>
            <dd className="mt-1 text-grey">No. Nothing you pay for affects your rating, your reviews or your position in search. If anyone tells you otherwise, they do not work for us.</dd>
          </div>
        </dl>
      </Card>

      <Card title="Being found">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">How do I appear higher in search?</dt>
            <dd className="mt-1 text-grey">By being more relevant, not by paying. Complete your profile, keep hours current, add photos, describe what you actually do in the words customers use. Featured placements exist, but they are a clearly labelled <strong>Sponsored</strong> slot — a separate thing from the real results, not a way of jumping them.</dd>
          </div>
          <div>
            <dt className="font-bold">What makes the biggest difference?</dt>
            <dd className="mt-1 text-grey">In order: photos, accurate opening hours, a description in plain language, and replying to reviews. All free.</dd>
          </div>
        </dl>
      </Card>

      <Card title="Premium and payments">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">What does Premium actually give me?</dt>
            <dd className="mt-1 text-grey">A photo gallery, an offer banner, an enquiry form with leads emailed to you, and click analytics. It gives you more room to convert people already looking at you. It does not create demand and it does not touch your rating or ranking.</dd>
          </div>
          <div>
            <dt className="font-bold">How do I cancel?</dt>
            <dd className="mt-1 text-grey">From your billing page, in a couple of clicks. You keep Premium until the end of the period you have paid for, and your photos and offer are saved rather than deleted.</dd>
          </div>
          <div>
            <dt className="font-bold">Do you take a commission on my sales?</dt>
            <dd className="mt-1 text-grey">No. We never take a cut of your work. Enquiries go straight to you and we are not involved in what happens next.</dd>
          </div>
        </dl>
      </Card>

      <Card title="Editorial">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">Can I pay to be written about?</dt>
            <dd className="mt-1 text-grey">You can buy sponsored content, and it is labelled as such with your name on it. You cannot buy ordinary editorial coverage, and our writers will not be told to cover you because you advertise.</dd>
          </div>
          <div>
            <dt className="font-bold">You wrote something about us that is wrong.</dt>
            <dd className="mt-1 text-grey">Tell us and we will check it. If we got it wrong we publish a correction with the date — we keep <Link href="/about" className="font-bold underline">a public record</Link> of those rather than quietly editing.</dd>
          </div>
        </dl>
      </Card>

      <Card title="Your account">
        <dl className="space-y-5 text-[15px]">
          <div>
            <dt className="font-bold">How do I sign in? I do not have a password.</dt>
            <dd className="mt-1 text-grey">There is no password. Enter your email and we send a link that signs you in. Nothing to forget and nothing to be stolen from another site.</dd>
          </div>
          <div>
            <dt className="font-bold">Someone else should be able to manage this.</dt>
            <dd className="mt-1 text-grey">Add them on your team page. We would encourage it — a listing that depends on one inbox is a problem waiting to happen.</dd>
          </div>
          <div>
            <dt className="font-bold">Too many emails.</dt>
            <dd className="mt-1 text-grey">Every non-essential email has an unsubscribe link, and one click stops the lot. We will still send the things your account needs: sign-in links, enquiries from customers and receipts.</dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
