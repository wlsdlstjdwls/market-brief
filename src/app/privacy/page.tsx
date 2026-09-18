import type { Metadata } from "next";
import Shell from "../../components/Shell";
import { ANALYTICS_START, ONLINE_MIN, RETENTION_MONTHS } from "../../lib/analytics";
import { CONTACT_EMAIL, SITE_NAME } from "../../lib/site";

/**
 * 개인정보 처리방침. 개인정보 보호법 제30조에 따라 첫 화면 푸터에서 한 번에 닿는다.
 *
 * **2026-09-18에 다시 세웠다.** 09-15에 한 번 지웠는데(그때는 수집하는 것이 0이었다)
 * 방문 집계를 켜면서 다시 필요해졌다 — 무작위 식별자라도 **사람을 하나로 묶어 세는**
 * 이상 처리방침이 먼저 서야 한다.
 *
 * **시행일은 `analytics.ts`의 `ANALYTICS_START`와 같은 값이어야 한다.** 한쪽만 옮기면
 * 「방침은 아직인데 적고 있다」나 그 반대가 되어 지면이 거짓말이 된다. 그래서 날짜를
 * 여기 적지 않고 그 상수를 그대로 읽어 찍는다.
 *
 * **지금 코드가 실제로 하는 일만 적는다.** 수집 항목을 늘리는 회차가 오면 그 커밋에서
 * 이 페이지도 같이 고친다. 방침과 동작이 다르면 방침 쪽이 위반이 된다.
 */
export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: `${SITE_NAME}이 무엇을 적고 무엇을 안 적는지.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export const revalidate = 86400;

/** 시행일. 집계 시작일과 같은 값이다 — 위 주석 참고 */
export const PRIVACY_EFFECTIVE = ANALYTICS_START;

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-gutter">
        <h2 className="sec-label">
          {String(n).padStart(2, "0")} {title}
        </h2>
      </div>
      <div className="sec-body">
        <div className="prose">{children}</div>
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <Shell>
      <header className="masthead">
        <div className="masthead-row">
          <span className="date-xl">개인정보 처리방침</span>
        </div>
        <p className="edition">
          <span>시행일 {PRIVACY_EFFECTIVE}</span>
        </p>
      </header>

      <Article n={1} title="받지 않는 것">
        <p>
          이 사이트는 <strong>회원가입, 로그인, 이메일 구독을 두지 않습니다.</strong> 이름,
          이메일 주소, 전화번호, 결제 정보를 입력받는 자리가 한 곳도 없습니다. 새 브리핑은
          공개 텔레그램 채널로 나가며, 채널은 독자가 직접 들어오고 나가는 곳이라 이 사이트가
          구독자 명단을 쥐지 않습니다.
        </p>
        <p>
          IP 주소, 브라우저 종류(User-Agent), 주소창의 검색어도 저장하지 않습니다.
          User-Agent는 자동 프로그램을 걸러내는 데만 잠깐 쓰고 바로 버립니다.
        </p>
      </Article>

      <Article n={2} title="적는 것">
        <p>
          얼마나 읽히는지 알기 위해 <strong>페이지를 열 때 네 가지</strong>를 적습니다.
        </p>
        <ul>
          <li>
            <strong>브라우저 표식</strong> — 브라우저가 스스로 만든 무작위 문자열입니다.
            이 사이트가 부여하는 것이 아니며 이름, 계정, 기기와 이어지지 않습니다.
            브라우저의 사이트 데이터를 지우면 사라지고, 다음 방문은 다른 사람으로 셉니다.
          </li>
          <li>
            <strong>본 페이지의 주소</strong> — <code>/brief/2026-09-18</code> 같은 경로만
            적고 물음표 뒤(쿼리스트링)는 떼어 냅니다.
          </li>
          <li>
            <strong>들어온 곳의 도메인</strong> — <code>t.me</code>, <code>google.com</code>처럼
            도메인만 적습니다. 그 사이트에서 어느 글을 보다 왔는지는 적지 않습니다.
          </li>
          <li>
            <strong>시각</strong>
          </li>
        </ul>
        <p>
          최근 {ONLINE_MIN}분 안에 움직인 표식의 수를 동시 접속자로 셉니다. 관리자 화면
          (<code>/admin</code>)에서 본 페이지는 아예 적지 않습니다.
        </p>
      </Article>

      <Article n={3} title="쓰는 곳">
        <p>
          위 기록은 <strong>얼마나 읽히는지와 어디에서 오는지</strong>를 보는 데만 씁니다.
          광고에 쓰지 않고, 사람을 골라 다른 화면을 보여 주는 데 쓰지 않으며,
          누구에게도 팔거나 넘기지 않습니다.
        </p>
      </Article>

      <Article n={4} title="얼마나 두는가">
        <p>
          {RETENTION_MONTHS}개월이 지난 기록은 지웁니다. 지우는 일은 사람이 챙기지 않고
          서비스가 스스로 합니다.
        </p>
      </Article>

      <Article n={5} title="맡겨 둔 곳">
        <p>
          사이트는 Vercel Inc.(미국)에서 돌고 기록은 Neon Inc.가 운영하는 데이터베이스
          (싱가포르)에 둡니다. 두 곳 모두 서비스를 돌리기 위한 것이며 이 사이트가 적는 항목은
          위 2항이 전부입니다.
        </p>
        <p>
          접속 속도를 재기 위해 Vercel Analytics와 Speed Insights를 함께 씁니다. 이들은
          쿠키를 쓰지 않고 개인을 알아보지 않습니다.
        </p>
      </Article>

      <Article n={6} title="쿠키">
        <p>
          독자에게는 쿠키를 심지 않습니다. 위 2항의 브라우저 표식은 쿠키가 아니라
          브라우저 안의 저장 공간에 있고 서버로 자동으로 실려 가지 않습니다.
          운영자가 관리자 화면에 로그인할 때만 쿠키 한 장을 씁니다.
        </p>
      </Article>

      <Article n={7} title="지우고 싶다면">
        <p>
          브라우저의 사이트 데이터를 지우면 표식이 사라집니다. 그 뒤로 이 사이트에는 그
          표식과 사람을 이어 줄 것이 아무것도 남지 않습니다. 이미 쌓인 기록을 따로 찾아
          지워 달라고 하기는 어렵습니다 — <strong>누구의 것인지 알아낼 방법이 없기 때문</strong>
          입니다. 대신 {RETENTION_MONTHS}개월이 지나면 전부 지워집니다.
        </p>
      </Article>

      <Article n={8} title="바뀔 때">
        <p>
          적는 항목이 늘거나 쓰는 곳이 바뀌면 이 페이지를 먼저 고치고 시행일을 새로
          적습니다. 지금 적힌 것은 오늘 코드가 실제로 하는 일과 같습니다.
        </p>
        {CONTACT_EMAIL ? (
          <p>
            문의: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        ) : null}
      </Article>
    </Shell>
  );
}
