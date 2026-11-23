#!/usr/bin/env bash
# 워크플로 실패 알림 (운영자 개인 챗). 네 워크플로의 "실패 알림" step이 부른다.
#
#   bash scripts/notify-failure.sh "<무엇이 실패했나>" "<대상 회차, 없으면 빈 값>"
#
# 필요한 env: TG_TOKEN, TG_CHAT (없으면 조용히 끝낸다), GH_TOKEN (실패 step 조회용, 없어도 보낸다)
#
# 회차 날짜와 실행 시각을 따로 적는다. 예전 문구는 "적재 실패 — 2026-11-21" 한 줄이라
# 11-23에 11-21 회차를 다시 넣다 실패한 것이 "21일에 실패"로 읽혔다.
set -u

TITLE="${1:-실행}"
TARGET=$(echo "${2:-}" | xargs)   # 회차가 비면 남는 공백을 걷는다

if [ -z "${TG_TOKEN:-}" ] || [ -z "${TG_CHAT:-}" ]; then
  echo "텔레그램 secret 없음 — 알림 건너뜀"
  exit 0
fi

# 실패한 step 이름. 조회가 안 되면 비워 두고 그래도 보낸다.
STEPS=""
if [ -n "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  STEPS=$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs" \
    --jq '[.jobs[].steps[] | select(.conclusion == "failure") | .name] | join(", ")' 2>/dev/null || true)
fi

case "${GITHUB_EVENT_NAME:-}" in
  workflow_dispatch) HOW="수동 또는 Vercel Cron" ;;
  schedule)          HOW="GitHub 백업 스케줄" ;;
  *)                 HOW="${GITHUB_EVENT_NAME:-?}" ;;
esac

NOW=$(TZ=Asia/Seoul date '+%m-%d %H:%M')
RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

TEXT="[market-brief] ${TITLE} 실패"
[ -n "$TARGET" ] && TEXT="${TEXT}
대상 회차: ${TARGET}"
[ -n "$STEPS" ] && TEXT="${TEXT}
실패 step: ${STEPS}"
TEXT="${TEXT}
실패 시각: ${NOW} KST (${HOW})
${RUN_URL}"

if [ -n "${NOTIFY_DRY_RUN:-}" ]; then echo "$TEXT"; exit 0; fi

curl -sS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d chat_id="$TG_CHAT" \
  --data-urlencode "text=${TEXT}" > /dev/null
