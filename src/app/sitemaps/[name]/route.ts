import { NextResponse } from "next/server";
import { SITEMAP_CHUNK, SITEMAP_GROUPS, urlsetXml, type SitemapGroup } from "@/lib/sitemaps";
import { collectIndexable } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const m = (await params).name.match(/^([a-z]+)-(\d+)\.xml$/);
  if (!m || !(SITEMAP_GROUPS as readonly string[]).includes(m[1])) return new NextResponse("Not found", { status: 404 });
  const n = Number(m[2]);
  const list = (await collectIndexable())[m[1] as SitemapGroup].slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK);
  if (!list.length) return new NextResponse("Not found", { status: 404 });
  return new Response(urlsetXml(list), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
