/** 원본 리포트 마크다운을 블록 단위로 쪼개는 최소 파서. */

export interface Section {
  level: number;
  heading: string;
  /** 헤딩 아래 본문 (하위 헤딩 제외) */
  body: string;
  /** 최상위부터의 헤딩 경로 */
  path: string[];
}

export interface Table {
  header: string[];
  rows: string[][];
}

/** 헤딩 기준으로 섹션을 자른다. */
export function splitSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const out: Section[] = [];
  const stack: string[] = [];
  let cur: Section | null = null;

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      const level = m[1].length;
      const heading = m[2].trim();
      stack.length = Math.max(0, level - 1);
      stack[level - 1] = heading;
      cur = { level, heading, body: "", path: stack.filter(Boolean).slice() };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

/** 본문에서 마크다운 표를 모두 뽑는다. */
export function parseTables(body: string): Table[] {
  const tables: Table[] = [];
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*\|/.test(lines[i] ?? "")) { i++; continue; }
    const sep = lines[i + 1] ?? "";
    if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(sep) || !sep.includes("-")) { i++; continue; }
    const cells = (l: string) =>
      l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const header = cells(lines[i]);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      rows.push(cells(lines[j]));
      j++;
    }
    tables.push({ header, rows });
    i = j;
  }
  return tables;
}

/** 표를 제외한 산문만 남긴다. */
export function proseOnly(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((l) => !/^\s*\|/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 내용이 없는 문단.
 *
 *   - 원본 구분선(`---`). 표와 종목 줄을 걷어내고 나면 구분선만 줄줄이 남아
 *     화면에 가로줄이 두세 개씩 연달아 그려졌다.
 *   - `**국채, 달러, 원자재, 변동성**`처럼 표 제목만 있는 줄. 그 표는 proseOnly가
 *     이미 버렸으므로 가리킬 내용이 없는 빈 제목이다.
 */
const EMPTY_PARA = [
  /^(?:[-*_]\s*){3,}$/,
  /^\*\*[^*\n]+\*\*$/,
];

/** 문단 단위로 쪼갠다 (차단 필터를 문단 단위로 적용하기 위함). */
export function paragraphs(body: string): string[] {
  return stripNoise(proseOnly(body))
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !EMPTY_PARA.some((re) => re.test(p)));
}

/** 이모지·장식 제거 */
export function cleanHeading(h: string): string {
  return h
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 숫자 파싱. "7,171.52", "-0.58%", "+3.0~5.2%" 등 */
export function toNumber(s: string | undefined): number | null {
  if (!s) return null;
  const m = /-?\d[\d,]*(\.\d+)?/.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 등락률 파싱. 괄호 안 포인트 값은 무시하고 % 값을 취한다. */
export function toPercent(s: string | undefined): number | null {
  if (!s) return null;
  const m = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * 가운뎃점을 쉼표로 바꾼다.
 *
 * 원본 리포트는 "외국인·기관·개인"처럼 가운뎃점으로 단어를 잇는데, 사용자 지시로
 * 화면에서 이 기호를 쓰지 않는다. 적재 단계에서 바꾸므로 DB에도 남지 않는다.
 */
export function dedot(s: string): string {
  return s.replace(/\s*[·ㆍ]\s*/g, ", ");
}

/**
 * 산문에서 원본 내부용 줄을 걷어낸다.
 *
 *   - `*(상세 분석은 시황.md 2장 참고)*` 같은 파일 상호참조. 이 사이트는 그 파일들을
 *     이미 같이 읽어 한 페이지에 싣기 때문에, 독자에게는 가리킬 곳이 없는 문장이다.
 *   - 원본 말미의 면책 고지 인용문. 사이트 하단에 같은 취지의 문구가 이미 있다.
 */
const NOISE_LINE = [
  /* 원본 구분선. 표를 걷어내면 가로줄만 연달아 남는다. */
  /^\s*(?:[-*_]\s*){3,}$/,
  /(시황|일일리포트|섹터분석|종목뉴스)\.md/,
  /^\s*[*_(]*\s*상세\s*(분석)?은/,
  /^\s*>\s*\*?\*?면책/,
  /*
   * 출처 줄. 이제 카드 하단과 "출처" 블록에 매체명 칩으로 따로 그리므로(sources.ts),
   * 산문에 남겨 두면 같은 링크가 두 번 나온다. 게다가 이 줄의 링크 텍스트에는
   * 기사 제목이 통째로 들어 있어 종목명이 섞이기 쉽다.
   */
  /^\s*[-*•]?\s*\**\s*(원문|국내\s*보도|해외\s*보도|출처|관련\s*기사)\s*\**\s*[:：]/,
  /* 시세만 적힌 목록 줄. 이 사이트는 지수 값을 싣지 않는다(사용자 지시). */
  /^\s*[-*]\s*\**\s*(코스피|코스닥|나스닥|다우|S&P\s*500|러셀|닛케이|상하이|수급|환율|원\/달러|엔\/달러|달러인덱스|WTI|브렌트|금|VIX|국고채|미\s*국채)\s*\**\s*[:：]/,
];

export function stripNoise(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((l) => !NOISE_LINE.some((re) => re.test(l)))
    .join("\n");
}
