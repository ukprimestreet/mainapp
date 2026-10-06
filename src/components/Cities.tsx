import Link from "next/link";
import { db } from "@/lib/db";
import { EDITOR_ROLES, type EditorRole, browsableCities } from "@/lib/cities";

/** City chooser. Renders nothing while PrimeStreet covers a single city, so London readers never see a pointless control. */
export async function CitySwitcher({ active, hrefFor = (slug: string) => `/locations/${slug}` }: { active?: string; hrefFor?: (slug: string) => string }) {
  const cities = await browsableCities();
  if (cities.length < 2) return null;
  return (
    <nav aria-label="Choose a city" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold">City:</span>
      {cities.map((c) => {
        const current = c.slug === active;
        return (
          <Link key={c.id} href={hrefFor(c.slug)} aria-current={current ? "page" : undefined}
            className={`inline-block rounded-full border-2 px-4 py-1.5 text-sm font-bold ${current ? "border-ink bg-yellow" : "border-line hover:border-ink"}`}>
            {c.name}{c.status !== "LIVE" ? <span className="font-semibold text-grey"> · soon</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Who covers a city. Named people are the point: readers should know there is a reporter behind the coverage. */
export async function CityTeam({ cityId, cityName }: { cityId: string; cityName: string }) {
  const team = await db.cityEditor.findMany({ where: { cityId }, include: { author: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  if (!team.length) return null;
  return (
    <section aria-labelledby="city-team">
      <h2 id="city-team" className="mb-3 font-display text-2xl font-extrabold">Who covers {cityName}</h2>
      <ul className="flex flex-wrap gap-4">{team.map((t) => (
        <li key={t.authorId} className="rounded-2xl border border-line px-5 py-4">
          <Link href={`/authors/${t.author.slug}`} className="font-extrabold underline">{t.author.name}</Link>
          <p className="text-sm text-grey">{EDITOR_ROLES[t.role as EditorRole] ?? t.role}</p>
        </li>
      ))}</ul>
    </section>
  );
}
