/**
 * 종목별 뉴스 (2026-11-24 사용자 지시, "종목별 뉴스도 볼 수 있나"). **종목 브리핑 지면 전용이다.**
 *
 * 원천은 원고 저장소의 `종목뉴스.md`다. 뉴스 브리핑 적재(`extract.ts`)는 이 파일을 통째로 거부한다
 * (`assertAllowedSource`). 여기서 읽은 것은 `fin_stock.detail.news`(jsonb)에만 들어가고 뉴스 지면,
 * 텔레그램, RSS는 이 값을 읽지 않는다.
 *
 * 원고 모양이 둘이다.
 *   아침판  `## 레인보우로보틱스 / 에스피지 / 로보티즈` 아래 사실 한 줄 + `- 구분: 호재 / 출처: [매체](url)`
 *   마감판  `## 삼성전자 -3.06% — …` 기사 제목 꼴 아래 `- 한줄 요약:`, `- 수혜:`, `- 원문:` 같은 이름 붙은 줄,
 *           뒤쪽에 리포트(목표가), 갭 예측, 관심 종목 절
 *
 * - **"구분: 호재/악재"는 싣지 않는다.** 루틴(LLM)의 판단이라 투자 조언처럼 읽힌다.
 * - **목표가, 최선호주, 추천 문장은 문장째 뺀다.** 종목 브리핑도 목표주가와 추천은 싣지 않는다.
 *   문장이 다 빠지면 그 꼭지는 버린다.
 * - 기사 링크는 매체명만 표시한다(`sources.ts`의 `mediaName`).
 */
import { dedot } from "./markdown";
import { mediaName } from "./sources";

export interface StockNewsSource {
  label: string;
  url: string;
}

/** 화면에 싣는 한 꼭지. `fin_stock.detail.news`의 원소 */
export interface StockNewsItem {
  /** 원고 날짜 YYYY-MM-DD */
  d: string;
  /** 아침(am) / 마감(pm) */
  s: "am" | "pm";
  title?: string;
  text: string;
  src: StockNewsSource[];
}

export interface StockNewsEntry {
  /** 꼭지 제목 원문. 종목 짝 맞춤은 이 안에 관심종목 이름이 있는지로 본다(`namesIn`) */
  heading: string;
  /** 기사 제목 꼴 꼭지(`삼성전자 -3.06% — 미국 반도체 …`)면 그 제목. 이름만 적힌 꼭지는 없다 */
  title?: string;
  text: string;
  src: StockNewsSource[];
}

/**
 * 추천, 목표가 표현. `stocks.ts`의 ADVICE_RE보다 넓다 — 증권사 리포트 인용("KB 최선호주",
 * "투자의견 유지")이 이 원고에 흔하다. 순매수, 장내 매수 같은 사실은 남긴다.
 */
export const NEWS_ADVICE_RE =
  /(매수|매도)\s*(의견|추천|권고|유지|제시|등급)|목표\s*주?가|최선호|탑\s*픽|top\s*pick|추천|비중\s*(확대|축소)|투자\s*의견|투자\s*포인트|손절|익절|사야|팔아야/i;

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** 사실 줄. 이 이름으로 시작하면 본문으로 싣는다 */
const TEXT_LABEL = /^(한\s*줄\s*요약|내용|요약)$/;
/** 링크만 받는 줄 */
const LINK_LABEL = /^(원문|국내\s*보도|해외\s*보도|출처|구분)/;
/**
 * 버리는 줄. 수혜/피해는 종목 지목, 구분(호재/악재)과 영향도, 투자 포인트는 루틴의 판단이다.
 * "왜 중요한가", "연결 경로"도 해석이라 싣지 않는다. 사실만 남긴다.
 */
const SKIP_LABEL =
  /^(왜\s*중요|영향도|연결\s*경로|수혜|피해|대장|후발|관련주|단기\s*영향|중장기\s*영향|투자\s*포인트|체크\s*포인트|리스크|전망)/;

/**
 * 원고의 `## 섹션 N.` 머리. 종목 이슈(1)와 종목별 중요 뉴스(6)만 받는다.
 * 리포트(목표가 모음), 갭상승/하락 예측, 관심 종목 절은 통째로 건너뛴다.
 * 섹션 머리가 없는 원고(아침판)는 전부 받는다.
 */
const SECTION_HEAD = /^섹션\s*\d+/;
const SECTION_OK = /^섹션\s*(1|6)|종목\s*이슈|종목별\s*(중요\s*)?뉴스/;

/** 문장 단위로 잘라 추천, 목표가 문장만 뺀다. 소수점(1.5조)에서는 자르지 않는다 */
export function cleanNewsText(text: string): string {
  const sentences = dedot(text).split(/(?<=[.다])\s+(?=\S)/);
  return sentences
    .filter((s) => !NEWS_ADVICE_RE.test(s))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `종목뉴스.md` 한 편을 꼭지 목록으로. */
export function parseStockNews(md: string): StockNewsEntry[] {
  const out: StockNewsEntry[] = [];
  type Cur = { heading: string; lines: string[]; src: StockNewsSource[] };
  let cur: Cur | null = null;
  let skip = false;
  const flush = () => {
    const c = cur as Cur | null;
    cur = null;
    if (!c) return;
    const text = cleanNewsText(c.lines.join(" "));
    if (!text) return;
    const heading = dedot(c.heading);
    // 기사 제목 꼴이면 제목으로 싣는다. 제목에 추천, 목표가가 있으면 꼭지를 버린다
    const title = / — |: /.test(heading) ? heading : undefined;
    if (title && NEWS_ADVICE_RE.test(title)) return;
    out.push({ heading, title, text, src: c.src });
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(raw);
    if (h) {
      flush();
      const head = h[1].replace(/\*/g, "").trim();
      if (SECTION_HEAD.test(head)) {
        skip = !SECTION_OK.test(head);
        continue;
      }
      if (!skip) cur = { heading: head, lines: [], src: [] };
      continue;
    }
    if (!cur) continue;
    const item = /^\s*[-*]\s+(.+)$/.exec(raw);
    if (!item) continue;
    const body = item[1].trim();
    const lab = /^\**([^:：*]{1,20})\**\s*[:：]\s*(.*)$/.exec(body);
    const label = lab?.[1].trim() ?? "";
    if (label && LINK_LABEL.test(label)) {
      for (const m of body.matchAll(LINK_RE)) {
        const name = mediaName(m[1]);
        const c = cur as Cur;
        if (name && !c.src.some((x) => x.url === m[2])) c.src.push({ label: name, url: m[2] });
      }
      continue;
    }
    if (label && SKIP_LABEL.test(label)) continue;
    const text = label && TEXT_LABEL.test(label) ? lab![2] : body;
    (cur as Cur).lines.push(text.replace(LINK_RE, "$1"));
  }
  flush();
  return out;
}

/**
 * 꼭지 제목 안에 든 관심종목 이름. 긴 이름부터 찾고, 찾은 자리는 지워 짧은 이름이 다시 걸리지 않게 한다
 * (`삼성전자우`에서 `삼성전자`, `SK하이닉스`에서 `SK`). 이름 앞이 글자로 이어지면 다른 단어라 보지 않는다.
 */
export function namesIn(heading: string, names: string[]): string[] {
  let rest = heading;
  const found: string[] = [];
  for (const n of [...names].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length)) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 뒤에 영숫자가 이어지면 다른 이름이다. `삼성전자우`(우선주)처럼 `우`로 끝나는 것도 다른 종목이다
    const re = new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}(?![A-Za-z0-9]|우(?![가-힣]))`, "i");
    if (re.test(rest)) {
      found.push(n);
      rest = rest.replace(re, "$1 ");
    }
  }
  return found;
}

/** 이름 짝 맞춤용. 공백, 대소문자를 무시한다 */
export const nameKey = (n: string) => n.replace(/\s+/g, "").toLowerCase();

/**
 * 원고와 회차 종목 이름이 다르게 적히는 경우. 왼쪽이 원고 표기, 오른쪽이 `fin_stock.name`.
 * 새 표기가 보이면 여기에 더한다.
 */
export const NEWS_ALIASES: Record<string, string> = {
  네이버: "NAVER",
  하이닉스: "SK하이닉스",
};

/** 한 종목의 뉴스 목록 정리: 최신순, 같은 글 중복 제거, 최대 개수 */
export function trimNews(items: StockNewsItem[], max = 20): StockNewsItem[] {
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => (a.d === b.d ? (a.s === b.s ? 0 : a.s === "pm" ? -1 : 1) : a.d < b.d ? 1 : -1))
    .filter((it) => {
      const k = it.text;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}
