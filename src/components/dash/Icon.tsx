/**
 * Navigation icons, drawn inline. No icon font and no sprite from a CDN: a blocked or slow third-party asset
 * must never be able to leave the navigation unreadable. Each one is a 20px stroke glyph on currentColor.
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5",
  pen: "M4 20h4L19 9a2.1 2.1 0 1 0-3-3L5 17v3zM14.5 7.5 16.5 9.5",
  inbox: "M3 13h5l1.5 3h5L16 13h5M4 13 6 5h12l2 8v6H4v-6z",
  file: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4zM14 3v4h4M9 13h6M9 17h6",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.5 3.5 0 0 1 0 6.6",
  shop: "M4 9h16v11H4V9zM4 9l1.5-5h13L20 9M9 20v-6h6v6",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z",
  shield: "M12 3l7 3v5.5c0 4.3-2.9 7.6-7 8.5-4.1-.9-7-4.2-7-8.5V6l7-3zM9.5 12l1.8 1.8 3.4-3.6",
  card: "M3 7.5h18v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9zM3 10.5h18M6.5 14.5h3",
  mic: "M12 14.5a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5.5a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21",
  map: "M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  search: "M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16.5 16.5 21 21",
  mail: "M3.5 6h17v12h-17V6zM3.5 6.5 12 13l8.5-6.5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cog: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z",
  upload: "M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  check: "M4 12.5 9 17.5 20 6.5",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z",
  tag: "M3 11.5V4h7.5L21 14.5 14.5 21 4 10.5zM7.5 7.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "", size = 20 }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  );
}
