import type { Metadata } from "next";
import { PSIcon, Wordmark } from "@/components/Brand";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Brand guide", robots: { index: false, follow: false } };

const swatches = [
  ["--prime-yellow", "#FFD400", "Hero. CTAs, logo, highlights", "bg-yellow text-ink"],
  ["--prime-yellow-hover", "#FFE14D", "Hover for yellow buttons", "bg-yellow-hover text-ink"],
  ["--prime-yellow-dark", "#E6BF00", "Pressed state only", "bg-yellow-dark text-ink"],
  ["--prime-yellow-soft", "#FFF6C2", "Tinted note backgrounds, never text", "bg-yellow-soft text-ink"],
  ["--prime-black", "#0A0A0A", "Authority. Text, header, footer", "bg-ink text-white"],
  ["--prime-charcoal", "#1C1C1E", "Hover on black", "bg-charcoal text-white"],
  ["--prime-grey", "#6B6B70", "Secondary text (5.2:1 on white)", "bg-grey text-white"],
  ["--prime-grey-light", "#F4F4F5", "Section backgrounds", "bg-mist text-ink"],
  ["--prime-border", "#E4E4E7", "Borders", "bg-line text-ink"],
] as const;

export default function Brand() {
  return (
    <>
      <PageHeader kicker="Internal" title="PrimeStreet brand guide" intro="One yellow. Yellow shouts, black commands, white breathes. See docs/brand.md." />
      <Container className="space-y-12 py-10">
        <section><h2 className="mb-4 text-2xl font-extrabold">Wordmark</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-ink p-8"><Wordmark variant="on-black" className="text-5xl" /></div>
            <div className="bg-yellow p-8"><Wordmark variant="on-yellow" className="text-5xl" /></div>
            <div className="border border-line bg-white p-8"><Wordmark variant="on-white" className="text-5xl" /></div>
            <div className="bg-ink p-8"><Wordmark variant="white-on-black" className="text-5xl" /></div>
          </div></section>
        <section><h2 className="mb-4 text-2xl font-extrabold">PS icon</h2>
          <div className="flex flex-wrap items-end gap-6">{[16, 32, 48, 64, 128, 256].map((s) => <div key={s} className="text-center text-xs"><PSIcon size={s} />{s}px</div>)}
            <PSIcon size={96} bg="var(--prime-black)" fg="var(--prime-yellow)" /><PSIcon size={96} bg="#fff" fg="var(--prime-black)" /></div></section>
        <section><h2 className="mb-4 text-2xl font-extrabold">Colour tokens</h2>
          <div className="grid gap-3 sm:grid-cols-3">{swatches.map(([t, hex, use, cls]) => <div key={t} className={`${cls} border border-line p-4`}><p className="font-bold">{t}</p><p className="font-mono text-sm">{hex}</p><p className="text-sm">{use}</p></div>)}</div></section>
        <section><h2 className="mb-4 text-2xl font-extrabold">Typography</h2>
          <p className="font-display text-5xl font-extrabold">Bricolage Grotesque — display</p><p className="mt-2 text-lg">Inter — body text, forms and UI.</p></section>
      </Container>
    </>
  );
}
