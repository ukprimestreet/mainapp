import Link from "next/link";
import { db } from "@/lib/db";

export default async function Dashboard() {
  const [changeOpen, coverageOpen, revPending, revReported, drafts, sched, claims, subs, total, real, sample, unpub] = await Promise.all([
    db.profileChangeRequest.count({ where: { status: "OPEN" } }),
    db.coverageRequest.count({ where: { status: { in: ["NEW", "CONSIDERING"] } } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "PUBLISHED", reports: { some: { status: "OPEN" } } } }),
    db.article.count({ where: { status: "DRAFT" } }),
    db.article.count({ where: { status: "PUBLISHED", publishedAt: { gt: new Date() } } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.businessSubmission.count({ where: { status: "PENDING" } }),
    db.business.count(), db.business.count({ where: { isSample: false } }), db.business.count({ where: { isSample: true } }), db.business.count({ where: { published: false } }),
  ]);
  const tile = (n: number, label: string, href: string) => (
    <Link href={href} className="block rounded-2xl border-2 border-ink p-5 hover:bg-yellow"><span className="font-display text-4xl font-extrabold">{n}</span><span className="mt-1 block font-bold">{label}</span></Link>
  );
  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tile(changeOpen + coverageOpen, "Owner requests & pitches", "/admin/owner-inbox")}
        {tile(revPending, "Reviews awaiting moderation", "/admin/reviews?tab=pending")}
        {tile(revReported, "Reported reviews", "/admin/reviews?tab=reported")}
        {tile(drafts, "Article drafts", "/admin/articles?status=draft")}
        {tile(sched, "Scheduled articles", "/admin/articles?status=scheduled")}
        {tile(claims, "Claims awaiting review", "/admin/claims")}
        {tile(subs, "Submissions awaiting review", "/admin/submissions")}
        {tile(unpub, "Unpublished businesses", "/admin/businesses")}
      </div>
      <p className="mt-8 text-grey">{total} businesses: <strong className="text-ink">{real} real</strong>, {sample} sample. Launch target: replace all sample data with researched real profiles.</p>
    </>
  );
}
