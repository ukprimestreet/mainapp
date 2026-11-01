import { audit } from "./audit";
import { LOW_BALANCE_THRESHOLD } from "./credits";
import { responseLink } from "./lead-response";
import { db } from "./db";
import { sendMail, siteLink } from "./mail";
import { URGENCY } from "./leads";
import { matchJobRequest, reverseAssignment } from "./matching";

/**
 * Telling people what has happened: the business that it has a job, and the customer where they stand.
 *
 * **These are transactional, not marketing.** They deliberately do not go through `automations.ts`, whose
 * rules are off by default, capped per day and sent once per recipient ever. Every one of those properties
 * would be a bug here: a business must not miss a lead because a daily cap was reached, or because it
 * happened to receive the same template last month. So this file sends immediately, every time, and uses a
 * column on the row rather than a search of past subjects to decide what has already gone out.
 *
 * The failure this exists to prevent: a business pays a credit for a job, never opens its dashboard, and a
 * customer waits a week for a phone call that was never coming. Nobody reports that as a bug — it just looks
 * like a directory that does not work.
 */

/** Chase a business that has not opened a job. Long enough not to nag, short enough to matter. */
export const REMIND_AFTER_HOURS = 4;
/** Take the job back after this. A business that has not looked in a day has not had value from it. */
export const ESCALATE_AFTER_HOURS = 24;
/** Tell the customer where they stand, rather than leaving them guessing. */
export const TELL_CUSTOMER_AFTER_HOURS = 6;

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

/** Everyone who should hear about this business's leads: its owners, and its own address as a fallback. */
async function recipients(businessId: string): Promise<string[]> {
  const [owners, business] = await Promise.all([
    db.businessOwner.findMany({ where: { businessId }, include: { owner: { select: { email: true } } } }),
    db.business.findUnique({ where: { id: businessId }, select: { email: true } }),
  ]);
  const list = owners.map((o) => o.owner.email).filter((e): e is string => !!e);
  // Only if nobody has claimed it: sending to both would mean two copies for most businesses.
  if (list.length === 0 && business?.email) list.push(business.email);
  return [...new Set(list.map((e) => e.toLowerCase()))];
}

const jobLines = (job: {
  reference: string; description: string; urgency: string; postcode: string | null;
  name: string; phone: string; contactTime: string | null;
  category: { name: string }; place: { label: string };
}) => [
  `${job.category.name} in ${job.place.label}${job.postcode ? ` (${job.postcode})` : ""}`,
  `When: ${URGENCY[job.urgency as keyof typeof URGENCY] ?? job.urgency}`,
  "",
  job.description,
  "",
  `Customer: ${job.name}`,
  `Phone: ${job.phone}`,
  job.contactTime ? `Best time to call: ${job.contactTime}` : null,
].filter((l) => l !== null) as string[];

// ---------------------------------------------------------------- the business has a job

/**
 * Tells a business it has a job, once.
 *
 * The customer's name and phone number are **in the email**, not behind a link. The business has paid a
 * credit for exactly this, and a trade reading it on a phone between jobs should not need to sign in to find
 * out who to ring. The email says the details are for this job only, which is the same thing the dashboard
 * says.
 *
 * Never throws: an assignment that is real must not be undone because an email failed. A row with a null
 * `notifiedAt` is picked up by the next run.
 */
export async function notifyAssignment(assignmentId: string) {
  const a = await db.leadAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      business: { select: { id: true, name: true } },
      jobRequest: { include: { category: { select: { name: true } }, place: { select: { label: true } } } },
    },
  });
  if (!a || a.notifiedAt || a.status === "REVERSED") return { sent: 0 };

  const to = await recipients(a.businessId);
  if (to.length === 0) {
    // Nothing to send to is not "sent". Left null so it is visible as a gap rather than looking done.
    await audit({
      action: "Lead notification not possible", targetType: "Business", targetId: a.businessId,
      detail: `${a.jobRequest.reference}: no email address for this business`,
    }, { kind: "SYSTEM" });
    return { sent: 0, reason: "no address" as const };
  }

  const job = a.jobRequest;
  for (const email of to) {
    await sendMail(
      email,
      `New job: ${job.category.name} in ${job.place.label} (${job.reference})`,
      [
        `${a.business.name} — a customer has asked for work you cover.`,
        "",
        ...jobLines(job),
        "",
        a.kind === "SPONSORED"
          ? "This one is on us: no credit has been charged."
          : "One lead credit has been charged for this job.",
        `We send each job to a maximum of two businesses, so you are not racing ten others. Ring them first and you are usually the one who gets the work.`,
        "",
        "When you have rung them — or if you cannot take it — tell us here, in one click:",
        siteLink(responseLink(a.id)),
        "",
        "Saying you cannot take it puts your credit straight back and lets us offer the job to somebody else. We would far rather have that than silence.",
        "",
        siteLink(`/owner/business/${a.businessId}/leads`),
        "",
        "Please use these details for this job only. If the customer asks you not to contact them again, stop — and tell us, so we can act on it too.",
      ].join("\n"),
      { purpose: "enquiries" },
    );
  }

  await db.leadAssignment.update({ where: { id: assignmentId }, data: { notifiedAt: new Date() } });
  return { sent: to.length };
}

/** Sends anything that was assigned but never notified — a crash, an outage, or no address at the time. */
export async function notifyPendingAssignments(limit = 50) {
  const waiting = await db.leadAssignment.findMany({
    where: { notifiedAt: null, status: { not: "REVERSED" } },
    orderBy: { createdAt: "asc" }, take: limit, select: { id: true },
  });
  let sent = 0;
  for (const w of waiting) sent += (await notifyAssignment(w.id)).sent;
  return { considered: waiting.length, sent };
}

// ---------------------------------------------------------------- the business has not looked

/** One chase per assignment, to a business that has been told and has not opened it. */
export async function chaseUnopened(limit = 50) {
  const stale = await db.leadAssignment.findMany({
    where: {
      // Not `status: "PENDING"`: opening the dashboard moves it to DELIVERED, and that used to take somebody
      // who had looked and then done nothing out of the chase entirely — the quietest possible failure.
      status: { not: "REVERSED" }, remindedAt: null,
      // `respondedAt` is the fact that matters, not `deliveredAt`: somebody who told us they have rung the
      // customer is dealing with it whether or not they ever opened a dashboard.
      respondedAt: null,
      notifiedAt: { not: null, lte: hoursAgo(REMIND_AFTER_HOURS) },
      createdAt: { gt: hoursAgo(ESCALATE_AFTER_HOURS) }, // past that it is escalated, not chased
    },
    orderBy: { createdAt: "asc" }, take: limit,
    include: {
      business: { select: { id: true, name: true } },
      jobRequest: { include: { category: { select: { name: true } }, place: { select: { label: true } } } },
    },
  });

  let sent = 0;
  for (const a of stale) {
    const to = await recipients(a.businessId);
    for (const email of to) {
      await sendMail(
        email,
        `Still waiting: ${a.jobRequest.category.name} in ${a.jobRequest.place.label} (${a.jobRequest.reference})`,
        [
          `${a.business.name} — you have not opened this job yet, and the customer is waiting.`,
          "",
          ...jobLines(a.jobRequest),
          "",
          "One click is all we need:",
          siteLink(responseLink(a.id)),
          "",
          `If you have already rung them, say so there and we will leave you alone. If you cannot take it, say that instead — your credit goes straight back and we offer the job to another business. What does not work is silence: the customer asked us for help and is waiting on a call.`,
          `Hearing nothing at all within ${ESCALATE_AFTER_HOURS} hours of us sending it, we take the job back, refund the credit and give it to somebody else.`,
          "",
          siteLink(`/owner/business/${a.businessId}/leads`),
        ].join("\n"),
        { purpose: "enquiries" },
      );
      sent++;
    }
    await db.leadAssignment.update({ where: { id: a.id }, data: { remindedAt: new Date() } });
  }
  return { considered: stale.length, sent };
}

/**
 * Takes back a job nobody opened, refunds the credit, and gives it to somebody else.
 *
 * The credit goes back even though the lead was genuinely delivered. That is deliberate: charging for a job
 * a business never looked at would be defensible on paper and indefensible in a phone call, and the
 * customer's problem — nobody has rung them — is not solved by us keeping the pound.
 */
export async function escalateUnopened(limit = 25) {
  const dead = await db.leadAssignment.findMany({
    where: {
      status: { not: "REVERSED" },
      // Taking a job back now needs **silence**, not merely an unopened dashboard. Reading `deliveredAt` as
      // "they are not dealing with it" took jobs off trades who had read the email on a phone and rung the
      // customer straight away — the proxy punished the best behaviour there is.
      respondedAt: null,
      createdAt: { lte: hoursAgo(ESCALATE_AFTER_HOURS) },
      jobRequest: { status: { notIn: ["CLOSED", "REJECTED"] } },
    },
    orderBy: { createdAt: "asc" }, take: limit,
    include: {
      business: { select: { id: true, name: true } },
      jobRequest: { select: { id: true, reference: true } },
    },
  });

  const out = { taken: 0, reassigned: 0, refunded: 0 };
  for (const a of dead) {
    const reversed = await reverseAssignment(a.id, `No word from the business within ${ESCALATE_AFTER_HOURS} hours of being sent it`);
    if (!reversed.ok) continue;
    out.taken++;
    if (reversed.refunded) out.refunded++;

    for (const email of await recipients(a.businessId)) {
      await sendMail(
        email,
        `Taken back: ${a.jobRequest.reference}`,
        [
          `${a.business.name} — we heard nothing about this job within ${ESCALATE_AFTER_HOURS} hours, so we have passed it to another business.`,
          "",
          reversed.refunded
            ? "Your credit has been put back. You have not paid for it."
            : "No credit was charged for it.",
          "",
          "No hard feelings and nothing to do. For future ones, the one-click link in the email is all we need — either answer keeps this from happening.",
          "",
          "And if leads are arriving at the wrong times or in the wrong areas, the areas you cover are yours to change:",
          siteLink(`/owner/business/${a.businessId}/areas`),
        ].join("\n"),
        { purpose: "enquiries" },
      );
    }

    // Give it to somebody else straight away. The freed place is why this is worth doing at all.
    const rerun = await matchJobRequest(a.jobRequest.id).catch(() => null);
    if (rerun && rerun.assigned.length) {
      out.reassigned += rerun.assigned.length;
      for (const assigned of rerun.assigned) {
        const fresh = await db.leadAssignment.findFirst({
          where: { jobRequestId: a.jobRequest.id, businessId: assigned.businessId, notifiedAt: null },
          select: { id: true },
        });
        if (fresh) await notifyAssignment(fresh.id);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the customer is waiting

/**
 * Tells a customer, once, that we have not found anyone.
 *
 * The alternative is silence, which is the worst answer we can give somebody waiting on a tradesperson: they
 * cannot tell whether to keep waiting or start again. So this says plainly that we have not managed it and
 * that they should not hold out for us.
 */
export async function tellCustomerNothingYet(limit = 50) {
  const waiting = await db.jobRequest.findMany({
    where: {
      status: { in: ["UNASSIGNED", "NEW", "ESCALATED"] },
      customerNotifiedAt: null,
      createdAt: { lte: hoursAgo(TELL_CUSTOMER_AFTER_HOURS) },
      assignments: { none: { status: { not: "REVERSED" } } },
    },
    orderBy: { createdAt: "asc" }, take: limit,
    include: { category: { select: { name: true } }, place: { select: { label: true } } },
  });

  let sent = 0;
  for (const job of waiting) {
    await sendMail(
      job.email,
      `About your ${job.category.name.toLowerCase()} request (${job.reference})`,
      [
        `${job.name},`,
        "",
        `You asked us for ${job.category.name.toLowerCase()} in ${job.place.label}, and we have not managed to find you anyone yet. We would rather tell you that than leave you waiting on a call that is not coming.`,
        "",
        "We are still looking, and a person here can see your request. But if the job is urgent, please do not hold out for us — try somewhere else as well.",
        "",
        `Your reference is ${job.reference} if you want to email us about it.`,
        "",
        "We have not passed your details to anybody.",
      ].join("\n"),
      { purpose: "enquiries" },
    );
    await db.jobRequest.update({ where: { id: job.id }, data: { customerNotifiedAt: new Date(), status: "ESCALATED" } });
    await audit({
      action: "Customer told we have no provider", targetType: "JobRequest", targetId: job.id,
      detail: job.reference,
    }, { kind: "SYSTEM" });
    sent++;
  }
  return { considered: waiting.length, sent };
}

// ---------------------------------------------------------------- the business is about to stop getting work

/**
 * Warns a business before, and when, its credits run out.
 *
 * This is the quiet failure the whole lead system was missing: at zero, the matcher excludes a business with
 * a recorded reason — correct, and completely invisible to them. They do not get a worse service; they get
 * no service, and no reason why.
 *
 * Only businesses that could actually receive work are warned. Telling somebody with no service areas that
 * their credits are low is noise, because credits are not what is stopping them.
 *
 * Warned once per run of being low: the flags are cleared by `credits.ts` the moment a balance is healthy
 * again, so a business that tops up and runs down months later hears about it the second time too.
 */
export async function warnLowBalance(limit = 100) {
  /** Only businesses that could actually receive work: credits are not what is stopping anybody else. */
  const eligible = { published: true, isSample: false, serviceAreas: { some: {} }, categories: { some: {} } } as const;

  const [empty, low] = await Promise.all([
    db.creditAccount.findMany({
      where: { balance: { lte: 0 }, zeroWarnedAt: null, business: eligible },
      include: { business: { select: { id: true, name: true } } }, take: limit,
    }),
    db.creditAccount.findMany({
      where: { balance: { gt: 0, lte: LOW_BALANCE_THRESHOLD }, lowWarnedAt: null, business: eligible },
      include: { business: { select: { id: true, name: true } } }, take: limit,
    }),
  ]);

  let sent = 0;

  for (const account of empty) {
    const body = [
      `${account.business.name} — your lead credits have run out, so new job requests in your areas are going to other businesses.`,
      "",
      "Nothing else has changed: your listing is live, it stays free, and we have not hidden you from anybody. Credits are only for receiving job requests.",
      "",
      "They are £1 each. You can top up here:",
      siteLink(`/owner/business/${account.businessId}/credits`),
      "",
      "If you would rather not receive job requests at all, leave it at zero — nothing will chase you again until you top up.",
    ].join("\n");

    for (const email of await recipients(account.businessId)) {
      await sendMail(email, `${account.business.name}: you are not receiving job requests`, body, { purpose: "billing" });
      sent++;
    }
    await db.creditAccount.update({ where: { id: account.id }, data: { zeroWarnedAt: new Date() } });
    await audit({ action: "Business warned its credits are empty", targetType: "Business", targetId: account.businessId, detail: "balance 0" }, { kind: "SYSTEM" });
  }

  for (const account of low) {
    const plural = account.balance === 1 ? "" : "s";
    const body = [
      `${account.business.name} — you have ${account.balance} lead credit${plural} left.`,
      "",
      "At zero, new job requests in your areas go to other businesses instead. Your listing is unaffected and stays free either way.",
      "",
      "Credits are £1 each:",
      siteLink(`/owner/business/${account.businessId}/credits`),
    ].join("\n");

    for (const email of await recipients(account.businessId)) {
      await sendMail(email, `${account.business.name}: ${account.balance} lead credit${plural} left`, body, { purpose: "billing" });
      sent++;
    }
    await db.creditAccount.update({ where: { id: account.id }, data: { lowWarnedAt: new Date() } });
  }

  return { empty: empty.length, low: low.length, sent };
}
// ---------------------------------------------------------------- the run

/**
 * Everything the lead system owes somebody, in one pass.
 *
 * Ordered deliberately: send what was never sent, chase what has not been opened, take back what has gone
 * cold (which may assign and notify somebody new), and only then tell customers nobody has it — so that a
 * customer is never told "we found nobody" in the same run that found them somebody.
 */
export async function runLeadNotifications() {
  const notified = await notifyPendingAssignments();
  const chased = await chaseUnopened();
  const escalated = await escalateUnopened();
  const customers = await tellCustomerNothingYet();
  // Last, because escalation and reassignment above both move balances, and a business should be warned
  // about the balance it actually has at the end of the run rather than the one it had at the start.
  const balances = await warnLowBalance();
  return { notified, chased, escalated, customers, balances };
}
