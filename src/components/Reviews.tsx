import Link from "next/link";
import { db } from "@/lib/db";
import { ratingSummary, stars } from "@/lib/reviews";
import { formToken } from "@/lib/antispam";
import { fmtDate } from "./Cards";
import { ReportButton } from "./ReportButton";

export function RatingBadge({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg == null) return null;
  return <span className="relative inline-flex items-center gap-1 text-sm font-bold"><span className="sr-only">Rated {avg} out of 5 from {count} {count === 1 ? "review" : "reviews"}</span><span aria-hidden>★ {avg.toFixed(1)} <span className="font-normal text-grey">({count})</span></span></span>;
}

export async function ReviewsSection({ business }: { business: { id: string; slug: string; name: string; isSample: boolean; ratingAvg: number | null; ratingCount: number } }) {
  const [reviews, dist] = await Promise.all([
    db.review.findMany({ where: { businessId: business.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 50 }),
    ratingSummary(business.id),
  ]);
  const ft = formToken();
  return (
    <section aria-labelledby="reviews">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews" className="text-2xl font-extrabold">Reviews</h2>
        {!business.isSample && <Link href={`/review/${business.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold hover:bg-yellow-hover">Write a review</Link>}
      </div>
      {reviews.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-line bg-mist p-6 text-grey">{business.isSample ? "Sample business — reviews are disabled." : `No reviews yet. Been to ${business.name}? Be the first to share your experience.`}</p>
      ) : (
        <>
          <div className="mb-6 grid gap-6 rounded-2xl border border-line p-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div><p className="font-display text-5xl font-extrabold">{business.ratingAvg?.toFixed(1)}</p><p aria-hidden className="text-lg">{stars(business.ratingAvg ?? 0)}</p><p className="text-sm text-grey">{business.ratingCount} {business.ratingCount === 1 ? "review" : "reviews"}</p></div>
            <ul className="space-y-1 text-sm" aria-label="Rating breakdown">{dist.map((d) => <li key={d.rating} className="flex items-center gap-2"><span className="w-12">{d.rating} star{d.rating > 1 ? "s" : ""}</span><span className="h-3 flex-1 overflow-hidden rounded bg-mist"><span className="block h-full bg-ink" style={{ width: `${business.ratingCount ? (d.count / business.ratingCount) * 100 : 0}%` }} /></span><span className="w-6 text-right">{d.count}</span></li>)}</ul>
          </div>
          <ul className="space-y-6">
            {reviews.map((r) => (
              <li key={r.id} id={`review-${r.id}`} className="border-b border-line pb-6">
                <p className="flex flex-wrap items-center gap-x-3 text-sm"><span className="relative"><span className="sr-only">{r.rating} out of 5 stars</span><span aria-hidden>{stars(r.rating)}</span></span><strong>{r.authorName}</strong><time dateTime={r.createdAt.toISOString()} className="text-grey">{fmtDate(r.createdAt)}</time>{r.editedAt && <span className="text-grey">(edited)</span>}</p>
                {r.title && <h3 className="mt-1 text-lg font-extrabold [overflow-wrap:anywhere]">{r.title}</h3>}
                <p className="mt-1 whitespace-pre-line break-words [overflow-wrap:anywhere]">{r.body}</p>
                {r.response && (
                  <div className="mt-3 rounded-xl border-l-4 border-yellow bg-mist p-4"><p className="text-sm font-bold">Response from {business.name}{r.respondedAt ? <span className="font-normal text-grey"> · {fmtDate(r.respondedAt)}</span> : null}</p><p className="mt-1 whitespace-pre-line break-words text-sm [overflow-wrap:anywhere]">{r.response}</p></div>
                )}
                <ReportButton reviewId={r.id} formToken={ft} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-grey">PrimeStreet doesn&apos;t sell or remove reviews. Every review is email-verified and moderated; businesses can respond but not edit them.</p>
        </>
      )}
    </section>
  );
}
