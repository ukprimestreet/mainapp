import Link from "next/link";
import { Card, Metric, MetricRow, Notice, PageHead, area, btn, field, labelCls } from "@/components/Dash";
import { requireBusiness } from "@/lib/owner";
import { clicks30, getEntitlements } from "@/lib/commerce";
import { saveOffer } from "../../../../business-actions";

export const dynamic = "force-dynamic";

export default async function Offers({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params; const { msg } = await searchParams;
  const { business } = await requireBusiness(id);
  const [ent, clicks] = await Promise.all([getEntitlements(id), clicks30(id)]);

  return (
    <>
      <PageHead
        title="Offers"
        subtitle="A single line at the top of your profile for whatever you are pushing this month."
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {!ent.premium ? (
        <Card title="The offer banner is part of Premium">
          <p className="text-[15px] text-grey">
            Premium adds an offer banner, a photo gallery, an enquiry form and click analytics.
          </p>
          <Link href={`/owner/business/${id}/promote`} className={`${btn()} mt-4`}>See what Premium costs</Link>
        </Card>
      ) : (
        <>
          <MetricRow cols={2}>
            <Metric label="Clicks on your website link" value={clicks.website} hint="Last 30 days" icon="bolt" />
            <Metric label="Offer live now" value={business.promoText ? "Yes" : "No"} icon="tag" tone={business.promoText ? "accent" : "plain"} />
          </MetricRow>

          <Card title="Your offer" description="Keep it short and specific. Say what it is and when it ends.">
            <form action={saveOffer} className="max-w-2xl space-y-4">
              <input type="hidden" name="businessId" value={id} />
              <div>
                <label className={labelCls} htmlFor="promoText">The offer</label>
                <textarea id="promoText" name="promoText" rows={2} maxLength={140} defaultValue={business.promoText ?? ""} className={area}
                  placeholder="10% off deep cleans booked before the end of October" />
                <p className="mt-1 text-[13px] text-grey">Up to 140 characters. No HTML.</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="promoUrl">Where it links (optional)</label>
                <input id="promoUrl" name="promoUrl" defaultValue={business.promoUrl ?? ""} className={field} placeholder="https://yoursite.co.uk/offer" />
                <p className="mt-1 text-[13px] text-grey">Must be an https address on your own site.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btn()}>Save offer</button>
                {business.promoText && <Link href={`/owner/business/${id}`} className={btn("quiet")}>Back to profile</Link>}
              </div>
            </form>
          </Card>

          {business.promoText && (
            <Card title="How it looks" description="Roughly what a reader sees at the top of your profile.">
              <aside className="rounded-2xl border-2 border-ink bg-yellow-soft p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider">Offer from {business.name}</p>
                <p className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">{business.promoText}</p>
                {business.promoUrl && <p className="mt-2 font-bold underline">Find out more →</p>}
              </aside>
            </Card>
          )}
        </>
      )}

      <Card title="What works">
        <ul className="space-y-2.5 text-[15px]">
          <li><strong>Be specific.</strong> &ldquo;10% off deep cleans in October&rdquo; beats &ldquo;great rates&rdquo;.</li>
          <li><strong>Give it an end date.</strong> A real one. Never invent urgency.</li>
          <li><strong>Change it monthly.</strong> A stale offer from March reads worse than none at all.</li>
          <li><strong>Honour it.</strong> A reader who is told no at the counter will say so in a review, and we will not remove it.</li>
        </ul>
      </Card>
    </>
  );
}
