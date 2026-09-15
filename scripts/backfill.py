# -*- coding: utf-8 -*-
"""
과거 회차 일괄 적재.

원본 리포트가 있는 날짜를 훑어 거래일만 골라 fetch_market.py → ingest.ts를 차례로 돌린다.
휴장일은 건너뛴다. 리포트 폴더가 토요일에도 있는 경우가 있어서(주말 정리본) 필요한 걸러내기다.

업종은 채워지지 않는다. 네이버 업종 API에 날짜 파라미터가 없어 과거 값을 받을 수 없다.
fetch_market.py 주석 참고. 추정값으로 메우지 않는다.

  python scripts/backfill.py --dry-run          대상 날짜만 출력
  python scripts/backfill.py                    draft로 적재
  python scripts/backfill.py --publish          published로 적재
  python scripts/backfill.py --from 2026-08-01  시작일 지정
  python scripts/backfill.py --skip-existing    이미 시세 파일이 있으면 수집 건너뜀

원본 리포트는 읽기만 한다.
"""
import argparse
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
REPORT_ROOT = os.environ.get(
    "REPORT_ROOT", os.path.abspath(os.path.join(ROOT, "..", "요약", "뉴스"))
)
MARKET_DIR = os.path.join(ROOT, "data", "market")


def report_dates():
    out = set()
    for _, dirs, _ in os.walk(REPORT_ROOT):
        for d in dirs:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
                out.add(d)
    return sorted(out)


def trading_days(start, end):
    """코스피 지수에 행이 있는 날 = 장이 선 날."""
    import FinanceDataReader as fdr

    df = fdr.DataReader("KS11", start, end)
    return {d.strftime("%Y-%m-%d") for d in df.index}


def run(cmd, label):
    r = subprocess.run(cmd, cwd=ROOT, shell=False)
    if r.returncode != 0:
        print(f"    x {label} 실패 (exit {r.returncode})")
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default=None)
    ap.add_argument("--to", dest="end", default=None)
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-existing", action="store_true",
                    help="data/market/{날짜}.json이 이미 있으면 시세 수집을 건너뛴다")
    args = ap.parse_args()

    dates = report_dates()
    if not dates:
        print(f"리포트를 찾을 수 없습니다: {REPORT_ROOT}", file=sys.stderr)
        return 1
    if args.start:
        dates = [d for d in dates if d >= args.start]
    if args.end:
        dates = [d for d in dates if d <= args.end]

    td = trading_days(dates[0], dates[-1])
    targets = [d for d in dates if d in td]
    skipped = [d for d in dates if d not in td]

    print(f"리포트 {len(dates)}일 · 거래일 {len(targets)}일 · 휴장 제외 {len(skipped)}일")
    if skipped:
        print(f"  제외: {', '.join(skipped)}")
    if args.dry_run:
        print("  대상: " + ", ".join(targets))
        return 0

    ok, fail = [], []
    for i, date in enumerate(targets, 1):
        # 자식 프로세스 출력과 순서가 엉키지 않게 즉시 내보낸다
        print(f"\n[{i}/{len(targets)}] {date}", flush=True)
        market_json = os.path.join(MARKET_DIR, f"{date}.json")
        if args.skip_existing and os.path.exists(market_json):
            print("    - 시세 파일 있음, 수집 건너뜀")
        elif not run([sys.executable, os.path.join("scripts", "fetch_market.py"), date], "시세 수집"):
            fail.append(date)
            continue

        cmd = ["npx.cmd" if os.name == "nt" else "npx", "tsx",
               "--env-file=.env.local", os.path.join("scripts", "ingest.ts"), "--date", date]
        if args.publish:
            cmd.append("--publish")
        if run(cmd, "적재"):
            ok.append(date)
        else:
            fail.append(date)
        time.sleep(1)  # 네이버 쪽에 연속 요청을 몰아치지 않는다

    print(f"\n완료 {len(ok)}일 · 실패 {len(fail)}일")
    if fail:
        print("  실패: " + ", ".join(fail))
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
