/**
 * 텔레그램 채널 알림의 문구 조립과 발송 직전 최종 검사.
 *
 * CLI(`scripts/notify-telegram.ts`)에서 떼어 둔 이유는 회귀 테스트 때문이다.
 * 여기 규칙들은 전부 실수로 되돌리기 쉬운 것이라 테스트로 못 박아 둔다
 * (`tests/notify.test.ts`).
 */
import { scan } from "./guard";
import { isRegistryName } from "./registry";
import { SESSION_LABEL, type Session } from "./queries";
import { SITE_NAME, SITE_URL } from "./site";

export interface NotifyBrief {
  tradeDate: string;
  session: Session;
  headline: string;
  summary: string;
}

/**
 * 텔레그램 HTML 모드에서 뜻을 갖는 세 글자만 막는다.
 *
 * 처음에는 `parse_mode` 자체를 안 썼다. 헤드라인의 `*`나 `_`가 마크다운으로 읽혀
 * 발송이 통째로 깨질까 봐서다. 그런데 서식이 없으니 제목과 본문이 구분되지 않는다는
 * 지적이 나왔고, HTML 모드는 이스케이프할 글자가 셋뿐이라 그 위험이 사라진다.
 * 마크다운 모드로 되돌리지 말 것 — 그쪽은 막아야 할 글자가 열 개가 넘는다.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 2026-09-18 → 2026.09.18 (금). 서버가 UTC로 돌기 때문에 시간대를 박아 둔다. */
function dateLine(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  const wd = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(d);
  return `${iso.replace(/-/g, ".")} (${wd})`;
}

/**
 * 요약을 문장 경계에서 자른다. 알림은 미끼지 본문이 아니다 — 채널에서 다 읽히면
 * 사이트로 올 이유가 없어진다. `BriefView`의 `lead()`와 같은 판단이다.
 */
export function clip(text: string, max = 180): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("다. "), head.lastIndexOf("다."));
  return cut > 40 ? head.slice(0, cut + 2).trim() : `${head.trim()}…`;
}

/**
 * 보낼 문구와, 그중 검사할 부분.
 *
 * **본문은 싣지 않는다.** 헤드라인, 잘라낸 요약, 그날 다룬 카드 제목 몇 줄, 링크까지다.
 * 종목 차단의 마지막 방어선이 렌더 단계(`renderMarkdown`)인데 텔레그램은 그 경로를
 * 타지 않는다. 카드 제목을 싣는 건 무엇을 다뤘는지 보여 주려는 것이고, 본문(무슨 일인가,
 * 왜 중요한가)은 사이트에만 있다.
 *
 * **가운뎃점(·)을 쓰지 않는다.** 화면 문구와 같은 규칙이다(`dedot` 참고).
 */
export function compose(
  b: NotifyBrief,
  topics: string[] = [],
): { text: string; prose: string; url: string } {
  const url = `${SITE_URL}/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`;
  const headline = b.headline.trim();
  const summary = clip(b.summary.trim());
  // 원고가 카드 제목을 `[…]`로 감싸는 회차가 있다. 대괄호는 벗기고 싣는다.
  // 첫 카드는 헤드라인과 같은 글인 경우가 많아(헤드라인이 첫 카드에서 나온다) 걸러낸다.
  const picked = topics
    .map((t) => t.trim().replace(/^\[(.*)\]$/s, "$1").trim())
    .filter((t) => t && t !== headline)
    .slice(0, 3);

  const lines = [
    `<b>${esc(SITE_NAME)}</b>  ${esc(SESSION_LABEL[b.session])}`,
    dateLine(b.tradeDate),
    "",
    `<b>${esc(headline)}</b>`,
  ];

  if (summary && summary !== headline) lines.push("", esc(summary));

  if (picked.length) {
    lines.push("", "<b>오늘 다룬 이야기</b>");
    for (const t of picked) lines.push(`— ${esc(t)}`);
  }

  lines.push("", `<a href="${url}">전문 보기</a>`);

  // 검사 대상은 사람이 쓴 문장뿐이다. 링크와 날짜 줄은 뺀다 (violations 주석 참고).
  const prose = [headline, summary, ...picked].join("\n");
  return { text: lines.join("\n"), prose, url };
}

/**
 * 나가기 직전 재검사. 레지스트리 표준 명칭(코스피, 러셀 2000 …)은 위반이 아니다.
 *
 * **URL은 검사하지 않는다.** KRX에 `TP`라는 종목이 있어서 `https`의 `tp`가 그대로 걸린다
 * (`sources.ts`가 링크를 한글 구간만 검사하는 것과 같은 이유다). 우리가 만드는 주소는
 * `SITE_URL` + 날짜뿐이라 한글이 섞일 자리가 없고, 검사할 값은 헤드라인과 요약, 카드 제목이다.
 *
 * `review` 등급도 `block`과 똑같이 막는다. 발행 경로 전체가 같은 기준이다.
 */
export function violations(prose: string): string[] {
  const r = scan(prose);
  return [...r.blocking, ...r.review]
    .filter((v) => !isRegistryName(v.match, v.context))
    .map((v) => `[${v.rule}] "${v.match}" :: ${v.context}`);
}
