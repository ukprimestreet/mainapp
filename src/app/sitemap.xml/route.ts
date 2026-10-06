import { indexXml, sitemapFiles } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";

/** Sitemap INDEX. Child files hold only pages that pass the quality gate (same functions that set meta robots). */
export async function GET() {
  const { files } = await sitemapFiles();
  return new Response(indexXml(files), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
