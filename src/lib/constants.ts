export const SITE = {
  name: "PrimeStreet",
  tagline: "London's Businesses. Stories. People.",
  description:
    "PrimeStreet tells the stories of the businesses, entrepreneurs and people shaping London — news, interviews, guides and a local business directory.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://primestreet.uk",
};

export const ARTICLE_TYPES = {
  NEWS: { label: "News", path: "news", blurb: "What's opening, expanding and changing across London business." },
  STORY: { label: "Stories", path: "stories", blurb: "The people and the journeys behind London's businesses." },
  INTERVIEW: { label: "Interviews", path: "interviews", blurb: "Founders and operators in their own words." },
  GUIDE: { label: "Guides", path: "guides", blurb: "Useful, local, human guides to discovering London businesses." },
  BOTW: { label: "Business of the Week", path: "business-of-the-week", blurb: "One London business worth knowing, every week." },
  INSIGHT: { label: "Insights", path: "insights", blurb: "How London's industries are really doing." },
} as const;
export type ArticleType = keyof typeof ARTICLE_TYPES;

export const DISCLOSURE = {
  EDITORIAL: { label: "Editorial", note: "Independent PrimeStreet editorial." },
  SPONSORED: { label: "Sponsored", note: "Paid for by the business featured." },
  PARTNER: { label: "Partner", note: "Created in partnership with the business." },
  ADVERTORIAL: { label: "Advertorial", note: "Advertising content." },
} as const;
export type Disclosure = keyof typeof DISCLOSURE;

export const CLAIM_STATUS = {
  UNCLAIMED: "Unclaimed",
  PENDING: "Claim pending",
  CLAIMED: "Claimed",
  VERIFIED: "Verified",
} as const;


export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
