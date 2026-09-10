#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Облегчённые копии для assets/media.

Панель управления выкладывает снимки как есть, и оригиналы бывают по
несколько мегабайт. Сайт качает их целиком даже под миниатюру в ленте —
на телефоне это долгое ожидание и лишний трафик.

Скрипт кладёт рядом с оригиналами два уменьшённых webp:

    assets/media/thumb/<имя>.webp   лента миниатюр
    assets/media/card/<имя>.webp    обложка в витрине
    assets/media/view/<имя>.webp    кадр в карточке работы и в услуге

Оригинал остаётся на месте: его тянет только полноэкранный просмотр,
где кадр можно приблизить. Соответствие путей зашито в store.js
(mediaSrc); если копии нет, сайт молча берёт оригинал.

Запуск (нужен Pillow):

    python tools/optimize-media.py

Ключи:
    --force   пересобрать даже то, что уже есть
    --dir P   другая папка с медиа (по умолчанию assets/media)
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:                                    # pragma: no cover
    sys.exit('Нужен Pillow: python -m pip install pillow')

# сторона длинной грани и качество webp для каждой копии
VARIANTS = {
    'thumb': (400, 70),
    'card': (800, 78),
    'view': (1600, 82),
}
SOURCE_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.gif')


def human(n):
    for unit in ('Б', 'КБ', 'МБ'):
        if n < 1024 or unit == 'МБ':
            return '%.0f %s' % (n, unit)
        n /= 1024.0


def build(src, dst, max_side, quality):
    im = Image.open(src)
    # webp не умеет палитру и CMYK, а альфу надо сохранить
    if im.mode in ('P', 'LA'):
        im = im.convert('RGBA')
    elif im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')

    w, h = im.size
    scale = min(1.0, float(max_side) / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(round(w * scale))),
                        max(1, int(round(h * scale)))), Image.LANCZOS)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, 'WEBP', quality=quality, method=6)


def main():
    ap = argparse.ArgumentParser(description='Уменьшённые копии для assets/media')
    ap.add_argument('--dir', default='assets/media')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    root = args.dir
    if not os.path.isdir(root):
        sys.exit('Нет папки %s — запускайте из корня сайта' % root)

    names = sorted(f for f in os.listdir(root)
                   if os.path.isfile(os.path.join(root, f))
                   and f.lower().endswith(SOURCE_EXT))
    if not names:
        print('В %s нет картинок' % root)
        return

    made = skipped = 0
    src_bytes = out_bytes = 0
    for name in names:
        src = os.path.join(root, name)
        stem = os.path.splitext(name)[0]
        src_bytes += os.path.getsize(src)
        for kind, (side, q) in VARIANTS.items():
            dst = os.path.join(root, kind, stem + '.webp')
            fresh = (os.path.exists(dst)
                     and os.path.getmtime(dst) >= os.path.getmtime(src))
            if fresh and not args.force:
                skipped += 1
                out_bytes += os.path.getsize(dst)
                continue
            try:
                build(src, dst, side, q)
            except Exception as err:                   # noqa: BLE001
                print('  ! %s (%s): %s' % (name, kind, err))
                continue
            made += 1
            out_bytes += os.path.getsize(dst)

    print('картинок: %d, собрано копий: %d, пропущено готовых: %d'
          % (len(names), made, skipped))
    print('оригиналы: %s, копии: %s' % (human(src_bytes), human(out_bytes)))


if __name__ == '__main__':
    main()
