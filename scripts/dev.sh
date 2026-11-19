#!/usr/bin/env bash
# Up/reload the dev stack: API server (:3000) + Vite web (:5173, proxies /api to the server).
# Usage: scripts/dev.sh [up|stop|status|logs]   (default: up = stop old ones, then start fresh)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD LOG=.dev API_PORT=${PORT:-3000} WEB_PORT=${WEB_PORT:-5173}
mkdir -p "$LOG"

# pids listening on $1 whose cwd is inside this repo (never touches other projects' servers)
ours() { for p in $(ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
  [[ "$(readlink "/proc/$p/cwd" 2>/dev/null)" == "$ROOT"* ]] && echo "$p"; done; }
stop() { for port in $API_PORT $WEB_PORT $((WEB_PORT + 1)); do for p in $(ours "$port"); do kill "$p" 2>/dev/null && echo "stopped :$port (pid $p)"; done; done; }
wait_for() { for _ in $(seq 60); do curl -fs -o /dev/null "$1" && return 0; sleep 0.5; done; echo "FAILED: $1 (see $LOG/$2.log)"; tail -15 "$LOG/$2.log"; return 1; }

case "${1:-up}" in
  stop) stop ;;
  status) for port in $API_PORT $WEB_PORT; do echo ":$port pids: $(ours "$port" | tr "\n" " ")"; done ;;
  logs) tail -f "$LOG/server.log" "$LOG/web.log" ;;
  up)
    stop; sleep 1
    pnpm install --frozen-lockfile >"$LOG/install.log" 2>&1 || pnpm install >>"$LOG/install.log" 2>&1  # no-op when current
    [ -f .env ] && set -a && . ./.env && set +a
    PORT=$API_PORT setsid nohup pnpm --filter @flowmotion/server start >"$LOG/server.log" 2>&1 &
    API_URL=http://localhost:$API_PORT setsid nohup pnpm --filter @flowmotion/web dev --port "$WEB_PORT" --strictPort >"$LOG/web.log" 2>&1 &
    wait_for "http://localhost:$API_PORT/api/icons?q=lock&limit=1" server
    wait_for "http://localhost:$WEB_PORT/" web
    echo "api  http://localhost:$API_PORT   web  http://localhost:$WEB_PORT   logs: scripts/dev.sh logs" ;;
  *) echo "usage: $0 [up|stop|status|logs]"; exit 2 ;;
esac
