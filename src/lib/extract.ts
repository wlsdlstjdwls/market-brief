/**
 * 원본 리포트 → 종목 없는 브리핑 페이로드 변환.
 *
 * 원본은 절대 수정하지 않는다 (읽기 전용).
 * 기존 텔레그램 파이프라인과 무관하며, 이 웹 프로젝트에서만 쓰인다.
 *
 * 3중 방어
 *   1) 파일 화이트리스트  — 종목뉴스.md는 투입 자체를 거부
 *   2) 섹션 블랙리스트    — 종목·관심·갭·투자아이디어·예측검증 섹션 통째 제외
 *   3) 문단 단위 필터     — 남은 문단도 한 건이라도 걸리면 버림
 * 구조화 수치(지수·지표·업종)는 원문 문자열이 아니라 registry의 표준 명칭으로 저장한다.
 */

import { scan } from "./guard";
import {
  splitSections, parseTables, paragraphs, cleanHeading, toNumber, toPercent,
  type Section,
} from "./markdown";
import { INDICES, MACROS, SECTORS } from "./registry";

export const SOURCE_ALLOW = ["시황.md", "일일리포트.md", "섹터분석.md"] as const;
export const SOURCE_DENY = ["종목뉴스.md"] as const;

/** 이 단어가 헤딩 경로에 하나라도 있으면 그 섹션과 하위 전체를 버린다. */
const SECTION_DENY = [
  /종목/, /관심/, /갭\s*상승/, /갭\s*하락/, /투자\s*아이디어/,
  /추천/, /예측\s*검증/, /목표가/, /수혜/, /대장/,
];

export interface DroppedBlock {
  heading: string;
  reason: "section-denied" | "equity-mention";
  matches?: string[];
  sample: string;
}

export interface BriefPayload {
  tradeDate: string;
  runId: string;
  headline: string;
  summary: string;
  macroCommentary: string;
  marketSummary: string;
  indices: Array<{ indexCode: string; indexName: string; close: number | null; changePct: number | null; sortOrder: number }>;
  macros: Array<{ kind: "rate" | "fx" | "oil" | "commodity" | "volatility"; name: string; value: number | null; unit: string; changePct: number | null; sortOrder: number }>;
  flows: Array<{ market: string; investor: "foreign" | "institution" | "retail"; netAmount: number | null }>;
  sectors: Array<{ krxSectorCode: string; sectorName: string; changePct: number | null; rank: number }>;
  dropped: DroppedBlock[];
}

export class DeniedSourceError extends Error {}

export function assertAllowedSource(fileName: string): void {
  if ((SOURCE_DENY as readonly string[]).includes(fileName)) {
    throw new DeniedSourceError(
      `${fileName}은(는) 개별 종목 뉴스라 이 파이프라인에 투입할 수 없습니다.`
    );
  }
  if (!(SOURCE_ALLOW as readonly string[]).includes(fileName)) {
    throw new DeniedSourceError(
      `${fileName}은(는) 허용 목록에 없습니다. 허용: ${SOURCE_ALLOW.join(", ")}`
    );
  }
}

const sectionDenied = (s: Section) =>
  s.path.some((h) => SECTION_DENY.some((re) => re.test(h)));

/** 문단 중 종목 언급이 전혀 없는 것만 남긴다. */
function cleanParagraphs(s: Section, dropped: DroppedBlock[]): string[] {
  const kept: string[] = [];
  for (const p of paragraphs(s.body)) {
    const r = scan(p);
    if (r.violations.length) {
      dropped.push({
        heading: cleanHeading(s.heading),
        reason: "equity-mention",
        matches: [...new Set(r.violations.map((v) => v.match))],
        sample: p.slice(0, 80),
      });
      continue;
    }
    kept.push(p);
  }
  return kept;
}

function pickSections(all: Section[], re: RegExp): Section[] {
  return all.filter((s) => s.path.some((h) => re.test(h)));
}

/**
 * 시장 수치는 리포트 산문에서 긁지 않는다.
 * scripts/fetch_market.py가 실제 시세에서 받아 둔 JSON만 사용한다.
 * 라벨은 원문 문자열이 아니라 registry의 표준 명칭으로 치환하므로,
 * "러셀2000"처럼 종목명과 겹치는 표기가 DB에 들어갈 수 없다.
 */
export interface MarketData {
  tradeDate: string;
  fetchedAt?: string;
  indices?: Array<{ indexCode: string; close: number | null; changePct: number | null; sortOrder?: number }>;
  macros?: Array<{ key: string; value: number | null; changePct: number | null; sortOrder?: number }>;
  flows?: Array<{ market: string; investor: string; netAmount: number | null }>;
  sectors?: Array<{ krxSectorCode: string; changePct: number | null; rank?: number }>;
}

const INVESTORS = new Set(["foreign", "institution", "retail"]);

function mapIndices(md: MarketData): BriefPayload["indices"] {
  return (md.indices ?? [])
    .flatMap((r) => {
      const def = INDICES.find((d) => d.code === r.indexCode);
      if (!def) return [];
      return [{
        indexCode: def.code, indexName: def.name,
        close: r.close ?? null, changePct: r.changePct ?? null, sortOrder: def.order,
      }];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapMacros(md: MarketData): BriefPayload["macros"] {
  return (md.macros ?? [])
    .flatMap((r) => {
      const def = MACROS.find((d) => d.key === r.key);
      if (!def) return [];
      return [{
        kind: def.kind, name: def.name, unit: def.unit,
        value: r.value ?? null, changePct: r.changePct ?? null, sortOrder: def.order,
      }];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapFlows(md: MarketData): BriefPayload["flows"] {
  return (md.flows ?? []).flatMap((r) => {
    if (!INVESTORS.has(r.investor)) return [];
    if (!/^(KOSPI|KOSDAQ|전체)$/.test(r.market)) return [];
    return [{
      market: r.market,
      investor: r.investor as "foreign" | "institution" | "retail",
      netAmount: r.netAmount ?? null,
    }];
  });
}

function mapSectors(md: MarketData): BriefPayload["sectors"] {
  return (md.sectors ?? []).flatMap((r, i) => {
    const def = SECTORS.find((d) => d.code === r.krxSectorCode);
    if (!def) return [];
    return [{
      krxSectorCode: def.code, sectorName: def.name,
      changePct: r.changePct ?? null, rank: r.rank ?? i + 1,
    }];
  });
}

/**
 * 구조화 필드 최종 검증.
 * 텍스트 스캔이 아니라 registry 소속 여부로 확인한다. 화이트리스트라 더 강하다.
 */
export function assertRegistryOnly(p: BriefPayload): void {
  const bad: string[] = [];
  for (const i of p.indices)
    if (!INDICES.some((d) => d.code === i.indexCode && d.name === i.indexName))
      bad.push(`지수 ${i.indexCode}/${i.indexName}`);
  for (const m of p.macros)
    if (!MACROS.some((d) => d.name === m.name)) bad.push(`지표 ${m.name}`);
  for (const s of p.sectors)
    if (!SECTORS.some((d) => d.code === s.krxSectorCode && d.name === s.sectorName))
      bad.push(`섹터 ${s.krxSectorCode}/${s.sectorName}`);
  for (const f of p.flows)
    if (!INVESTORS.has(f.investor)) bad.push(`수급 ${f.investor}`);
  if (bad.length)
    throw new Error(`레지스트리에 없는 항목이 있습니다: ${bad.join(", ")}`);
}

export function buildPayload(
  files: Record<string, string>,
  tradeDate: string,
  runId: string,
  market: MarketData = { tradeDate }
): BriefPayload {
  for (const name of Object.keys(files)) assertAllowedSource(name);

  const dropped: DroppedBlock[] = [];
  const all: Section[] = [];
  for (const [name, md] of Object.entries(files)) {
    for (const s of splitSections(md)) {
      if (sectionDenied(s)) {
        dropped.push({
          heading: `${name} › ${cleanHeading(s.heading)}`,
          reason: "section-denied",
          sample: s.body.slice(0, 60),
        });
        continue;
      }
      all.push(s);
    }
  }

  const usSections = pickSections(all, /미국\s*증시|채권|환율|원자재|변동성|지정학|예정\s*지표/);
  const krSections = pickSections(all, /한국\s*증시|지수\s*마감|하루의\s*흐름|수급|결론/);

  const macroParas = usSections.flatMap((s) => cleanParagraphs(s, dropped));
  const krParas = krSections.flatMap((s) => cleanParagraphs(s, dropped));

  const indices = mapIndices(market);
  const kospi = indices.find((i) => i.indexCode === "KOSPI");
  const headline =
    kospi && kospi.changePct !== null
      ? `코스피 ${kospi.close?.toLocaleString() ?? ""} (${kospi.changePct > 0 ? "+" : ""}${kospi.changePct}%)`
      : `${tradeDate} 시장 브리핑`;

  const payload: BriefPayload = {
    tradeDate,
    runId,
    headline,
    summary: krParas[0] ?? macroParas[0] ?? "",
    macroCommentary: macroParas.join("\n\n"),
    marketSummary: krParas.join("\n\n"),
    indices,
    macros: mapMacros(market),
    flows: mapFlows(market),
    sectors: mapSectors(market),
    dropped,
  };
  assertRegistryOnly(payload);
  return payload;
}
