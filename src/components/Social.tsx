import { activeSocials, type SocialKey } from "@/lib/authors";

/**
 * Inline SVG social marks. First-party only: no icon fonts, no third-party scripts, nothing loaded from a CDN.
 * Each path is drawn in currentColor so the icons inherit whatever text colour they sit on.
 */
const PATHS: Record<string, string> = {
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.7 0 3.2 2.6 3.7 6H8.3C8.8 6.6 10.3 4 12 4zM4.3 11h2.6c.1-2 .5-3.8 1.1-5.2A8 8 0 004.3 11zm0 2h3.7c.1 2 .5 3.8 1.1 5.2A8 8 0 014.3 13zm5.7 0h4c-.1 2.6-.9 4.8-2 6-1.1-1.2-1.9-3.4-2-6zm0-2c.1-.5.1-1 .2-1.5h3.6c.1.5.1 1 .2 1.5h-4zm6 2h3.7a8 8 0 01-4.8 5.2c.6-1.4 1-3.2 1.1-5.2zm0-2c-.1-2-.5-3.8-1.1-5.2A8 8 0 0119.7 11h-3.7z",
  x: "M18.9 2H22l-7 8 7.6 12h-6.3l-4.9-7.7L5.8 22H2.6l7.4-8.4L2.7 2H9l4.6 7.2L18.9 2zm-1.1 18h1.7L7.4 3.9H5.6L17.8 20z",
  facebook: "M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z",
  instagram: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.8.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.3-1.7-.3-1.3-.1-1.7-.1-4.8-.1zm0 3.1a5 5 0 110 10 5 5 0 010-10zm0 1.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zm5.2-2.1a1.2 1.2 0 110 2.3 1.2 1.2 0 010-2.3z",
  linkedin: "M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.82-2.05 3.75-2.05C21 8.65 22 10.9 22 14v7h-4v-6.2c0-1.5-.03-3.4-2.08-3.4-2.08 0-2.4 1.6-2.4 3.3V21h-4V9z",
  youtube: "M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 00-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z",
  tiktok: "M16.6 2h-3v13.1a2.6 2.6 0 11-1.9-2.5V9.5a5.7 5.7 0 103.9 5.4V8.6a6.5 6.5 0 003.8 1.2V6.7a3.7 3.7 0 01-2.8-4.7z",
  threads: "M12.2 22h-.05c-3.3 0-5.8-1.1-7.5-3.2C3.2 17 2.4 14.6 2.3 11.9v-.02c0-2.7.9-5.1 2.4-6.9C6.4 2.9 8.9 1.8 12.1 1.8h.05c2.5 0 4.6.6 6.2 1.8 1.5 1.1 2.6 2.7 3.2 4.7l-2 .6c-1-3.2-3.2-4.8-6.5-4.8h-.03c-2.5 0-4.4.8-5.7 2.4C6.1 8 5.4 9.8 5.4 11.9c0 2.1.7 3.9 1.9 5.4 1.3 1.6 3.2 2.4 5.7 2.4h.04c2.2 0 3.7-.5 4.9-1.7 1.4-1.3 1.3-2.9 .9-3.9-.3-.6-.8-1.1-1.5-1.5-.2 1.2-.6 2.1-1.2 2.8-.8 1-2 1.5-3.4 1.6-1.1.05-2.1-.2-2.9-.8-.9-.7-1.5-1.7-1.5-2.9-.05-2.4 1.9-4.1 4.8-4.3.9-.05 1.8 0 2.6.1-.1-.7-.3-1.2-.7-1.6-.5-.5-1.2-.7-2.1-.7h-.03c-.7 0-1.7.2-2.3 1.2l-1.7-1.2c.8-1.3 2.2-2 4-2h.05c1.5 0 2.7.5 3.6 1.4.8.8 1.2 2 1.4 3.4.4.2.8.4 1.1.6 1.1.7 1.9 1.6 2.3 2.6.7 1.8.6 4.4-1.5 6.3-1.6 1.5-3.5 2.2-6.2 2.2zm1.1-9.4c-.3 0-.6 0-.9.02-2 .1-3 .9-3 2.2 0 .6.3 1 .7 1.3.4.3 1 .4 1.6.4.9-.05 1.6-.3 2-.8.4-.5.7-1.2.8-2.3-.4-.1-.8-.1-1.2-.1z",
  bluesky: "M6.3 4.3C8.5 5.9 10.8 9.2 12 11c1.2-1.8 3.5-5.1 5.7-6.7C19.2 3.2 21.7 2.3 21.7 5c0 .6-.3 4.6-.5 5.3-.6 2.2-2.9 2.8-4.9 2.4 3.5.6 4.4 2.6 2.5 4.6-3.6 3.8-5.2-1-5.6-2.2-.1-.2-.2-.3-.2-.2s0 0-.2.2c-.4 1.2-2 6-5.6 2.2-1.9-2-1-4 2.5-4.6-2 .4-4.3-.2-4.9-2.4C4.6 9.6 4.3 5.6 4.3 5c0-2.7 2.5-1.8 2-.7z",
  mastodon: "M21.3 8.1c0-3.9-2.6-5-2.6-5C17.4 2.5 15.2 2.2 13 2.2h-.05c-2.2 0-4.4.3-5.7.9 0 0-2.6 1.1-2.6 5v2.8c0 4.4.4 7.1 4.4 8.1 1.9.4 3.5.5 4.8.4 2.3-.1 3.6-.8 3.6-.8l-.1-1.7s-1.6.5-3.5.4c-1.9-.06-3.9-.2-4.2-2.5 0-.2-.05-.4-.05-.6 4.1 1 7.6.4 8.1.4 2.7-.3 5-2 5.3-3.5.5-2.4.4-5.9.4-5.9zm-3.3 5.3h-2.1V8.3c0-1.1-.5-1.6-1.4-1.6-1 0-1.5.6-1.5 1.9v2.7h-2.05V8.6c0-1.3-.5-1.9-1.5-1.9-.9 0-1.4.5-1.4 1.6v5.1H5.9V8.1c0-1.1.3-1.9.9-2.5.6-.6 1.3-.9 2.3-.9 1.1 0 1.9.4 2.5 1.2l.4.7.4-.7c.6-.8 1.4-1.2 2.5-1.2 1 0 1.7.3 2.3.9.6.6.9 1.4.9 2.5v5.3z",
};

/** One social glyph, drawn in currentColor. */
export function SocialIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d={PATHS[icon] ?? PATHS.globe} />
    </svg>
  );
}

/** Social icons for an author. Renders nothing when they have given no links. */
export function SocialLinks({
  author, size = 44, className = "", label,
}: {
  author: Partial<Record<SocialKey, string | null>> & { name?: string };
  size?: number; className?: string; label?: string;
}) {
  const links = activeSocials(author);
  if (!links.length) return null;
  return (
    <ul aria-label={label ?? `${author.name ?? "Author"} on social media`} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map((l) => (
        <li key={l.key}>
          <a
            href={l.url} rel="me noopener noreferrer" target="_blank"
            title={`${author.name ? author.name + " on " : ""}${l.label}`}
            className="flex items-center justify-center rounded-full border-2 border-ink/15 text-ink transition hover:border-ink hover:bg-yellow focus-visible:border-ink"
            style={{ width: size, height: size }}
          >
            <SocialIcon icon={l.icon} size={Math.round(size * 0.48)} />
            <span className="sr-only">{l.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Round portrait with initials as the fallback, so a byline never shows a broken image. */
export function Avatar({ src, name, size = 40, className = "" }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  if (src) {
    return (
      <img src={src} alt={`${name}, portrait`} width={size} height={size} loading="lazy"
        className={`shrink-0 rounded-full border-2 border-ink/10 object-cover ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-display font-extrabold text-yellow ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}>
      {initials || "?"}
    </span>
  );
}
