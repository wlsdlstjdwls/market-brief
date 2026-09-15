/**
 * 원본 리포트의 "뉴스 분석" 블록을 종목 없는 카드 목록으로 뽑는다.
 *
 *   섹션 1 Executive Summary   → 뉴스 분석
 *   섹션 5 오늘의 핵심 테마    → 핵심 테마
 *   섹션 4 섹터별 투자 포인트  → 업종 관점
 *
 * 이 파일이 다루는 것은 수치가 아니라 산문이다. 그래서 규칙이 extract.ts의 문단 필터보다 세다.
 *
 *   - 수혜 / 피해 / 대표 종목 / 대장주 줄은 **읽지도 않는다.** 그 줄의 존재 이유가
 *     개별 종목 지목이라 걸러 쓸 여지가 없다.
 *   - 제목과 첫 항목에 종목이 하나라도 있으면 그 카드를 통째로 버린다.
 *   - 나머지 항목만 걸리면 그 줄만 비우고 카드는 남긴다.
 *
 * review 등급도 block과 똑같이 버린다. 놓치는 쪽이 훨씬 위험하다(guard.ts 주석 참고).
 */

import { scan } from "./guard";
import { cleanHeading, dedot, type Section } from "./markdown";

export type TopicKind = "news" | "theme" | "sector";

export interface TopicLine {
  label: string;
  text: string;
}

export interface Topic {
  kind: TopicKind;
  rank: number;
  title: string;
  /** 영향도 등급. 뉴스에만 있고 나머지는 빈 문자열 */
  impact: string;
  lines: TopicLine[];
}

export interface DroppedTopic {
  kind: TopicKind;
  title: string;
  matches: string[];
}

interface FieldSpec {
  label: string;
  match: RegExp;
}

interface TopicSpec {
  kind: TopicKind;
  /** 블록 시작 헤딩 */
  start: RegExp;
  /**
   * 카드를 어디서 자르는가.
   *   "heading" — 뒤따르는 형제 헤딩 하나가 카드 하나 (섹션 1, 섹션 5)
   *   "bold"    — 한 섹션 본문 안의 `**1. 제목**` 줄이 카드 하나 (섹션 4)
   */
  cut: "heading" | "bold";
  /** 화면에 싣는 항목. 배열 첫 번째가 그 카드의 본문이며, 여기가 더러우면 카드를 버린다. */
  fields: FieldSpec[];
  /** 등급 배지로 뽑을 항목 */
  impact?: RegExp;
  /** 제목을 손볼 일이 있으면 (섹터 카드의 강세, 약세 표시 같은) */
  title?: (heading: string, source: string) => string;
}

const TOPIC_SPECS: TopicSpec[] = [
  {
    kind: "news",
    start: /섹션\s*1\b.*executive\s*summary/i,
    cut: "heading",
    fields: [
      { label: "무슨 일인가", match: /한\s*줄\s*요약/ },
      { label: "왜 중요한가", match: /왜\s*중요/ },
    ],
    impact: /영향도/,
  },
  {
    kind: "theme",
    start: /섹션\s*5\b.*(테마|핵심)/,
    cut: "heading",
    fields: [
      { label: "발생 원인", match: /발생\s*원인|배경/ },
      { label: "시장 관심도", match: /시장\s*관심도|관심도/ },
      { label: "지속 가능성", match: /지속\s*가능성/ },
      { label: "논리와 리스크", match: /논리|리스크/ },
    ],
  },
  /*
   * 업종 단위라 종목 없이 살아남는 비율이 Executive Summary보다 훨씬 높다.
   * 뉴스 카드가 종목 때문에 무더기로 버려지는 회차를 이걸로 메운다.
   * 회차에 따라 항목이 `### 1. 반도체` 헤딩일 때도, `**1. 반도체**` 굵은 줄일 때도 있어
   * 둘 다 받는다. "대표 종목" 줄은 어느 쪽이든 읽지 않는다.
   */
  {
    kind: "sector",
    start: /(상승|강세|약세|하락)\s*가능성\s*높은\s*섹터/,
    cut: "bold",
    title: (heading, source) => {
      const weak = /약세|하락/.test(source);
      const name = heading.replace(/^\s*\d+\s*[.)]\s*/, "").trim();
      return `${weak ? "약세" : "강세"} — ${name}`;
    },
    fields: [
      { label: "논리", match: /(상승|하락|약세)?\s*논리/ },
      { label: "관련 뉴스", match: /관련\s*뉴스/ },
      { label: "체크 포인트", match: /체크\s*포인트/ },
    ],
  },
];

/** 다음 "섹션 N."을 만나면 그 블록이 끝난 것 */
const NEXT_SECTION = /^섹션\s*\d+\s*[.)]/;

/** `- 라벨: 값` 한 줄을 뽑는다. 콜론은 반각, 전각 모두 받는다. */
function field(body: string, label: RegExp): string {
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*[-*•]\s*([^:：]+)[:：]\s*(.+)$/.exec(line);
    if (m && label.test(m[1].replace(/\*/g, "").trim())) return m[2].trim();
  }
  return "";
}

/** 영향도에서 이모지, 괄호를 걷어내고 등급 문구만 남긴다. */
export function impactLevel(raw: string): string {
  const t = cleanHeading(raw).replace(/[(（].*$/, "").trim();
  const m = /(매우\s*큼|매우\s*작음|큼|보통|작음)/.exec(t);
  return m ? m[1].replace(/\s+/g, " ") : "";
}

const dirty = (t: string) => t === "" || scan(t).violations.length > 0;
const matchesOf = (t: string) =>
  [...new Set(scan(t).violations.map((v) => v.match))];

/** 카드 하나의 원재료 — 제목과 그 아래 줄들 */
interface Block {
  heading: string;
  body: string;
  /** 제목 가공에 쓰는 문맥 (섹터의 강세, 약세 판별) */
  source: string;
}

/** 섹션 본문에서 `**1. 제목**` 줄을 경계로 블록을 자른다. */
function boldBlocks(s: Section): Block[] {
  const source = [...s.path, s.heading].map(cleanHeading).join(" ");
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const line of s.body.split(/\r?\n/)) {
    const m = /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { heading: m[1].trim(), body: "", source };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 블록 시작 헤딩 뒤에 이어지는 형제 헤딩들을 블록으로 본다. */
function headingBlocks(spec: TopicSpec, sections: Section[]): Block[] {
  const start = sections.findIndex((s) =>
    spec.start.test(cleanHeading(s.heading)),
  );
  if (start < 0) return [];
  const out: Block[] = [];
  for (const s of sections.slice(start + 1)) {
    const heading = cleanHeading(s.heading);
    if (NEXT_SECTION.test(heading)) break;
    out.push({ heading, body: s.body, source: heading });
  }
  return out;
}

function blocksOf(spec: TopicSpec, sections: Section[]): Block[] {
  if (spec.cut === "heading") return headingBlocks(spec, sections);

  // bold — 굵은 줄 항목과, 항목이 헤딩으로 적힌 형태를 모두 받는다.
  const out: Block[] = [];
  for (const s of sections) {
    const path = [...s.path, s.heading].map(cleanHeading).join(" ");
    if (!spec.start.test(path)) continue;
    out.push(...boldBlocks(s));
    if (!spec.start.test(cleanHeading(s.heading)))
      out.push({ heading: cleanHeading(s.heading), body: s.body, source: path });
  }
  return out;
}

function collect(
  spec: TopicSpec,
  sections: Section[],
  dropped: DroppedTopic[],
): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<string>();

  for (const b of blocksOf(spec, sections)) {
    const raw = dedot(cleanHeading(b.heading));
    const title = spec.title ? spec.title(raw, b.source) : raw;

    const values = spec.fields.map((f) => ({
      label: f.label,
      text: dedot(field(b.body, f.match)),
    }));
    const lead = values[0];
    if (!lead.text) continue; // 이 형식의 카드가 아니다
    if (seen.has(title)) continue;
    seen.add(title);

    if (dirty(title) || dirty(lead.text)) {
      dropped.push({
        kind: spec.kind,
        title,
        matches: matchesOf(`${title}\n${lead.text}`),
      });
      continue;
    }

    out.push({
      kind: spec.kind,
      rank: out.length + 1,
      title,
      impact: spec.impact ? impactLevel(field(b.body, spec.impact)) : "",
      lines: values.filter((v) => v.text && !dirty(v.text)),
    });
  }
  return out;
}

/** 리포트 한 편에서 카드를 모두 뽑는다. */
export function extractTopics(
  sections: Section[],
  dropped: DroppedTopic[] = [],
): Topic[] {
  return TOPIC_SPECS.flatMap((spec) => collect(spec, sections, dropped));
}
