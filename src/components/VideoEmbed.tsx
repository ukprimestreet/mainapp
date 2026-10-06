"use client";
import { useState } from "react";
import type { VideoInfo } from "@/lib/podcast-shared";

/**
 * Click-to-load: NOTHING from YouTube/Vimeo loads (no iframe, no thumbnail, no cookies) until the visitor presses play.
 * Faster pages and better privacy. Direct video files use a native <video> with preload="none".
 */
export function VideoEmbed({ video, title }: { video: VideoInfo; title: string }) {
  const [on, setOn] = useState(false);
  if (video.provider === "file") return <video controls preload="none" className="aspect-video w-full rounded-2xl bg-ink" aria-label={title}><source src={video.fileUrl} />Your browser can&apos;t play this video. <a href={video.fileUrl}>Download it</a>.</video>;
  if (on) return <iframe src={`${video.embedUrl}${video.embedUrl!.includes("?") ? "&" : "?"}autoplay=1`} title={`Video: ${title}`} className="aspect-video w-full rounded-2xl" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />;
  return (
    <button type="button" onClick={() => setOn(true)} aria-label={`Play video: ${title}`} className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-ink text-white">
      <span className="absolute inset-0 border-l-[24px] border-yellow" aria-hidden />
      <span className="relative flex flex-col items-center gap-3"><span className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow text-4xl text-ink transition group-hover:scale-105" aria-hidden>▶</span><span className="font-display text-xl font-extrabold">Watch the video</span><span className="text-sm text-white/70">Loads from {video.provider === "youtube" ? "YouTube" : "Vimeo"} when you press play</span></span>
    </button>
  );
}
