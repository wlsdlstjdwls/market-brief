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

/** 문단 단위로 쪼갠다 (차단 필터를 문단 단위로 적용하기 위함). */
export function paragraphs(body: string): string[] {
  return proseOnly(body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
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
