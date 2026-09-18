/**
 * 텔레그램 채널 알림의 문구 조립과 최종 검사.
 *
 * CLI(`scripts/notify-telegram.ts`)에서 떼어 둔 이유는 회귀 테스트 때문이다.
 * 여기 두 규칙은 둘 다 실수로 되돌리기 쉬운 것들이라 테스트로 못 박아 둔다
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
 * 요약을 문장 경계에서 자른다. 알림은 미끼지 본문이 아니다 — 채널에서 다 읽히면
 * 사이트로 올 이유가 없어진다. `BriefView`의 `lead()`와 같은 판단이다.
 */
export function clip(text: string, max = 150): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("다. "), head.lastIndexOf("다."));
  return cut > 40 ? head.slice(0, cut + 2).trim() : `${head.trim()}…`;
}

/**
 * 보낼 문구와, 그중 검사할 부분.
 *
 * `parse_mode`를 쓰지 않는다 — 헤드라인에 `*`나 `_`가 섞였을 때 이스케이프 사고로
 * 발송이 통째로 깨지는 쪽이 서식보다 비싸다.
 *
 * **본문은 싣지 않는다.** 헤드라인, 잘라낸 요약, 링크까지다. 종목 차단의 마지막
 * 방어선이 렌더 단계(`renderMarkdown`)인데 텔레그램은 그 경로를 타지 않는다.
 */
export function compose(b: NotifyBrief): { text: string; prose: string; url: string } {
  const url = `${SITE_URL}/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`;
  const headline = b.headline.trim();
  const summary = clip(b.summary.trim());

  const body = [headline];
  if (summary && summary !== headline) body.push("", summary);

  const text = [`[${SITE_NAME}] ${SESSION_LABEL[b.session]}`, "", ...body, "", url].join("\n");
  return { text, prose: body.join("\n"), url };
}

/**
 * 나가기 직전 재검사. 레지스트리 표준 명칭(코스피, 러셀 2000 …)은 위반이 아니다.
 *
 * **URL은 검사하지 않는다.** KRX에 `TP`라는 종목이 있어서 `https`의 `tp`가 그대로 걸린다
 * (`sources.ts`가 링크를 한글 구간만 검사하는 것과 같은 이유다). 우리가 만드는 주소는
 * `SITE_URL` + 날짜뿐이라 한글이 섞일 자리가 없고, 검사할 값은 헤드라인과 요약이다.
 *
 * `review` 등급도 `block`과 똑같이 막는다. 발행 경로 전체가 같은 기준이다.
 */
export function violations(prose: string): string[] {
  const r = scan(prose);
  return [...r.blocking, ...r.review]
    .filter((v) => !isRegistryName(v.match, v.context))
    .map((v) => `[${v.rule}] "${v.match}" :: ${v.context}`);
}
