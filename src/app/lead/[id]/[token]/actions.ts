"use server";

import { redirect } from "next/navigation";
import { isResponseKind, recordResponse, responseTokenValid } from "@/lib/lead-response";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Records the business's answer.
 *
 * The token is re-checked here rather than trusted because the page rendered: a server action is an endpoint
 * like any other, and the form that posts to it is the one place an attacker controls. The actor is recorded
 * as the business itself — nobody signed in, and attributing it to an administrator would be a lie in the
 * audit log.
 */
export async function respondToLead(fd: FormData) {
  const id = s(fd, "id");
  const token = s(fd, "token");
  const kind = s(fd, "kind");
  if (!responseTokenValid(id, decodeURIComponent(token)) || !isResponseKind(kind)) {
    redirect("/");
  }

  const result = await recordResponse(id, kind, { kind: "OWNER", id, email: null });
  // Both outcomes land on the same page; it reads the result from the query rather than from a flash
  // message, so a refresh cannot re-run anything.
  const done = result.ok ? (kind === "DECLINED" ? "declined" : "called") : "already";
  redirect(`/lead/${id}/${token}?done=${done}`);
}
