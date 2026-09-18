import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/**
 * `/api/*`는 색인 대상이 아니다. cron 트리거 라우트라 사람이 볼 것이 없고
 * 크롤러가 두드려 봐야 401만 돌려받는다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
