import Link from "next/link";
import type { ReactNode } from "react";
import { CLAIM_STATUS, DISCLOSURE, SITE, type Disclosure } from "@/lib/constants";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

const btn = "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-colors min-h-12";
const VARIANTS = {
  primary: "bg-yellow text-ink hover:bg-yellow-hover active:bg-yellow-dark",
  dark: "bg-ink text-white hover:bg-charcoal",
  outline: "border-2 border-ink text-ink hover:bg-ink hover:text-white",
};
export const buttonClass = (variant: keyof typeof VARIANTS = "primary") => `${btn} ${VARIANTS[variant]}`;

export function Button({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: keyof typeof VARIANTS; className?: string }) {
  return <Link href={href} className={`${buttonClass(variant)} ${className}`}>{children}</Link>;
}

/** Status is always text + icon + border, never colour alone. */
export function ClaimBadge({ status }: { status: string }) {
  const verified = status === "VERIFIED" || status === "CLAIMED";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${verified ? "border-ink bg-ink text-yellow" : "border-ink/30 bg-white text-ink"}`}>
      <span aria-hidden>{verified ? "✓" : "○"}</span>{CLAIM_STATUS[status as keyof typeof CLAIM_STATUS] ?? status}
    </span>
  );
}
export function SampleBadge({ dark = false }: { dark?: boolean }) {
  return <span title="Fictional demo data used during development" className={`inline-flex rounded-full border-2 border-dashed ${dark ? "border-white/60 text-white" : "border-ink/40 text-grey"} px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide`}>Sample data</span>;
}
export function DisclosureBadge({ kind }: { kind: string }) {
  if (kind === "EDITORIAL") return null; // editorial is the default; anything else must be labelled
  const d = DISCLOSURE[kind as Disclosure];
  return <span className="inline-flex rounded-full bg-yellow px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-ink ring-2 ring-ink">{d.label} content</span>;
}
export function Label({ children }: { children: ReactNode }) {
  return <span className="inline-block bg-yellow px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-ink">{children}</span>;
}

export function Breadcrumbs({ items, dark = false }: { items: { name: string; href?: string }[]; dark?: boolean }) {
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${dark ? "text-white/80" : "text-grey"}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {it.href ? <Link href={it.href} className={`underline-offset-2 hover:underline ${dark ? "hover:text-yellow" : "hover:text-ink"}`}>{it.name}</Link> : <span aria-current="page" className={dark ? "text-white" : "text-ink"}>{it.name}</span>}
            {i < items.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHead({ title, href, linkText = "See all" }: { title: string; href?: string; linkText?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b-4 border-ink pb-2">
      <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>
      {href && <Link href={href} className="shrink-0 text-sm font-bold underline decoration-yellow decoration-4 underline-offset-4">{linkText} →</Link>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-mist p-10 text-center">
      <p className="font-display text-xl font-extrabold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-grey">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Placeholder art: brand block with the first letters. Replaced by real photography. */
export function Thumb({ text, className = "", src }: { text: string; className?: string; src?: string | null }) {
  if (src) return <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />;
  return (
    <div aria-hidden className={`flex items-end bg-ink p-4 ${className}`}>
      <span className="font-display text-4xl font-extrabold leading-none tracking-tight text-yellow">{text.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

export function PageHeader({ title, intro, crumbs, kicker, ld = false }: { title: string; intro?: string; crumbs?: { name: string; href?: string }[]; kicker?: string; ld?: boolean }) {
  // BreadcrumbList for pages that don't emit their own. The current page is the last item and carries no `item` URL (valid per schema.org / Google).
  const crumbLd = ld && crumbs ? { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.href ? { item: `${SITE.url}${c.href}` } : {}) })) } : null;
  return (
    <section className="border-b border-line bg-mist">
      {crumbLd && <JsonLd data={crumbLd} />}
      <Container className="py-10 sm:py-14">
        {crumbs && <div className="mb-5"><Breadcrumbs items={crumbs} /></div>}
        {kicker && <Label>{kicker}</Label>}
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-lg text-grey">{intro}</p>}
      </Container>
    </section>
  );
}
