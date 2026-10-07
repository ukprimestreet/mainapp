import { db } from "./db";
import { extractLinks, linkSummary } from "./links";

/**
 * The review pipeline. An author writes a DRAFT, submits it (SUBMITTED), and an admin either approves it
 * — which publishes it — or requests changes, which sends it back to DRAFT. Either way a note is mandatory,
 * so an author never receives a verdict without a reason.
 */
export const ARTICLE_STATUS = {
  DRAFT: { label: "Draft", help: "Only you can see this." },
  SUBMITTED: { label: "In review", help: "Waiting for an editor." },
  PUBLISHED: { label: "Published", help: "Live on the site." },
} as const;
export type ArticleStatus = keyof typeof ARTICLE_STATUS;

export const DECISIONS = { APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested" } as const;
export type Decision = keyof typeof DECISIONS;

export const MIN_BODY = 300;
export const MIN_STANDFIRST = 40;

/** What an author must have written before it can go to an editor. */
export function readyToSubmit(a: { title: string; standfirst: string; body: string; type: string; disclosure: string; sponsorName: string | null }) {
  const problems: string[] = [];
  if (a.title.trim().length < 10) problems.push("Give it a headline of at least 10 characters.");
  if (a.standfirst.trim().length < MIN_STANDFIRST) problems.push(`The standfirst needs at least ${MIN_STANDFIRST} characters.`);
  if (a.body.trim().length < MIN_BODY) problems.push(`The article needs at least ${MIN_BODY} characters.`);
  if (a.disclosure !== "EDITORIAL" && !a.sponsorName?.trim()) problems.push("Sponsored, partner and advertorial pieces must name the sponsor.");
  return { ok: problems.length === 0, problems };
}

/** The review packet: everything an editor needs, including every link without reading the piece. */
export async function reviewPacket(articleId: string) {
  const article = await db.article.findUnique({
    where: { id: articleId },
    include: { author: true, location: { include: { city: true } }, reviews: { orderBy: { createdAt: "desc" } } },
  });
  if (!article) return null;
  const links = extractLinks(article.body + (article.imageUrl ? `\n![cover](${article.imageUrl})` : ""));
  return { article, links, summary: linkSummary(links) };
}

/** Everything waiting on an editor, oldest submission first so nothing is left sitting. */
export const reviewQueue = () =>
  db.article.findMany({ where: { status: "SUBMITTED" }, include: { author: true }, orderBy: { submittedAt: "asc" } });

export const queueCount = () => db.article.count({ where: { status: "SUBMITTED" } });

/** The latest decision on a piece, which is what the author sees on their dashboard. */
export const latestReview = (a: { reviews: { decision: string; note: string; createdAt: Date }[] }) => a.reviews[0] ?? null;
