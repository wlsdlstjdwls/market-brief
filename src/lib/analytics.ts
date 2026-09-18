/**
 * 방문 집계. **여기가 웹이 DB에 쓰는 유일한 자리다.**
 *
 * 브리핑 적재는 전부 `ingest.ts`가 한다(로컬·Actions). 방문만은 브라우저에서만 생기는
 * 사실이라 그쪽이 알 길이 없어 한 자리를 열었다.
 *
 * 무엇을 적나 — 무작위 방문자 식별자, 경로, 유입 도메인, 시각. 넷뿐이다.
 * IP도 User-Agent도 쿼리스트링도 안 적는다(User-Agent는 봇을 거르는 데만 쓰고 버린다).
 */
import { sql } from "drizzle-orm";
import { db } from "../db/index";

/**
 * 집계를 시작하는 날(KST). 이 날 전에는 라우트가 아무것도 안 적는다.
 *
 * **왜 날짜로 막나** — 무작위 식별자라도 사람을 하나로 묶어 세는 이상 개인정보 처리방침이
 * 먼저 서야 한다(개인정보 보호법 제30조). 그래서 방침 시행일(`/privacy`의
 * `PRIVACY_EFFECTIVE`)과 이 날짜를 **같은 값으로** 맞춰 둔다.
 * 한쪽만 고치면 지면이 거짓말이 된다 — 옮길 땐 둘 다 옮긴다.
 *
 * 로컬에서 확인할 때는 env `ANALYTICS_START`로 덮어쓴다.
 */
export const ANALYTICS_START = process.env.ANALYTICS_START || "2026-09-18";

/** 오늘(KST)이 시행일에 닿았나 */
export function analyticsOn(): boolean {
  const todayKST = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return todayKST >= ANALYTICS_START;
}

/** 방문 기록 보관 기간. 지나면 지운다 */
export const RETENTION_MONTHS = 12;
/** 「동시접속」으로 칠 최근 시간(분) */
export const ONLINE_MIN = 5;

/** drizzle neon-http의 결과 모양이 버전에 따라 배열이거나 `{ rows }`다. 한 줄로 흡수한다 */
async function rows<T extends Record<string, unknown>>(
  text: string,
  params: number[] = [],
): Promise<T[]> {
  const res = await db.execute<T>(sql.raw(params.length ? bind(text, params) : text));
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}

/**
 * `$1`,`$2`…를 값으로 바꾼다. **여기 들어오는 값은 전부 코드가 만든 숫자뿐이다** —
 * 기간은 `RANGES` 표에서만 오고 상한은 호출부가 상수로 준다.
 * 그래도 숫자가 아니면 던져서, 나중에 문자열을 끼워 넣는 수정이 조용히 통과하지 않게 한다.
 */
function bind(text: string, params: number[]): string {
  return text.replace(/\$(\d+)/g, (_, i) => {
    const v = params[Number(i) - 1];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`analytics: 숫자가 아닌 인자 $${i}`);
    }
    return String(v);
  });
}

// ── 봇 거르기 ──────────────────────────────────────────────────────
//
// 첫 겹은 구조다: 집계가 JS 비콘이라 **스크립트를 안 도는 크롤러는 애초에 안 들어온다.**
// 구글·네이버(Yeti)·빙의 주력 크롤러가 여기서 거의 다 빠진다.
// 둘째 겹이 이 정규식 — 헤드리스 브라우저나 스크립트가 붙은 놈을 막는다.
// 셋째 겹은 브라우저 쪽 `navigator.webdriver` 확인(VisitTracker.tsx).
//
// **「naver」를 막으면 안 된다** — 네이버 앱 인앱 브라우저의 UA에 그 글자가 들어간다(진짜 사람이다).
// 네이버 크롤러는 「Yeti」, 다음 크롤러는 「Daumoa」라 그 이름을 막는다.
const BOT_UA =
  /(bot\b|bot\/|crawler|crawl(?:ing)?|spider|slurp|yeti|daumoa|mediapartners|adsbot|facebookexternalhit|embedly|scrapy|curl\/|wget|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww|headless|phantomjs|puppeteer|playwright|selenium|webdriver|lighthouse|pingdom|uptimerobot|gtmetrix|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|applebot|amazonbot|claudebot|gptbot|ccbot|perplexity)/i;

/** User-Agent만 보고 봇인지. 빈 UA도 봇으로 친다(사람 브라우저는 반드시 보낸다) */
export function isBotUA(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 10) return true;
  return BOT_UA.test(ua);
}

// ── 적기 ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ViewInput = {
  visitorId: string;
  path: string;
  referrerHost?: string | null;
  entry?: boolean;
};

/** 들어온 값을 믿지 않고 깎는다. 못 쓸 값이면 null — 라우트는 조용히 204를 돌려준다 */
export function cleanView(v: Partial<ViewInput>): ViewInput | null {
  const visitorId = String(v.visitorId ?? "");
  if (!UUID_RE.test(visitorId)) return null;

  // 경로만 받는다. 쿼리스트링은 뗀다 — 그래서 `/brief/2026-09-18?s=am`은 마감판과 한 줄로 합쳐진다.
  // 회차별 조회수를 보려면 쿼리를 받아야 하는데, 거기 무엇이 실려 올지는 우리가 정하지 못한다
  let path = String(v.path ?? "");
  if (!path.startsWith("/")) return null;
  path = path.split("?")[0].split("#")[0].slice(0, 200);
  // 운영자가 콘솔을 보는 것은 방문이 아니다
  if (path.startsWith("/admin")) return null;

  // 유입은 **도메인만** 남긴다. 경로·쿼리가 붙은 referrer는 그 자체로 개인정보가 될 수 있다
  let referrerHost: string | null = null;
  const raw = (v.referrerHost ?? "").toString().trim().toLowerCase().slice(0, 100);
  if (raw && !/[\s/]/.test(raw)) referrerHost = raw;

  return { visitorId, path, referrerHost, entry: Boolean(v.entry) };
}

/** 한 줄 적는다. 실패해도 화면에는 아무 영향이 없어야 한다 — 부르는 쪽에서 삼킨다 */
export async function recordView(v: ViewInput): Promise<void> {
  await db.execute(
    sql`INSERT INTO page_view (visitor_id, path, referrer_host, entry)
        VALUES (${v.visitorId}::uuid, ${v.path}, ${v.referrerHost ?? null}, ${v.entry ?? false})`,
  );
}

/** 오래된 기록 청소. 크론을 따로 두지 않고 100번에 한 번 지나가며 치운다 */
export async function sweepOld(): Promise<void> {
  await db.execute(
    sql.raw(
      `DELETE FROM page_view WHERE created_at < now() - interval '${RETENTION_MONTHS} months'`,
    ),
  );
}

// ── 읽기 ──────────────────────────────────────────────────────────

/** 기간 칩. 라벨과 일수를 한곳에 둔다 */
export const RANGES = [
  { key: "1", label: "1일", days: 1 },
  { key: "7", label: "1주일", days: 7 },
  { key: "30", label: "1개월", days: 30 },
  { key: "90", label: "3개월", days: 90 },
  { key: "365", label: "1년", days: 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/** 아무것도 안 고른 기본 기간. 첫 화면은 「오늘 어떤가」를 보는 자리다 */
export const DEFAULT_RANGE = RANGES[0];

export function rangeOf(key: string | undefined): (typeof RANGES)[number] {
  return RANGES.find((r) => r.key === key) ?? DEFAULT_RANGE;
}

export type VisitorSummary = {
  online: number;
  todayVisitors: number;
  todayViews: number;
  totalVisitors: number;
  totalViews: number;
  rangeVisitors: number;
  rangeViews: number;
};

export type DayPoint = { day: string; visitors: number; views: number };
export type PathRow = { path: string; visitors: number; views: number };
export type RefRow = { host: string | null; visitors: number; views: number };

/** 유입을 무엇으로 볼 것인가. 「어느 채널이 먹혔나」를 보려면 sns만 따로 뽑으면 된다 */
export type ChannelKind = "sns" | "search" | "direct" | "etc";

export type Channel = { key: string; label: string; kind: ChannelKind };
/** 채널 한 줄 — 호스트 여럿을 하나로 묶은 값 */
export type ChannelRow = Channel & { visitors: number; views: number; hosts: RefRow[] };

/**
 * 호스트를 채널로 묶는 표. **위에서부터 먼저 맞는 것이 이긴다** —
 * `cafe.naver.com`이 `naver.com`보다 위에 있어야 카페가 「네이버 기타」로 먹히지 않는다.
 *
 * 블로그·카페·텔레그램도 kind는 sns다. 운영자가 글을 올려 사람을 부르는 자리라는 점이 같아서,
 * 「내가 올린 글이 얼마나 데려왔나」를 한 자리에서 보려면 같은 묶음이어야 한다.
 * **텔레그램이 이 사이트의 주 유통 채널이다**(`t.me/thebriefing_kr`) — 거기 숫자가 채널 효과다.
 *
 * 호스트는 접미사로 맞춘다 — `m.blog.naver.com`은 `blog.naver.com`으로 끝나므로 같은 채널이다.
 */
const CHANNELS: (Channel & { hosts: string[] })[] = [
  {
    key: "telegram", label: "텔레그램", kind: "sns",
    hosts: ["t.me", "telegram.me", "telegram.org"],
  },
  { key: "naver-search", label: "네이버 검색", kind: "search", hosts: ["search.naver.com"] },
  { key: "naver-blog", label: "네이버 블로그", kind: "sns", hosts: ["blog.naver.com", "blog.me"] },
  { key: "naver-cafe", label: "네이버 카페", kind: "sns", hosts: ["cafe.naver.com"] },
  { key: "naver-post", label: "네이버 포스트", kind: "sns", hosts: ["post.naver.com", "in.naver.com"] },
  { key: "band", label: "네이버 밴드", kind: "sns", hosts: ["band.us"] },
  { key: "naver", label: "네이버 기타", kind: "etc", hosts: ["naver.com", "naver.me"] },
  { key: "kakao", label: "카카오톡", kind: "sns", hosts: ["kakao.com", "kakaocorp.com"] },
  { key: "daum-search", label: "다음 검색", kind: "search", hosts: ["search.daum.net"] },
  { key: "daum", label: "다음", kind: "etc", hosts: ["daum.net"] },
  { key: "google", label: "구글 검색", kind: "search", hosts: ["google.com"] },
  { key: "bing", label: "빙 검색", kind: "search", hosts: ["bing.com"] },
  { key: "nate", label: "네이트", kind: "search", hosts: ["nate.com"] },
  { key: "zum", label: "줌", kind: "search", hosts: ["zum.com"] },
  { key: "duckduckgo", label: "덕덕고", kind: "search", hosts: ["duckduckgo.com"] },
  {
    key: "ai", label: "AI 챗봇", kind: "search",
    hosts: [
      "chatgpt.com", "openai.com", "perplexity.ai", "claude.ai",
      "gemini.google.com", "copilot.microsoft.com",
    ],
  },
  { key: "instagram", label: "인스타그램", kind: "sns", hosts: ["instagram.com", "ig.me"] },
  { key: "threads", label: "스레드", kind: "sns", hosts: ["threads.net", "threads.com"] },
  { key: "facebook", label: "페이스북", kind: "sns", hosts: ["facebook.com", "fb.me", "fb.com"] },
  { key: "x", label: "X (트위터)", kind: "sns", hosts: ["x.com", "twitter.com", "t.co"] },
  { key: "youtube", label: "유튜브", kind: "sns", hosts: ["youtube.com", "youtu.be"] },
  { key: "tiktok", label: "틱톡", kind: "sns", hosts: ["tiktok.com"] },
  { key: "discord", label: "디스코드", kind: "sns", hosts: ["discord.com", "discordapp.com"] },
  { key: "reddit", label: "레딧", kind: "sns", hosts: ["reddit.com", "redd.it"] },
  { key: "linkedin", label: "링크드인", kind: "sns", hosts: ["linkedin.com", "lnkd.in"] },
  { key: "tistory", label: "티스토리", kind: "sns", hosts: ["tistory.com"] },
  { key: "brunch", label: "브런치", kind: "sns", hosts: ["brunch.co.kr"] },
  { key: "velog", label: "벨로그", kind: "sns", hosts: ["velog.io"] },
  {
    // 증시·재테크 이야기가 도는 자리. 브리핑이 퍼질 만한 곳을 먼저 넣어 둔다
    key: "community", label: "커뮤니티", kind: "sns",
    hosts: [
      "dcinside.com", "fmkorea.com", "clien.net", "ruliweb.com", "ppomppu.co.kr",
      "theqoo.net", "82cook.com", "bobaedream.co.kr", "inven.co.kr", "mlbpark.donga.com",
      "instiz.net", "everytime.kr", "blind.com", "teamblind.com", "arca.live", "slrclub.com",
    ],
  },
  {
    // 증권사 앱·경제지에서 넘어오는 길. 채널로 접어 두면 「매체에서 왔다」가 한 줄로 보인다
    key: "finance", label: "증권, 경제 매체", kind: "etc",
    hosts: [
      "hankyung.com", "mk.co.kr", "sedaily.com", "edaily.co.kr", "fnnews.com",
      "mt.co.kr", "news1.kr", "yna.co.kr", "investing.com", "finance.yahoo.com",
    ],
  },
];

/** `google.co.kr`처럼 나라마다 다른 구글. 표에 나라를 다 적을 수 없어 따로 본다 */
const GOOGLE_RE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;

const DIRECT: Channel = { key: "direct", label: "직접 유입", kind: "direct" };

/** 호스트 하나를 채널로. 모르는 곳은 호스트를 그대로 이름으로 쓴다 */
export function channelOf(host: string | null): Channel {
  if (!host) return DIRECT;
  const h = host.toLowerCase();
  for (const c of CHANNELS) {
    if (c.hosts.some((x) => h === x || h.endsWith(`.${x}`))) {
      return { key: c.key, label: c.label, kind: c.kind };
    }
  }
  if (GOOGLE_RE.test(h)) return { key: "google", label: "구글 검색", kind: "search" };
  return { key: `host:${h}`, label: h, kind: "etc" };
}

/**
 * 호스트 줄을 채널로 접는다.
 *
 * **방문자 수는 더한 값이다** — 한 사람이 기간 안에 텔레그램과 구글 양쪽으로 들어왔다면
 * 두 번 세어진다. 정확히 세려면 채널 묶음을 SQL 안으로 넣어야 하는데, 표가 코드에 있는 편이
 * 고치기 쉽고 겹치는 사람은 드물어 이대로 둔다.
 */
export function foldChannels(refs: RefRow[]): ChannelRow[] {
  const by = new Map<string, ChannelRow>();
  for (const r of refs) {
    const c = channelOf(r.host);
    const cur = by.get(c.key) ?? { ...c, visitors: 0, views: 0, hosts: [] };
    cur.visitors += r.visitors;
    cur.views += r.views;
    cur.hosts.push(r);
    by.set(c.key, cur);
  }
  return [...by.values()].sort((a, b) => b.visitors - a.visitors || b.views - a.views);
}

export type VisitorReport = VisitorSummary & {
  days: DayPoint[];
  paths: PathRow[];
  refs: RefRow[];
  pathTotal: number;
};

// KST 기준 오늘 0시. 날짜 경계를 UTC로 잡으면 KST 00~09시가 어제로 샌다
const TODAY_START = `((now() AT TIME ZONE 'Asia/Seoul')::date::timestamp AT TIME ZONE 'Asia/Seoul')`;
/** N일 전 0시(KST). 오늘 포함이라 1일이면 오늘 하루다 */
const rangeStart = (n: string) =>
  `(((now() AT TIME ZONE 'Asia/Seoul')::date - (${n}::int - 1))::timestamp AT TIME ZONE 'Asia/Seoul')`;

/**
 * 방문 화면이 쓰는 값 전부. **질의 한 번**이다 — 나눠 던지면 왕복이 늘고,
 * Neon HTTP 드라이버는 질의마다 연결을 새로 여느라 동시에 던져도 이득이 없다.
 */
export async function visitorReport(
  days: number,
  topN = 20,
  refN = 200,
): Promise<VisitorReport> {
  const [row] = await rows<{
    summary: VisitorSummary;
    days: DayPoint[];
    paths: PathRow[];
    refs: RefRow[];
    path_total: number;
  }>(
    `WITH win AS (
       SELECT * FROM page_view WHERE created_at >= ${rangeStart("$1")}
     ), summary AS (
       SELECT (SELECT count(DISTINCT visitor_id) FROM page_view
                WHERE created_at > now() - interval '${ONLINE_MIN} minutes')::int AS online,
              (SELECT count(DISTINCT visitor_id) FROM page_view WHERE created_at >= ${TODAY_START})::int
                AS "todayVisitors",
              (SELECT count(*) FROM page_view WHERE created_at >= ${TODAY_START})::int AS "todayViews",
              (SELECT count(DISTINCT visitor_id) FROM page_view)::int AS "totalVisitors",
              (SELECT count(*) FROM page_view)::int                   AS "totalViews",
              (SELECT count(DISTINCT visitor_id) FROM win)::int       AS "rangeVisitors",
              (SELECT count(*) FROM win)::int                         AS "rangeViews"
     ), grid AS (
       -- 기록이 없는 날도 0으로 채운다. 안 그러면 막대에 빈 칸이 생겨 추이가 거짓으로 보인다
       SELECT generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - ($1::int - 1),
                              (now() AT TIME ZONE 'Asia/Seoul')::date,
                              interval '1 day')::date AS day
     ), daily AS (
       SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS day,
              count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS views
       FROM win GROUP BY 1
     ), series AS (
       SELECT g.day::text AS day, coalesce(d.visitors, 0) AS visitors, coalesce(d.views, 0) AS views
       FROM grid g LEFT JOIN daily d USING (day)
     ), paths AS (
       SELECT path, count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS views
       FROM win GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT $2
     ), refs AS (
       -- 유입은 **첫 조회(entry)**만 센다. 안에서 옮겨 다닐 때는 referrer가 안 바뀌어
       -- 같은 출처가 부풀려진다. 상위 몇 개가 아니라 넉넉히 가져오는 이유는 화면에서
       -- 채널로 접기 때문이다 — 잘라 오면 꼬리 도메인이 떨어져 나가 합계가 모자라게 나온다
       SELECT referrer_host AS host, count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS views
       FROM win WHERE entry GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT $3
     )
     SELECT (SELECT to_jsonb(s) FROM summary s) AS summary,
            (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.day), '[]'::jsonb) FROM series s) AS days,
            (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.visitors DESC, p.views DESC), '[]'::jsonb)
               FROM paths p) AS paths,
            (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.visitors DESC, r.views DESC), '[]'::jsonb)
               FROM refs r) AS refs,
            (SELECT count(DISTINCT path)::int FROM win) AS path_total`,
    [days, topN, refN],
  );
  return {
    ...row.summary,
    days: row.days,
    paths: row.paths,
    refs: row.refs,
    pathTotal: row.path_total,
  };
}

export type VisitCards = Pick<
  VisitorSummary,
  "online" | "todayVisitors" | "todayViews" | "totalVisitors" | "totalViews"
>;

/** 대시보드 위쪽에 얹는 작은 요약. 대시보드 질의에 끼워 넣기 좋게 SQL 조각으로 낸다 */
export const VISIT_SUMMARY_SQL = `
  SELECT (SELECT count(DISTINCT visitor_id) FROM page_view
           WHERE created_at > now() - interval '${ONLINE_MIN} minutes')::int AS online,
         (SELECT count(DISTINCT visitor_id) FROM page_view WHERE created_at >= ${TODAY_START})::int
           AS "todayVisitors",
         (SELECT count(*) FROM page_view WHERE created_at >= ${TODAY_START})::int AS "todayViews",
         (SELECT count(DISTINCT visitor_id) FROM page_view)::int AS "totalVisitors",
         (SELECT count(*) FROM page_view)::int AS "totalViews"`;

/** 경로를 사람 말로. 「/brief/2026-09-18」보다 「브리핑」이 먼저 읽힌다 */
export function pathKind(path: string): string {
  if (path === "/") return "홈";
  if (path === "/archive") return "아카이브";
  if (path.startsWith("/brief/")) return "브리핑";
  if (path.startsWith("/privacy")) return "방침";
  return "기타";
}
