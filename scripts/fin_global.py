"""해외 관심종목 재무 추세 수집기 (종목 브리핑, 2026-11-23 사용자 지시).

국내 수집기(stock-analysis `fin_trend.py`)와 **같은 모양의 data.json**을 만든다. 그래서 적재
(`ingest-global.ts`)와 화면이 국내와 같은 길을 탄다. 다른 점은 출처와 통화뿐이다.

    python scripts/fin_global.py --fin-trend reports/fin_trend.py --out out/global

데이터 출처 (키 없음, 웹검색 숫자 안 씀)
  - SEC EDGAR companyfacts: 분기, 연간 재무 (us-gaap, 외국 기업은 ifrs-full 연간만)
  - SEC EDGAR submissions: 공시 목록 (8-K 실적 발표, 10-Q, 10-K …)
  - Yahoo Finance chart: 주봉 (종목, 나스닥 종합, S&P 500), 환율

계산(PER, 52주 위치, 지수 대비, 신호)은 `fin_trend.py`의 함수를 그대로 불러 쓴다. 원본 수집기는
**고치지 않는다**(CLAUDE.md 절대 규칙 3, `fin_daily.py`와 같은 방식).

**금액 단위는 달러다.** 외국 기업(대만 달러 등)은 수집 시점 환율로 달러로 바꾼다(근사, `warn`에 적는다).
ADR은 `adr`(ADR 1주가 원주 몇 주인가)로 주식 수를 ADR 기준으로 바꿔 PER, 시총을 맞춘다.

분기 키는 **달력 분기**로 맞춘다. 회계연도가 달력과 다른 회사(엔비디아 1월 결산, 애플 9월 결산 …)도
분기 말에서 45일을 뺀 날이 속한 달력 분기로 적는다. 국내 종목과 같은 칸에서 비교하려는 것이다.
"""
import argparse
import datetime as dt
import importlib.util
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

KST = dt.timezone(dt.timedelta(hours=9))
# SEC는 자동 요청의 User-Agent에 연락처(메일)를 요구한다. 집 PC에서는 없어도 받아 주지만 GitHub 러너
# (클라우드 IP)에서는 403으로 막는다(2026-11-23 실측). 연락처는 코드에 박지 않고 secret `SEC_USER_AGENT`로 받는다
# (예: "thebriefing.kr market-brief 연락용주소@도메인").
UA = {"User-Agent": os.environ.get("SEC_USER_AGENT", "").strip() or "thebriefing.kr market-brief",
      "Accept-Encoding": "identity"}
HERE = os.path.dirname(os.path.abspath(__file__))

REV = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
       "RevenueFromContractWithCustomerIncludingAssessedTax", "Revenue"]
OP = ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"]
NI = ["NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent", "ProfitLoss"]
ASSETS = ["Assets"]
LIAB = ["Liabilities"]
EQUITY = ["StockholdersEquity", "EquityAttributableToOwnersOfParent",
          "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"]
LIAB_EQ = ["LiabilitiesAndStockholdersEquity", "EquityAndLiabilities"]
OCF = ["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"]
CAPEX = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets",
         "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"]
DPS = ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"]
FORMS = {"10-Q", "10-K", "20-F", "40-F", "10-Q/A", "10-K/A", "20-F/A"}

# 8-K 항목 번호 → 화면 제목. 9.01(첨부 서류)만 있는 8-K는 싣지 않는다
ITEMS = {
    "1.01": "중요 계약 체결", "1.02": "계약 종료", "2.01": "인수, 매각 완료", "2.02": "실적 발표",
    "2.03": "채무 발생", "2.05": "구조조정", "2.06": "자산 손상", "3.02": "증권 발행",
    "5.02": "임원 변동", "5.03": "정관 변경", "5.07": "주주총회 결과", "7.01": "공정공시",
    "8.01": "기타 주요사항",
}


def load_fin_trend(path):
    spec = importlib.util.spec_from_file_location("fin_trend", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


# ── 시세 ──
def chart(symbol, rng="6y"):
    """주봉 [(날짜, 고가, 저가, 종가)]와 메타(거래소, 통화, 마지막 체결 시각)."""
    d = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(symbol)}"
            f"?interval=1wk&range={rng}&events=split")
    r = d["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    out = []
    for t, h, l, c in zip(r.get("timestamp") or [], q["high"], q["low"], q["close"]):
        if c is None:
            continue
        day = dt.datetime.fromtimestamp(t, dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
        out.append((day, h if h is not None else c, l if l is not None else c, c))
    meta = dict(r["meta"], events=r.get("events") or {})
    return out[-270:], meta


def fx_to_usd(cur):
    if cur in (None, "USD"):
        return 1.0
    px, _ = chart(f"{cur}USD=X", "1mo")
    return px[-1][3]


MARKET = {"NMS": "나스닥", "NGM": "나스닥", "NCM": "나스닥", "NAS": "나스닥", "NYQ": "NYSE", "NYS": "NYSE",
          "ASE": "NYSE", "PCX": "NYSE"}
INDEX = {"나스닥": "^IXIC", "NYSE": "^GSPC"}


# ── 재무 ──
def qkey(end):
    """분기 말 → 달력 분기 키. 45일을 빼 회계 분기를 가장 많이 겹치는 달력 분기에 놓는다."""
    m = end - dt.timedelta(days=45)
    return f"{m.year}Q{(m.month - 1) // 3 + 1}"


def facts_of(cf, names):
    """개념 이름 후보 → {(start, end): 값}. 회사가 개념을 바꿔 쓴 경우(Revenues → RevenueFrom…)를
    최근 것을 먼저 두고 합친다. 같은 기간은 가장 늦게 제출된 값(정정 반영)을 쓴다."""
    found = []
    for tax in ("us-gaap", "ifrs-full"):
        for n in names:
            node = cf.get("facts", {}).get(tax, {}).get(n)
            if not node:
                continue
            for unit, xs in node["units"].items():
                rows = [x for x in xs if x.get("form") in FORMS]
                if rows:
                    found.append((max(x["end"] for x in rows), unit, rows))
    found.sort(key=lambda f: f[0], reverse=True)
    out, unit0 = {}, None
    for _last, unit, rows in found:
        if unit0 is None:
            unit0 = unit
        if unit != unit0:  # 통화가 다른 개념은 섞지 않는다
            continue
        best = {}
        for x in rows:
            k = (x.get("start"), x["end"])
            if k not in best or x.get("filed", "") > best[k].get("filed", ""):
                best[k] = x
        for k, x in best.items():
            out.setdefault(k, x["val"])
    return out, unit0


def days(k):
    s, e = k
    return (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days if s else 0


def flows_split(vals):
    """{(start, end): v} → (분기 {키: v}, 연간 {(start, end): v})."""
    q, y = {}, {}
    for k, v in vals.items():
        n = days(k)
        if 80 <= n <= 100:
            q[k] = v
        elif 350 <= n <= 380:
            y[k] = v
    return q, y


def build(cf, conv):
    """companyfacts → fin_trend 모양의 (분기, 연간, 현금흐름 연간, 현금흐름 누적, 주당배당)."""
    qs, annual = {}, {}
    units = {}
    for f, names in (("rev", REV), ("op", OP), ("ni", NI)):
        vals, units[f] = facts_of(cf, names)
        q, y = flows_split(vals)
        for (s, e), v in q.items():
            qs.setdefault(qkey(dt.date.fromisoformat(e)), {})[f] = v * conv
        for (s, e), v in y.items():
            ed = dt.date.fromisoformat(e)
            annual.setdefault(str((ed - dt.timedelta(days=45)).year), {})[f] = v * conv
            # 4분기는 따로 보고하지 않는 회사가 많다. 연간 - 그해 1~3분기로 채운다
            inner = [v2 for (s2, e2), v2 in q.items()
                     if s2 and s2 >= s and e2 < e and days((s2, e2)) <= 100]
            k4 = qkey(ed)
            if len(inner) == 3 and f not in qs.get(k4, {}):
                qs.setdefault(k4, {})[f] = (v - sum(inner)) * conv
    # 재무상태표 (시점 값)
    bal = {}
    for f, names in (("assets", ASSETS), ("liab", LIAB), ("equity", EQUITY), ("liab_eq", LIAB_EQ)):
        vals, _ = facts_of(cf, names)
        for (s, e), v in vals.items():
            if s:
                continue
            bal.setdefault(e, {})[f] = v * conv
    for e, b in bal.items():
        if "liab" not in b and "liab_eq" in b and "equity" in b:
            b["liab"] = b["liab_eq"] - b["equity"]
        b.pop("liab_eq", None)
        ed = dt.date.fromisoformat(e)
        qs.setdefault(qkey(ed), {}).update(b)
        annual_key = str((ed - dt.timedelta(days=45)).year)
        if annual_key in annual and qkey(ed).endswith("Q4"):
            annual[annual_key].update(b)
    # 현금흐름: 연간과 올해 누적
    cf_annual, cf_ytd = {}, None
    ocf, _ = facts_of(cf, OCF)
    capex, _ = facts_of(cf, CAPEX)
    for k, v in ocf.items():
        if 350 <= days(k) <= 380:
            c = capex.get(k)
            y = str((dt.date.fromisoformat(k[1]) - dt.timedelta(days=45)).year)
            cf_annual[y] = dict(ocf=v * conv, capex=None if c is None else c * conv,
                                fcf=None if c is None else (v - c) * conv)
    if ocf:
        last_end = max(e for _s, e in ocf)
        ytd = [k for k in ocf if k[1] == last_end and days(k) < 350]
        if ytd:
            k = max(ytd, key=days)
            c = capex.get(k)
            cf_ytd = dict(period=qkey(dt.date.fromisoformat(last_end)), ocf=ocf[k] * conv,
                          capex=None if c is None else c * conv,
                          fcf=None if c is None else (ocf[k] - c) * conv)
    # 주당배당: 연간 합계 (분기 선언액을 연도별로 더한다)
    dps_vals, _ = facts_of(cf, DPS)
    dps_y = {}
    for k, v in dps_vals.items():
        if 350 <= days(k) <= 380:
            dps_y[str((dt.date.fromisoformat(k[1]) - dt.timedelta(days=45)).year)] = v * conv
    return qs, annual, cf_annual, cf_ytd, dps_y, units.get("rev")


def shares_out(cf):
    """(주식 수, 기준일, 출처). 표지 발행주식수(dei)를 먼저 본다. 주식 종류가 여럿인 회사(알파벳 A/B/C,
    메타 A/B)는 표지 값이 종류별(차원 붙은 값)이라 companyfacts에 안 실린다 — 그때는 최근 분기의
    희석 가중평균 주식 수로 근사한다."""
    node = cf.get("facts", {}).get("dei", {}).get("EntityCommonStockSharesOutstanding")
    xs = (node or {}).get("units", {}).get("shares", [])
    if xs:
        last = max(x["end"] for x in xs)
        # 같은 날짜 값이 여러 서류에 중복될 수 있다. 가장 늦게 제출된 서류 하나만 쓴다
        filed = max(x.get("filed", "") for x in xs if x["end"] == last)
        v = sum(x["val"] for x in xs if x["end"] == last and x.get("filed", "") == filed)
        if v:
            return v, last, "표지"
    node = cf.get("facts", {}).get("us-gaap", {}).get("WeightedAverageNumberOfDilutedSharesOutstanding")
    xs = [x for x in (node or {}).get("units", {}).get("shares", []) if x.get("form") in FORMS]
    if xs:
        x = max(xs, key=lambda x: (x["end"], x.get("filed", "")))
        return x["val"], x["end"], "희석 가중평균"
    return None, None, None


def split_factor(meta_events, since):
    """주식 수 기준일 뒤에 있었던 액면분할 배수. 주봉은 Yahoo가 이미 분할을 반영해 준다.
    샌디스크(2026-11 8:1)에서 분할 전 주식 수로 PER 0.6배가 나왔다."""
    f = 1.0
    for v in (meta_events or {}).get("splits", {}).values():
        day = dt.datetime.fromtimestamp(v["date"], dt.timezone.utc).date().isoformat()
        if day > since and v.get("denominator"):
            f *= v["numerator"] / v["denominator"]
    return f


def disclosures(cik, today):
    d = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    r = d["filings"]["recent"]
    since = (today - dt.timedelta(days=400)).isoformat()
    out = []
    for form, day, acc, doc, items in zip(r["form"], r["filingDate"], r["accessionNumber"],
                                         r["primaryDocument"], r.get("items", [""] * len(r["form"]))):
        if day < since:
            continue
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}"
        if form in ("10-Q", "10-K", "20-F", "40-F"):
            out.append(dict(d=day, cat="정기보고서", title=f"{form} 정기보고서", url=url))
        elif form == "8-K":
            codes = [c.strip() for c in (items or "").split(",") if c.strip()]
            labels = [ITEMS[c] for c in codes if c in ITEMS]
            if not labels:
                continue
            cat = "실적" if "2.02" in codes else ("증자/사채" if "3.02" in codes or "2.03" in codes else "주요사항")
            out.append(dict(d=day, cat=cat, title=f"8-K {', '.join(labels)}", url=url))
        elif form in ("6-K",):
            out.append(dict(d=day, cat="주요사항", title="6-K 수시 보고", url=url))
        elif form in ("S-1", "F-1", "424B4"):
            out.append(dict(d=day, cat="증자/사채", title=f"{form} 증권 신고", url=url))
    out.sort(key=lambda x: x["d"], reverse=True)
    return out


def price_asof(meta, now):
    """미국 정규장(뉴욕 9:30~16:00) 중에 돌렸으면 장중 표시. 서머타임은 무시한 근사다."""
    ny = now.astimezone(dt.timezone(dt.timedelta(hours=-5)))
    if ny.weekday() >= 5 or not (dt.time(9, 30) <= ny.time() < dt.time(16, 0)):
        return None
    return f"{now:%H:%M} 장중"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fin-trend", required=True)
    ap.add_argument("--watchlist", default=os.path.join(HERE, "..", "data", "global-watchlist.json"))
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    ft = load_fin_trend(a.fin_trend)
    now = dt.datetime.now(KST)
    today = now.date()
    wl = json.load(open(a.watchlist, encoding="utf-8"))
    tickers = {v["ticker"]: v["cik_str"] for v in get("https://www.sec.gov/files/company_tickers.json").values()}
    idx = {m: chart(sym)[0] for m, sym in INDEX.items()}
    last_fy = str(today.year - 1)

    def collect(item):
        tk = item["ticker"]
        px, meta = chart(tk)
        if not px:
            raise RuntimeError("시세 없음")
        mk = MARKET.get(meta.get("exchangeName"), "나스닥")
        warn, qs, annual, cf_annual, cf_ytd, dps_y, sh = [], {}, {}, {}, None, {}, None
        cik = tickers.get(tk)
        if cik:
            try:
                cf = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
                # 통화를 먼저 알아야 환산한다. 매출 단위로 판단한다
                _v, unit = facts_of(cf, REV)
                conv = fx_to_usd(unit) if unit and unit != "USD" else 1.0
                if conv != 1.0:
                    warn.append(f"재무 {unit} → USD 환산 (수집 시점 환율 {conv:.4f})")
                qs, annual, cf_annual, cf_ytd, dps_y, _ = build(cf, conv)
                sh, sh_end, sh_src = shares_out(cf)
                if sh:
                    f = split_factor(meta.get("events"), sh_end)
                    if f != 1.0:
                        sh *= f
                        warn.append(f"주식 수 액면분할 반영 x{f:g}")
                    if sh_src != "표지":
                        warn.append(f"주식 수는 {sh_src}로 근사")
            except Exception as e:
                warn.append(f"재무: {type(e).__name__}")
        if not qs and not annual:
            warn.append("SEC 재무 없음 (상장 직후이거나 외국 기업)")
        if item.get("adr") and sh:
            sh = sh / item["adr"]  # 원주 수 → ADR 환산 주식 수
        s = dict(sector=item["group"], name=item["name"], code=tk, market=mk, corp=str(cik or ""))
        r = ft.analyze(s, "CFS", qs, annual, sh, px, idx[mk])
        r["cur"] = "USD"
        r["snap"]["date"] = dt.datetime.fromtimestamp(meta["regularMarketTime"], dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
        r["snap"]["asof"] = price_asof(meta, now)
        r["flows"], r["flow_sum"] = [], {}
        r["cf_annual"] = {y: cf_annual[y] for y in sorted(cf_annual)[-5:]}
        r["cf_ytd"] = cf_ytd
        ys = [y for y in sorted(dps_y, reverse=True)[:3]]
        if ys and not dps_y[ys[0]]:  # 0 선언(무배당 회사의 빈 줄)은 배당으로 치지 않는다
            ys = []
        price = r["snap"]["price"]
        if ys:
            dps = [dps_y[y] for y in ys]
            r["div"] = dict(year=int(ys[0]), dps=dps, yield_now=dps[0] / price * 100 if price else None,
                            payout=[ft.ratio(dps_y[y] * (sh or 0), (annual.get(y) or {}).get("ni")) for y in ys],
                            **{"yield": [None] * len(ys)})
        else:
            r["div"] = None
        disc = []
        if cik:
            try:
                disc = disclosures(cik, today)
            except Exception as e:
                warn.append(f"공시: {type(e).__name__}")
        r["disc"] = disc[:40]
        r["sched"] = ft.earnings_schedule(disc, today)
        r["warn"] = warn
        lfy = r["cf_annual"].get(last_fy, {})
        r["snap"].update(fcf_fy=lfy.get("fcf"), ocf_fy=lfy.get("ocf"),
                         cash_conv=ft.ratio(lfy.get("ocf"), (annual.get(last_fy) or {}).get("ni")),
                         frgn_20=None, organ_20=None, hold_now=None, hold_chg_60=None,
                         dps=(r["div"] or {}).get("dps", [None])[0], div_yield=(r["div"] or {}).get("yield_now"),
                         next_earn=r["sched"]["next_expected"])
        return r

    results, fails = {}, []
    with ThreadPoolExecutor(max_workers=4) as ex:  # SEC 한도(초당 10회) 아래로
        futs = {ex.submit(collect, it): it for it in wl}
        for f, it in futs.items():
            try:
                r = results[it["ticker"]] = f.result()
                print(f"  {it['name']} ({it['ticker']}, {r['market']}): 분기 {len(r['quarters'])}, "
                      f"공시 {len(r['disc'])}건{'  경고 ' + ', '.join(r['warn']) if r['warn'] else ''}")
            except Exception as e:
                fails.append((it["name"], f"{type(e).__name__}: {e}"))
    data = [results[it["ticker"]] for it in wl if it["ticker"] in results]
    os.makedirs(a.out, exist_ok=True)
    payload = dict(run_at=now.strftime("%Y-%m-%d %H:%M KST"), stocks=data, fails=fails)
    open(os.path.join(a.out, "data.json"), "w", encoding="utf-8").write(
        json.dumps(ft.rnd(payload), ensure_ascii=False, separators=(",", ":")))
    print(f"완료: {a.out}  (성공 {len(data)}, 실패 {len(fails)})")
    for n, why in fails:
        print(f"  실패 {n}: {why}")
    if not data:
        sys.exit(1)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
    except Exception:
        pass
    main()
