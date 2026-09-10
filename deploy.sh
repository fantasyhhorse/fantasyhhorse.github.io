#!/usr/bin/env bash
# ============================================================
#  FHh — выкладка сайта одной командой.
#
#  Делает по порядку:
#    1. собирает облегчённые копии для новых снимков;
#    2. поднимает ?v=N у css/js — иначе у тех, кто уже заходил,
#       останется старая версия из кеша и правки «не появятся»;
#    3. коммитит и пушит;
#    4. ждёт, пока новая версия реально ляжет на сайт, и говорит об этом.
#
#  Запуск:  ./deploy.sh  ["текст коммита"]
#  Ключи:   --bump       поднять версию, даже если css/js не трогали
#           --no-media   не пересобирать копии картинок
#           --no-wait    не ждать публикацию, просто запушить
# ============================================================
set -u

cd "$(dirname "$0")" || exit 1

SITE_URL="https://fantasyhhorse.github.io"
POLL_LIMIT=60          # попыток по 10 секунд = 10 минут

DO_MEDIA=1
DO_WAIT=1
FORCE_BUMP=0
MSG=""

for arg in "$@"; do
  case "$arg" in
    --bump)     FORCE_BUMP=1 ;;
    --no-media) DO_MEDIA=0 ;;
    --no-wait)  DO_WAIT=0 ;;
    -h|--help)  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          MSG="$arg" ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

# ---------- проверки ----------
[ -f index.html ] || die "index.html рядом не найден — запускайте скрипт из папки сайта."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Это не git-репозиторий."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "HEAD" ] && die "Отсоединённая голова: сделайте git checkout main."

REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
[ -n "$REMOTE_URL" ] || die "Не задан origin: git remote add origin <адрес репозитория>."
SLUG="$(printf '%s' "$REMOTE_URL" | sed -e 's#.*github\.com[:/]##' -e 's#\.git$##')"

say "Ветка $BRANCH  →  $SLUG"

# ---------- 1. облегчённые копии ----------
if [ "$DO_MEDIA" = "1" ] && [ -f tools/optimize-media.py ]; then
  PY=""
  for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }; done
  if [ -n "$PY" ] && "$PY" -c "import PIL" >/dev/null 2>&1; then
    say "Облегчённые копии картинок"
    "$PY" tools/optimize-media.py || die "Не удалось собрать копии картинок."
  else
    info "Pillow не найден — копии не пересобираю (сайт возьмёт оригиналы)."
    info "Поставить: python -m pip install pillow"
  fi
fi

# ---------- 2. версия статики ----------
# Считаем изменённым и то, что ещё не закоммичено, и то, что закоммичено,
# но не отправлено: иначе правки уедут со старой меткой и постоянные
# посетители получат из кеша прежние css/js.
CHANGED="$(git status --porcelain -- '*.css' '*.js' '*.html' | head -1)"
if [ -z "$CHANGED" ] && git rev-parse --verify -q "origin/$BRANCH" >/dev/null; then
  CHANGED="$(git diff --name-only "origin/$BRANCH..HEAD" -- '*.css' '*.js' '*.html' | head -1)"
fi

VER=""
if [ -n "$CHANGED" ] || [ "$FORCE_BUMP" = "1" ]; then
  CUR="$(sed -n 's/.*style\.css?v=\([0-9]\{1,\}\).*/\1/p' index.html | head -1)"
  if [ -n "$CUR" ]; then
    VER=$((CUR + 1))
    # правим все страницы, где встречается метка, а не только index.html
    for f in $(grep -rl "?v=$CUR\"" --include='*.html' . 2>/dev/null | grep -v '^\./\.git/'); do
      sed -i "s/?v=$CUR\"/?v=$VER\"/g" "$f"
    done
    say "Версия статики: $CUR → $VER"
  else
    info "Метку ?v= в index.html не нашёл — пропускаю."
  fi
fi

# ---------- 3. коммит и пуш ----------
if [ -n "$(git status --porcelain)" ]; then
  [ -n "$MSG" ] || MSG="Обновление сайта $(date '+%Y-%m-%d %H:%M')"
  git add -A || die "git add не прошёл."
  git commit -m "$MSG" || die "git commit не прошёл."
  say "Коммит: $MSG"
else
  info "Менять нечего — коммит не нужен."
fi

AHEAD="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
if [ "$AHEAD" -gt 0 ]; then
  say "Отправляю коммитов: $AHEAD"
  git push origin "$BRANCH" || die "git push не прошёл. Проверьте доступ к репозиторию."
else
  info "На сервере уже всё то же самое."
fi
info "коммит $(git rev-parse --short HEAD)"

[ "$DO_WAIT" = "1" ] || { say "Готово. Публикация идёт своим ходом."; exit 0; }
command -v curl >/dev/null 2>&1 || { say "curl нет — статус не покажу."; info "$SITE_URL"; exit 0; }

# ---------- 4. ждём, пока новая версия ляжет на сайт ----------
# Спрашиваем не GitHub, а сам сайт: это ровно тот ответ, который нужен —
# «видно ли уже правки». Заодно не мешает вторая, встроенная публикация
# Pages, которая иногда висит в очереди со статусом waiting.
if [ -z "$VER" ]; then
  say "Готово."
  info "$SITE_URL"
  info "Версию статики не поднимали, так что проверять на сайте нечего."
  exit 0
fi

say "Жду, когда сайт отдаст версию $VER (до 10 минут; можно закрыть — публикация всё равно пройдёт)"
n=0
while [ "$n" -lt "$POLL_LIMIT" ]; do
  n=$((n + 1))
  LIVE="$(curl -fsS -H 'Cache-Control: no-cache' "$SITE_URL/index.html?_=$(date +%s)" 2>/dev/null || true)"
  if printf '%s' "$LIVE" | grep -q "?v=$VER\""; then
    say "Опубликовано"
    info "$SITE_URL"
    info "Если на телефоне всё ещё старое — потяните страницу вниз для обновления"
    info "или откройте в приватной вкладке: у Safari свой кеш."
    exit 0
  fi
  printf '.'
  sleep 10
done

printf '\n'
say "За 10 минут сайт новую версию не отдал."
info "Что пошло не так, видно тут: https://github.com/$SLUG/actions"
info "$SITE_URL"
exit 1
