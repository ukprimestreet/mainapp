import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/brand", "/admin", "/reviews/manage", "/owner", "/claim/status", "/claim/dispute", "/review/", "/search", "/saved", "/newsletter", "/api", "/go/"] }], sitemap: `${SITE.url}/sitemap.xml` };
}
