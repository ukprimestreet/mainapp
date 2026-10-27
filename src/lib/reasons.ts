export const REPORT_REASONS = { SPAM: "Spam or advertising", FAKE: "Fake or not a real customer", ABUSIVE: "Abusive or hateful", PERSONAL_INFO: "Contains personal information", CONFLICT: "Conflict of interest", OTHER: "Something else" } as const;

/**
 * Why a job request was closed.
 *
 * Here rather than in the server-action file because a `"use server"` module may only export async
 * functions — Next.js refuses to build otherwise, and it has.
 *
 * `NO_PROVIDER` is the one worth counting: every request closed for that reason is a customer we could not
 * help, and a place and trade where recruiting a business would have paid for itself.
 */
export const LEAD_CLOSE_REASONS = {
  NO_PROVIDER: "Nobody covers this area or trade yet",
  DUPLICATE: "Duplicate of another request",
  NOT_GENUINE: "Not a genuine request",
  CUSTOMER_WITHDREW: "Customer no longer needs it",
  HANDLED_OFFLINE: "Dealt with by phone or email",
} as const;
export type LeadCloseReason = keyof typeof LEAD_CLOSE_REASONS;
