import Link from "next/link";
import { Cell, Chip, DashTable, Empty, Panel, Progress, Row, Stat, StatRow, btn } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { extractLinks, linkSummary } from "@/lib/links";
import { gbp, monthlyPence } from "@/lib/commerce";
import { adminCreateArticle } from "../compose-actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const now = new Date();
  const [
    inReview, changeOpen, coverageOpen, revPending, revReported, drafts, sched, claims, subs,
    realBiz, sampleBiz, unpub, published, writers, pendingWriters, subsLive, products, newEnq, queue,
  ] = await Promise.all([
    db.article.count({ where: { status: "SUBMITTED" } }),
    db.profileChangeRequest.count({ where: { status: "OPEN" } }),
    db.coverageRequest.count({ where: { status: { in: ["NEW", "CONSIDERING"] } } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "PUBLISHED", reports: { some: { status: "OPEN" } } } }),
    db.article.count({ where: { status: "DRAFT" } }),
    db.article.count({ where: { status: "PUBLISHED", publishedAt: { gt: now } } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.businessSubmission.count({ where: { status: "PENDING" } }),
    db.business.count({ where: { isSample: false } }),
    db.business.count({ where: { isSample: true } }),
    db.business.count({ where: { published: false } }),
    db.article.count({ where: { status: "PUBLISHED", publishedAt: { lte: now } } }),
    db.author.findMany({ where: { active: true }, include: { _count: { select: { articles: true } } }, orderBy: { name: "asc" } }),
    db.author.count({ where: { passwordHash: null, invitedAt: { not: null } } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } } }),
    db.product.findMany(),
    db.salesEnquiry.count({ where: { status: "NEW" } }),
    db.article.findMany({ where: { status: "SUBMITTED" }, include: { author: true }, orderBy: { submittedAt: "asc" }, take: 5 }),
  ]);

  const price = new Map(products.map((p) => [p.key, p]));
  const mrr = subsLive.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  const needsYou = inReview + revPending + revReported + claims + subs + changeOpen + coverageOpen;
  const notReady = writers.filter((w) => w.passwordHash && (completeness(w).percent < MIN_TO_SUBMIT || !w.acceptedTermsAt));
  const LAUNCH_TARGET = 150;

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Overview</h1>
          <p className="mt-1 text-grey">
            {needsYou === 0 ? "Nothing is waiting on you." : `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} a decision from you.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={adminCreateArticle}><button className={btn()}>Write a piece</button></form>
          <Link href="/admin/review" className={btn("ghost")}>Review queue{inReview ? ` (${inReview})` : ""}</Link>
        </div>
      </header>

      <StatRow>
        <Stat label="Waiting for review" value={inReview} hint={inReview ? "Writers are waiting" : "Queue is clear"} tone={inReview ? "accent" : "plain"} href="/admin/review" />
        <Stat label="Ratings to moderate" value={revPending + revReported} hint={revReported ? `${revReported} reported` : "Nothing reported"} tone={revReported ? "warn" : "plain"} href="/admin/reviews" />
        <Stat label="Claims & submissions" value={claims + subs} hint="Business owners waiting" href="/admin/claims" />
        <Stat label="Owner inbox" value={changeOpen + coverageOpen} hint="Change requests and pitches" href="/admin/owner-inbox" />
      </StatRow>

      <div className="mb-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Next in the review queue" action={<Link href="/admin/review" className="font-bold underline">Open queue</Link>}>
          {queue.length === 0 ? (
            <Empty title="Nothing waiting">Submitted pieces appear here, oldest first.</Empty>
          ) : (
            <DashTable head={["Piece", "Writer", "Links", "Waiting since", ""]}>
              {queue.map((a) => {
                const s = linkSummary(extractLinks(a.body));
                return (
                  <Row key={a.id}>
                    <Cell className="font-bold [overflow-wrap:anywhere]">{a.title}</Cell>
                    <Cell className="whitespace-nowrap">
                      <span className="flex items-center gap-2"><Avatar src={a.author.imageUrl} name={a.author.name} size={28} />{a.author.name}</span>
                    </Cell>
                    <Cell>
                      <span className="flex flex-wrap gap-1">
                        <Chip tone="quiet">{s.total}</Chip>
                        {s.unsafe > 0 && <Chip tone="bad">{s.unsafe} unsafe</Chip>}
                      </span>
                    </Cell>
                    <Cell className="whitespace-nowrap text-grey">{a.submittedAt ? fmtDate(a.submittedAt) : "—"}</Cell>
                    <Cell><Link href={`/admin/review/${a.id}`} className="font-bold underline">Review</Link></Cell>
                  </Row>
                );
              })}
            </DashTable>
          )}
        </Panel>

        <div>
          <Panel title="Directory progress" description={`Launch target is ${LAUNCH_TARGET} real profiles.`}>
            <Progress percent={(realBiz / LAUNCH_TARGET) * 100} target={100} label={`${realBiz} real businesses`} />
            <ul className="mt-4 space-y-1 text-sm">
              <li><span className="text-grey">Published articles:</span> <strong>{published}</strong>{sched ? <span className="text-grey"> · {sched} scheduled</span> : null}</li>
              <li><span className="text-grey">Drafts:</span> <strong>{drafts}</strong></li>
              {sampleBiz > 0 && <li className="text-red-800"><strong>{sampleBiz} sample businesses</strong> still present — remove before launch</li>}
              {unpub > 0 && <li><span className="text-grey">Unpublished:</span> <strong>{unpub}</strong></li>}
            </ul>
          </Panel>

          <Panel title="Commerce">
            <StatRow cols={2}>
              <Stat label="Recurring / month" value={gbp(mrr)} tone={mrr ? "accent" : "plain"} />
              <Stat label="New enquiries" value={newEnq} href="/admin/commerce/enquiries" />
            </StatRow>
            <Link href="/admin/commerce" className="font-bold underline">Open commerce →</Link>
          </Panel>
        </div>
      </div>

      <Panel
        title={`Writers (${writers.length})`}
        description={pendingWriters ? `${pendingWriters} invited and yet to set a password.` : undefined}
        action={<Link href="/admin/authors" className="font-bold underline">Manage writers</Link>}
      >
        {writers.length === 0 ? (
          <Empty title="No writers yet" action={<Link href="/admin/authors" className={btn()}>Register a writer</Link>}>
            Register a writer and they are emailed a link to set their own password.
          </Empty>
        ) : (
          <DashTable head={["Writer", "Profile", "Published", "Can file?"]}>
            {writers.slice(0, 8).map((w) => {
              const c = completeness(w);
              const ready = c.percent >= MIN_TO_SUBMIT && !!w.acceptedTermsAt;
              return (
                <Row key={w.id}>
                  <Cell>
                    <span className="flex items-center gap-2">
                      <Avatar src={w.imageUrl} name={w.name} size={30} />
                      <Link href={`/admin/authors/${w.id}`} className="font-bold underline">{w.name}</Link>
                    </span>
                  </Cell>
                  <Cell className="min-w-[160px]"><Progress percent={c.percent} target={MIN_TO_SUBMIT} label="" /></Cell>
                  <Cell className="font-display text-lg font-extrabold">{w._count.articles}</Cell>
                  <Cell>
                    {!w.passwordHash ? <Chip tone="review">Not set up</Chip> : ready ? <Chip tone="live">Yes</Chip> : <Chip tone="bad">No</Chip>}
                  </Cell>
                </Row>
              );
            })}
          </DashTable>
        )}
        {notReady.length > 0 && (
          <p className="mt-4 text-sm text-grey">
            {notReady.length} {notReady.length === 1 ? "writer" : "writers"} cannot file yet because their profile is under {MIN_TO_SUBMIT}% or the terms are unaccepted.
          </p>
        )}
      </Panel>
    </>
  );
}
