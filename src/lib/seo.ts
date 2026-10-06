import type { Metadata } from "next";
import { SITE } from "./constants";

export const abs = (path: string) => `${SITE.url}${path}`;

export function meta(o: { title: string; description: string; path: string; noindex?: boolean; image?: string; type?: "website" | "article" }): Metadata {
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: abs(o.path) },
    robots: o.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: o.title, description: o.description, url: abs(o.path), siteName: SITE.name, type: o.type ?? "website", locale: "en_GB", images: [o.image ?? abs("/opengraph-image")] },
    twitter: { card: "summary_large_image", title: o.title, description: o.description },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}
