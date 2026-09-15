import type { Metadata } from "next";

export const metadata: Metadata = { title: "면책 고지" };

const SECTIONS = [
  {
    title: "다루는 것",
    body: "국내외 지수, 금리, 환율, 유가, 투자주체별 순매수, 업종 등락률 기반 섹터 강약, 그리고 이들에 대한 해설을 제공합니다.",
  },
  {
    title: "다루지 않는 것",
    body: "개별 종목의 이름, 종목코드, 관련주·수혜주·대장주 같은 지목 표현, 매수·매도 추천, 목표주가는 일절 다루지 않습니다. 원본 자료에 그런 내용이 있어도 발행 전 단계에서 제거합니다.",
  },
  {
    title: "투자자문이 아닙니다",
    body: "본 서비스는 개별 종목에 대한 투자자문 또는 투자권유를 제공하지 않습니다. 제공되는 내용은 시장 전반의 통계와 해설이며, 특정 금융투자상품의 매매를 권유하지 않습니다.",
  },
  {
    title: "책임의 한계",
    body: "자료는 신뢰할 수 있다고 판단되는 출처에서 수집하지만 정확성과 완전성을 보장하지 않습니다. 투자 판단과 그 결과에 대한 책임은 이용자 본인에게 있습니다.",
  },
  {
    title: "수치의 출처",
    body: "지수·환율·유가는 시장 데이터에서 직접 수집합니다. 본문 해설과 별개로 관리되며, 수집되지 않은 항목은 추정값을 쓰지 않고 비워 둡니다.",
  },
];

export default function Disclaimer() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">면책 고지</h1>
      <div className="mt-6 space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-sm font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {s.body}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
