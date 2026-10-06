import Link from "next/link";
import { Wordmark } from "./Brand";
import { Container, buttonClass } from "./ui";
import { SearchBox } from "./SearchBox";
import { NewsletterForm } from "./NewsletterForm";
import { formToken } from "@/lib/antispam";

const NAV = [
  ["News", "/news"], ["Businesses", "/businesses"], ["Locations", "/locations"], ["Stories", "/stories"],
  ["Interviews", "/interviews"], ["Guides", "/guides"], ["Podcast", "/podcast"],
] as const;

export function Header() {
  return (
    <header className="on-dark sticky top-0 z-40 bg-ink text-white">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="PrimeStreet home"><Wordmark variant="on-black" className="text-2xl sm:text-3xl" /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-semibold lg:flex">
          {NAV.map(([n, h]) => <Link key={h} href={h} className="hover:text-yellow">{n}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/search" aria-label="Search" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 hover:border-yellow hover:text-yellow"><span aria-hidden className="text-lg">⌕</span></Link>
          <Link href="/saved" aria-label="Saved businesses" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 hover:border-yellow hover:text-yellow"><span aria-hidden className="text-lg">♡</span></Link>
          <Link href="/claim" className={`${buttonClass()} max-sm:!hidden !min-h-10 !px-4 !py-2 text-sm`}>Claim your business</Link>
          <details className="relative lg:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/30" aria-label="Open menu"><span aria-hidden className="text-xl">☰</span></summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-3 w-72 rounded-2xl bg-white p-3 text-ink shadow-xl"><div className="mb-2"><SearchBox id="mobile-search" /></div>
              {NAV.map(([n, h]) => <Link key={h} href={h} className="block rounded-lg px-3 py-3 font-bold hover:bg-yellow">{n}</Link>)}
              <Link href="/claim" className={`${buttonClass()} mt-2 w-full`}>Claim your business</Link>
            </nav>
          </details>
        </div>
      </Container>
      <div className="h-1 bg-yellow" />
    </header>
  );
}

export function Footer() {
  const col = (title: string, links: readonly (readonly [string, string])[]) => (
    <div>
      <h2 className="mb-3 font-display text-sm font-extrabold uppercase tracking-wider text-yellow">{title}</h2>
      <ul className="space-y-2 text-sm">{links.map(([n, h]) => <li key={h}><Link href={h} className="hover:underline">{n}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="on-dark mt-24 bg-ink text-white">
      <Container className="grid gap-10 py-14 md:grid-cols-4">
        <div>
          <Wordmark variant="on-black" className="text-3xl" />
          <p className="mt-3 text-sm text-white/70">London&apos;s Businesses. Stories. People.</p>
        </div>
        {col("Read", [["News", "/news"], ["Stories", "/stories"], ["Interviews", "/interviews"], ["Guides", "/guides"], ["Business of the Week", "/business-of-the-week"], ["Insights", "/insights"], ["RSS feed", "/feed.xml"]])}
        {col("Discover", [["Businesses", "/businesses"], ["Locations", "/locations"], ["Categories", "/categories"], ["Search", "/search"], ["Saved", "/saved"], ["Suggest a business", "/businesses/submit"], ["Podcast", "/podcast"]])}
        {col("PrimeStreet", [["About", "/about"], ["Claim your business", "/claim"], ["Advertise", "/advertise"], ["Owner sign in", "/owner/login"], ["Editorial standards", "/about#standards"], ["Privacy", "/privacy"]])}
      </Container>
      <Container className="border-t border-white/15 py-10"><div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center [&>*]:min-w-0"><div><h2 className="font-display text-2xl font-extrabold text-yellow">Get the weekly digest</h2><p className="mt-1 text-sm text-white/70">London business news, new interviews and new businesses — once a week.</p></div><NewsletterForm formToken={formToken()} source="footer" dark /></div></Container>
      <Container className="border-t border-white/15 py-6 text-xs text-white/60">
        © {new Date().getFullYear()} PrimeStreet. Sponsored, partner and advertorial content is always labelled. Unclaimed profiles have not been verified or approved by the business.
      </Container>
    </footer>
  );
}
