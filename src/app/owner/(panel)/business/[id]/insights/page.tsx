import Link from "next/link";
import { BarChart, Breakdown, Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn } from "@/components/Dash";
import { requireBusiness } from "@/lib/owner";
import { businessClicks, businessEnquiries, businessViews, dayKey, daysAgo } from "@/lib/analytics";
import { clicks30, getEntitlements } from "@/lib/commerce";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Insights({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business } = await requireBusiness(id);
  const [views, clickSeries, enquiries, ent, clicks, reviews, peers, terms] = await Promise.all([
    businessViews(id, 30), businessClicks(id, 30), businessEnquiries(id, 30),
    getEntitlements(id), clicks30(id),
    db.review.aggregate({ where: { businessId: id, status: "PUBLISHED" }, _avg: { rating: true }, _count: true }),
    // The category average, so a number has something to be compared against.
    db.businessStat.groupBy({
      by: ["businessId"],
      where: { day: { gte: dayKey(daysAgo(29)) }, business: { categoryId: business.categoryId, locationId: business.locationId, published: true } },
      _sum: { views: true },
    }),
    db.searchTerm.findMany({ where: { day: { gte: dayKey(daysAgo(29)) }, zeroCount: 0 }, orderBy: { count: "desc" }, take: 8 }),
  ]);

  const peerTotals = peers.map((p) => p._sum.views ?? 0).filter((n) => n > 0);
  const peerAvg = peerTotals.length ? Math.round(peerTotals.reduce((a, b) => a + b, 0) / peerTotals.length) : 0;
  const vsPeers = peerAvg > 0 ? Math.round(((views.total - peerAvg) / peerAvg) * 100) : null;
  const totalClicks = clicks.website + clicks.phone + clicks.directions;
  const convert = views.total > 0 ? ((totalClicks / views.total) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PageHead
        title="Insights"
        subtitle={`How people are finding and using your ${business.name} profile. Counted from real page views — nothing here is estimated.`}
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />

      <MetricRow>
        <Metric label="Profile views" value={views.total.toLocaleString()} series={views} icon="chart" tone="accent" />
        <Metric label="Clicks to you" value={totalClicks} series={clickSeries} icon="bolt" hint="Website, phone, directions" />
        <Metric label="Enquiries" value={enquiries.total} series={enquiries} icon="inbox" />
        <Metric label="Rating" value={reviews._avg.rating ? reviews._avg.rating.toFixed(1) : "—"} icon="star" hint={`${reviews._count} ${reviews._count === 1 ? "review" : "reviews"}`} />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Views, day by day" description="Last 30 days.">
            {views.total === 0
              ? <Empty title="No views yet" icon="chart">Once people start finding your profile this fills in.</Empty>
              : <BarChart series={views} label={`Views of ${business.name}`} />}
          </Card>

          <Card title="What people did next" description={ent.premium ? "Of everyone who saw your profile." : "Premium shows the breakdown."}>
            {ent.premium ? (
              <>
                <Breakdown rows={[
                  { label: "Clicked your website", value: clicks.website },
                  { label: "Tapped your phone number", value: clicks.phone, tone: "yellow" },
                  { label: "Asked for directions", value: clicks.directions },
                ]} />
                <p className="mt-5 text-[14px] text-grey">
                  <strong className="text-ink">{convert}%</strong> of people who viewed your profile went on to contact you or look you up.
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] text-grey">
                  We are counting these for you already. Premium shows you the numbers, adds a photo gallery, an offer banner and an enquiry form.
                </p>
                <Link href={`/owner/business/${id}/promote`} className={`${btn()} mt-4`}>See what Premium costs</Link>
                <p className="mt-3 text-[13px] text-grey">It never changes your rating, your reviews or where you appear in search.</p>
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Against similar businesses" description={`Others in ${business.category.name} in ${business.location.name}.`}>
            {peerAvg === 0 ? (
              <p className="text-[14px] text-grey">Not enough comparable businesses yet to be worth showing.</p>
            ) : (
              <>
                <Metric label="Their average views" value={peerAvg.toLocaleString()} hint="Last 30 days" />
                <p className="mt-3 text-[15px]">
                  {vsPeers === null ? null : vsPeers >= 0
                    ? <>You are getting <strong>{vsPeers}% more</strong> views than the typical {business.category.name.toLowerCase()} business in {business.location.name}.</>
                    : <>You are getting <strong>{Math.abs(vsPeers)}% fewer</strong> views than the typical {business.category.name.toLowerCase()} business in {business.location.name}.</>}
                </p>
                <p className="mt-2 text-[13px] text-grey">
                  An average, not a league table. We will never name another business or tell them about you.
                </p>
              </>
            )}
          </Card>

          <Card title="What people are searching for" description="Across PrimeStreet, last 30 days.">
            {terms.length === 0 ? (
              <p className="text-[14px] text-grey">No searches recorded yet.</p>
            ) : (
              <Table head={["Search", "Times"]}>
                {terms.map((t) => (
                  <Row key={`${t.day}-${t.q}`}>
                    <Cell className="font-semibold [overflow-wrap:anywhere]">{t.q}</Cell>
                    <Cell className="font-display font-extrabold tabular-nums">{t.count}</Cell>
                  </Row>
                ))}
              </Table>
            )}
            <p className="mt-4 text-[13px] text-grey">
              These are searches across the whole site, not just ones that found you. Useful for the words you use in your own description.
            </p>
          </Card>

          <Notice tone="info" title="How we count">
            One row per page view. No sampling, no modelling, and bots are excluded. If a number looks wrong, tell us and we will check it by hand.
          </Notice>
        </div>
      </div>
    </>
  );
}
