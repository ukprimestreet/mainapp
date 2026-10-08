import { activeSocials, type SocialKey } from "./authors";

/**
 * Profile completeness. An author cannot send work for review until their profile is at least
 * MIN_TO_SUBMIT per cent complete and they have accepted the author terms. The weights say what the
 * newsroom actually needs: readers should be able to see who wrote something and why they are worth reading.
 */
export const MIN_TO_SUBMIT = 90;
export const MIN_BIO_CHARS = 120;
export const MIN_EXPERIENCE_CHARS = 120;

export type ProfileFields = {
  name?: string | null; email?: string | null; imageUrl?: string | null; role?: string | null; bio?: string | null;
  phone?: string | null; basedIn?: string | null; experience?: string | null; cvUrl?: string | null;
  expertise?: string | null; portfolio?: string | null; acceptedTermsAt?: Date | null;
} & Partial<Record<SocialKey, string | null>>;

export const parseList = (json: string | null | undefined): string[] => {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []; }
  catch { return []; }
};

const filled = (s: string | null | undefined, min = 1) => (s ?? "").trim().length >= min;

export type Check = { key: string; label: string; weight: number; done: boolean; hint: string };

export function profileChecks(a: ProfileFields): Check[] {
  return [
    { key: "name", label: "Full name", weight: 8, done: filled(a.name, 2), hint: "The name readers will see on your byline." },
    { key: "email", label: "Email address", weight: 7, done: filled(a.email, 5), hint: "How we reach you. Set when your account was created." },
    { key: "imageUrl", label: "Portrait photo", weight: 10, done: filled(a.imageUrl), hint: "A clear head-and-shoulders photo. It appears on every article you write." },
    { key: "role", label: "Job title", weight: 7, done: filled(a.role, 2), hint: "For example Reporter, Contributing Editor, or Freelance Journalist." },
    { key: "bio", label: "About you", weight: 12, done: filled(a.bio, MIN_BIO_CHARS), hint: `At least ${MIN_BIO_CHARS} characters. What you write about and why readers should trust you on it.` },
    { key: "phone", label: "Phone number", weight: 8, done: filled(a.phone, 7), hint: "Never published. Used only when an editor needs you quickly." },
    { key: "basedIn", label: "Where you are based", weight: 6, done: filled(a.basedIn, 2), hint: "The London area or city you work from." },
    { key: "experience", label: "Past experience", weight: 12, done: filled(a.experience, MIN_EXPERIENCE_CHARS), hint: `At least ${MIN_EXPERIENCE_CHARS} characters. Where you have written or worked before.` },
    { key: "cvUrl", label: "CV", weight: 10, done: filled(a.cvUrl), hint: "Upload a CV or résumé. Not published." },
    { key: "expertise", label: "Subjects you cover", weight: 8, done: parseList(a.expertise).length > 0, hint: "At least one subject, so editors know what to send you." },
    { key: "socials", label: "At least one social link", weight: 6, done: activeSocials(a).length > 0, hint: "Only the links you give are shown on your profile." },
    { key: "portfolio", label: "Links to published work", weight: 6, done: parseList(a.portfolio).length > 0, hint: "At least one link to something you have written elsewhere." },
  ];
}

export function completeness(a: ProfileFields) {
  const checks = profileChecks(a);
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.filter((c) => c.done).reduce((n, c) => n + c.weight, 0);
  const percent = Math.round((earned / total) * 100);
  const missing = checks.filter((c) => !c.done);
  return { checks, percent, missing, termsAccepted: !!a.acceptedTermsAt, enough: percent >= MIN_TO_SUBMIT };
}

/** The single gate used everywhere an author tries to send work for review. */
export function canSubmit(a: ProfileFields): { ok: true } | { ok: false; reason: string; percent: number; missing: Check[] } {
  const c = completeness(a);
  if (!c.termsAccepted) return { ok: false, reason: "Accept the author terms before sending work for review.", percent: c.percent, missing: c.missing };
  if (!c.enough) {
    const names = c.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(", ");
    return {
      ok: false,
      reason: `Your profile is ${c.percent}% complete. It needs to reach ${MIN_TO_SUBMIT}% before you can send work for review${names ? ` — still missing: ${names}` : ""}.`,
      percent: c.percent, missing: c.missing,
    };
  }
  return { ok: true };
}

// ---------------- validation for the fields the profile form adds ----------------
export const MAX_EXPERTISE = 8;
export const MAX_PORTFOLIO = 8;

export function validateExtras(v: { phone?: string; basedIn?: string; experience?: string; cvUrl?: string; expertise?: string; portfolio?: string }) {
  const errors: Record<string, string> = {};
  const phone = (v.phone ?? "").trim();
  if (phone && !/^[+()\d\s-]{7,24}$/.test(phone)) errors.phone = "Enter a phone number using digits, spaces, brackets, + or -.";
  const basedIn = (v.basedIn ?? "").trim();
  if (basedIn.length > 80) errors.basedIn = "Keep this under 80 characters.";
  const experience = (v.experience ?? "").trim();
  if (experience.length > 4000) errors.experience = "Keep past experience under 4,000 characters.";
  if (/<[a-z/]/i.test(experience)) errors.experience = "No HTML, please — plain text only.";

  // A CV lives in the private bucket, so it is stored as a storage reference rather than a public URL.
  const cvUrl = (v.cvUrl ?? "").trim();
  if (cvUrl && !/^https:\/\//i.test(cvUrl) && !/^storage:[a-z-]+\/[^\s]+$/i.test(cvUrl)) errors.cvUrl = "Upload your CV using the button above.";

  const expertise = (v.expertise ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  if (expertise.length > MAX_EXPERTISE) errors.expertise = `At most ${MAX_EXPERTISE} subjects.`;
  if (expertise.some((x) => x.length > 40)) errors.expertise = "Keep each subject under 40 characters.";

  const portfolio = (v.portfolio ?? "").split(/[\n\s]+/).map((x) => x.trim()).filter(Boolean);
  if (portfolio.length > MAX_PORTFOLIO) errors.portfolio = `At most ${MAX_PORTFOLIO} links.`;
  const badLink = portfolio.find((x) => !/^https:\/\//i.test(x));
  if (badLink) errors.portfolio = `"${badLink.slice(0, 40)}" is not an https link.`;

  return {
    errors, ok: Object.keys(errors).length === 0,
    value: {
      phone: phone || null, basedIn: basedIn || null, experience: experience || null, cvUrl: cvUrl || null,
      expertise: expertise.length ? JSON.stringify([...new Set(expertise)]) : null,
      portfolio: portfolio.length ? JSON.stringify([...new Set(portfolio)]) : null,
    },
  };
}
