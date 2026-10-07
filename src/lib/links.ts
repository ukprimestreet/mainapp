import { SITE } from "./constants";

/**
 * Pulls every link out of article body text so an admin can review what a piece points at without reading it.
 * Reviewers care about three things: where does this go, what is the clickable thing, and is it ours or someone else's.
 */
export type FoundLink = {
  url: string;
  anchor: string; // the clickable text, or the image's alt text
  kind: "text" | "image" | "video" | "bare";
  scope: "internal" | "external" | "unsafe";
  host: string | null;
};

const siteHost = () => { try { return new URL(SITE.url).host.replace(/^www\./, "").toLowerCase(); } catch { return "primestreet.uk"; } };
const hostOf = (u: string) => { try { return new URL(u, SITE.url).host.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

/** Internal = our own site or a root-relative path. Anything that is not http(s) or a path is flagged unsafe. */
export function classify(url: string): { scope: FoundLink["scope"]; host: string | null } {
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return { scope: "internal", host: null };
  if (/^mailto:/i.test(u)) return { scope: "external", host: null };
  if (!/^https?:\/\//i.test(u)) return { scope: "unsafe", host: null };
  const host = hostOf(u);
  if (!host) return { scope: "unsafe", host: null };
  return { scope: host === siteHost() || host.endsWith("." + siteHost()) ? "internal" : "external", host };
}

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com", "player.vimeo.com"];

/**
 * Finds markdown images first (so an image link is not also counted as a text link), then inline links,
 * then bare URLs left in the prose. De-duplicated on url + anchor.
 */
export function extractLinks(body: string): FoundLink[] {
  const out: FoundLink[] = [];
  const seen = new Set<string>();
  const push = (url: string, anchor: string, kind: FoundLink["kind"]) => {
    const key = `${kind}:${url}:${anchor}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { scope, host } = classify(url);
    out.push({ url: url.trim(), anchor: anchor.trim() || "(no text)", kind, scope, host });
  };

  let text = body ?? "";

  // ![alt](url) — an image, optionally itself wrapped in a link
  text = text.replace(/\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g, (_m, alt: string, img: string, href: string) => {
    push(href, alt ? `image: ${alt}` : "image", "image");
    push(img, alt ? `image file: ${alt}` : "image file", "image");
    return " ";
  });
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, img: string) => {
    push(img, alt ? `image file: ${alt}` : "image file", "image");
    return " ";
  });
  // [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, anchor: string, url: string) => {
    const host = hostOf(url);
    push(url, anchor, host && VIDEO_HOSTS.includes(host) ? "video" : "text");
    return " ";
  });
  // bare URLs still sitting in the prose
  for (const m of text.matchAll(/(?<![\w(])(https?:\/\/[^\s<>")\]]+)/g)) {
    const url = m[1].replace(/[.,;:)]+$/, "");
    const host = hostOf(url);
    push(url, url, host && VIDEO_HOSTS.includes(host) ? "video" : "bare");
  }
  return out;
}

export function linkSummary(links: FoundLink[]) {
  return {
    total: links.length,
    internal: links.filter((l) => l.scope === "internal").length,
    external: links.filter((l) => l.scope === "external").length,
    unsafe: links.filter((l) => l.scope === "unsafe").length,
    videos: links.filter((l) => l.kind === "video").length,
    images: links.filter((l) => l.kind === "image").length,
    hosts: [...new Set(links.map((l) => l.host).filter(Boolean))] as string[],
  };
}
