#!/usr/bin/env sh
# Локальный просмотр сайта (macOS / Linux). Windows — start.cmd
cd "$(dirname "$0")" || exit 1

PORT=5173
URL="http://localhost:$PORT/"

echo
echo "  FHh - Fantasy Hobbyhorse"
echo "  ----------------------------------------------"
echo "  Сайт откроется здесь:  $URL"
echo "  Панель управления:     точка в правом нижнем углу или Ctrl+Shift+A"
echo
echo "  Остановить — Ctrl+C."
echo

( sleep 2
  if   command -v open    >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) &

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve --listen "$PORT" .
else
  echo "  Не найден ни Python, ни Node.js — поставьте что-то одно."
  exit 1
fi
