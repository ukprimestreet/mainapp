import Link from "next/link";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { articlePath, bizPath } from "@/lib/queries";
import { RatingBadge } from "./Reviews";
import { SaveButton } from "./SaveButton";
import { fmtKm } from "@/lib/geo";
import { ClaimBadge, DisclosureBadge, Label, SampleBadge, Thumb } from "./ui";

type Biz = { id?: string; ratingAvg?: number | null; ratingCount?: number; imageUrl?: string | null; name: string; slug: string; summary: string; claimStatus: string; isSample: boolean; category: { name: string; slug: string }; location: { name: string }; city: { slug: string } };
export function BusinessCard({ b, level = 3, distanceKm, approx, open, refreshOnSave }: { b: Biz; level?: 2 | 3; distanceKm?: number | null; approx?: boolean; open?: boolean | null; refreshOnSave?: boolean }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:border-ink hover:shadow-[6px_6px_0_var(--prime-yellow)]">
      <Thumb text={b.name} src={b.imageUrl} className="h-28 w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-grey">{b.category.name} · {b.location.name}</p>
        <H className="text-lg font-extrabold leading-snug">
          <Link href={bizPath(b)} className="after:absolute after:inset-0">{b.name}</Link>
        </H>
        <p className="text-sm text-grey">{b.summary}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><RatingBadge avg={b.ratingAvg ?? null} count={b.ratingCount ?? 0} />{distanceKm != null && <span className="text-sm font-bold">{approx ? "≈ " : ""}{fmtKm(distanceKm)} away</span>}{open === true && <span className="text-sm font-bold"><span aria-hidden>● </span>Open now</span>}{open === false && <span className="text-sm text-grey">Closed now</span>}</div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2"><ClaimBadge status={b.claimStatus} />{b.isSample && <SampleBadge />}{b.id && <span className="ml-auto"><SaveButton id={b.id} name={b.name} compact refreshOnChange={refreshOnSave} /></span>}</div>
      </div>
    </article>
  );
}

type Art = { type: string; slug: string; title: string; standfirst: string; disclosure: string; isSample: boolean; publishedAt: Date | null; location?: { name: string } | null };
export const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d) : "");

export function ArticleCard({ a, large = false, level = 3 }: { a: Art; large?: boolean; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  const t = ARTICLE_TYPES[a.type as ArticleType];
  return (
    <article className="group relative flex flex-col gap-3">
      <Thumb text={a.title} className={large ? "h-64 rounded-2xl" : "h-40 rounded-2xl"} />
      <div className="flex flex-wrap items-center gap-2"><Label>{t.label}</Label><DisclosureBadge kind={a.disclosure} />{a.isSample && <SampleBadge />}</div>
      <H className={`${large ? "text-3xl" : "text-xl"} font-extrabold leading-tight`}>
        <Link href={articlePath(a)} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-yellow group-hover:decoration-4 group-hover:underline-offset-4">{a.title}</Link>
      </H>
      <p className="text-grey">{a.standfirst}</p>
      <p className="text-xs text-grey">{a.location ? `${a.location.name} · ` : ""}{fmtDate(a.publishedAt)}</p>
    </article>
  );
}
