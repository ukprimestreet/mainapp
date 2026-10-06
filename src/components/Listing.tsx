import Link from "next/link";
import { bizPath } from "@/lib/queries";
import { abs, breadcrumbLd } from "@/lib/seo";

export function Pagination({ basePath, page, pages }: { basePath: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (n: number) => (n > 1 ? `${basePath}${basePath.includes("?") ? "&" : "?"}page=${n}` : basePath);
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-between">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="font-bold underline">← Previous</Link> : <span />}
      <span className="text-sm text-grey">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="font-bold underline">Next →</Link> : <span />}
    </nav>
  );
}

/** CollectionPage + ItemList + BreadcrumbList. The ItemList only contains businesses that are visible on the page. */
export function listingLd(o: { path: string; name: string; description: string; crumbs: { name: string; path: string }[]; businesses: { name: string; slug: string; city: { slug: string }; category: { slug: string } }[] }) {
  return [
    breadcrumbLd(o.crumbs),
    {
      "@context": "https://schema.org", "@type": "CollectionPage", name: o.name, description: o.description, url: abs(o.path),
      mainEntity: { "@type": "ItemList", numberOfItems: o.businesses.length, itemListElement: o.businesses.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: abs(bizPath(b)) })) },
    },
  ];
}

export function IntroBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section aria-labelledby="intro" className="mb-12 max-w-3xl">
      <h2 id="intro" className="mb-3 text-2xl font-extrabold">{title}</h2>
      {text.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-3 text-lg leading-relaxed [overflow-wrap:anywhere]">{p}</p>)}
    </section>
  );
}
