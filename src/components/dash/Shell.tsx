import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../Brand";
import { Icon, type IconName } from "./Icon";

/**
 * The dashboard shell: a dark rail on the left, a light working canvas on the right.
 *
 * The rail is a <details> on small screens, so the drawer opens and closes with no JavaScript at all and keeps
 * working if a script fails. Navigation is grouped and labelled rather than a long flat list, because a flat
 * list of seventeen links is where admin panels usually go wrong.
 */
export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

const isActive = (href: string, active: string, exact?: boolean) =>
  exact ? active === href : active === href || active.startsWith(href + "/");

function NavLinks({ groups, active }: { groups: NavGroup[]; active: string }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.title} className="mb-6">
          <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/70">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const on = isActive(i.href, active, i.exact);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      on ? "bg-yellow text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon name={i.icon} className={on ? "text-ink" : "text-white/50 group-hover:text-white"} />
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    {!!i.badge && (
                      <span className={`inline-flex min-w-[22px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${on ? "bg-ink text-yellow" : "bg-yellow text-ink"}`}>
                        {i.badge > 99 ? "99+" : i.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DashShell({
  groups, active, account, children, title,
}: {
  groups: NavGroup[];
  active: string;
  /** The block at the foot of the rail: who is signed in, and the way out. */
  account: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="min-h-screen bg-mist lg:flex">
      {/* Mobile bar */}
      <div className="on-dark sticky top-0 z-40 bg-ink text-white lg:hidden">
        <details className="group">
          <summary className="flex h-16 cursor-pointer list-none items-center justify-between px-4">
            {/* No link inside the summary: a control nested in a control is unusable with a screen reader. */}
            <span><Wordmark variant="on-black" className="text-xl" /></span>
            <span className="flex items-center gap-2 text-sm font-bold">
              {title}
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 group-open:bg-white/10">☰</span>
              <span className="sr-only">Open the dashboard menu</span>
            </span>
          </summary>
          <nav aria-label="Dashboard" className="max-h-[70vh] overflow-y-auto px-3 pb-4">
            <Link href="/" className="mb-4 block px-3 text-sm font-bold text-white/70 hover:text-yellow">← Back to the site</Link>
            <NavLinks groups={groups} active={active} />
            <div className="border-t border-white/15 pt-4">{account}</div>
          </nav>
        </details>
        <div className="h-1 bg-yellow" />
      </div>

      {/* Desktop rail */}
      <div className="on-dark sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-ink text-white lg:flex">
        <div className="px-5 py-6">
          <Link href="/" aria-label="PrimeStreet home"><Wordmark variant="on-black" className="text-2xl" /></Link>
          <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow">{title}</p>
        </div>
        <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <NavLinks groups={groups} active={active} />
        </nav>
        <div className="border-t border-white/15 p-4">{account}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-7 lg:py-10">{children}</div>
      </div>
    </div>
  );
}

/** Page heading: what this screen is, why it matters, and the one or two things you can do here. */
export function PageHead({
  title, subtitle, actions, back,
}: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-8">
      {back && (
        <p className="mb-3 text-sm">
          <Link href={back.href} className="font-bold text-grey underline hover:text-ink">← {back.label}</Link>
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-grey">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
