# market-brief 작업 인계

한국 증시 시황 브리핑 웹. **개별 종목을 일절 다루지 않는다.**

## 절대 규칙

1. **종목 금지.** 종목명·종목코드·관련주/수혜주/대장주 같은 지목 표현·매수매도 추천·목표주가를
   DB·API·화면·메타태그 어디에도 넣지 않는다. 지금은 무료지만 유료 전환이 목표이고,
   유료로 종목을 언급하면 자본시장법상 유사투자자문업 신고 대상이 된다.
2. **종목을 담을 컬럼을 만들지 않는다.** `ticker`, `stock_name`, `symbol`, `isin` 같은 컬럼은
   어떤 테이블에도 없고, 추가해서도 안 된다.
3. **상위 저장소를 수정하지 않는다.** `../` 의 텔레그램 파이프라인(`send_news_telegram.py`,
   리포트 생성기, `pick_today.py`)은 이 프로젝트와 무관하다. 그쪽은 종목을 그대로 내보낸다.
   원본 리포트는 **읽기 전용**으로만 연다.
4. **시장 수치를 리포트 산문에서 파싱하지 않는다.** 그렇게 하면 틀린다
   (실제로 코스피 종가가 4.61로 나온 적 있음). `scripts/fetch_market.py`가 실제 시세에서 받는다.
5. **구조화 라벨은 레지스트리 표준 명칭만 쓴다.** 원문 문자열을 쓰면 "러셀2000" 같은
   종목명 충돌이 DB에 들어간다. `assertRegistryOnly`가 막는다.

## 구조

| 파일 | 역할 |
|---|---|
| `src/lib/guard.ts` | 종목 탐지. KRX 2,875종목 사전 + 6자리 코드 + 지목 표현 |
| `src/lib/extract.ts` | 원본 마크다운 → 페이로드. 파일·섹션·문단 3단 필터 |
| `src/lib/topics.ts` | 뉴스 분석 카드 추출 (섹션 1 Executive Summary, 섹션 5 핵심 테마) |
| `src/lib/headline.ts` | 헤드라인에서 지수 시세 접두부 제거 |
| `src/lib/registry.ts` | 지수·매크로·업종 표준 명칭 화이트리스트 |
| `src/lib/render.ts` | 렌더 직전 최종 방어 + 마크다운 변환 |
| `src/lib/persist.ts` | Neon 적재. 적재 직전 재검사 + 감사 로그 |
| `src/db/schema.ts` | Drizzle 스키마 8테이블 |
| `scripts/add-brief-topic.ts` | `brief_topic` 테이블 추가 SQL (1회성, 아무것도 지우지 않음) |
| `scripts/fetch_market.py` | 실제 시세 수집 → `data/market/{날짜}.json` |
| `scripts/ingest.ts` | 적재 CLI |
| `scripts/verify.ts` | 발행 결과 검증 (DB / 저장한 HTML) |
| `scripts/update_web.bat` | 일일 갱신 (수집 → 적재 → 검증). 작업 스케줄러가 부른다 |
| `scripts/install_update_web_task.bat` | 위 작업을 평일 16:10에 등록 |
| `scripts/backfill.py` | 과거 회차 일괄 적재 |

배치 파일은 ASCII로만 쓴다. cmd.exe가 한글 배치 텍스트를 깨뜨려 실행 자체가 실패한다
(기존 `../*.bat`들도 전부 영문인 이유다). 설명은 이 문서에 쓴다.

### 시세 데이터 소스 (2026-09-15 교체)

KRX(data.krx.co.kr)가 이 PC의 IP를 차단한다. 응답이 JSON이 아니라 ip-block-page HTML이라
`Expecting value: line 13 column 1`로 죽는다. pykrx도 같은 엔드포인트를 쓰므로 같이 실패한다.
그래서 pykrx 경로를 걷어내고 아래로 갈아탔다. KRX가 다시 열리면 수급·업종은 KRX가 더 정확하다.

| 항목 | 소스 | 과거 조회 |
|---|---|---|
| 지수 8종, 환율·유가·금·달러인덱스·VIX | FinanceDataReader | 가능 |
| 미 국채 10년·2년물 | FinanceDataReader `FRED:DGS10` / `DGS2` | 가능 |
| 국고채 3년물 | 네이버 시장지표 `IRR_GOVT03Y` | 가능 |
| 투자주체별 순매수 | 네이버 `investorDealTrendDay` (억원) | 가능 |
| 업종 등락률 | 네이버 `m.stock.naver.com/api/stocks/industry` | **불가** |

업종 API에는 날짜 파라미터가 없다. 언제 불러도 "지금" 값이다. 그래서 ① 요청일이 오늘이고
② 15:40을 넘겼고 ③ 그날 수급이 집계됐을 때만 그날 값으로 인정하고, 아니면 통째로 비운다.
장중에 돌리면 장중 등락률이 그날 종가로 둔갑하기 때문이다. 과거 회차에 업종이 비어 있는 건
이 이유이고, 정상이다.

네이버 업종(79개 GICS 분류)을 `registry.ts`의 `SECTORS` 코드로 묶을 때는 소속 종목 수로
가중평균한다. 시총 가중이 맞지만 API가 시총을 주지 않는다. 근사치다.
`SEMI_EQP`·`ROBOT`·`SOLAR`는 대응하는 네이버 분류가 없어 항상 빈다.
`SOX`(필라델피아 반도체)도 어느 소스에서도 안 받아진다.

### 차단 4중 방어

1. 파일 — `종목뉴스.md` 투입 거부 (`assertAllowedSource`)
2. 섹션 — 종목·관심·갭·투자아이디어·예측검증 섹션 통째 제외 (`SECTION_DENY`)
3. 문단 — 남은 문단도 한 건 걸리면 폐기 (`scan`)
4. 렌더 — DB가 오염돼도 화면 차단 (`renderMarkdown`)

`block`은 확실한 종목. `review`는 문맥상 아닐 수 있는 것(러셀2000의 러셀, 아스트라의 아스트).
발행 경로에서는 review도 차단한다. 버리지 않고 남기는 이유는 놓치는 쪽이 더 위험해서다.

## 명령

```bash
npm test                     # 회귀 테스트 25건
npm run typecheck
npm run guard -- <파일|폴더>  # 원본에 어떤 종목 표기가 있는지
npm run ingest -- --dry-run  # DB 없이 적재 결과 미리보기
npm run verify               # DB의 published 브리핑 검사

python scripts/fetch_market.py 2026-09-14   # 시세 수집 (장 마감 후)
python scripts/backfill.py --dry-run        # 과거 회차 대상 날짜만 확인
python scripts/backfill.py --publish --skip-existing
scripts\update_web.bat 2026-09-14           # 일일 갱신 전체를 손으로 한 번
```

DB를 쓰는 스크립트는 `.env.local`을 먼저 로드해야 한다.

```bash
npx tsx --env-file=.env.local scripts/ingest.ts --date 2026-09-08 --publish
```

## 일일 자동 실행

경로가 둘이다. **같은 일을 하므로 한쪽만 켜 둔다.**

| | GitHub Actions (권장) | 로컬 작업 스케줄러 |
|---|---|---|
| 정의 | `.github/workflows/daily-update.yml` | `MarketBrief-Update` → `scripts/update_web.bat` |
| 시각 | 평일 16:10 KST (`cron: 10 7 * * 1-5`, UTC) | 평일 16:10 |
| PC 전원 | 무관 | **켜져 있고 로그인돼 있어야 함** (`Logon Mode: Interactive only`) |
| 로그 | Actions 탭 + Step Summary | `data/logs/update_web.log` |

16:10인 이유는 장 마감 15:30 + 업종 스냅샷 인정 시각 15:40 이후이고,
상위 저장소의 `SimpleStock-Report-PM`(16:00)과 겹치지 않아서다. 더 앞으로 당기지 말 것.
Actions 스케줄은 수 분 지연될 수 있는데, 늦는 방향이라 15:40 제약과는 충돌하지 않는다.

**배포는 하지 않는다.** 페이지가 `revalidate = 300`이라 적재만 하면 5분 안에 사이트에 뜬다.

### Actions 쪽 구성

원고(`일일리포트.md`)는 이 저장소가 아니라 **`wlsdlstjdwls/stock-analysis`** 에 있다.
그래서 체크아웃을 두 번 하고 `REPORT_ROOT`로 위치를 알려준다.
`ingest.ts`가 `process.env.REPORT_ROOT ?? "../요약/뉴스"`를 보므로 스크립트는 수정하지 않았다.

필요한 repository secret (Settings → Secrets and variables → Actions):

| 이름 | 용도 | 값 출처 |
|---|---|---|
| `DATABASE_URL` | Neon 접속 | `.env.local`의 같은 키 |
| `REPORTS_SSH_KEY` | private인 `stock-analysis` 체크아웃 | read-only deploy key 개인키 (공개키는 stock-analysis → Settings → Deploy keys) |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | 실패 알림 (선택) | `../telegram_config.json` |

텔레그램 secret이 없으면 알림 step은 조용히 건너뛴다. GitHub 기본 실패 메일은 그대로 온다.

원고가 없는 날(공휴일·루틴 미실행)은 **실패가 아니다.** 적재 step들을 건너뛰고
Step Summary에 "원고 없음, 스킵"만 남기고 정상 종료한다. 실패 알림도 가지 않는다.

`python scripts/fetch_market.py`의 의존성은 `scripts/requirements.txt`에 있다. 로컬도 같은 파일을 쓴다.

### 중복 실행은 안전하다

`persist.ts`가 `daily_brief`를 `tradeDate` 기준 `onConflictDoUpdate`로 upsert하고,
하위 5개 테이블은 `briefId`로 지운 뒤 다시 넣는다. 같은 날짜를 몇 번 돌려도 결과가 같다.
그래도 두 경로를 동시에 켜 둘 이유는 없다. Actions 검증이 끝나면 로컬 태스크를 끈다.

```powershell
schtasks /Change /TN "MarketBrief-Update" /DISABLE   # 끄기
schtasks /Change /TN "MarketBrief-Update" /ENABLE    # 되돌리기
```

**삭제하지 않는다.** `update_web.bat`은 손으로 한 회차만 돌릴 때 계속 쓰고,
Actions가 막히면(네트워크 차단 등) 바로 되돌릴 수 있어야 한다.

## 배포

**푸시해도 자동 배포되지 않는다.** `vercel.json`의 `git.deploymentEnabled: false`.
저장소 연결은 살아 있고 배포만 수동이다. 검증 완료 후:

```bash
vercel deploy --prod
```

자동 배포로 되돌리려면 `vercel.json`에서 `git` 블록을 지운다.

## 현재 상태 (2026-09-15 기준)

- 배포됨: https://market-brief-xi.vercel.app (공개, 배포 보호 해제)
- 저장소: https://github.com/wlsdlstjdwls/market-brief (private)
- Neon: Vercel Marketplace 연동, 무료 플랜, sin1 리전. `DATABASE_URL` 자동 주입
- 스키마 적용 완료, 금칙어 5,765건 시드 완료
- 발행된 브리핑: 2026-06-22 ~ 2026-09-08 거래일 44회차 (backfill.py로 일괄 적재)
- 수급·금리 채워짐. 업종은 과거 회차에서 빈다(위 "시세 데이터 소스" 참고)
- 자동 실행: **GitHub Actions `daily-update.yml` 평일 16:10 KST** (PC 전원 무관)
- 로컬 작업 스케줄러 `MarketBrief-Update`는 **비활성화됨** (중복 실행 방지, 되돌리기는 `/ENABLE`)

### 배포 이력 (2026-09-15)

**`vercel deploy --prod` 1회로 밀려 있던 코드 변경분을 전부 올렸다.** 자동 배포는 계속 꺼져 있다
(`vercel.json`의 `git.deploymentEnabled: false`). 푸시는 여전히 배포가 아니다.

| 커밋 | 내용 | 상태 |
|---|---|---|
| `8ab8974` | 업종 섹션 제목에서 "(KRX 업종지수)" 표기 제거 + 면책 고지 문구 | 배포됨 |
| `6b32a06` | 이메일 구독 폼(`/api/subscribe` + 홈 하단 폼) + `docs/유료전환_법적요건.md` | 배포됨 |
| `c5aa0c2` | `/privacy` 개인정보 처리방침 + 푸터 링크 + 구독 폼 수집·이용 동의 체크박스 | 배포됨 |

**구독 폼은 2026-09-15 회차에 전부 삭제했다(아래 "이메일 구독 삭제" 절).** 위 표의 `6b32a06`·
`c5aa0c2`는 그 시점의 배포 기록으로만 남긴다. 이메일을 받는 창구는 더 이상 없다.

검증: `npm test` 23건 · `npm run typecheck` · `npm run build` 통과. 배포 후 라이브 확인 —
`/` 200(푸터 처리방침 링크·동의 체크박스 렌더), `/privacy` 200, 홈에서 "KRX 업종지수" 표기 0건.

### 개인정보 처리방침 (2026-09-15 추가 → 같은 날 전면 개정)

`src/app/privacy/page.tsx`. 개인정보 보호법 제30조에 따라 첫 화면 푸터에서 한 번에 닿는다.

- **지금 내용은 "수집하는 개인정보가 없다"이다.** 구독 폼을 삭제해 입력 양식·저장 테이블이
  둘 다 사라졌으므로, 수집 항목·보유 기간·파기 절차·동의 관련 조항을 전부 걷어냈다.
- **국외 이전 절은 남겼다.** Neon(싱가포르)·Vercel(미국)에서 운영하지만 이전되는 개인정보는
  없고, 호스팅 사업자가 남기는 접속 기록에는 운영자가 식별 목적으로 접근하지 않는다고 적었다.
- **지금 코드가 실제로 하는 일만 적는다.** 수집을 다시 시작하는 회차가 오면 그 커밋에서 이
  페이지도 같이 고친다. 방침과 동작이 다르면 방침 쪽이 위반이 된다.
- 유료 전환 시 추가로 필요한 것: 이용약관, 푸터 사업자 표시(상호·대표자·사업자등록번호·
  통신판매업 신고번호), 결제 항목 추가에 따른 처리방침 개정.

## 디자인 (2026-09-15 개편 — dailyaithread.com 벤치마킹)

**바꾼 것은 껍데기뿐이다.** 섹션 구성·수치·문구는 그대로고 타이포·여백·구분선만 갈았다.

| 토큰 | 값 | 출처 |
|---|---|---|
| 본문폭 | 720px | 벤치마크와 동일 |
| 본문 | 17px / 1.75, 시스템 산세리프 | 수치·메타용 |
| 제목·산문 | `Noto Serif KR` (`next/font/google`, `--font-serif`) | `.serif` / `.prose` |
| 아크센트 | `#a2201d` (다크 `#e0736c`) | 벤치마크 크림슨 — 2026-09-15에 교체됨(아래 브랜드 색) |
| 구분선 | 헤어라인 `.rule`, 단락 머리 `.rule-accent`(2px) | 카드 박스 폐기 |

- **카드 박스를 없앴다.** 지수·표·목록 전부 가로 헤어라인으로만 구분한다. 지수 그리드에
  `gap-px` + 배경색 트릭을 쓰면 항목 수가 열 배수와 안 맞을 때(8개/3열) 빈 칸이 회색
  블록으로 남는다 — 그래서 셀마다 `border-b`를 주는 방식으로 갔다.
- **섹션마다 `01`~`06` 아크센트 번호 + 세리프 제목.** 번호는 `blocks` 배열 순서에서 나오므로
  본문(국내 시장·해외 매크로)이 없는 회차에는 자동으로 줄어든다.
- **좌측 스티키 목차** `src/components/SectionRail.tsx` — 본문폭 바깥(-230px)에 절대배치,
  `xl`(1280px) 미만에서는 숨긴다. IntersectionObserver로 현재 섹션을 표시한다.
  감춰도 각 섹션에 `h2`가 있어 구조·접근성 손해가 없다.
- **헤더**가 sticky로 바뀌고 `오늘 / 지난 브리핑 / 면책 / 처리방침` 네비가 생겼다.
  우측 "종목 추천 없음" 배지는 2026-09-15 회차에 삭제했다(위 "뉴스 분석" 절).
- **리드 문장**(`lead()` in `BriefView.tsx`)은 220자에서 무조건 자르던 것을 문장 경계에서
  자르게 고쳤다. 마크다운 강조 기호도 걷어낸다.
- `renderMarkdown`에 **잔여 `**…**` 복구 후처리**를 넣었다. CommonMark는 닫는 `**` 앞이
  구두점이고 뒤가 글자면 강조로 안 본다(`되돌림(약세 전환)**으로`). 한국어 원문에 흔해서
  화면에 별표가 그대로 남았다. 이스케이프 뒤 단계라 HTML 주입 위험은 없다.

**가져오지 않은 것**(사용자 지시): 이메일 구독 폼, "후보 95건에서 고른 10건" 같은 선정 근거
표기, 읽는 시간, 누적 통계, 소스별 점유율 차트.

검증: `npm test` 18건 · `npm run typecheck` · `npm run build` 통과. 로컬 `/` `/archive`
`/privacy` `/disclaimer` 200. **아직 배포 안 했다** (`vercel deploy --prod` 필요).

## 뉴스 분석 (2026-09-15 추가)

**이 사이트의 본문은 이제 수치가 아니라 뉴스다.** 사용자 지시 — "종목추천·시황분석보다
그냥 뉴스 분석한 걸 보여 달라". 지수·금리·수급·업종 블록은 그대로 두되 뉴스 아래로 내렸다.
헤더 우측 "종목 추천 없음" 배지는 뺐다(`.topbar-note` 규칙도 같이 삭제).

원본 `일일리포트.md`의 두 블록에서 카드를 뽑는다. `src/lib/topics.ts`.

| 블록 | 화면 이름 | 싣는 줄 |
|---|---|---|
| 섹션 1. Executive Summary | 뉴스 분석 | 한줄 요약 → "무슨 일인가", 왜 중요한가, 영향도 미터 |
| 섹션 5. 오늘의 핵심 테마 | 핵심 테마 | 발생 원인, 시장 관심도, 지속 가능성, 논리와 리스크 |
| 섹션 4. 섹터별 투자 포인트 | 업종 관점 | 논리, 관련 뉴스, 체크 포인트 (제목 앞에 강세/약세) |

**업종 카드를 나중에 더한 이유**는 뉴스 카드가 회차당 2건까지 줄어서다. Executive Summary는
제목에 종목명을 박는 일이 잦아 통째로 버려지는 비율이 높은데, 섹터 항목은 업종 단위라
살아남는 비율이 훨씬 높다. 회차당 평균 10.3장(뉴스 71, 테마 91, 업종 291 / 44회차).

섹터 항목은 회차에 따라 `### 1. 반도체` 헤딩일 때도 있고 `**1. 반도체**` 굵은 줄일 때도 있다.
`cut: "bold"` 스펙이 둘 다 받는다. "대표 종목" 줄은 어느 쪽이든 읽지 않는다.

**수혜 · 피해 · 대장주/후발주/관련주 줄은 파싱조차 하지 않는다.** 그 줄의 존재 이유가
개별 종목 지목이라 걸러 쓸 여지가 없다. 나머지 줄은 이렇게 판단한다.

- 제목이나 첫 줄(한줄 요약·발생 원인)에 종목이 하나라도 있으면 **카드를 통째로 버린다.**
- 뒤쪽 줄만 걸리면 **그 줄만 비우고 카드는 남긴다.** ("왜 중요한가"가 자주 여기 해당한다)
- `review` 등급도 `block`과 똑같이 버린다. 문단 필터와 같은 기준이다.

버려진 카드의
사유는 대부분 진짜 종목명(SK하이닉스·삼성전자)이고, `배럴`(배럴당)·`대상`(~를 대상으로)·
`레이`처럼 보통명사와 겹쳐 오탐인 것도 섞여 있다. **오탐 쪽은 손대지 않았다.** 지금 손대면
차단 기준을 느슨하게 만드는 일이라, 필요해지면 guard에 단위·문맥 규칙을 따로 넣는다.

### 한글 표기 종목 구멍 (2026-09-15)

사전(`data/ticker_names.json`)은 KRX 표기를 그대로 담아서 `NAVER`처럼 영문으로만 올라간
종목이 92개 있다. 한글로 "네이버"라고 쓰면 그대로 통과했다 — 실제로 2026-07-27 회차의
카드 제목이 그렇게 새어 나갔다. `guard.ts`의 `HANGUL_ALIASES`로 막았다.
**여기 없는 표기가 또 발견되면 이 목록에 추가한다.** 회귀 테스트가 붙어 있다.

### 화면에서 뺀 것 (2026-09-15 2차)

사용자 지시로 **수치 블록을 화면에서 전부 내렸다.** 지수, 금리와 환율, 투자주체별 수급,
업종 강약 네 블록이다. 남은 것은 뉴스 분석, 핵심 테마, 국내 시장, 해외 시장, 지난 브리핑.

- **수집과 적재는 그대로 돈다.** `fetch_market.py`도, `market_index` 같은 테이블도 살아 있다.
  되살리려면 `BriefView.tsx`에 블록을 다시 넣고 `queries.ts`의 `getBrief`에 조회를 되돌리면 된다.
- **헤드라인이 바뀌었다.** "코스피 6,954.52 (-0.58%)" → 그날 첫 뉴스 카드 제목.
  제목 앞에 지수 시세가 붙어 있으면 `src/lib/headline.ts`가 떼어낸다
  ("코스피 +4.61%, 코스닥 +1.07% — 외국인 쌍끌이 매수" → "외국인 쌍끌이 매수").
- **마스트헤드 리드 문단과 "장 마감 기준" 표기를 뺐다.** 날짜, 요일, 헤드라인만 남는다.
- **산문에서 걷어내는 줄**(`stripNoise` in `markdown.ts`): `시황.md` 같은 파일 상호참조,
  원본 면책 고지 인용문, 그리고 `- **코스피**: 6,954.52(...)` 처럼 시세만 적힌 목록 줄.
- **가운뎃점(`·`)은 쓰지 않는다.** `dedot`이 적재 단계에서 쉼표로 바꾸므로 DB에도 남지 않는다.
  화면 문구, 면책 고지, 처리방침에서도 전부 걷어냈다.
- **버튼 라벨에 화살표를 쓰지 않는다**(사용자 지시, 앞으로도). "전체 보기 →" → "전체 보기".
- `body`에 `word-break: keep-all`을 넣었다. 한국어 어절이 줄 끝에서 갈리던 문제
  ("국제 정/세")가 이것 때문이었다.
- 영향도는 **제목 위 한 줄에 알약 모양 배지**로 둔다(`시장 영향 큼`). 제목 옆에 붙이면
  제목의 일부로 읽히고, 등급만 적으면 무엇의 크기인지 모른다 — 둘 다 지적받았다.
  **바탕을 채우는 건 `매우 큼` 하나뿐이고**(`#b3261e` + 흰 글씨) 나머지는 테두리만 쓴다.
  큼은 붉은 테두리와 붉은 글씨, 보통과 작음은 회색 (`.topic-impact--max/high/mid/low`).
  모래색이나 주황을 섞으면 크림 배경에서 탁해지고, 옅은 빨강 바탕에 빨강 글씨를 얹으면
  붉은 기가 겹쳐 지저분해진다 — 둘 다 해 보고 물린 조합이다.
- 카드 항목 이름(무슨 일인가, 발생 원인 …)은 본문과 **같은 줄**에 둔다. 줄을 따로 잡으면
  작은 제목이 카드마다 네 개씩 쌓여 본문이 안 읽힌다는 지적이 있었다.
- 사이트 이름: `시황 브리핑` → `뉴스 브리핑`(메타 타이틀은 `데일리 뉴스 브리핑`).
- **푸터는 이름과 링크를 한 줄에 둔다.** 130px 거터(`sec-gutter`)에 넣으면 링크가 세로로
  쌓인다 — `.footer-top` 가로 flex로 바꿨다.
- **`/disclaimer`, `/privacy` 두 페이지를 삭제했다**(사용자 지시 "일단 없애줘").
  처리방침은 수집하는 개인정보가 0이라 개인정보 보호법 제30조 대상이 아니고, 면책 고지는
  법적 의무가 아니다. 취지는 푸터 두 줄에 남아 있다. **구독이나 결제를 붙이는 순간 처리방침은
  다시 필수**이고, 유료 전환 시에는 면책 고지와 이용약관도 같이 세워야 한다
  (`docs/유료전환_법적요건.md`). 지운 파일은 git 이력에 있다.

### 브랜드 색 (2026-09-15 확정)

| 역할 | 값 | 쓰이는 곳 |
|---|---|---|
| 배경 | `#fbfaf7` 크림 | 페이지 바탕 |
| 본문 | `#14161a` 잉크 | 제목, 본문 |
| **브랜드** | **`#2563eb` 블루** | 섹션 번호, 카드 항목 이름, 링크 hover, 목차 현재 위치 |
| 강조 | `#a32d22` 레드 | 영향도 배지 (`--up`) |

**파랑을 고른 이유**는 영향도 배지가 이미 빨강이어서다. 브랜드도 빨강으로 가면 "강조"와
"구조"가 같은 색이 돼 배지가 눈에 안 띈다. 딥그린 `#1b4d3e` → 딥네이비 `#123c7a` → 지금 값 순서로 두 번 올렸다.
앞의 둘은 크림 배경에서 본문 잉크색과 구별이 안 된다는 지적을 받았다. 채도와 명도를
같이 올려야 파랑으로 읽힌다. 바꿀 때는 `globals.css`의 `--accent` 한 줄만 고치면 된다.

### 적재·검증

`brief_topic` 테이블(`kind` · `rank` · `title` · `impact` · `lines` jsonb). 종목 컬럼은 없다.
`persist.ts`가 적재 직전 카드 본문까지 `assertObjectClean`에 넣고, `verify.ts`가 DB의
카드 본문을 다시 스캔한다. 화면에서는 `renderText`가 한 번 더 막는다.

**테이블은 `drizzle-kit push`가 아니라 `scripts/add-brief-topic.ts`로 만들었다.** 원격에
스키마에서 빠진 `subscriber`·`subscription`이 남아 있어 push가 그 둘을 DROP하려 들기 때문이다.
같은 이유로 앞으로도 이 저장소에서 `npm run db:push`를 그냥 돌리지 말 것.

과거 회차 반영은 `python scripts/backfill.py --publish --skip-existing` 한 번이면 된다
(44회차 재적재, 실패 0). 새 회차는 기존 16:10 자동 실행이 그대로 처리한다.

## 막힌 것

**원본 리포트가 2026-09-08에서 끊겨 있다.** `../요약/뉴스/`에 09-09 이후 폴더가 없다.
상위 저장소의 아침 뉴스 파이프라인 쪽 문제이고 여기서 고칠 일이 아니다(상위 저장소 수정 금지).
그게 안 돌면 16:10 자동 실행은 매일 "원본 없음"으로 exit 2가 난다.

**업종 과거값을 받을 방법이 없다.** 네이버 업종 API에 날짜가 없고 KRX는 IP가 막혔다.
KRX가 풀리거나 다른 소스를 찾기 전까지 과거 회차의 업종은 비워 둔다. 추정값 금지.

**`SOX`(필라델피아 반도체)** 가 FinanceDataReader·야후 어디서도 안 받아진다.

## 이메일 구독 삭제 (2026-09-15)

**메일 수집·발송은 이 프로젝트의 범위가 아니다.** 사용자 지시로 구독 기능을 전부 걷어냈다.

| 삭제한 것 | |
|---|---|
| `src/components/SubscribeForm.tsx` | 홈 하단 신청 폼 |
| `src/app/api/subscribe/route.ts` | `POST /api/subscribe` |
| `src/lib/subscribe.ts` | 이메일 정규화·검증·토큰·적재 |
| `tests/subscribe.test.ts` | 관련 회귀 5건 |
| `src/db/schema.ts` 의 `subscriber`·`subscription` | 유료 전환 대비 스텁 테이블 정의 |
| `src/app/page.tsx` 의 `<SubscribeForm />` | 홈 렌더 |

- **원격 DB의 `subscriber`·`subscription` 테이블은 아직 남아 있다.** 스키마 정의만 지웠다.
  실제 DROP은 `npm run db:push` 가 필요하고 되돌릴 수 없어 하지 않았다. 그때까지 쌓인
  `pending` 행이 있으면 같이 지워야 처리방침("수집하지 않음")과 상태가 일치한다.
- 다시 붙일 일이 생기면 폼·라우트·처리방침을 **한 커밋에서** 같이 만든다. 정보통신망법
  제50조 때문에 더블 옵트인·수신거부가 없는 발송은 그 자체로 위반이다.

## 업종 과거값 재탐색 결과 (2026-09-15)

| 소스 | 결과 |
|---|---|
| `data.krx.co.kr` (기존 경로·pykrx) | **여전히 차단.** 응답이 `ip-block-page` HTML |
| `openapi.krx.co.kr` (OPEN API 포털) | HTTP 200 — **차단 아님** |
| `data-dbg.krx.co.kr` (OPEN API 엔드포인트) | 키 없이 401 Unauthorized — **도달함**. 차단이면 401이 아니라 차단 HTML이 온다 |
| FinanceDataReader `KRX:1003` | 실패 (내부적으로 `data.krx.co.kr` 호출) |
| FinanceDataReader `StockListing("KRX-INDEX")` | `NotImplementedError` |
| 네이버 업종 API | 살아 있음. 여전히 날짜 파라미터 없음 → 과거 조회 불가 |

**가장 유망한 경로는 KRX OPEN API다.** 웹 스크래핑 호스트만 막혔고 공식 API 호스트는 열려 있다.
무료 회원가입 후 `AUTH_KEY`를 발급받아 헤더에 실으면 `basDd`(기준일자) 파라미터로 과거 조회가 된다.
지수 일별 시세 서비스에 KOSPI·KOSDAQ 업종지수가 포함되는지는 **키를 받아 실제로 찍어봐야 확정된다**
(서비스 목록 페이지가 로그인 뒤에 있다). 확인 전까지 추정으로 코드를 바꾸지 않는다.

착수 순서: ① 포털 가입·키 발급 → ② 업종지수 응답 확인 → ③ `SECTORS` 매핑 재작성
(네이버 79개 GICS 가중평균 근사 → KRX 업종지수 실측으로 교체) → ④ `backfill.py` 재실행으로 과거 회차 채움.
**③까지는 코드 변경이 없다.** 지금은 네이버 근사값을 유지하고 과거 회차 업종은 계속 비워 둔다.

## 다음 할 일

1. 디자인 개편분 배포 (`vercel deploy --prod`) — 로컬 검증까지만 끝났다
2. KRX OPEN API 키 발급 → 업종지수 과거 조회 가능 여부 확정 (위 절차 ①②)
3. 유료 전환 준비는 `docs/유료전환_법적요건.md` 참고 — 사업자등록 → 구매안전서비스 확인증
   → 통신판매업 신고 → 처리방침·약관 게시 → 푸터 표시 항목 추가 → PG 연동 → 해지·환불 화면 순서.
   종목을 안 넣는 한 유사투자자문업 신고는 해당 없음

## 하지 말 것

- 상위 저장소 파일 수정
- 종목 관련 컬럼·필드 추가
- 리포트 산문에서 숫자 파싱
- 수집 실패한 수치를 추정값으로 채우기
- 푸시로 배포 트리거하기

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
