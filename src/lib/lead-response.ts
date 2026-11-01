import { createHmac, timingSafeEqual } from "crypto";
import { audit, type Actor } from "./audit";
import { db } from "./db";

/**
 * What the business says it is doing about a job.
 *
 * The problem this solves: escalation was reading `deliveredAt` — "somebody opened the dashboard" — as
 * evidence that a business was dealing with a job. It is not. A trade who reads the email on a phone between
 * jobs and rings the customer straight away never opens a dashboard, and at 24 hours we took the job off
 * them and refunded it. The proxy punished exactly the behaviour we want.
 *
 * So the business is asked, in one click, from the email itself:
 *
 *   - **"I have called them"** → nothing more happens. They keep the job and the credit.
 *   - **"I cannot take this job"** → the job is released immediately, the credit refunded, and somebody else
 *     gets it. That is a better outcome for the customer than waiting 24 hours for a timer.
 *
 * The link needs no sign-in, because a sign-in wall is the reason nobody tells us anything. It is safe
 * without one: the token is an HMAC of the assignment id, it only ever sets a flag on one assignment, and
 * **the state change happens on POST**. A GET shows a confirmation page, because email clients and security
 * scanners prefetch links — a GET that acted would have mail software releasing people's jobs for them.
 */

export const RESPONSES = {
  CALLED: "I have contacted the customer",
  DECLINED: "I cannot take this job",
} as const;
export type ResponseKind = keyof typeof RESPONSES;
export const isResponseKind = (v: string): v is ResponseKind => v in RESPONSES;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (32+ chars) is not configured");
  return s;
};

/** Purpose-prefixed, like every other signature on this platform, so one token cannot be used as another. */
const sign = (assignmentId: string) =>
  createHmac("sha256", secret()).update(`lead-response:${assignmentId}`).digest("base64url");

export const responseToken = (assignmentId: string) => sign(assignmentId);

export function responseTokenValid(assignmentId: string, token: string): boolean {
  if (!assignmentId || !token) return false;
  const expected = sign(assignmentId);
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The one-click link that goes in every lead email. */
export const responseLink = (assignmentId: string) => `/lead/${assignmentId}/${responseToken(assignmentId)}`;

export type ResponseResult =
  | { ok: true; kind: ResponseKind; released: boolean; refunded: boolean; reference: string }
  | { ok: false; reason: "unknown" | "reversed" | "already"; message: string; kind?: ResponseKind };

/**
 * Records what the business said, and acts on it.
 *
 * `DECLINED` reverses the assignment through the normal path — refund, freed place, ledger row, audit — and
 * then re-runs matching so the customer is not left waiting for the next hourly pass. Imported lazily
 * because `matching.ts` and the notifier already know about each other, and a third edge in that cycle is
 * how import loops start.
 */
export async function recordResponse(assignmentId: string, kind: ResponseKind, actor?: Actor): Promise<ResponseResult> {
  const a = await db.leadAssignment.findUnique({
    where: { id: assignmentId },
    include: { jobRequest: { select: { id: true, reference: true } }, business: { select: { name: true } } },
  });
  if (!a) return { ok: false, reason: "unknown", message: "We cannot find that job." };
  if (a.status === "REVERSED") {
    return { ok: false, reason: "reversed", message: "This job is no longer yours — it was passed to another business.", kind };
  }
  if (a.respondedAt) {
    return {
      ok: false, reason: "already",
      message: a.responseKind === "DECLINED"
        ? "You have already told us you cannot take this one."
        : "You have already told us you contacted the customer.",
      kind: (a.responseKind as ResponseKind) ?? kind,
    };
  }

  await db.leadAssignment.update({
    where: { id: assignmentId },
    // Seeing the question counts as seeing the job, so `deliveredAt` is filled in if it was not already.
    data: { respondedAt: new Date(), responseKind: kind, deliveredAt: a.deliveredAt ?? new Date() },
  });
  await audit({
    action: kind === "CALLED" ? "Business says it contacted the customer" : "Business declined a job",
    targetType: "JobRequest", targetId: a.jobRequestId,
    detail: `${a.jobRequest.reference} · ${a.business.name}`,
  }, actor);

  if (kind === "CALLED") {
    return { ok: true, kind, released: false, refunded: false, reference: a.jobRequest.reference };
  }

  const { matchJobRequest, reverseAssignment } = await import("./matching");
  const reversed = await reverseAssignment(assignmentId, "The business told us it could not take this job");
  // Straight away, not on the next hourly pass: the customer is waiting, and we now know this business is not
  // going to ring them.
  if (reversed.ok) await matchJobRequest(a.jobRequest.id).catch(() => null);

  return { ok: true, kind, released: reversed.ok, refunded: reversed.ok && reversed.refunded, reference: a.jobRequest.reference };
}

/** For the page that asks: enough to show which job it is, and nothing that is not already in the email. */
export const assignmentForResponse = (assignmentId: string) =>
  db.leadAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true, status: true, respondedAt: true, responseKind: true, kind: true, businessId: true,
      business: { select: { name: true } },
      jobRequest: {
        select: {
          reference: true, name: true, urgency: true, postcode: true, createdAt: true,
          category: { select: { name: true } }, place: { select: { label: true } },
        },
      },
    },
  });
