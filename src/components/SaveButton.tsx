"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSaved, pushRecent, toggleSaved } from "@/lib/saved";

export function SaveButton({ id, name, compact = false, refreshOnChange = false }: { id: string; name: string; compact?: boolean; refreshOnChange?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  useEffect(() => { setSaved(getSaved().includes(id)); setReady(true); }, [id]);
  return (
    <button type="button" aria-pressed={saved} disabled={!ready} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSaved(toggleSaved(id)); if (refreshOnChange) router.refresh(); }}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      className={`relative z-10 inline-flex items-center gap-1.5 rounded-full border-2 font-bold transition ${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"} ${saved ? "border-ink bg-yellow text-ink" : "border-ink/30 bg-white text-ink hover:border-ink"}`}>
      <span aria-hidden>{saved ? "♥" : "♡"}</span><span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

/** Records this profile in the visitor's "recently viewed" cookie. Renders nothing. */
export function TrackView({ id }: { id: string }) { useEffect(() => { pushRecent(id); }, [id]); return null; }
