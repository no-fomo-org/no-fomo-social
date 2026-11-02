#!/bin/sh
# Starts and manages the installed no-fomo-social app on macOS.
# Usage: no-fomo-social [start|stop|restart|status|logs|update|uninstall]
set -eu

APP_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
HOME_DIR="${NO_FOMO_SOCIAL_HOME:-$HOME/.no-fomo-social}"
PORT="${NO_FOMO_SOCIAL_PORT:-4747}"
URL="http://localhost:$PORT"
LOG_DIR="$HOME_DIR/logs"
LOG="$LOG_DIR/server.log"
PID_FILE="$HOME_DIR/server.pid"
INSTALL_URL="https://raw.githubusercontent.com/no-fomo-org/no-fomo-social/main/scripts/install/install.sh"

# True when a no-fomo-social server answers on the port (its config has an extension id).
running() {
  /usr/bin/curl -fsS --max-time 2 "$URL/api/config" 2>/dev/null | grep -q extensionId
}

open_browser() {
  if [ -n "${NO_FOMO_SOCIAL_NO_BROWSER:-}" ]; then return 0; fi
  /usr/bin/open -a "Google Chrome" "$URL" 2>/dev/null || /usr/bin/open "$URL"
}

start() {
  if running; then
    open_browser
    return 0
  fi
  mkdir -p "$LOG_DIR"
  # Keep the log small: start fresh when it passes 5 MB.
  if [ -f "$LOG" ] && [ "$(wc -c <"$LOG")" -gt 5000000 ]; then mv "$LOG" "$LOG.old"; fi
  NO_FOMO_SOCIAL_APP_DIR="$APP_DIR" nohup "$APP_DIR/node/node" "$APP_DIR/server.mjs" >>"$LOG" 2>&1 &
  echo $! >"$PID_FILE"
  i=0
  while [ $i -lt 40 ]; do
    if running; then
      open_browser
      return 0
    fi
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then break; fi
    sleep 0.5
    i=$((i + 1))
  done
  echo "no-fomo-social did not start. Last lines of $LOG:" >&2
  tail -n 20 "$LOG" >&2 || true
  exit 1
}

stop() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE")"
    # After a reboot the number can belong to another program; only stop our node.
    case "$(ps -p "$pid" -o comm= 2>/dev/null)" in *node*) ;; *) rm -f "$PID_FILE"; return 0 ;; esac
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      i=0
      while kill -0 "$pid" 2>/dev/null && [ $i -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
    fi
    rm -f "$PID_FILE"
  fi
}

uninstall() {
  stop
  rm -rf "$HOME/Applications/no-fomo-social.app"
  if [ -L "$HOME/.local/bin/no-fomo-social" ]; then rm -f "$HOME/.local/bin/no-fomo-social"; fi
  rm -rf "$APP_DIR"
  echo "no-fomo-social is removed."
  echo "Your library is still in $HOME_DIR. Delete that folder too if you do not need it any more."
  echo "Remove the Chrome extension in chrome://extensions."
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) if running; then echo "no-fomo-social is running at $URL"; else echo "no-fomo-social is not running"; fi ;;
  logs) tail -n 100 "$LOG" ;;
  update) /usr/bin/curl -fsSL "$INSTALL_URL" | /bin/bash ;;
  uninstall) uninstall ;;
  version) cat "$APP_DIR/VERSION" ;;
  *) echo "Usage: no-fomo-social [start|stop|restart|status|logs|update|uninstall|version]" >&2; exit 2 ;;
esac
