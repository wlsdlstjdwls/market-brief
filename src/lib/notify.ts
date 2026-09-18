/**
 * 텔레그램 채널 알림의 문구 조립과 발송 직전 최종 검사.
 *
 * CLI(`scripts/notify-telegram.ts`)에서 떼어 둔 이유는 회귀 테스트 때문이다.
 * 여기 규칙들은 전부 실수로 되돌리기 쉬운 것이라 테스트로 못 박아 둔다
 * (`tests/notify.test.ts`).
 *
 * **본문을 통째로 싣는다** (2026-09-18 사용자 지시). 처음에는 헤드라인과 링크만 보냈는데
 * "내용이 너무 적다"는 지적을 받았다. 그 대신 **보내는 글 전체가 `violations()`를 지난다** —
 * 렌더 단계(`renderMarkdown`)를 안 타는 경로라 여기서 한 번 더 보는 것이 유일한 방어선이다.
 * 한 건이라도 걸리면 그 회차는 통째로 발송하지 않는다.
 */
import { scan } from "./guard";
import { isRegistryName } from "./registry";
import { SESSION_LABEL, type Session } from "./queries";
import { SITE_NAME, SITE_URL } from "./site";

/** 텔레그램 한 통의 상한은 4096자다. 서식 태그까지 세므로 여유를 둔다. */
const CHUNK = 3500;

export interface NotifyTopic {
  kind: string;
  title: string;
  impact?: string;
  lines: Array<{ label?: string; text?: string }>;
}

export interface NotifyBrief {
  tradeDate: string;
  session: Session;
  headline: string;
  summary: string;
  marketSummary?: string;
  macroCommentary?: string;
}

const KIND_LABEL: Record<string, string> = {
  news: "뉴스 분석",
  theme: "핵심 테마",
  sector: "업종 관점",
};

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
  const wd = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${iso}T00:00:00+09:00`));
  return `${iso.replace(/-/g, ".")} (${wd})`;
}

/**
 * 저장된 마크다운을 텔레그램용 평문으로 바꾼다.
 *
 * 화면은 `renderMarkdown`이 HTML로 바꾸지만 여기서는 서식이 거의 필요 없다.
 * 링크는 **표시 문자열만 남긴다** — 기사 URL을 그대로 실으면 글이 링크 더미가 되고,
 * 채널에서 미리보기가 엉뚱한 기사로 잡힌다.
 */
function toPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]{3,}\s*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "— ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 카드 제목. 원고가 `[…]`로 감싸는 회차가 있어 대괄호를 벗긴다. */
function cardTitle(t: string): string {
  return t.trim().replace(/^\[(.*)\]$/s, "$1").trim();
}

/**
 * 보낼 문구(여러 통으로 쪼갠 것)와, 그중 검사할 부분.
 *
 * **가운뎃점(·)을 쓰지 않는다.** 화면 문구와 같은 규칙이다(`dedot` 참고).
 */
export function compose(
  b: NotifyBrief,
  topics: NotifyTopic[] = [],
): { chunks: string[]; prose: string; url: string } {
  const url = `${SITE_URL}/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`;
  const headline = b.headline.trim();
  const summary = b.summary.trim();

  /** 서식을 입힌 문단들과, 검사에 넣을 맨 문장들을 나란히 쌓는다. */
  const blocks: string[] = [];
  const plain: string[] = [headline, summary];

  blocks.push(`<b>${esc(SITE_NAME)}</b>  ${esc(SESSION_LABEL[b.session])}\n${dateLine(b.tradeDate)}`);
  blocks.push(`<b>${esc(headline)}</b>`);
  if (summary && summary !== headline) blocks.push(esc(summary));

  /**
   * 같은 카드가 두 번 실리는 걸 막는다. 원고에 같은 업종이 두 번 적히는 회차가 있고
   * (2026-09-18 pm의 반도체), 헤드라인은 원래 첫 뉴스 카드에서 뽑은 것이라 늘 겹친다.
   * 머리에서 이미 읽은 문장을 카드에서 또 읽게 두면 글이 길기만 해진다.
   */
  const seen = new Set<string>();
  let lastKind = "";

  for (const t of topics) {
    const title = cardTitle(t.title);
    if (!title) continue;

    const key = `${title}\n${(t.lines ?? []).map((l) => l?.text ?? "").join("\n")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 머리에 이미 실은 요약과 같은 줄은 뺀다.
    const rows = (t.lines ?? [])
      .map((l) => ({ label: (l?.label ?? "").trim(), text: (l?.text ?? "").trim() }))
      .filter((l) => l.text && l.text !== summary);

    // 제목도 본문도 머리와 같은 카드면 통째로 버린다(헤드라인이 나온 그 카드다).
    if (!rows.length && title === headline) continue;

    // 묶음 제목은 실제로 실을 카드가 정해진 뒤에 붙인다. 먼저 붙이면 그 묶음의
    // 카드가 전부 걸러진 회차에서 제목만 덩그러니 남는다.
    if (t.kind !== lastKind) {
      blocks.push(`<b>${esc(KIND_LABEL[t.kind] ?? t.kind)}</b>`);
      lastKind = t.kind;
    }

    const impact = (t.impact ?? "").trim();
    const body = [`<b>${esc(title)}</b>${impact ? ` <i>${esc(impact)}</i>` : ""}`];
    plain.push(title);

    for (const l of rows) {
      body.push(l.label ? `${esc(l.label)}  ${esc(l.text)}` : esc(l.text));
      plain.push(l.text);
    }
    blocks.push(body.join("\n"));
  }

  for (const [label, md] of [
    ["국내 시장", b.marketSummary],
    ["해외 시장", b.macroCommentary],
  ] as const) {
    const text = toPlain((md ?? "").trim());
    if (!text) continue;
    blocks.push(`<b>${esc(label)}</b>`);
    blocks.push(esc(text));
    plain.push(text);
  }

  blocks.push(`<a href="${url}">사이트에서 보기</a>`);

  // 검사 대상은 사람이 쓴 문장뿐이다. 링크와 날짜 줄, 서식 태그는 뺀다 (violations 주석 참고).
  return { chunks: pack(blocks), prose: plain.join("\n"), url };
}

/**
 * 문단을 4096자 한도 아래로 묶는다. **문단 경계에서만 자른다** — 글자 수로 자르면
 * `<b>` 태그가 두 통에 걸쳐 쪼개져 텔레그램이 발송을 거부한다.
 * 한 문단이 그 자체로 한도를 넘으면 그때만 줄 단위로 나눈다.
 */
function pack(blocks: string[]): string[] {
  const out: string[] = [];
  let cur = "";

  const push = (piece: string) => {
    if (!cur) cur = piece;
    else if (cur.length + piece.length + 2 <= CHUNK) cur += `\n\n${piece}`;
    else {
      out.push(cur);
      cur = piece;
    }
  };

  for (const b of blocks) {
    if (b.length <= CHUNK) {
      push(b);
      continue;
    }
    let buf = "";
    for (const line of b.split("\n")) {
      if (buf.length + line.length + 1 > CHUNK) {
        push(buf);
        buf = line;
      } else buf = buf ? `${buf}\n${line}` : line;
    }
    if (buf) push(buf);
  }

  if (cur) out.push(cur);
  return out;
}

/**
 * 나가기 직전 재검사. 레지스트리 표준 명칭(코스피, 러셀 2000 …)은 위반이 아니다.
 *
 * **URL은 검사하지 않는다.** KRX에 `TP`라는 종목이 있어서 `https`의 `tp`가 그대로 걸린다
 * (`sources.ts`가 링크를 한글 구간만 검사하는 것과 같은 이유다). 우리가 만드는 주소는
 * `SITE_URL` + 날짜뿐이라 한글이 섞일 자리가 없고, 검사할 값은 사람이 쓴 문장 전부다.
 *
 * `review` 등급도 `block`과 똑같이 막는다. 발행 경로 전체가 같은 기준이다.
 */
export function violations(prose: string): string[] {
  const r = scan(prose);
  return [...r.blocking, ...r.review]
    .filter((v) => !isRegistryName(v.match, v.context))
    .map((v) => `[${v.rule}] "${v.match}" :: ${v.context}`);
}
