import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "개인정보 처리방침" };

/**
 * 개인정보 보호법 제30조에 따른 공개용 처리방침.
 *
 * 여기 적힌 것은 전부 지금 코드가 실제로 하는 일이다(`src/lib/subscribe.ts`,
 * `src/app/api/subscribe/route.ts`, `src/db/schema.ts`). 앞으로 할 계획을 미리
 * 적어 두지 않는다 — 메일 발송 사업자·결제 대행사를 붙이는 회차에 이 파일도 같이 고친다.
 */

const EFFECTIVE_DATE = "2026년 9월 15일";
const CONTACT = "wlsdlstjdwls12@gmail.com";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "1. 처리하는 개인정보 항목",
    body:
      "메일 구독을 신청한 경우에만 이메일 주소, 언어 설정(기본값 ko), 신청 시각, 신청 상태, 확인용 토큰을 저장합니다. 그 밖에 이름·전화번호·생년월일·결제 정보는 받지 않으며, 저장할 수 있는 항목 자체를 두지 않았습니다. 브리핑을 읽기만 하는 경우에는 아무것도 저장하지 않습니다.",
  },
  {
    title: "2. 처리 목적",
    body:
      "발행 알림 메일을 보내기 위해서만 사용합니다. 광고·마케팅 목적으로 쓰거나, 다른 서비스의 회원 식별에 연결하거나, 프로필을 만드는 데 쓰지 않습니다.",
  },
  {
    title: "3. 현재 메일을 보내지 않고 있습니다",
    body:
      "메일 발송 사업자를 연결하기 전이라 신청 건은 '접수(pending)' 상태로만 쌓입니다. 발송을 시작할 때는 신청 주소로 확인 메일을 보내 수신에 동의한 주소에만 발송하며(더블 옵트인), 모든 메일에 수신거부 방법을 함께 적습니다. 정보통신망법 제50조에 따라 사전 동의 없이는 보내지 않습니다.",
  },
  {
    title: "4. 보유 및 이용 기간",
    body:
      "구독을 해지하거나 삭제를 요청하면 지체 없이 파기합니다. 서비스를 종료할 때도 보관하던 신청 정보를 전부 파기합니다. 발송을 시작한 뒤에는 정보통신망법에 따라 수신동의 여부를 2년마다 확인하며, 확인에 응답이 없으면 그 시점에 파기합니다. 별도 백업본은 두지 않습니다.",
  },
  {
    title: "5. 제3자 제공",
    body:
      "개인정보를 제3자에게 제공하지 않습니다. 판매·대여하지 않으며, 법령에 근거한 수사기관의 적법한 요구가 있는 경우를 제외하고 외부에 넘기지 않습니다.",
  },
  {
    title: "6. 처리 위탁 및 국외 이전",
    body:
      "서비스 운영에 필요한 범위에서 아래 사업자의 설비에 정보가 저장·처리됩니다. 두 곳 모두 해외 사업자이므로 개인정보가 국외로 이전됩니다. 이전을 원하지 않으면 구독을 신청하지 않거나 해지를 요청할 수 있으며, 이 경우 발행 알림 메일을 받지 못하는 것 외에 불이익은 없습니다.",
  },
  {
    title: "7. 파기 절차와 방법",
    body:
      "보유 기간이 끝나거나 삭제 요청을 받으면 데이터베이스에서 해당 레코드를 삭제합니다. 종이로 출력해 보관하는 기록은 없습니다.",
  },
  {
    title: "8. 정보주체의 권리와 행사 방법",
    body:
      "언제든지 자신의 정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다. 아래 연락처로 메일을 보내면 처리하며, 요청한 주소가 신청 시 쓴 주소와 같은지 확인한 뒤 진행합니다. 권리 행사를 이유로 불이익을 주지 않습니다.",
  },
  {
    title: "9. 안전성 확보 조치",
    body:
      "수집 항목을 목적에 필요한 최소한으로 제한하고, 사이트 전 구간을 HTTPS로 전송합니다. 데이터베이스 접속 정보는 코드에 넣지 않고 운영 환경의 환경변수로만 관리하며, 접근 권한은 운영자 1인으로 한정합니다. 신청 폼에는 반복 투입을 막는 요청 제한을 두었습니다.",
  },
  {
    title: "10. 접속 기록과 쿠키",
    body:
      "광고·분석 도구를 넣지 않았고, 이용자를 추적하는 쿠키를 심지 않습니다. 구독 신청 시 반복 요청을 막기 위해 접속 IP를 서버 메모리에서 잠시 대조하지만 저장하지 않습니다. 호스팅 사업자가 자체 운영 목적으로 남기는 접속 기록에는 운영자가 개인을 식별할 목적으로 접근하지 않습니다.",
  },
  {
    title: "11. 만 14세 미만 아동",
    body:
      "만 14세 미만 아동의 개인정보는 수집하지 않습니다. 해당 사실을 알게 되면 즉시 파기합니다.",
  },
];

const PROCESSORS: { name: string; role: string; country: string; items: string }[] = [
  {
    name: "Neon (Neon Inc.)",
    role: "구독 신청 정보 저장(데이터베이스)",
    country: "싱가포르",
    items: "이메일 주소, 언어 설정, 신청 시각, 신청 상태, 확인용 토큰",
  },
  {
    name: "Vercel (Vercel Inc.)",
    role: "웹사이트 호스팅 및 신청 처리 실행",
    country: "미국",
    items: "신청 과정에서 전송되는 이메일 주소(별도 저장하지 않음)",
  },
];

export default function Privacy() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">개인정보 처리방침</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        시황 브리핑(개인 운영, 이하 &ldquo;서비스&rdquo;)은 개인정보 보호법 제30조에 따라
        아래와 같이 개인정보를 처리합니다. 시행일 {EFFECTIVE_DATE}.
      </p>

      <div className="mt-6 space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-sm font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {s.body}
            </p>

            {s.title.startsWith("6.") ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr style={{ color: "var(--muted)" }}>
                      {["수탁자", "위탁 업무", "이전 국가", "이전 항목"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="border-b px-2 py-1.5 text-left font-medium"
                          style={{ borderColor: "var(--line)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROCESSORS.map((p) => (
                      <tr key={p.name}>
                        <td className="border-b px-2 py-1.5 align-top" style={{ borderColor: "var(--line)" }}>
                          {p.name}
                        </td>
                        <td
                          className="border-b px-2 py-1.5 align-top"
                          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                        >
                          {p.role}
                        </td>
                        <td
                          className="border-b px-2 py-1.5 align-top"
                          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                        >
                          {p.country}
                        </td>
                        <td
                          className="border-b px-2 py-1.5 align-top"
                          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                        >
                          {p.items}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}

        <section>
          <h2 className="text-sm font-semibold">12. 개인정보 보호책임자</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            개인정보 처리에 관한 문의, 열람·정정·삭제·처리정지 요청, 피해 구제는 아래로
            연락하면 됩니다. 접수한 날부터 지체 없이 답변합니다.
          </p>
          <p className="mt-2 text-sm">
            <a href={`mailto:${CONTACT}`} className="underline underline-offset-4">
              {CONTACT}
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">13. 권익침해 구제 방법</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            개인정보 침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이
            118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972), 대검찰청 사이버수사과(1301),
            경찰청 사이버수사국(ecrm.police.go.kr, 182)에 할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">14. 처리방침의 변경</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            내용이 바뀌면 변경된 방침을 이 페이지에 게시하고 시행일을 함께 적습니다. 수집 항목이
            늘어나거나 새로운 수탁자가 생기는 변경은 시행 전에 미리 알립니다.
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm">
        <Link href="/disclaimer" className="underline underline-offset-4">
          면책 고지
        </Link>
        <span style={{ color: "var(--muted)" }}> · 투자자문·투자권유를 제공하지 않습니다.</span>
      </p>
    </>
  );
}
