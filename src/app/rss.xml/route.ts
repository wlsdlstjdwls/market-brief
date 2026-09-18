/**
 * RSS 2.0 피드.
 *
 * 뉴스 서비스에서 제일 싼 유통 경로다. 구독 인프라(메일 발송, 카카오 채널)가 없어도
 * 읽는 쪽이 알아서 가져간다. 발송 비용도, 수신 동의 문제도 없다.
 *
 * **본문은 싣지 않는다.** 헤드라인과 한 줄 요약만 내보내고 본문은 사이트에서 읽게 한다.
 * 종목 차단은 렌더 단계(`renderMarkdown`)에 걸려 있는데 피드는 그 경로를 타지 않아서,
 * 본문을 통째로 실으면 방어선 하나가 빠진 채 나간다. 그래서 `scan`으로 한 번 더 보고
 * 걸리면 그 항목을 통째로 뺀다.
 */
import { listBriefs } from "../../lib/queries";
import { scan } from "../../lib/guard";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site";

export const revalidate = 3600;

/** XML 특수문자. 텍스트 노드에 그대로 넣으면 피드가 깨진다. */
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  let items: Array<{
    tradeDate: string;
    headline: string;
    summary: string;
    publishedAt: Date | null;
  }> = [];
  try {
    items = await listBriefs(30);
  } catch (e) {
    console.error("rss: 브리핑 목록을 못 읽었습니다.", e);
  }

  const entries = items
    // 적재·렌더에서 이미 걸렀지만 피드는 별도 경로다. 한 건이라도 걸리면 싣지 않는다.
    .filter((b) => !scan(`${b.headline}\n${b.summary}`).violations.length)
    .map((b) => {
      const url = `${SITE_URL}/brief/${b.tradeDate}`;
      const date = (b.publishedAt ?? new Date(`${b.tradeDate}T09:00:00+09:00`)).toUTCString();
      return `    <item>
      <title>${xml(`${b.tradeDate} ${b.headline}`)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <pubDate>${date}</pubDate>
      <description>${xml(b.summary)}</description>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(SITE_NAME)}</title>
    <link>${xml(SITE_URL)}</link>
    <description>${xml(SITE_DESCRIPTION)}</description>
    <language>ko</language>
    <atom:link href="${xml(`${SITE_URL}/rss.xml`)}" rel="self" type="application/rss+xml" />
${entries}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
