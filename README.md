# 시황 브리핑 (market-brief)

그날 시장을 움직인 뉴스와 테마를 정리하는 웹 브리핑. 개별 종목은 다루지 않는다.
**개별 종목은 다루지 않는다.**

기존 텔레그램 파이프라인(`send_news_telegram.py`, 리포트 생성기)은 이 프로젝트와 무관하며
아무것도 바꾸지 않는다. 원본 리포트는 **읽기 전용**으로만 접근한다.

## 왜 종목을 빼는가

유료 전환 시 자본시장법상 유사투자자문업 신고 의무를 피하기 위한 전제다.
"가급적 안 쓴다"가 아니라 시스템이 강제한다. 4중 방어:

| 단계 | 위치 | 하는 일 |
|---|---|---|
| 1. 파일 | `extract.ts` `assertAllowedSource` | `종목뉴스.md` 투입 자체를 거부 |
| 2. 섹션 | `extract.ts` `SECTION_DENY` | 종목·관심·갭·투자아이디어·예측검증 섹션 통째 제외 |
| 3. 문단 | `guard.ts` `scan` | 남은 문단도 한 건이라도 걸리면 폐기 |
| 4. 렌더 | `render.ts` | DB가 오염돼도 화면에 안 나감 |

구조화 수치(지수명·지표명·업종명)는 원문 문자열을 쓰지 않는다.
`registry.ts`의 표준 명칭으로만 저장하므로, "러셀2000"처럼 종목명과 겹치는 표기가
DB에 들어갈 수 없다. `assertRegistryOnly`가 소속 여부를 검증한다.

금칙어 사전은 `data/ticker_names.json` (KRX 2,875종목) + 지목 표현 15개.

### block과 review

- **block** — 확실한 종목 언급. 무조건 차단.
- **review** — 사전에는 있으나 문맥상 종목이 아닐 수 있음. 예: "러셀2000"의 러셀,
  "아스트라"의 아스트. 조용히 통과시키지 않고 사람이 확인한다.
  발행 경로에서는 review도 차단한다.

## 수치의 출처

리포트 산문에서 숫자를 긁지 않는다. 그렇게 하면 틀린다.
`scripts/fetch_market.py`가 FinanceDataReader·pykrx로 실제 시세를 받아
`data/market/{날짜}.json`에 저장하고, 적재 파이프라인은 그 파일만 읽는다.
수집 실패한 항목은 추정값을 쓰지 않고 비워 둔다.

현재 상태:

| 항목 | 출처 | 상태 |
|---|---|---|
| 코스피·코스닥 | FinanceDataReader | 정상 |
| S&P500·나스닥·다우·러셀 | FinanceDataReader | 정상 |
| 환율·유가·금 | FinanceDataReader | 정상 |
| 투자주체별 수급 | 네이버 investorDealTrendDay | 정상 |
| 업종 등락률 | 네이버 업종 API | 당일만 가능 (과거 조회 불가) |

KRX(data.krx.co.kr)는 이 PC의 IP를 차단한다. 자세한 사정은 `CLAUDE.md` 참고.
수집한 수치는 DB에 쌓이지만 지금은 화면에 싣지 않는다.

## 준비

```bash
npm install
cp .env.example .env.local     # DATABASE_URL 채우기
npm run db:push                # Neon에 스키마 생성
npm run seed:terms             # 금칙어 사전 시드
```

Neon 연결 문자열은 Neon 콘솔 > Connection Details의 pooled URL.

## 매일 실행

```bash
python scripts/fetch_market.py 2026-09-08   # 시세 수집
npm run ingest -- --date 2026-09-08 --publish
```

`scripts/update_web.bat`가 이 두 단계를 묶어 실행한다.
Windows 작업 스케줄러에 장마감 이후(예: 16:10) 등록하면 된다.

**Vercel Cron은 쓸 수 없다.** 원본 리포트가 로컬 디스크에 있어 Vercel에서 읽을 수 없다.
적재는 로컬에서 실행해 Neon에 쓰고, Vercel은 Neon만 읽는다.

## 점검

```bash
npm test                                  # 차단 필터 회귀 테스트 18건
npm run typecheck
npm run guard -- ../요약/뉴스/2026/09      # 원본에 어떤 종목 표기가 있는지 확인
npm run ingest -- --dry-run               # DB 없이 적재 결과 미리보기
npm run verify                            # DB의 published 브리핑 검사
npm run verify -- page.html               # 저장한 페이지 본문 검사
```

`--dry-run`은 무엇이 제외됐는지 사유별로 출력한다.

## 배포

**푸시해도 자동 배포되지 않는다.** `vercel.json`의 `git.deploymentEnabled: false`가
GitHub 이벤트로 생기는 배포를 막는다. 저장소는 연결돼 있지만 배포는 수동이다.

```bash
npm test && npm run typecheck    # 먼저 통과시킬 것
vercel deploy --prod
```

미리보기만 올리려면 `--prod`를 뺀다.

다시 자동 배포로 돌리려면 `vercel.json`에서 `git` 블록을 지운다.

### 최초 설정 (이미 완료)

1. Vercel 프로젝트 생성 및 GitHub 저장소 연결
2. Neon을 Vercel Marketplace로 프로비저닝 (`DATABASE_URL` 자동 주입)
3. `npm run db:push`, `npm run seed:terms`

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 최신 브리핑 + 지난 브리핑 6건 |
| `/archive` | 월별 전체 목록 |
| `/brief/{YYYY-MM-DD}` | 개별 회차 |

본문은 뉴스 분석, 핵심 테마, 업종 관점 카드와 국내외 시장 해설이다. 지수, 금리, 수급,
업종 등락률 같은 수치 블록은 2026-09-15에 화면에서 내렸다(수집과 적재는 계속 돈다).
면책 문구는 모든 페이지 푸터에 고정 노출된다. `/disclaimer`와 `/privacy` 페이지는 삭제했다 —
수집하는 개인정보가 없어서다. 구독이나 결제를 붙이면 처리방침은 다시 필수다.

## 유료 전환 시

`daily_brief.tier` 만 자리를 잡아 뒀다. `subscriber`, `subscription` 스텁은 2026-09-15에 삭제했다(메일 수집 안 함).
결제·로그인 코드는 없다. 전환 전에 필요한 것:

- 사업자등록 (개시 후 20일 내, 홈택스, 간이과세자로 시작)
- 통신판매업 신고 (정부24)
- 개인정보처리방침 (현재: 수집 항목 없음. 수집을 시작하면 같은 커밋에서 개정)

종목을 넣지 않는 한 유사투자자문업 신고는 해당 없다.
