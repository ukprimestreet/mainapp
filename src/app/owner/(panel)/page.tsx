import Link from "next/link";
import { ClaimBadge } from "@/components/ui";
import { RatingBadge } from "@/components/Reviews";
import { Activity, BarChart, Card, Chip, Empty, Metric, MetricRow, Notice, PageHead, Progress, btn } from "@/components/Dash";
import { db } from "@/lib/db";
import { completeness, requireOwner } from "@/lib/owner";
import { bizPath } from "@/lib/queries";
import { clicks30, getEntitlements } from "@/lib/commerce";
import { businessClicks, businessEnquiries, businessViews } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function OwnerHome() {
  const owner = await requireOwner();
  const links = await db.businessOwner.findMany({
    where: { ownerId: owner.id },
    include: { business: { include: { category: true, city: true, location: true } } },
  });

  const rows = await Promise.all(links.map(async (l) => {
    const id = l.businessId;
    const [views, clickSeries, enquiries, ent, clicks, published, unanswered, newLeads, recentLeads, recentReviews] = await Promise.all([
      businessViews(id, 30), businessClicks(id, 30), businessEnquiries(id, 30),
      getEntitlements(id), clicks30(id),
      db.review.count({ where: { businessId: id, status: "PUBLISHED" } }),
      db.review.count({ where: { businessId: id, status: "PUBLISHED", response: null } }),
      db.lead.count({ where: { businessId: id, status: "NEW" } }),
      db.lead.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 3 }),
      db.review.findMany({ where: { businessId: id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 3 }),
    ]);
    return { b: l.business, c: completeness(l.business), views, clickSeries, enquiries, ent, clicks, published, unanswered, newLeads, recentLeads, recentReviews };
  }));

  if (rows.length === 0) {
    return (
      <>
        <PageHead title={`Welcome, ${owner.name.split(" ")[0]}`} />
        <Empty title="You don't manage any businesses right now" icon="shop" action={<Link href="/claim" className={btn()}>Claim your business</Link>}>
          If your access was removed and you think that is a mistake, get in touch.
        </Empty>
      </>
    );
  }

  const totals = rows.reduce((a, r) => ({
    views: a.views + r.views.total, enquiries: a.enquiries + r.enquiries.total,
    unanswered: a.unanswered + r.unanswered, clicks: a.clicks + r.clickSeries.total,
  }), { views: 0, enquiries: 0, unanswered: 0, clicks: 0 });

  return (
    <>
      <PageHead
        title={`Welcome, ${owner.name.split(" ")[0]}`}
        subtitle="How people are finding you on PrimeStreet, and anything waiting on you. Every figure here is a real person, counted — nothing is estimated."
      />

      {totals.unanswered > 0 && (
        <Notice tone="warn" title="Worth two minutes">
          {totals.unanswered === 1 ? "One review has no reply from you yet." : `${totals.unanswered} reviews have no reply from you yet.`}{" "}
          A public reply is the single most useful thing you can do here — readers take it as a sign someone is paying attention.
        </Notice>
      )}

      <MetricRow>
        <Metric label="Profile views" value={totals.views.toLocaleString()} series={rows[0].views} icon="chart" tone="accent" />
        <Metric label="Clicks to you" value={totals.clicks} series={rows[0].clickSeries} icon="bolt" hint="Website, phone and directions" />
        <Metric label="Enquiries" value={totals.enquiries} series={rows[0].enquiries} icon="inbox" tone={totals.enquiries ? "plain" : "plain"} />
        <Metric label="Reviews to answer" value={totals.unanswered} icon="star" tone={totals.unanswered ? "warn" : "plain"} hint={totals.unanswered ? "A reply is public" : "All answered"} />
      </MetricRow>

      {rows.map(({ b, c, views, clickSeries, enquiries, ent, clicks, published, unanswered, newLeads, recentLeads, recentReviews }) => (
        <div key={b.id} className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight">{b.name}</h2>
              <p className="text-[14px] text-grey">{b.category.name} · {b.location.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ClaimBadge status={b.claimStatus} />
              {ent.premium && <Chip tone="good">Premium</Chip>}
              <RatingBadge avg={b.ratingAvg} count={b.ratingCount} />
            </div>
          </div>

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Card title="Profile views" description="Last 30 days.">
                {views.total === 0
                  ? <Empty title="No views yet" icon="chart">Once people start finding your profile, the shape of it appears here.</Empty>
                  : <BarChart series={views} label={`Views of ${b.name}`} />}
              </Card>

              <Card title="What people did next" description="Premium shows the full breakdown.">
                <MetricRow cols={3}>
                  <Metric label="Website" value={ent.premium ? clicks.website : "—"} hint={ent.premium ? "Last 30 days" : "Premium shows this"} />
                  <Metric label="Phone" value={ent.premium ? clicks.phone : "—"} hint={ent.premium ? "Last 30 days" : "Premium shows this"} />
                  <Metric label="Directions" value={ent.premium ? clicks.directions : "—"} hint={ent.premium ? "Last 30 days" : "Premium shows this"} />
                </MetricRow>
                {!ent.premium && (
                  <p className="text-[13px] text-grey">
                    Premium adds a photo gallery, an offer banner, an enquiry form and these numbers.{" "}
                    <Link href={`/owner/business/${b.id}/promote`} className="font-bold underline">See what it costs</Link>.
                    It never changes your rating, your reviews or where you appear in search.
                  </p>
                )}
              </Card>
            </div>

            <div className="min-w-0">
              <Card title="Profile completeness">
                <Progress percent={c.pct} label="" />
                {c.pct < 100 ? (
                  <>
                    <p className="mt-3 text-[14px] text-grey">Next to add:</p>
                    <ul className="mt-1.5 space-y-1 text-[14px] font-semibold">
                      {c.items.filter(([, ok]) => !ok).slice(0, 4).map(([n]) => <li key={n}>· {n}</li>)}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-[14px] text-grey">Everything is filled in. Keep hours and photos current.</p>
                )}
                <Link href={`/owner/business/${b.id}`} className={`${btn("ghost")} mt-4 w-full`}>Edit profile</Link>
              </Card>

              <Card title="Recent" description={`${published} published ${published === 1 ? "review" : "reviews"}${newLeads ? ` · ${newLeads} new ${newLeads === 1 ? "enquiry" : "enquiries"}` : ""}`}>
                <Activity items={[
                  ...recentLeads.map((l) => ({ icon: "inbox" as const, title: <>Enquiry from <strong>{l.name}</strong></>, meta: ago(l.createdAt), href: `/owner/business/${b.id}/leads` })),
                  ...recentReviews.map((r) => ({ icon: "star" as const, title: <>{r.rating}★ {r.response ? "— you replied" : "— no reply yet"}</>, meta: ago(r.createdAt), href: `/owner/business/${b.id}/reviews` })),
                ].slice(0, 6)} />
              </Card>

              <div className="flex flex-wrap gap-2">
                <Link href={`/owner/business/${b.id}/leads`} className={btn("quiet")}>Enquiries{newLeads ? ` (${newLeads})` : ""}</Link>
                <Link href={`/owner/business/${b.id}/reviews`} className={btn("quiet")}>Reviews{unanswered ? ` (${unanswered})` : ""}</Link>
                <Link href={`/owner/business/${b.id}/promote`} className={btn("quiet")}>Promote</Link>
                <Link href={`/owner/business/${b.id}/coverage`} className={btn("quiet")}>Tell us your story</Link>
                <Link href={bizPath(b)} className={btn("quiet")}>View public page</Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
