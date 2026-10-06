import type { ReactNode } from "react";

const safe = (u: string) => (/^(https?:\/\/|\/(?!\/)|mailto:)/i.test(u.trim()) ? u.trim() : null);

/** Inline: **bold**, *italic*, [text](url). Everything else is plain text — no raw HTML is ever rendered. */
function inline(text: string, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k)}</em>);
    else {
      const href = safe(m[4]);
      const external = href && /^https?:/i.test(href);
      out.push(href ? <a key={k} href={href} {...(external ? { rel: "noopener noreferrer nofollow ugc" } : {})}>{m[3]}</a> : m[3]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Markdown-lite: paragraphs, ## / ### headings, > quotes, - lists, 1. lists, ![alt](https://…) images, --- rules.
 * Safe by construction (React escapes text; URLs are scheme-checked).
 */
export function Prose({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.trim().split(/\n{2,}/).forEach((raw, i) => {
    const b = raw.trim();
    const img = b.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)(?:\s+"([^"]*)")?$/);
    if (!b) return;
    if (b === "---") out.push(<hr key={i} className="my-8 border-line" />);
    else if (img) out.push(<figure key={i} className="my-8"><img src={img[2]} alt={img[1]} loading="lazy" className="w-full rounded-2xl" />{img[3] && <figcaption className="mt-2 text-sm text-grey">{img[3]}</figcaption>}</figure>);
    else if (b.startsWith("### ")) out.push(<h3 key={i} className="mb-2 mt-6 text-xl font-extrabold">{inline(b.slice(4))}</h3>);
    else if (b.startsWith("## ")) out.push(<h2 key={i}>{inline(b.slice(3))}</h2>);
    else if (b.startsWith("> ")) out.push(<blockquote key={i}>{inline(b.replace(/^> ?/gm, ""))}</blockquote>);
    else if (b.split("\n").every((l) => /^- /.test(l))) out.push(<ul key={i}>{b.split("\n").map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>);
    else if (b.split("\n").every((l) => /^\d+\. /.test(l))) out.push(<ol key={i} className="mb-5 list-decimal pl-6 text-lg leading-relaxed">{b.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>);
    else out.push(<p key={i}>{inline(b.replace(/\n/g, " "))}</p>);
  });
  return <div className="prose-ps">{out}</div>;
}
