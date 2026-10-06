import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { gbp } from "@/lib/commerce";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";
import { EnquiryForm } from "./EnquiryForm";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "Advertise & sponsor", description: "Reach people discovering London businesses: premium profiles, featured placements and sponsorship. Always labelled, never at the cost of editorial independence.", path: "/advertise" });

const INTERVAL: Record<string, string> = { MONTH: "per month", YEAR: "per year", ONE_OFF: "one-off" };

export default async function Advertise() {
  const products = await db.product.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader ld kicker="For businesses & brands" title="Advertise & sponsor" intro="PrimeStreet helps Londoners discover local businesses. Here's how businesses and brands can be discovered too, without compromising trust." crumbs={[{ name: "Home", href: "/" }, { name: "Advertise" }]} />
      <Container className="space-y-14 py-10">
        <section aria-labelledby="free"><h2 id="free" className="mb-3 text-2xl font-extrabold">Free, always</h2><p className="max-w-3xl text-lg">A business profile, claiming it, replying to reviews and pitching us a story are free. You never have to pay to be listed or to be reviewed fairly.</p></section>

        <section aria-labelledby="products"><h2 id="products" className="mb-4 text-2xl font-extrabold">Ways to grow</h2>
          {products.length === 0 ? <p className="rounded-xl border-2 border-dashed border-line p-6 text-grey">Our paid options are opening soon. Tell us what you&apos;re interested in below and we&apos;ll be in touch.</p> : (
            <ul className="grid gap-5 md:grid-cols-2">{products.map((p) => (
              <li key={p.key} className="rounded-2xl border-2 border-ink p-6"><h3 className="font-display text-xl font-extrabold">{p.name}</h3><p className="mt-1 text-2xl font-extrabold">{gbp(p.pricePence)} <span className="text-sm font-normal text-grey">{INTERVAL[p.interval]} + VAT</span></p><p className="mt-2 text-grey">{p.description}</p></li>))}</ul>
          )}
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            <li className="rounded-2xl bg-mist p-5"><h3 className="font-bold">Premium profile</h3><p className="text-sm text-grey">Photo gallery, offer banner, an enquiry form that sends leads straight to you, and click analytics.</p></li>
            <li className="rounded-2xl bg-mist p-5"><h3 className="font-bold">Featured placement</h3><p className="text-sm text-grey">A labelled “Sponsored” slot on relevant category and area pages. Shown fairly in rotation; never changes organic order.</p></li>
            <li className="rounded-2xl bg-mist p-5"><h3 className="font-bold">Podcast &amp; newsletter sponsorship</h3><p className="text-sm text-grey">Sponsor an episode or the weekly digest. Clearly labelled, and sponsors don&apos;t choose what we cover.</p></li>
          </ul>
        </section>

        <section aria-labelledby="policy" className="rounded-2xl border-2 border-ink bg-yellow-soft p-6"><h2 id="policy" className="mb-3 text-2xl font-extrabold">Our advertising &amp; sponsorship promise</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Everything paid is labelled — <strong>Sponsored</strong>, <strong>Advertisement</strong>, <strong>Partner</strong> or <strong>Advertorial</strong> — and visually distinct.</li>
            <li>Payment <strong>never</strong> affects ratings, reviews, search ranking, “Business of the Week” or editorial coverage. We don&apos;t sell, edit or remove reviews.</li>
            <li>Paid links are marked <code>rel=&quot;sponsored&quot;</code>. We don&apos;t run third-party ad scripts or tracking pixels.</li>
            <li>If PrimeStreet&apos;s founder owns a business that appears, we say so on the page.</li>
            <li>Ads and offers must be truthful and lawful; we can decline or remove anything misleading.</li>
          </ul></section>

        <section aria-labelledby="contact" className="max-w-2xl"><h2 id="contact" className="mb-3 text-2xl font-extrabold">Talk to us</h2><EnquiryForm formToken={formToken()} /></section>
      </Container>
    </>
  );
}
