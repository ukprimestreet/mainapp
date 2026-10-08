import Link from "next/link";
import { notFound } from "next/navigation";
import { Cell, Chip, DashTable, Notice, Panel, Progress, Row, Stat, StatRow, area, btn, labelCls } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { Blocks } from "@/components/Blocks";
import { parseBlocks } from "@/lib/blocks";
import { fmtDate } from "@/components/Cards";
import { ARTICLE_TYPES, DISCLOSURE, type ArticleType, type Disclosure } from "@/lib/constants";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { reviewPacket } from "@/lib/editorial-flow";
import { signedUrl } from "@/lib/storage";
import { decide } from "../../../editorial-actions";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

const KIND_LABEL = { text: "Text link", image: "Image", video: "Video", bare: "Bare URL" } as const;

export default async function ReviewOne({ params, searchParams }: P) {
  const { id } = await params; const { msg } = await searchParams;
  const packet = await reviewPacket(id);
  if (!packet) notFound();
  const { article: a, links, summary } = packet;
  const c = completeness(a.author);
  const cv = a.author.cvUrl ? await signedUrl(a.author.cvUrl, 600) : null;
  const words = a.body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/review" className="font-bold underline">← Review queue</Link></p>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip tone="review">{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Chip>
            <Chip tone={a.disclosure === "EDITORIAL" ? "quiet" : "bad"}>{DISCLOSURE[a.disclosure as Disclosure]?.label ?? a.disclosure}</Chip>
            {a.status !== "SUBMITTED" && <Chip tone="draft">{a.status}</Chip>}
          </div>
          <h1 className="font-display text-3xl font-extrabold leading-tight [overflow-wrap:anywhere]">{a.title}</h1>
          <p className="mt-2 max-w-3xl text-grey [overflow-wrap:anywhere]">{a.standfirst}</p>
        </div>
      </div>
      {msg && <Notice tone="warn" title="Not done">{msg}</Notice>}

      {a.disclosure !== "EDITORIAL" && (
        <Notice tone="bad" title="Paid content">
          This is labelled {DISCLOSURE[a.disclosure as Disclosure]?.label}{a.sponsorName ? ` for ${a.sponsorName}` : ""}.
          {!a.sponsorName && " No sponsor is named — it must be before this can go live."}
        </Notice>
      )}

      <StatRow>
        <Stat label="Words" value={words} />
        <Stat label="Links" value={summary.total} hint={`${summary.external} external · ${summary.internal} internal`} tone={summary.unsafe ? "warn" : "plain"} />
        <Stat label="Videos" value={summary.videos} />
        <Stat label="Unsafe links" value={summary.unsafe} tone={summary.unsafe ? "warn" : "plain"} hint={summary.unsafe ? "Not http or https" : "None"} />
      </StatRow>

      {/* The link audit: what every clickable thing points at, without reading the piece. */}
      <Panel title="Every link in this piece" description="Read this before the copy. It shows what each clickable thing is and where it goes.">
        {links.length === 0 ? (
          <p className="text-grey">No links, images or embeds in this piece.</p>
        ) : (
          <DashTable head={["What is clickable", "Type", "Goes to", "Scope"]}>
            {links.map((l, i) => (
              <Row key={i}>
                <Cell className="max-w-xs font-bold [overflow-wrap:anywhere]">{l.anchor}</Cell>
                <Cell className="whitespace-nowrap">{KIND_LABEL[l.kind]}</Cell>
                <Cell className="max-w-md [overflow-wrap:anywhere]">
                  {l.scope === "unsafe" ? <code className="rounded bg-mist px-1">{l.url}</code> : (
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">{l.url}</a>
                  )}
                </Cell>
                <Cell>
                  <Chip tone={l.scope === "unsafe" ? "bad" : l.scope === "external" ? "draft" : "quiet"}>
                    {l.scope === "internal" ? "Ours" : l.scope === "external" ? l.host ?? "external" : "Unsafe"}
                  </Chip>
                </Cell>
              </Row>
            ))}
          </DashTable>
        )}
        {summary.unsafe > 0 && (
          <p className="mt-4 rounded-xl border-2 border-red-700 p-3 text-sm font-bold text-red-800">
            An unsafe link is anything that is not http(s) or a path on this site. These are never rendered as links, but they should not be there.
          </p>
        )}
      </Panel>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Panel title="The piece">
            {a.imageUrl && <img src={a.imageUrl} alt={a.imageAlt ?? ""} className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover" />}
            <div className="max-w-none"><Blocks text={a.body} blocks={parseBlocks(a.blocks)} /></div>
          </Panel>
        </div>

        <div className="min-w-0">
          <Panel title="The writer">
            <div className="flex items-center gap-3">
              <Avatar src={a.author.imageUrl} name={a.author.name} size={52} />
              <div className="min-w-0">
                <Link href={`/admin/authors/${a.author.id}`} className="font-bold underline [overflow-wrap:anywhere]">{a.author.name}</Link>
                <p className="text-xs text-grey [overflow-wrap:anywhere]">{a.author.email}</p>
              </div>
            </div>
            <div className="mt-4"><Progress percent={c.percent} target={MIN_TO_SUBMIT} label="Profile" /></div>
            <ul className="mt-4 space-y-1 text-sm">
              {a.author.phone && <li><span className="text-grey">Phone:</span> <strong>{a.author.phone}</strong></li>}
              {a.author.basedIn && <li><span className="text-grey">Based in:</span> <strong>{a.author.basedIn}</strong></li>}
              <li><span className="text-grey">Terms:</span> <strong>{a.author.acceptedTermsAt ? `accepted ${fmtDate(a.author.acceptedTermsAt)}` : "not accepted"}</strong></li>
              {cv && <li><a href={cv} target="_blank" rel="noopener noreferrer" className="font-bold underline">Open CV (private link, 10 minutes)</a></li>}
            </ul>
            {a.author.experience && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-bold">Past experience</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-grey [overflow-wrap:anywhere]">{a.author.experience}</p>
              </details>
            )}
          </Panel>

          <Panel title="Your decision" description="The writer sees this note either way.">
            <form action={decide} className="space-y-4">
              <input type="hidden" name="id" value={a.id} />
              <div>
                <label className={labelCls} htmlFor="note">Feedback</label>
                <textarea id="note" name="note" rows={6} required minLength={10} className={area}
                  placeholder="What works, what needs changing, and anything to check before this goes live." />
                <p className="mt-1 text-xs text-grey">At least 10 characters. Emailed to the writer and kept on the piece.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button name="decision" value="APPROVED" className={btn()} disabled={a.status !== "SUBMITTED"}>Approve and publish</button>
                <button name="decision" value="CHANGES_REQUESTED" className={btn("danger")} disabled={a.status !== "SUBMITTED"}>Request changes</button>
              </div>
              {a.status !== "SUBMITTED" && <p className="text-sm font-bold text-grey">This piece is not waiting for review.</p>}
            </form>
          </Panel>

          {a.reviews.length > 0 && (
            <Panel title="Decision history">
              <ul className="space-y-4">
                {a.reviews.map((r) => (
                  <li key={r.id} className="border-b border-line pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <Chip tone={r.decision === "APPROVED" ? "live" : "bad"}>{r.decision === "APPROVED" ? "Approved" : "Changes"}</Chip>
                      <span className="text-xs text-grey">{fmtDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm [overflow-wrap:anywhere]">{r.note}</p>
                    <p className="mt-1 text-xs text-grey">{r.reviewer}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
