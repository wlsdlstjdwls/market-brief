import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/**
 * `/api/*`는 색인 대상이 아니다. cron 트리거와 방문 집계 라우트라 사람이 볼 것이 없고
 * 크롤러가 두드려 봐야 401이나 204만 돌려받는다.
 *
 * `/admin`은 세 겹으로 막는다 — 여기, 페이지의 `robots: { index: false }`
 * (`admin/layout.tsx`), 그리고 계정이 없으면 404를 내는 레이아웃 자체다.
 * **robots.txt는 크롤러에게 부탁하는 것일 뿐**이라 이것만 믿으면 안 된다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
