import Link from "next/link";
import { renderMarkdown, renderText } from "../lib/render";
import { SESSION_LABEL, SESSION_ORDER, type Session } from "../lib/queries";
import SectionRail from "./SectionRail";
import Shell from "./Shell";

interface Props {
  brief: {
    tradeDate: string;
    session: Session;
    runId: string;
    /** 원고가 적어 둔 작성 기준시각. 지금은 화면에 찍지 않는다(DB에는 계속 쌓인다). */
    writtenAt?: Date | string | null;
    /** 이 사이트에 올라간 시각(적재 시각). 원고가 늦으면 작성 시각과 몇 시간 벌어진다. */
    publishedAt?: Date | string | null;
    headline: string;
    macroCommentary: string;
    marketSummary: string;
    /** 그 회차가 인용한 기사. jsonb라 모양을 믿지 않고 toSources가 확인한다 */
    sources?: unknown;
  };
  /** 그날 발행된 회차. 둘이면 탭이 나온다. 하나면 탭을 그리지 않는다. */
  sessions?: Session[];
  /** 탭 링크의 뿌리. 홈이면 "/", 날짜 페이지면 "/brief/{날짜}". */
  basePath?: string;
  topics?: Array<{
    kind: string;
    rank: number;
    title: string;
    impact: string;
    lines: unknown;
    sources?: unknown;
  }>;
  recent?: Array<{ tradeDate: string; headline: string }>;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : WEEKDAY[d.getDay()];
}

/*
 * 시각 표기는 전부 KST로 고정한다. 서버(Vercel)는 UTC로 도는데 포맷터에 시간대를
 * 주지 않으면 화면의 "07:34"가 배포 환경마다 달라진다.
 */
const KST_HM = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const KST_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 게시 시각. 거래일과 다른 날에 올라갔으면 날짜를 같이 찍는다.
 * 원고가 늦게 나온 날은 다음 날 새벽에 들어가기도 하고, 과거 회차 일괄 적재분은
 * 거래일과 게시일이 아예 다르다. 시각만 찍으면 그게 언제인지 알 수 없다.
 */
function postedLabel(v: Date | string | null | undefined, tradeDate: string) {
  const d = toDate(v);
  if (!d) return null;
  const day = KST_YMD.format(d);
  const time = KST_HM.format(d);
  return day === tradeDate ? `${time} 게시` : `${dotted(day).slice(5)} ${time} 게시`;
}

/**
 * 회차 탭. 원본 루틴이 하루 두 번 쓰기 때문에 한 날짜에 글이 둘이다.
 * 링크만 쓰므로 클라이언트 자바스크립트가 필요 없다.
 */
function SessionTabs({
  basePath,
  current,
  sessions,
}: {
  basePath: string;
  current: Session;
  sessions: Session[];
}) {
  const shown = SESSION_ORDER.filter((s) => sessions.includes(s));
  if (shown.length < 2) return null;
  return (
    <nav className="tabs" aria-label="회차">
      {shown.map((s) => (
        <Link
          key={s}
          href={s === "pm" ? basePath : `${basePath}?s=${s}`}
          className={s === current ? "tab tab--on" : "tab"}
          aria-current={s === current ? "page" : undefined}
          scroll={false}
        >
          {SESSION_LABEL[s]}
        </Link>
      ))}
    </nav>
  );
}

/** 2026-09-15 → 2026.09.15 (마스트헤드에서 가장 큰 요소) */
function dotted(date: string) {
  return date.replace(/-/g, ".");
}

function Section({
  id,
  ord,
  label,
  note,
  link,
  first,
  children,
}: {
  id: string;
  ord: number;
  label: string;
  note?: string;
  link?: { href: string; text: string };
  first: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={first ? "sec sec--first" : "sec"}>
      <div className="sec-gutter">
        <h2 className="sec-label">
          {String(ord).padStart(2, "0")} {label}
        </h2>
        {note ? <p className="sec-note">{note}</p> : null}
        {link ? (
          <Link href={link.href} className="sec-link">
            {link.text}
          </Link>
        ) : null}
      </div>
      <div className="sec-body">{children}</div>
    </section>
  );
}

/**
 * 뉴스 카드 한 장. 원본에서 종목이 든 줄을 걷어낸 뒤 남은 줄만 들어온다.
 * lines는 DB에서 jsonb로 오므로 모양을 믿지 않고 toLines가 한 번 더 확인한다.
 */
function TopicCard({
  ord,
  title,
  impact,
  lines,
  sources,
}: {
  ord: number;
  title: string;
  impact: string;
  lines: Array<{ label: string; text: string }>;
  sources: SourceLink[];
}) {
  return (
    <article className="topic">
      {/* 번호와 배지를 제목 위 한 줄에 따로 둔다. 제목 옆에 붙이면 제목의 일부로 읽힌다. */}
      <div className="topic-head">
        <span className="topic-no">{String(ord).padStart(2, "0")}</span>
        {impact ? <ImpactMeter level={impact} /> : null}
      </div>
      <h3 className="topic-title">{renderText(title)}</h3>
      {lines.map((l) => (
        <p className="topic-line" key={l.label}>
          <span className="topic-label">{l.label}</span>
          {renderText(l.text)}
        </p>
      ))}
      <SourceList links={sources} />
    </article>
  );
}

/**
 * 기사 링크 줄.
 *
 * 매체명만 찍는다. 기사 제목을 쓰면 거기에 종목명이 들어 있다("... SK하이닉스 자사주 매입").
 * sources.ts가 이미 매체명만 남기고 URL까지 검사하지만, 화면에서도 제목을 쓰지 않는다.
 * 외부로 나가는 링크라 `rel`을 박는다.
 */
function SourceList({ links, label = "기사" }: { links: SourceLink[]; label?: string }) {
  if (!links.length) return null;
  // 같은 매체의 다른 기사가 여러 건이면 이름이 똑같이 찍힌다. 두 번째부터 번호를 단다.
  const seen = new Map<string, number>();
  return (
    <p className="topic-sources">
      {label ? <span className="topic-label">{label}</span> : null}
      {links.map((l) => {
        const n = (seen.get(l.label) ?? 0) + 1;
        seen.set(l.label, n);
        return (
          <a
            key={l.url}
            className="source-chip"
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {renderText(n > 1 ? `${l.label} ${n}` : l.label)}
          </a>
        );
      })}
    </p>
  );
}

/**
 * 영향도 등급 → 막대 미터.
 * 칸 수로 크기를 보여주므로 글자를 안 읽어도 농도가 눈에 들어온다.
 */
const IMPACT_LEVEL: Record<string, { fill: number; tone: string }> = {
  "매우 큼": { fill: 3, tone: "topic-impact--max" },
  "큼": { fill: 2, tone: "topic-impact--high" },
  "보통": { fill: 1, tone: "topic-impact--mid" },
  "작음": { fill: 0, tone: "topic-impact--low" },
  "매우 작음": { fill: 0, tone: "topic-impact--low" },
};

const METER_SLOTS = [0, 1, 2];

function ImpactMeter({ level }: { level: string }) {
  const spec = IMPACT_LEVEL[level] ?? { fill: 0, tone: "topic-impact--low" };
  return (
    <span className={`topic-impact ${spec.tone}`}>
      <span className="impact-meter" aria-hidden="true">
        {METER_SLOTS.map((i) => (
          <span
            key={i}
            className={i < spec.fill ? "impact-bar impact-bar--on" : "impact-bar"}
          />
        ))}
      </span>
      시장 영향 {level}
    </span>
  );
}

interface SourceLink {
  label: string;
  url: string;
}

/** jsonb에서 온 링크 배열을 확인한다. http(s) 절대 URL만 받는다. */
function toSources(v: unknown): SourceLink[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { label, url } = x as { label?: unknown; url?: unknown };
    if (typeof label !== "string" || typeof url !== "string") return [];
    if (!label || !/^https?:\/\//.test(url)) return [];
    return [{ label, url }];
  });
}

function toLines(v: unknown): Array<{ label: string; text: string }> {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { label, text } = x as { label?: unknown; text?: unknown };
    if (typeof label !== "string" || typeof text !== "string" || !text)
      return [];
    return [{ label, text }];
  });
}

const TOPIC_BLOCKS: Array<{ kind: string; id: string; label: string }> = [
  { kind: "news", id: "news", label: "뉴스 분석" },
  { kind: "theme", id: "themes", label: "핵심 테마" },
  { kind: "sector", id: "sectors", label: "업종 관점" },
];

/**
 * 이 페이지는 뉴스만 싣는다.
 * 지수, 금리, 수급, 업종 등락률 같은 수치 블록은 2026-09-15 회차에 화면에서 뺐다(사용자 지시).
 * 수집과 적재는 계속 돌고 있으니 되돌리려면 이 파일에 블록을 다시 넣으면 된다.
 */
export default function BriefView({
  brief,
  sessions = [],
  basePath = `/brief/${brief.tradeDate}`,
  topics = [],
  recent = [],
}: Props) {
  const blocks: Array<{
    id: string;
    label: string;
    note?: string;
    link?: { href: string; text: string };
    node: React.ReactNode;
  }> = [];

  for (const b of TOPIC_BLOCKS) {
    const items = topics
      .filter((t) => t.kind === b.kind)
      .map((t) => ({ ...t, lines: toLines(t.lines), sources: toSources(t.sources) }))
      .filter((t) => t.lines.length);
    if (!items.length) continue;
    blocks.push({
      id: b.id,
      label: b.label,
      node: (
        <>
          {items.map((t, i) => (
            <TopicCard
              key={`${t.rank}-${t.title}`}
              ord={i + 1}
              title={t.title}
              impact={t.impact}
              lines={t.lines}
              sources={t.sources}
            />
          ))}
        </>
      ),
    });
  }

  if (brief.marketSummary) {
    blocks.push({
      id: "domestic",
      label: "국내 시장",
      node: (
        <div
          className="prose"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(brief.marketSummary),
          }}
        />
      ),
    });
  }

  if (brief.macroCommentary) {
    blocks.push({
      id: "global",
      label: "해외 시장",
      node: (
        <div
          className="prose"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(brief.macroCommentary),
          }}
        />
      ),
    });
  }

  /*
   * 회차 전체 출처. 원고 말미 `## 출처(주요)` 목록이다.
   * 카드별 링크가 붙기 시작한 건 2026-09-18 회차부터라, 그 전 회차는 여기만 채워진다.
   */
  const briefSources = toSources(brief.sources);
  if (briefSources.length) {
    blocks.push({
      id: "sources",
      label: "출처",
      note: "원문 기사로 이동합니다",
      node: <SourceList links={briefSources} label="" />,
    });
  }

  if (recent.length) {
    blocks.push({
      id: "recent",
      label: "지난 브리핑",
      link: { href: "/archive", text: "전체 보기" },
      node: (
        <>
          {recent.map((b) => {
            const d = weekday(b.tradeDate);
            return (
              <Link
                key={b.tradeDate}
                href={`/brief/${b.tradeDate}`}
                className="list-row"
              >
                <span className="list-date">
                  {b.tradeDate.slice(5).replace("-", ".")}
                  {d ? ` ${d}` : ""}
                </span>
                <span className="list-title">{b.headline}</span>
              </Link>
            );
          })}
        </>
      ),
    });
  }

  const day = weekday(brief.tradeDate);
  const posted = postedLabel(brief.publishedAt, brief.tradeDate);

  return (
    <Shell
      rail={
        <SectionRail
          items={blocks.map((b) => ({ id: b.id, label: b.label }))}
          meta={dotted(brief.tradeDate)}
        />
      }
    >
      <header className="masthead">
        <div className="masthead-row">
          <span className="date-xl">{dotted(brief.tradeDate)}</span>
          {day ? <span className="masthead-meta">{day}요일</span> : null}
        </div>

        <SessionTabs
          basePath={basePath}
          current={brief.session}
          sessions={sessions}
        />

        {/* 회차와 게시 시각만 찍는다. 원고 작성 시각은 사용자 지시로 뺐다(2026-09-17).
            값은 daily_brief.written_at에 계속 쌓이므로 되살리려면 여기만 되돌리면 된다. */}
        <p className="edition">
          <span>{SESSION_LABEL[brief.session]}</span>
          {posted ? <span>{posted}</span> : null}
        </p>

        <h1 className="headline">{renderText(brief.headline)}</h1>
      </header>

      {blocks.map((b, i) => (
        <Section
          key={b.id}
          id={b.id}
          ord={i + 1}
          label={b.label}
          note={b.note}
          link={b.link}
          first={i === 0}
        >
          {b.node}
        </Section>
      ))}
    </Shell>
  );
}
