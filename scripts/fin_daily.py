"""평일 새 공시 확인 (종목 브리핑, 2026-11-19 사용자 지시).

회차는 토요일에만 만든다. 평일 21:00에 최신 회차 종목들에 그 뒤로 새 공시가 있는지 DART에서 보고,
있는 종목만 원본 수집기(stock-analysis `fin_trend.py`)로 다시 수집한다. 적재는 `patch-fin.ts`가 한다.

    python scripts/fin_daily.py --fin-trend reports/fin_trend.py --targets t.json --out out

입력 `--targets` (`fin-daily-targets.ts`가 만든다)
    {"runDate": "2026-11-14", "stocks": [{"code", "name", "group", "known": [접수번호...]}]}
출력 `--out`
    changes.json   {"on": 오늘, "checked": 종목 수, "changed": [{"code", "name", "group", "titles", "seen"}]}
    run/           바뀐 종목만 다시 수집한 결과(data.json …). 바뀐 게 없으면 만들지 않는다

**새 공시 판정**: 회차 날짜 이후 접수된 공시 중 수집기가 다루는 종류(`fin_trend.DISC` — 실적, 배당,
자사주, 증자/사채, 수주, IR, 정기보고서)이면서 `known`에 없는 접수번호. `known`은 저장된 공시 목록과
지난 갱신 때 본 번호라, 같은 공시로 다음 날 또 다시 수집하지 않는다.

원본 수집기는 **고치지 않는다**(CLAUDE.md 절대 규칙 3). 함수를 불러 쓰고, 다시 수집은 임시 관심종목
목록을 만들어 그대로 실행한다. 표준 라이브러리만 쓴다(수집기와 같다).
"""
import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import subprocess
import sys

KST = dt.timezone(dt.timedelta(hours=9))


def load_fin_trend(path):
    spec = importlib.util.spec_from_file_location("fin_trend", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def new_disclosures(ft, key, corp, bgn, today, known):
    """회차 날짜 이후 공시 중 수집기가 다루는 것. (새 것, 본 것 전부)"""
    fresh, seen = [], []
    for ty in ("A", "B", "I"):
        d = ft.get(
            f"{ft.DART}/list.json?crtfc_key={key}&corp_code={corp}&bgn_de={bgn}"
            f"&end_de={today:%Y%m%d}&pblntf_ty={ty}&page_count=100"
        )
        for x in d.get("list", []) if d.get("status") == "000" else []:
            nm = re.sub(r"\s+", " ", x["report_nm"]).strip()
            if not any(any(k in nm for k in kws) for _cat, kws in ft.DISC):
                continue
            no = x["rcept_no"]
            seen.append(no)
            if no not in known:
                fresh.append(nm)
    return fresh, seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fin-trend", required=True)
    ap.add_argument("--targets", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--today", help="YYYY-MM-DD (기본 오늘 KST)")
    a = ap.parse_args()

    ft = load_fin_trend(a.fin_trend)
    key = ft.api_key()
    t = json.load(open(a.targets, encoding="utf-8"))
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(KST).date()
    run_date = dt.date.fromisoformat(t["runDate"])
    if today <= run_date:
        print(f"오늘({today})이 회차({run_date}) 이후가 아니다. 확인할 것이 없다.")
        changed = []
    else:
        _by_name, by_code = ft.corp_map(key)
        bgn = run_date.strftime("%Y%m%d")
        changed = []
        for s in t["stocks"]:
            hit = by_code.get(s["code"])
            if not hit:
                print(f"  {s['name']}: DART 고유번호 없음, 건너뜀")
                continue
            fresh, seen = new_disclosures(ft, key, hit[0], bgn, today, set(s.get("known", [])))
            if fresh:
                print(f"  {s['name']}: 새 공시 {len(fresh)}건 — {', '.join(fresh)}")
                changed.append(dict(code=s["code"], name=s["name"], group=s["group"], titles=fresh, seen=seen))
        print(f"{len(t['stocks'])}종목 확인, 새 공시 {len(changed)}종목")

    os.makedirs(a.out, exist_ok=True)
    out = dict(on=today.isoformat(), checked=len(t["stocks"]), changed=changed)
    json.dump(out, open(os.path.join(a.out, "changes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if not changed:
        return

    # 수집기는 관심종목 문서의 4.4절을 읽는다. 바뀐 종목만 담은 임시 문서를 만든다
    groups = {}
    for c in changed:
        groups.setdefault(c["group"], []).append(c["name"])
    lines = ["### 4.4 관심종목", ""] + [f"- **{g}:** {', '.join(ns)}" for g, ns in groups.items()] + ["", "---", ""]
    wl = os.path.join(a.out, "_watchlist.md")
    open(wl, "w", encoding="utf-8").write("\n".join(lines))
    run = os.path.join(a.out, "run")
    r = subprocess.run([sys.executable, a.fin_trend, "--watchlist", wl, "--out", run])
    if r.returncode != 0:
        sys.exit(f"수집기 실패 (exit {r.returncode})")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
    except Exception:
        pass
    main()
