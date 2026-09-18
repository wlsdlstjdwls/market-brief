import type { MetadataRoute } from "next";
import { listBriefs } from "../lib/queries";
import { SITE_URL } from "../lib/site";

/** 브리핑이 하루 두 번 늘어난다. 색인이 그만큼 자주 갱신돼야 한다. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * DB가 없거나 막히면 sitemap 생성이 빌드를 깨선 안 된다.
   * 고정 경로 둘만이라도 내보내는 편이 아무것도 안 주는 것보다 낫다.
   */
  let briefs: Array<{ tradeDate: string }> = [];
  try {
    briefs = await listBriefs(500);
  } catch (e) {
    console.error("sitemap: 브리핑 목록을 못 읽었습니다.", e);
  }

  const latest = briefs[0]?.tradeDate;

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: latest ? new Date(`${latest}T00:00:00+09:00`) : new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/archive`,
      lastModified: latest ? new Date(`${latest}T00:00:00+09:00`) : new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      // 거의 안 바뀌지만 색인에는 있어야 한다 — 법정 고지라 검색으로도 닿아야 하는 지면이다
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...briefs.map((b) => ({
      url: `${SITE_URL}/brief/${b.tradeDate}`,
      lastModified: new Date(`${b.tradeDate}T00:00:00+09:00`),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
