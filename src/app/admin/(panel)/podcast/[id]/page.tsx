import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/constants";
import { db } from "@/lib/db";
import { copyKit, fmtDuration, parseVideoUrl } from "@/lib/podcast";
import { createInterviewDraft, deleteClip, deleteEpisode, toggleClip } from "../../../podcast-actions";
import { ClipForm } from "./ClipForm";
import { CopyBox } from "./CopyBox";
import { EpisodeEditor } from "../EpisodeEditor";
import { episodeProps } from "../form-data";

export default async function EditEpisode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const p = await episodeProps(id);
  if (!p || !p.ep) notFound();
  const ep = p.ep;
  const [clips, authors, article] = await Promise.all([
    db.episodeClip.findMany({ where: { episodeId: id }, orderBy: { createdAt: "asc" } }),
    db.author.findMany({ orderBy: { name: "asc" } }),
    ep.articleId ? db.article.findUnique({ where: { id: ep.articleId } }) : null,
  ]);
  const kit = copyKit({ title: ep.title, description: ep.description, guestName: ep.guestName, businessName: ep.business?.name, url: `${SITE.url}/podcast/${ep.slug}`, hasVideo: !!parseVideoUrl(ep.videoUrl) });
  const quotes = clips.filter((c) => c.kind === "QUOTE"), cuts = clips.filter((c) => c.kind === "CLIP");
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/podcast" className="underline">← All episodes</Link></p>
      <h1 className="mb-4 text-3xl font-extrabold">Edit episode</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <EpisodeEditor key={`${ep.id}-${ep.status}-${ep.updatedAt.getTime()}`} initial={p.initial} articles={p.articles} />

      <section aria-labelledby="repurpose" className="mt-14 space-y-10 border-t-4 border-ink pt-8">
        <div><h2 id="repurpose" className="text-2xl font-extrabold">Repurpose this interview</h2><p className="mt-1 max-w-3xl text-grey">One conversation, many formats: the written interview, quote cards, video clips and ready-to-post copy.</p></div>

        <div className="rounded-2xl border border-line p-5"><h3 className="mb-2 text-xl font-extrabold">1 · Written interview</h3>
          {article ? <p>Linked article: <Link className="font-bold underline" href={`/admin/articles/${article.id}`}>{article.title}</Link> <span className="text-grey">({article.status === "PUBLISHED" ? "published" : "draft"})</span></p> : (
            <form action={createInterviewDraft} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={ep.id} />
              <div><label htmlFor="authorId" className="mb-1 block text-sm font-bold">Author</label><select id="authorId" name="authorId" className="min-h-11 rounded-lg border-2 border-line px-3">{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <button className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Create draft from transcript</button>
              <p className="basis-full text-sm text-grey">Builds a Q&amp;A draft (host turns become headings, guest turns become answers), links this episode and the featured business. {ep.transcript ? "" : "Add a transcript first."}</p></form>
          )}</div>

        <div className="rounded-2xl border border-line p-5"><h3 className="mb-3 text-xl font-extrabold">2 · Quote cards</h3>
          {quotes.length === 0 && <p className="mb-3 text-sm text-grey">No quotes yet. Add a line worth sharing — it gets a branded image card automatically.</p>}
          <ul className="mb-4 grid gap-4 sm:grid-cols-2">{quotes.map((q) => (
            <li key={q.id} className="rounded-xl border border-line p-3"><img src={`/podcast/${ep.slug}/quote/${q.id}`} alt={`Quote card: ${q.quote}`} width={600} height={315} loading="lazy" className="aspect-[1200/630] w-full rounded-lg border border-line" />
              <p className="mt-2 text-sm"><a className="font-bold underline" href={`/podcast/${ep.slug}/quote/${q.id}`} download={`quote-${q.id}.png`}>Download PNG</a>{q.speaker ? ` · ${q.speaker}` : ""}{q.startSec != null ? ` · at ${fmtDuration(q.startSec)}` : ""}</p>
              <form action={deleteClip}><input type="hidden" name="id" value={q.id} /><button className="text-sm font-bold text-red-700 underline">Remove</button></form></li>))}</ul>
          <ClipForm episodeId={ep.id} kind="QUOTE" defaultSpeaker={ep.guestName ?? ""} /></div>

        <div className="rounded-2xl border border-line p-5"><h3 className="mb-3 text-xl font-extrabold">3 · Video &amp; social clips</h3>
          {cuts.length === 0 && <p className="mb-3 text-sm text-grey">Mark the moments to cut for social. Tick them off once produced.</p>}
          <ul className="mb-4 space-y-2">{cuts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm"><span><strong>{c.title}</strong> · {fmtDuration(c.startSec)}–{fmtDuration(c.endSec)}{c.note ? ` · ${c.note}` : ""}{c.url ? <> · <a className="underline" href={c.url} rel="noopener">clip</a></> : null}</span>
              <span className="flex gap-3"><form action={toggleClip}><input type="hidden" name="id" value={c.id} /><button className="font-bold underline">{c.status === "DONE" ? "✓ Done (undo)" : "Mark done"}</button></form><form action={deleteClip}><input type="hidden" name="id" value={c.id} /><button className="font-bold text-red-700 underline">Remove</button></form></span></li>))}</ul>
          <ClipForm episodeId={ep.id} kind="CLIP" defaultSpeaker="" /></div>

        <div className="rounded-2xl border border-line p-5"><h3 className="mb-3 text-xl font-extrabold">4 · Ready-to-post copy</h3>
          <div className="grid gap-4 lg:grid-cols-2"><CopyBox label="Newsletter blurb" text={kit.newsletter} />{kit.captions.map((c, i) => <CopyBox key={i} label={`Social caption ${i + 1}`} text={c} />)}</div></div>

        <div className="rounded-2xl border border-line p-5"><h3 className="mb-2 text-xl font-extrabold">5 · Business profile</h3>
          <p>{ep.business ? <>This episode appears on <strong>{ep.business.name}</strong>&apos;s profile automatically once published. <Link className="underline" href={`/admin/businesses/${ep.business.id}`}>Open business</Link></> : "Link a featured business in the form above and the episode will show on its profile."}</p></div>
      </section>

      <form action={deleteEpisode} className="mt-12 border-t border-line pt-6"><input type="hidden" name="id" value={ep.id} /><button className="font-bold text-red-700 underline">Delete this episode</button> <span className="text-sm text-grey">(only drafts and sample episodes can be deleted)</span></form>
    </>
  );
}
