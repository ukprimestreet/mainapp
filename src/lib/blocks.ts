import { parseVideoUrl } from "./podcast-shared";

/**
 * The visual editor's document: an ordered list of blocks. Articles written in plain markdown have
 * `blocks = null` and keep working untouched.
 *
 * Whatever an author builds, `blocksToMarkdown()` derives the canonical text that goes in `Article.body`,
 * so search indexing, reading time and the admin link audit all keep working from one place and never
 * need to know whether a piece came from the editor or from markdown.
 */
export type Block =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 2 | 3; text: string }
  | { id: string; type: "image"; url: string; alt: string; caption?: string; href?: string }
  | { id: string; type: "video"; url: string; caption?: string }
  | { id: string; type: "quote"; text: string; cite?: string }
  | { id: string; type: "list"; style: "bullet" | "number"; items: string[] }
  | { id: string; type: "button"; label: string; href: string }
  | { id: string; type: "divider" };

export type BlockType = Block["type"];

export const BLOCK_KINDS: { type: BlockType; label: string; hint: string }[] = [
  { type: "paragraph", label: "Text", hint: "A paragraph. **bold**, *italic* and [links](https://…) work." },
  { type: "heading", label: "Heading", hint: "Breaks the piece into sections." },
  { type: "image", label: "Image", hint: "Upload a picture. You can make it clickable." },
  { type: "video", label: "Video", hint: "Paste a YouTube or Vimeo link." },
  { type: "quote", label: "Quote", hint: "A pull quote, with who said it." },
  { type: "list", label: "List", hint: "Bulleted or numbered." },
  { type: "button", label: "Button", hint: "A clear call to action linking somewhere." },
  { type: "divider", label: "Divider", hint: "A horizontal rule." },
];

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "heading": return { id, type, level: 2, text: "" };
    case "image": return { id, type, url: "", alt: "" };
    case "video": return { id, type, url: "" };
    case "quote": return { id, type, text: "" };
    case "list": return { id, type, style: "bullet", items: [""] };
    case "button": return { id, type, label: "", href: "" };
    case "divider": return { id, type };
    default: return { id, type: "paragraph", text: "" };
  }
}

// ---------------------------------------------------------------- safety
/** Only https links and root-relative paths survive. Anything else (javascript:, data:, //host) is dropped. */
export function safeHref(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  if (/^https:\/\/[^\s]+$/i.test(v)) return v;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(v)) return v;
  return null;
}
const safeImage = (raw: string | undefined | null) => {
  const v = (raw ?? "").trim();
  return /^https:\/\/[^\s]+$/i.test(v) ? v : null;
};
const clean = (s: unknown, max = 5000) => (typeof s === "string" ? s.replace(/\r/g, "").slice(0, max) : "");

/** Parses and sanitises a stored or submitted block document. Unknown or broken blocks are dropped. */
export function parseBlocks(json: string | null | undefined): Block[] {
  let raw: unknown;
  try { raw = JSON.parse(json ?? "[]"); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw.slice(0, 300)) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id.slice(0, 20) : newId();
    switch (o.type) {
      case "paragraph": out.push({ id, type: "paragraph", text: clean(o.text) }); break;
      case "heading": out.push({ id, type: "heading", level: o.level === 3 ? 3 : 2, text: clean(o.text, 200) }); break;
      case "image": {
        const url = safeImage(o.url as string);
        if (url) out.push({ id, type: "image", url, alt: clean(o.alt, 300), caption: clean(o.caption, 300) || undefined, href: safeHref(o.href as string) ?? undefined });
        break;
      }
      case "video": {
        const url = safeHref(o.url as string);
        if (url && parseVideoUrl(url)) out.push({ id, type: "video", url, caption: clean(o.caption, 300) || undefined });
        break;
      }
      case "quote": out.push({ id, type: "quote", text: clean(o.text, 1000), cite: clean(o.cite, 200) || undefined }); break;
      case "list": {
        const items = Array.isArray(o.items) ? o.items.map((i) => clean(i, 500)).filter((i) => i.trim()).slice(0, 50) : [];
        out.push({ id, type: "list", style: o.style === "number" ? "number" : "bullet", items });
        break;
      }
      case "button": {
        const href = safeHref(o.href as string);
        if (href) out.push({ id, type: "button", label: clean(o.label, 80) || "Read more", href });
        break;
      }
      case "divider": out.push({ id, type: "divider" }); break;
      default: break;
    }
  }
  return out;
}

/** Drops blocks the author left empty, so a half-finished block never reaches a reader. */
export const usefulBlocks = (blocks: Block[]) =>
  blocks.filter((b) => {
    switch (b.type) {
      case "paragraph": case "heading": case "quote": return b.text.trim().length > 0;
      case "list": return b.items.some((i) => i.trim());
      case "image": case "video": return !!b.url;
      case "button": return !!b.href && !!b.label.trim();
      case "divider": return true;
    }
  });

/**
 * The canonical text. Markdown-lite, so it renders identically to a hand-written article and the existing
 * link audit finds every link — including a clickable image, written as [![alt](img)](href).
 */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of usefulBlocks(blocks)) {
    switch (b.type) {
      case "paragraph": parts.push(b.text.trim()); break;
      case "heading": parts.push(`${b.level === 3 ? "###" : "##"} ${b.text.trim()}`); break;
      case "image": {
        const img = `![${b.alt.trim()}](${b.url})`;
        parts.push(b.href ? `[${img}](${b.href})` : img);
        if (b.caption?.trim()) parts.push(`> ${b.caption.trim()}`);
        break;
      }
      case "video": parts.push(`[${b.caption?.trim() || "Watch the video"}](${b.url})`); break;
      case "quote": parts.push(`> ${b.text.trim()}${b.cite?.trim() ? `\n> — ${b.cite.trim()}` : ""}`); break;
      case "list": parts.push(b.items.filter((i) => i.trim()).map((i, n) => (b.style === "number" ? `${n + 1}. ${i.trim()}` : `- ${i.trim()}`)).join("\n")); break;
      case "button": parts.push(`[${b.label.trim()}](${b.href})`); break;
      case "divider": parts.push("---"); break;
    }
  }
  return parts.join("\n\n");
}

/** Plain prose only, for word counts and the "is it long enough" check. */
export const blocksToPlainText = (blocks: Block[]) =>
  usefulBlocks(blocks)
    .map((b) => (b.type === "paragraph" || b.type === "quote" || b.type === "heading" ? b.text : b.type === "list" ? b.items.join(" ") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Problems worth telling the author about before they submit. */
export function blockProblems(blocks: Block[]): string[] {
  const list = usefulBlocks(blocks);
  const problems: string[] = [];
  const images = list.filter((b) => b.type === "image") as Extract<Block, { type: "image" }>[];
  if (images.some((i) => !i.alt.trim())) problems.push("Every image needs alt text describing it, for readers using a screen reader.");
  const headings = list.filter((b) => b.type === "heading") as Extract<Block, { type: "heading" }>[];
  if (headings.length > 0 && headings[0].level === 3) problems.push("Start with a main heading (H2) before using a sub-heading (H3).");
  return problems;
}
