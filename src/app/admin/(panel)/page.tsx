import Link from "next/link";
import { Activity, BarChart, Breakdown, Card, Cell, Chip, Empty, Metric, MetricRow, PageHead, Progress, Row, Table, btn } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { gbp, monthlyPence } from "@/lib/commerce";
import { queueAge, siteRevenue, siteSearches, siteViews, sitePublished } from "@/lib/analytics";
import { adminCreateArticle } from "../compose-actions";

export const dynamic = "force-dynamic";

const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function Dashboard() {
  const now = new Date();
  const [
    views, searches, revenue, published, queue,
    ratings, reportedRatings, claims, subs, inbox, enquiries,
    realBiz, sampleBiz, unpub, liveArticles, writers, subsLive, products,
    recentReviews, recentLeads, recentClaims, recentDecisions, clicksByKind,
  ] = await Promise.all([
    siteViews(30), siteSearches(30), siteRevenue(30), sitePublished(30), queueAge(),
    db.review.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "PUBLISHED", reports: { some: { status: "OPEN" } } } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.businessSubmission.count({ where: { status: "PENDING" } }),
    db.profileChangeRequest.count({ where: { status: "OPEN" } }),
    db.salesEnquiry.count({ where: { status: "NEW" } }),
    db.business.count({ where: { isSample: false } }),
    db.business.count({ where: { isSample: true } }),
    db.business.count({ where: { published: false } }),
    db.article.count({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } }),
    db.author.findMany({ where: { active: true }, include: { _count: { select: { articles: true } } } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } } }),
    db.product.findMany(),
    db.review.findMany({ orderBy: { createdAt: "desc" }, take: 4, include: { business: { select: { name: true } } } }),
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 4, include: { business: { select: { name: true } } } }),
    db.claimRequest.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { business: { select: { name: true } } } }),
    db.articleReview.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { article: { select: { title: true } } } }),
    db.businessClick.groupBy({ by: ["kind"], _sum: { count: true } }),
  ]);

  const price = new Map(products.map((p) => [p.key, p]));
  const mrr = subsLive.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  const decisions = queue.count + ratings + reportedRatings + claims + subs + inbox + enquiries;
  const notReady = writers.filter((w) => w.passwordHash && (completeness(w).percent < MIN_TO_SUBMIT || !w.acceptedTermsAt));
  const LAUNCH_TARGET = 150;

  const feed = [
    ...recentLeads.map((l) => ({ icon: "inbox" as const, title: <>Enquiry for <strong>{l.business.name}</strong></>, meta: `${l.name} · ${ago(l.createdAt)}`, href: "/admin/businesses" })),
    ...recentReviews.map((r) => ({ icon: "star" as const, title: <>{r.rating}★ review of <strong>{r.business.name}</strong></>, meta: `${r.status.toLowerCase()} · ${ago(r.createdAt)}`, href: "/admin/reviews" })),
    ...recentClaims.map((c) => ({ icon: "shield" as const, title: <>Claim on <strong>{c.business.name}</strong></>, meta: `${c.status.toLowerCase()} · ${ago(c.createdAt)}`, href: "/admin/claims" })),
    ...recentDecisions.map((d) => ({ icon: "check" as const, title: <>{d.decision === "APPROVED" ? "Published" : "Returned"} “{d.article.title}”</>, meta: `${d.reviewer} · ${ago(d.createdAt)}`, href: "/admin/review" })),
  ].sort(() => 0).slice(0, 9);

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={decisions === 0
          ? "Nothing is waiting on you. Everything below is for information."
          : `${decisions} ${decisions === 1 ? "thing needs" : "things need"} a decision from you.`}
        actions={
          <>
            <form action={adminCreateArticle}><button className={btn()}>Write a piece</button></form>
            <Link href="/admin/review" className={btn("ghost")}>Review queue{queue.count ? ` · ${queue.count}` : ""}</Link>
          </>
        }
      />

      <MetricRow>
        <Metric label="Profile views" value={views.total.toLocaleString()} series={views} icon="chart" tone={views.total ? "accent" : "plain"} />
        <Metric label="Searches" value={searches.total.toLocaleString()} series={searches} icon="search" />
        <Metric label="Published" value={published.total} series={published} icon="file" hint="Last 30 days" />
        <Metric label="Recurring revenue" value={gbp(mrr)} unit="/mo" icon="card" tone="dark" hint={`${subsLive.length} active ${subsLive.length === 1 ? "plan" : "plans"}`} />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Profile views" description="Last 30 days, counted from real page views — no sampling, no estimates.">
            {views.total === 0
              ? <Empty title="No views recorded yet" icon="chart">Once the directory has real businesses and traffic, this fills in.</Empty>
              : <BarChart series={views} label="Profile views" />}
          </Card>

          <Card title="Waiting on you" description="Everything that needs a human decision, in one place.">
            {decisions === 0 ? (
              <Empty title="All clear" icon="check">Nothing is waiting for a decision.</Empty>
            ) : (
              <Table head={["What", "Count", "Oldest", ""]}>
                {[
                  { label: "Articles for review", n: queue.count, href: "/admin/review", age: queue.oldestHours ? `${queue.oldestHours}h` : "—" },
                  { label: "Ratings to moderate", n: ratings, href: "/admin/reviews?tab=pending", age: "—" },
                  { label: "Reported ratings", n: reportedRatings, href: "/admin/reviews?tab=reported", age: "—" },
                  { label: "Business claims", n: claims, href: "/admin/claims", age: "—" },
                  { label: "Business submissions", n: subs, href: "/admin/submissions", age: "—" },
                  { label: "Owner requests", n: inbox, href: "/admin/owner-inbox", age: "—" },
                  { label: "Sales enquiries", n: enquiries, href: "/admin/commerce/enquiries", age: "—" },
                ].filter((r) => r.n > 0).map((r) => (
                  <Row key={r.label}>
                    <Cell className="font-semibold">{r.label}</Cell>
                    <Cell><Chip tone={r.n > 5 ? "review" : "quiet"}>{r.n}</Chip></Cell>
                    <Cell className="text-grey">{r.age}</Cell>
                    <Cell><Link href={r.href} className="font-bold underline">Open</Link></Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card title={`Writers (${writers.length})`} action={<Link href="/admin/authors" className="font-bold underline">Manage</Link>}>
            {writers.length === 0 ? (
              <Empty title="No writers yet" icon="users" action={<Link href="/admin/authors" className={btn()}>Register a writer</Link>}>
                Register one and they are emailed a link to set their own password.
              </Empty>
            ) : (
              <Table head={["Writer", "Profile", "Published", "Can file?"]}>
                {writers.slice(0, 6).map((w) => {
                  const c = completeness(w);
                  const ready = c.percent >= MIN_TO_SUBMIT && !!w.acceptedTermsAt;
                  return (
                    <Row key={w.id}>
                      <Cell>
                        <span className="flex items-center gap-2.5">
                          <Avatar src={w.imageUrl} name={w.name} size={30} />
                          <Link href={`/admin/authors/${w.id}`} className="font-semibold underline">{w.name}</Link>
                        </span>
                      </Cell>
                      <Cell className="min-w-[150px]"><Progress percent={c.percent} target={MIN_TO_SUBMIT} label="" /></Cell>
                      <Cell className="font-display font-extrabold tabular-nums">{w._count.articles}</Cell>
                      <Cell>{!w.passwordHash ? <Chip tone="review">Not set up</Chip> : ready ? <Chip tone="live">Yes</Chip> : <Chip tone="bad">No</Chip>}</Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
            {notReady.length > 0 && (
              <p className="mt-4 text-[13px] text-grey">
                {notReady.length} {notReady.length === 1 ? "writer cannot" : "writers cannot"} file yet: profile under {MIN_TO_SUBMIT}% or terms unaccepted.
              </p>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Launch progress" description={`Target: ${LAUNCH_TARGET} real business profiles.`}>
            <Progress percent={(realBiz / LAUNCH_TARGET) * 100} label={`${realBiz} real ${realBiz === 1 ? "business" : "businesses"}`} />
            <ul className="mt-4 space-y-1.5 text-[14px]">
              <li><span className="text-grey">Published articles</span> <strong className="float-right tabular-nums">{liveArticles}</strong></li>
              {unpub > 0 && <li><span className="text-grey">Unpublished</span> <strong className="float-right tabular-nums">{unpub}</strong></li>}
              {sampleBiz > 0 && <li className="font-bold text-red-800">{sampleBiz} sample businesses still present — remove before launch</li>}
            </ul>
          </Card>

          <Card title="Where clicks go" description="Across every business profile, all time.">
            <Breakdown
              rows={[
                { label: "Website", value: clicksByKind.find((k) => k.kind === "website")?._sum.count ?? 0 },
                { label: "Phone", value: clicksByKind.find((k) => k.kind === "phone")?._sum.count ?? 0, tone: "yellow" },
                { label: "Directions", value: clicksByKind.find((k) => k.kind === "directions")?._sum.count ?? 0 },
              ]}
            />
          </Card>

          <Card title="Revenue" action={<Link href="/admin/commerce" className="font-bold underline">Commerce</Link>}>
            <Metric label="Paid in the last 30 days" value={gbp(revenue.total)} series={revenue} />
          </Card>

          <Card title="Recent activity">
            <Activity items={feed} />
          </Card>
        </div>
      </div>
    </>
  );
}
