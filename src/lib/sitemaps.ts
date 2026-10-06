import { SITE } from "./constants";
import { collectIndexable, type SitemapEntry } from "./seo-engine";

export const SITEMAP_CHUNK = 5000; // well under the 50,000-URL protocol limit
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

export const SITEMAP_GROUPS = ["pages", "locations", "categories", "businesses", "articles", "podcast", "authors"] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

const day = (d?: Date) => (d ? d.toISOString().slice(0, 10) : undefined);

export function urlsetXml(entries: SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => `<url><loc>${esc(SITE.url + e.path)}</loc>${e.lastmod ? `<lastmod>${day(e.lastmod)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
}

/** Child sitemap file names that actually have content, e.g. "businesses-1.xml". Empty groups are omitted from the index. */
export async function sitemapFiles() {
  const set = await collectIndexable();
  const files: { name: string; lastmod?: Date }[] = [];
  for (const g of SITEMAP_GROUPS) {
    const list = set[g];
    if (!list.length) continue;
    const chunks = Math.ceil(list.length / SITEMAP_CHUNK);
    for (let i = 1; i <= chunks; i++) {
      const slice = list.slice((i - 1) * SITEMAP_CHUNK, i * SITEMAP_CHUNK);
      const last = slice.map((e) => e.lastmod?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
      files.push({ name: `${g}-${i}.xml`, lastmod: last ? new Date(last) : undefined });
    }
  }
  return { files, set };
}

export function indexXml(files: { name: string; lastmod?: Date }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `<sitemap><loc>${SITE.url}/sitemaps/${f.name}</loc>${f.lastmod ? `<lastmod>${day(f.lastmod)}</lastmod>` : ""}</sitemap>`).join("\n")}\n</sitemapindex>`;
}
