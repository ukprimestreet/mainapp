import { Container, PageHeader } from "@/components/ui";
import { MAX_RECIPIENTS, PRIVACY_NOTICE_VERSION } from "@/lib/leads";
import { meta } from "@/lib/seo";

export const metadata = meta({ title: "Privacy notice", description: "What personal data PrimeStreet collects, why, how long we keep it and how to control it.", path: "/privacy" });

export default function Privacy() {
  const H = ({ children, id }: { children: React.ReactNode; id: string }) => <h2 id={id} className="pt-6 font-display text-2xl font-extrabold">{children}</h2>;
  return (
    <>
      <PageHeader ld kicker="Legal" title="Privacy notice" intro={`Plain-English summary of how PrimeStreet handles personal data. Version ${PRIVACY_NOTICE_VERSION}.`} crumbs={[{ name: "Home", href: "/" }, { name: "Privacy" }]} />
      <Container className="max-w-3xl space-y-4 py-10 text-lg leading-relaxed">
        <p role="note" className="rounded-xl border-2 border-ink bg-yellow-soft p-4 text-base font-semibold">This notice describes how the platform is built to behave. Before launch it should be reviewed by a qualified adviser and the controller details below completed.</p>
        <H id="who">Who we are</H><p>PrimeStreet (primestreet.uk) is a London business media and directory site. The data controller is the operator of PrimeStreet; contact: the address shown on the About page.</p>
        <H id="data">What we collect and why</H>
        <ul className="list-disc space-y-3 pl-6 text-base">
          <li><strong>Reviews:</strong> your display name, email address and the review. The email is used only to confirm you're real and to tell you the outcome; it is never shown. Kept until you delete the review (via the link in your email), which removes your email too. Rejected reviews are purged after 12 months.</li>
          <li><strong>Business claims and owner accounts:</strong> name, email, phone, role and the evidence you provide, to verify you represent a business. Kept while the claim or account is active, then for up to 12 months for audit.</li>
          <li><strong>Suggestions and coverage pitches:</strong> what you submit and your contact email, so we can follow up.</li>
          <li><strong>Newsletter:</strong> your email address, once you confirm. One email a week; every email has a one-click unsubscribe link. Unsubscribing stops all sending.</li>
          <li><strong>Anti-abuse:</strong> a salted hash of your IP address (not the address itself) to limit spam and duplicate reviews.</li>
          <li><strong>Search and page analytics:</strong> we count page and podcast views and plays, and keep an anonymous list of search words (never tied to you; queries that look like emails, phone numbers or links are dropped).</li>
          <li><strong>Your location (optional):</strong> if you press “Use my location” or enter a postcode, it is used once to sort results. It is held in the page address only and never stored.</li>
        </ul>
        <H id="job-requests">If you ask us for quotes</H>
        <p className="text-base">
          This is the one part of PrimeStreet where we pass your details to another company, so it is set out
          in full. It applies when you use the <a href="/get-quotes" className="underline">quote request form</a>.
        </p>
        <ul className="list-disc space-y-3 pl-6 text-base">
          <li><strong>What we collect:</strong> your name, email address, phone number, the area the job is in, your postcode if you give one, what you need doing, how soon you need it and the best time to call. <strong>We never ask for your full address</strong> — a postcode is enough to route a job, and it is optional.</li>
          <li><strong>Why:</strong> to pass your request to local businesses so they can quote. We record which version of this notice you agreed to and when, so a later change to the wording cannot alter what you consented to.</li>
          <li><strong>Who we pass it to:</strong> <strong>a maximum of {MAX_RECIPIENTS} businesses</strong> who cover your area and offer the work. We name them on the confirmation page and in nothing else. We do not sell your details, we do not pass them to anybody else, and nobody who was not sent your job receives them.</li>
          <li><strong>What the businesses may do with it:</strong> contact you about that job. They are told, in the email that carries your details, to use them for that job only and to stop if you ask them to. If one keeps contacting you after you have asked them to stop, tell us — we will act on it, and a business that generates complaints stops receiving requests.</li>
          <li><strong>If nobody can take it:</strong> we email you to say so rather than leaving you waiting, and your details are not passed to anybody.</li>
          <li><strong>Marketing is separate.</strong> The box asking whether we may email you about PrimeStreet is a different, unticked box, and nothing about your request depends on it. Every such email has a one-click unsubscribe.</li>
          <li><strong>Anti-abuse:</strong> a salted hash of your IP address, never the address itself.</li>
          <li><strong>How long:</strong> a request nobody took is deleted after 90 days. Where it was passed to a business, your contact details are removed after 12 months and the record of the job itself is kept without them, because it is an accounting record. Payments between us and businesses are kept for seven years, as tax law requires.</li>
          <li><strong>Deleting it:</strong> email us with your reference (the <code>PS-</code> code on your confirmation) and we will delete your details. We will tell you if a business already has them, because we cannot delete what we have already passed on — you can ask them directly, and we will tell you who they were.</li>
        </ul>

        <H id="cookies">Cookies</H>
        <p className="text-base">We use only <strong>first-party functional cookies</strong> that you trigger yourself: <code>ps_saved</code> (the businesses you pressed “Save” on) and <code>ps_recent</code> (businesses you recently viewed), each just a list of business IDs, stored for a year. Owners and admins get a secure sign-in cookie. We do not use advertising or cross-site tracking cookies. Video embeds (YouTube/Vimeo) load nothing until you press play.</p>
        <H id="rights">Your rights</H>
        <p className="text-base">You can ask to see, correct or delete your data, object to processing, or withdraw consent at any time. Reviews and newsletter subscriptions can be removed by you directly; for anything else contact us and we will respond within one month. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
        <H id="sharing">Who sees your data</H>
        <p className="text-base">
          We do not sell personal data. Service providers may process it on our behalf (hosting, email
          delivery). Business owners see the review text and reviewer&apos;s display name, never the email.
          The one exception is a quote request, which we pass to at most {MAX_RECIPIENTS} businesses with your
          consent and only ever those — see <a href="#job-requests" className="underline">above</a>.
        </p>
        <p className="text-base">
          Inside PrimeStreet, a customer&apos;s contact details are restricted to administrators who need them
          for their work, revealed one request at a time, and every single time somebody looks is recorded with
          their name against it.
        </p>
      </Container>
    </>
  );
}
