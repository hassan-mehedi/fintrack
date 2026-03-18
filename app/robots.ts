import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fintrack.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/accounts/", "/analytics/", "/assistant/", "/budgets/", "/categories/", "/recurring/", "/settings/", "/transactions/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
