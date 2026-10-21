#!/usr/bin/env bash
set -euo pipefail

: "${DISPLAY:=:99}"
: "${VNC_PASSWORD:?VNC_PASSWORD must be set}"

# Virtual display the headful Firefox renders into.
Xvfb "$DISPLAY" -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &

# Wait for the X socket (display :99 -> /tmp/.X11-unix/X99).
sock="/tmp/.X11-unix/X${DISPLAY#:}"
for _ in $(seq 1 50); do
  [ -S "$sock" ] && break
  sleep 0.1
done
[ -S "$sock" ] || { echo "Xvfb did not start" >&2; cat /tmp/xvfb.log >&2; exit 1; }

# VNC server so a human can watch (or solve a challenge by hand).
mkdir -p "$HOME/.vnc"
x11vnc -storepasswd "$VNC_PASSWORD" "$HOME/.vnc/passwd" >/dev/null 2>&1
x11vnc -display "$DISPLAY" -rfbauth "$HOME/.vnc/passwd" -forever -shared -quiet \
  -rfbport 5900 >/tmp/x11vnc.log 2>&1 &

exec "$@"
