import { PS_PATHS } from "@/lib/brand";

type Variant = "on-black" | "on-yellow" | "on-white" | "white-on-black";
const WM: Record<Variant, string> = {
  "on-black": "text-yellow",
  "on-yellow": "text-ink",
  "on-white": "text-ink",
  "white-on-black": "text-white",
};

/** The word IS the logo. No symbol. Display face, heavy weight, tight tracking. */
export function Wordmark({ variant = "on-white", className = "text-2xl" }: { variant?: Variant; className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.045em] leading-none select-none ${WM[variant]} ${className}`}>
      PrimeStreet
    </span>
  );
}

/** Secondary mark: PS. Pure strokes, legible at 16px. */
export function PSIcon({ size = 32, bg = "var(--prime-yellow)", fg = "var(--prime-black)" }: { size?: number; bg?: string; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="PrimeStreet">
      <rect width="100" height="100" rx="22" fill={bg} />
      <g fill="none" stroke={fg} strokeWidth="12">
        <path d={PS_PATHS.p} />
        <path d={PS_PATHS.s} />
      </g>
    </svg>
  );
}
