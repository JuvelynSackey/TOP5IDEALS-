import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/sell", "/auth", "/api"] }],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
