import { OwnerTabs } from "@/components/OwnerTabs";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/owner";
import { stars } from "@/lib/reviews";
import { ReviewRow } from "./ReviewRow";

export default async function OwnerReviews({ params }: { params: Promise<{ id: string }> }) {
  const { business: b } = await requireBusiness((await params).id);
  const reviews = await db.review.findMany({ where: { businessId: b.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="reviews" />
      <p className="mb-6 max-w-2xl text-grey">You can reply publicly to any published review and report reviews that break our guidelines. You can&apos;t edit or delete reviews — that keeps ratings trustworthy for everyone, including you.</p>
      {reviews.length === 0 && <p className="rounded-xl border-2 border-dashed border-line p-6">No published reviews yet.</p>}
      <ul className="space-y-6">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line p-5">
            <p className="text-sm"><span><span className="sr-only">{r.rating} out of 5 stars</span><span aria-hidden>{stars(r.rating)}</span></span> <strong>{r.authorName}</strong> <span className="text-grey">· {fmtDate(r.createdAt)}</span></p>
            {r.title && <p className="mt-1 font-extrabold [overflow-wrap:anywhere]">{r.title}</p>}
            <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{r.body}</p>
            <ReviewRow reviewId={r.id} response={r.response ?? ""} />
          </li>
        ))}
      </ul>
    </>
  );
}
