# 시황 브리핑 — 디자인 스펙 (고시형 개편안)

구현 대상 파일: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/BriefView.tsx`,
`src/components/SectionRail.tsx`.
섹션 구성·수치·문구는 기존과 동일하다. 바꾸는 것은 토큰·타이포·행 구조뿐이다.

## 컨셉

관공서 통계 고시표. 카드·박스·둥근 모서리·배경 채움 없음.
좌측 라벨 거터 + 점선 리더 데이터 행, 헤어라인만으로 구분.
가장 큰 요소는 헤드라인이 아니라 **날짜**다.

## 색 토큰

`globals.css` `:root` 교체값.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#FBFAF7` | 종이 바탕 |
| `--fg` | `#14161A` | 본문 잉크 |
| `--muted` | `#6E7276` | 부제·리드 |
| `--faint` | `#8C9095` | 메타 |
| `--fainter` | `#A4A8AC` | 단위·비활성 |
| `--line` | `#DCD9D2` | 섹션 구분 헤어라인 |
| `--line-dot` | `#D6D3CC` | 데이터 행 점선 |
| `--rule-strong` | `#14161A` | 첫 섹션·푸터 위 실선 |
| `--accent` | `#1B4D3E` | 섹션 번호·라벨, 활성 목차 |
| `--up` | `#A32D22` | 상승 (한국 관행: 적) |
| `--down` | `#1B5E9E` | 하락 (청) |

아크센트는 섹션 라벨과 활성 목차에만 쓴다. 수치에는 쓰지 않는다 — `--up`/`--down`과 역할이 겹친다.

## 타이포

한 가족만 쓴다: **Noto Sans KR** 300/400/500/600/700. 세리프·모노 없음.
`body`에 `font-variant-numeric: tabular-nums` 전역 적용 (수치 자리 흔들림 방지).

| 역할 | 크기 | 굵기 | 자간 |
|---|---|---|---|
| 날짜 (마스트헤드) | `clamp(40px,7vw,68px)` | 300 | `-0.045em` |
| 헤드라인 | `clamp(21px,2.8vw,29px)` / 1.42 | 600 | `-0.03em` |
| 리드 | 15.5px / 1.9 | 400 | — |
| 섹션 라벨 (`01 지수`) | 12px | 600 | `0.14em` |
| 섹션 보조 (출처 등) | 11.5px | 400 | `0.06em` |
| 데이터 행 항목명 | 14.5px | 400 | — |
| 데이터 행 수치 | 15.5px | 500 | `-0.01em` |
| 수급 수치 | 17px | 500 | `-0.01em` |
| 등락률 | 13.5px | 400 | — |
| 푸터·면책 | 12.5px / 1.9 | 400 | — |

헤드라인 `max-width: 30ch`, 리드 `60ch`, 면책 `66ch`.

## 레이아웃

- 셸 폭 `max-width: 1120px`, 좌우 패딩 `clamp(20px,4vw,40px)`.
- `display:flex; flex-wrap:wrap` — 목차 `flex:0 1 170px` (min 150px), 본문 `flex:1 1 560px`.
  740px 미만에서 목차가 본문 위로 접힌다. 미디어쿼리 없음.
- 섹션 = 같은 flex 패턴: 라벨 거터 `flex:0 0 130px`, 데이터 `flex:1 1 380px`, 열 간격 28px.
- 섹션 상단 구분: 첫 섹션과 푸터는 `1px solid #14161A`, 나머지는 `1px solid #DCD9D2`.
- 섹션 상하 패딩 26px. 마스트헤드 상단 `clamp(40px,6vw,72px)`.

## 데이터 행 (핵심 패턴)

```
[항목명] ····················· [값] [단위] [등락률]
```

- `display:flex; align-items:baseline; gap:8px`
- 가운데 `flex:1; min-width:12px` 스페이서 — 점선은 행의 `border-bottom:1px dotted var(--line-dot)`
- 등락률 열 `width:72px; text-align:right`
- 단위는 12px `--fainter`, 값 뒤 공백 한 칸
- 마지막 행은 `border-bottom` 없음
- 미수집 항목은 행을 지우지 않고 값 자리에 13px `--fainter`로 `미수집`

## 상단 바

`position:sticky; top:0`, 배경 `rgba(251,250,247,0.94)` + `backdrop-filter:blur(8px)`,
하단 `1px solid #14161A`. 좌측 워드마크 14px/700, 네비 12.5px, 우측 `종목 추천 없음` 11.5px
(기존 `.pill` 알약 테두리 폐기 — 텍스트만).

## 좌측 목차

`SectionRail.tsx` 로직 유지(IntersectionObserver, `rootMargin: -80px 0px -65% 0px`).
시각만 교체: 좌측 `1px` 세로선 + 좌패딩 12px, 13px 글자.

| 상태 | 글자 | 세로선 | 굵기 |
|---|---|---|---|
| 기본 | `#6E7276` | `#DCD9D2` | 400 |
| 활성 | `#1B4D3E` | `#1B4D3E` | 600 |

번호(`01`)는 `#A4A8AC`, 항목명과 `gap:10px`.

## 폐기하는 기존 요소

- `.serif` / `.prose` 세리프 (`Noto Serif KR`) — 전면 제거
- 크림슨 `#a2201d` 아크센트, `--accent-bg` 연분홍
- `.rule-accent` 2px 아크센트 실선
- `.pill` 알약 테두리
- 다크 모드 `prefers-color-scheme` 블록 (이 안은 라이트 단일. 다크가 필요하면 별도 정의)
- 업종 강약의 막대 그래프 — 수치 정렬만으로 대체

## 남은 작업

- 헤드라인·리드·지난 브리핑 제목은 Neon DB 값. 시안의 문구는 임시다.
- 다크 모드 토큰 미정의.
- `/archive`, `/disclaimer`, `/privacy` 는 같은 거터 패턴을 그대로 쓰면 된다 (별도 시안 없음).
