"use client";
import { useRouter } from "next/navigation";
import { SAVED_COOKIE, RECENT_COOKIE, writeCookie } from "@/lib/saved";

export function ClearSaved({ which }: { which: "saved" | "recent" }) {
  const router = useRouter();
  return <button type="button" onClick={() => { writeCookie(which === "saved" ? SAVED_COOKIE : RECENT_COOKIE, []); router.refresh(); }} className="text-sm font-bold text-red-700 underline">{which === "saved" ? "Clear saved list" : "Clear history"}</button>;
}
