import Link from "next/link";
import { Prose } from "./Prose";
import { VideoEmbed } from "./VideoEmbed";
import { parseVideoUrl } from "@/lib/podcast-shared";
import { safeHref, usefulBlocks, type Block } from "@/lib/blocks";

/**
 * Renders a visual-editor document. Text runs through Prose, so inline markdown and URL safety behave
 * exactly as they do in a hand-written article, and no raw HTML is ever rendered. External links carry
 * rel="nofollow ugc" because an author's outbound link is not an endorsement from us.
 */
export function Blocks({ text, blocks }: { text: string; blocks: Block[] | null }) {
  if (!blocks || blocks.length === 0) return <Prose text={text} />;
  const list = usefulBlocks(blocks);
  return (
    <div className="prose-ps">
      {list.map((b) => {
        switch (b.type) {
          case "paragraph":
            return <Prose key={b.id} text={b.text} />;

          case "heading":
            return b.level === 3
              ? <h3 key={b.id} className="mb-2 mt-8 font-display text-xl font-extrabold">{b.text}</h3>
              : <h2 key={b.id}>{b.text}</h2>;

          case "image": {
            const img = <img src={b.url} alt={b.alt} loading="lazy" className="w-full rounded-2xl" />;
            const href = safeHref(b.href);
            return (
              <figure key={b.id} className="my-8">
                {href
                  ? (href.startsWith("/")
                      ? <Link href={href}>{img}</Link>
                      : <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{img}</a>)
                  : img}
                {b.caption && <figcaption className="mt-2 text-sm text-grey">{b.caption}</figcaption>}
              </figure>
            );
          }

          case "video": {
            const v = parseVideoUrl(b.url);
            if (!v) return null;
            return (
              <figure key={b.id} className="my-8">
                <VideoEmbed video={v} title={b.caption ?? "Video"} />
                {b.caption && <figcaption className="mt-2 text-sm text-grey">{b.caption}</figcaption>}
              </figure>
            );
          }

          case "quote":
            return (
              <blockquote key={b.id}>
                {b.text}
                {b.cite && <footer className="mt-2 text-sm font-bold not-italic text-grey">— {b.cite}</footer>}
              </blockquote>
            );

          case "list":
            return b.style === "number"
              ? <ol key={b.id} className="mb-5 list-decimal pl-6 text-lg leading-relaxed">{b.items.map((i, n) => <li key={n}><Prose text={i} /></li>)}</ol>
              : <ul key={b.id}>{b.items.map((i, n) => <li key={n}><Prose text={i} /></li>)}</ul>;

          case "button": {
            const href = safeHref(b.href);
            if (!href) return null;
            const cls = "my-6 inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 font-bold text-yellow no-underline transition hover:bg-black";
            return href.startsWith("/")
              ? <p key={b.id}><Link href={href} className={cls}>{b.label}</Link></p>
              : <p key={b.id}><a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className={cls}>{b.label}</a></p>;
          }

          case "divider":
            return <hr key={b.id} className="my-10 border-line" />;
        }
      })}
    </div>
  );
}
