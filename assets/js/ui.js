/* ============================================================
   ui.js — загрузка, разделы, витрина, группы товаров, карточка
   работы, фотолента «о мастере», Telegram.
   Фазы: boot → reveal → live.
   ============================================================ */
window.FHh = window.FHh || {};

(function (NS) {
  'use strict';

  var S = NS.store, B = NS.bot, BR = NS.brand;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var body = document.body;
  var pre = null, hero = null, wiper = null;
  var currentGroup = null;      // открытая группа товаров
  var groupCat = 'all';         // подфильтр внутри группы
  var currentItem = null;

  /* Режим витрины на телефоне: 'lane' — кадр во всю ширину, 'grid' — мелкая
     сетка, чтобы за раз помещалось больше работ. Выбор запоминается в этом
     браузере и действует и на главной, и на странице группы. */
  var CARDS_KEY = 'fhh.cards';
  function cardsMode() {
    try { return localStorage.getItem(CARDS_KEY) === 'grid' ? 'grid' : 'lane'; }
    catch (e) { return 'lane'; }
  }
  function applyCardsMode(m) {
    body.dataset.cards = m;
    try { localStorage.setItem(CARDS_KEY, m); } catch (e) {}
    $$('[data-cardmode]').forEach(function (b) {
      b.setAttribute('aria-pressed', m === 'grid' ? 'true' : 'false');
      var lbl = $('span', b);
      if (lbl) lbl.textContent = m === 'grid' ? 'лента' : 'сетка';
    });
  }
  function toggleCards() { applyCardsMode(cardsMode() === 'grid' ? 'lane' : 'grid'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- блокировка прокрутки со счётчиком ----------------
     Карточка работы открывается поверх страницы группы: без счётчика
     закрытие карточки вернуло бы прокрутку фону, который ещё закрыт. */
  var locks = 0;
  function lockScroll(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    body.style.overflow = locks ? 'hidden' : '';
  }

  /* ---------------- настройки → DOM ---------------- */
  function applySettings() {
    var st = S.state.settings;
    var r = document.documentElement.style;

    ['paper', 'ink', 'rust', 'olive', 'emerald'].forEach(function (k) {
      if (st[k]) r.setProperty('--' + k, st[k]);
    });
    // роли: значение роли — имя токена, поэтому ссылаемся на его переменную
    r.setProperty('--accent', 'var(--' + (st.roleAccent || 'rust') + ')');
    r.setProperty('--band-bg', 'var(--' + (st.roleBand || 'olive') + ')');
    r.setProperty('--badge', 'var(--' + (st.roleBadge || 'rust') + ')');
    r.setProperty('--seal', 'var(--' + (st.roleSeal || 'emerald') + ')');
    r.setProperty('--logo-ring', 'var(--' + (st.roleLogo || 'olive') + ')');
    // ботанике нужен разобранный цвет: canvas не понимает var()
    r.setProperty('--botany', st[st.roleBotany] || st.emerald || st.olive);
    r.setProperty('--logo-body', 'var(--rust)');
    r.setProperty('--logo-ink', 'var(--ink)');
    r.setProperty('--anim', st.anim);
    r.setProperty('--fs', st.fontScale || 1);

    var about = $('.about');
    if (about) about.classList.toggle('is-left', st.aboutSide === 'left');
    body.dataset.font = st.fontPreset || 'rune';
    applyDisplayFont(st);
    body.dataset.lineart = st.lineart ? '1' : '0';
    body.dataset.drift = st.aboutDrift ? '1' : '0';

    var tc = $('#themeColor'); if (tc) tc.setAttribute('content', st.paper);
    var fav = $('#favicon');
    if (fav && BR) {
      fav.setAttribute('href', BR.faviconURL({
        paper: st.paper,
        ink: st.ink,
        stick: st[st.roleLogo] || st.olive,
        body: st.rust
      }));
    }

    $$('[data-bind]').forEach(function (el) {
      var v = st[el.getAttribute('data-bind')];
      if (v !== undefined) el.textContent = v;
    });
    $$('[data-bind-html]').forEach(function (el) {
      var v = st[el.getAttribute('data-bind-html')];
      if (v !== undefined) el.innerHTML = v;
    });
    document.title = st.siteTitle + ' — ' + st.siteTagline;

    var tg = tgLink();
    $$('#tgTop, #tgContacts, #tgFoot').forEach(function (a) { a.href = tg; });

    renderBlocks($('#aboutBlocks'), st.aboutBlocks);
    renderBlocks($('#contactsBlocks'), st.contactsBlocks);

    var n = S.state.items.filter(function (i) { return !i.hidden; }).length;
    $('#heroCount').textContent = n + ' ' + plural(n, 'работа', 'работы', 'работ') + ' в витрине';

    paintMarks();
  }

  /* ---------------- разделы страниц ----------------
     «Контакты» и «о мастере» собираются из разделов: заголовок, текст и
     свои кнопки-ссылки. Раньше заголовки размечались вручную внутри
     одного HTML-поля, и кнопку к разделу было не приставить. */
  function blockURL(u) {
    u = String(u || '').trim();
    if (!u) return '';
    // без схемы браузер посчитал бы адрес относительным путём сайта
    if (/^(https?:|mailto:|tel:|tg:|#|\/|\.)/i.test(u)) return u;
    return 'https://' + u;
  }

  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 12h16m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function renderBlocks(host, list) {
    if (!host) return;
    host.innerHTML = '';
    (list || []).forEach(function (b) {
      if (!b) return;
      var sec = document.createElement('section');
      sec.className = 'blk';

      if (b.title) {
        var h = document.createElement('h3');
        h.className = 'blk__title';
        h.textContent = b.title;
        sec.appendChild(h);
      }
      if (b.text) {
        var body = document.createElement('div');
        body.className = 'prose';
        body.innerHTML = b.text;
        sec.appendChild(body);
      }

      var links = (b.links || []).filter(function (l) { return l && (l.label || l.url); });
      if (links.length) {
        var box = document.createElement('div');
        box.className = 'blk__links';
        links.forEach(function (l) {
          var href = blockURL(l.url);
          var a = document.createElement('a');
          a.className = 'cta cta--sm';
          a.href = href || '#';
          if (href && href.charAt(0) !== '#') { a.target = '_blank'; a.rel = 'noopener'; }
          var sp = document.createElement('span');
          sp.textContent = l.label || l.url;
          a.appendChild(sp);
          a.insertAdjacentHTML('beforeend', ARROW);
          box.appendChild(a);
        });
        sec.appendChild(box);
      }
      host.appendChild(sec);
    });
  }

  /* ---------------- акцентный шрифт ----------------
     Готовые начертания подтягиваются с Google Fonts одним <link>, своё —
     собирается из файла через FontFace. Меняется на лету, без перезагрузки. */
  var fontLoaded = '';
  function applyDisplayFont(st) {
    var r = document.documentElement.style;
    var id = st.fontDisplay || 'jura';

    if (id === 'custom' && st.fontCustom) {
      if (fontLoaded !== st.fontCustom) {
        fontLoaded = st.fontCustom;
        S.resolveMedia(st.fontCustom).then(function (u) {
          if (!u || !window.FontFace) return;
          var ff = new FontFace('FHhCustom', 'url("' + u + '")');
          ff.load().then(function (f) {
            document.fonts.add(f);
            r.setProperty('--f-display', '"FHhCustom","Jura","Segoe UI",Arial,sans-serif');
          }).catch(function () { r.setProperty('--f-display', '"Jura","Segoe UI",Arial,sans-serif'); });
        });
      }
      return;
    }

    var font = (S.FONTS || []).filter(function (f) { return f.id === id; })[0] || (S.FONTS || [])[0];
    if (!font) return;
    // Jura и Manrope уже в разметке — второй запрос им не нужен
    if (font.id !== 'jura' && font.id !== 'manrope' && fontLoaded !== font.id) {
      var link = $('#fontExtra');
      if (!link) {
        link = document.createElement('link');
        link.id = 'fontExtra';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = 'https://fonts.googleapis.com/css2?family=' + font.spec + '&display=swap';
    }
    fontLoaded = font.id;
    r.setProperty('--f-display', font.family + ',"Segoe UI",Arial,sans-serif');
  }

  /* пустая витрина: маскот вместо голой строки */
  function paintEmpty() {
    var el = $('#gridEmpty');
    if (!el || $('i', el) || !BR) return;
    var i = document.createElement('i');
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML = BR.mascotSVG();
    el.insertBefore(i, el.firstChild);
  }

  /* маскот и печать: одни и те же пути, разные размеры и роли */
  function paintMarks() {
    if (!BR) return;
    var mascot = BR.mascotSVG();
    ['#navMark', '#preMark', '#footMark'].forEach(function (sel) {
      var el = $(sel); if (el) el.innerHTML = mascot;
    });
  }

  function plural(n, a, b, c) {
    var m = n % 100;
    if (m > 4 && m < 20) return c;
    m = n % 10;
    return m === 1 ? a : (m > 1 && m < 5) ? b : c;
  }

  /* ---------------- тост ---------------- */
  var toastT = 0;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  /* ---------------- Telegram ---------------- */
  function tgLink() {
    return 'https://t.me/' + String(S.state.settings.telegram || '').replace(/^@/, '');
  }
  function orderText(it) {
    var lines = [
      'Здравствуйте! Хочу заказать работу с сайта:',
      '',
      '• ' + it.title + ' (' + S.catName(it.cat) + ')',
      '• Цена: ' + S.money(it.price),
      '• Артикул: ' + it.id
    ];
    if (it.status === 'order') lines.push('• Статус: под заказ');
    return lines.join('\n');
  }
  function buy(it) {
    var text = orderText(it);
    var open = function () { window.open(tgLink(), '_blank', 'noopener'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('Текст заявки скопирован — вставьте в чат'); })
        .catch(function () { toast('Открываю Telegram'); })
        .then(open, open);
    } else {
      toast('Открываю Telegram');
      open();
    }
  }

  /* ---------------- карточки ---------------- */
  function statusPill(st) {
    if (st !== 'sold' && st !== 'order') return '';
    return '<span class="st st--' + st + '">' + S.statusLabel(st) + '</span>';
  }

  function cardHTML(it) {
    // «под заказ» показываем только подписью у ценника, чтобы не двоилось;
    // «в наличии», наоборот, выносим наверх заметной зелёной плашкой
    var badge = it.status === 'sold' ? '<span class="card__badge">продано</span>'
              : it.status === 'available' ? '<span class="card__badge card__badge--ok">в наличии</span>' : '';
    return '' +
      '<div class="card__media">' + badge +
        '<img class="card__img" alt="' + esc(it.title) + '" loading="lazy">' +
        '<span class="card__over"><b>' + (it.status === 'sold' ? 'продано' : 'смотреть работу') + '</b></span>' +
      '</div>' +
      '<div class="card__cap">' +
        '<div><h3 class="card__name">' + esc(it.title) + '</h3>' +
        '<p class="card__cat">' + esc(String(S.catName(it.cat)).toLowerCase()) + '</p></div>' +
        '<div class="card__pricebox">' +
          '<div class="card__price">' + (it.old ? '<s>' + S.money(it.old) + '</s>' : '') + S.money(it.price) + '</div>' +
          /* дубль статуса рядом с ценником — как и на обложке */
          statusPill(it.status) +
        '</div>' +
      '</div>';
  }

  /* Ставит облегчённую копию, а если её ещё нет в репозитории —
     молча откатывается на исходный файл. */
  function setImg(node, url, kind) {
    if (!url) return;
    var light = S.mediaSrc(url, kind);
    if (light !== url) {
      node.onerror = function () { node.onerror = null; node.src = url; };
    }
    node.src = light;
  }

  /* Обложка работы: первое медиа в списке. Видео показывается кадром,
     на наведение — проигрывается. */
  function setCardImage(node, it) {
    var ref = (it.images || [])[0];
    var media = node.closest ? node.closest('.card__media') : null;

    if (!ref) { node.src = B.placeholder(it.id + it.title, 720, 900); return; }

    if (S.mediaKind(ref) === 'video' && media) {
      var v = document.createElement('video');
      v.className = 'card__img';
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      node.parentNode.replaceChild(v, node);
      media.classList.add('has-video');
      if (!$('.card__play', media)) {
        var badge = document.createElement('span');
        badge.className = 'card__play';
        badge.setAttribute('aria-hidden', 'true');
        media.appendChild(badge);
      }
      // #t=0.1 — просит браузер отрисовать первый кадр вместо пустого места
      S.resolveMedia(ref).then(function (u) { if (u) v.src = u + '#t=0.1'; });
      media.addEventListener('mouseenter', function () { v.play().catch(function () {}); });
      media.addEventListener('mouseleave', function () { v.pause(); });
      return;
    }

    S.resolveMedia(ref).then(function (u) {
      if (u) setImg(node, u, 'card');
      else node.src = B.placeholder(it.id + it.title, 720, 900);
    });
  }

  /* Универсальная отрисовка сетки: и главная витрина, и страница группы */
  function renderCards(grid, list, animate, io) {
    grid.innerHTML = '';
    list.forEach(function (it) {
      var el = document.createElement('article');
      el.className = 'card';
      el.dataset.id = it.id;
      el.innerHTML = cardHTML(it);
      setCardImage($('.card__img', el), it);
      el.addEventListener('click', function () { openProduct(it.id); });
      grid.appendChild(el);
      if (!animate) el.classList.add('is-in');
    });
    if (animate) {
      var obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return;
          var idx = Array.prototype.indexOf.call(e.target.parentNode.children, e.target);
          e.target.style.transitionDelay = (idx % 3) * 80 + 'ms';
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        });
      }, { root: grid.closest('.gpanel__inner') || null, rootMargin: '0px 0px -6% 0px', threshold: .05 });
      $$('.card', grid).forEach(function (c) { obs.observe(c); });
      return obs;
    }
    return null;
  }

  /* ---------------- главная витрина ---------------- */
  var io = null;
  function visibleItems() {
    return S.state.items.filter(function (i) { return !i.hidden; });
  }
  function renderGrid(animate) {
    var grid = $('#grid');
    var list = visibleItems();
    paintEmpty();
    $('#gridEmpty').hidden = list.length > 0;
    if (io) io.disconnect();
    io = renderCards(grid, list, animate);
  }

  /* Фильтры на главной = группы товаров. Клик открывает страницу группы. */
  function renderFilters() {
    var wrap = $('#filters');
    var groups = S.state.groups || [];
    var html = '<button data-cat="all" class="' + (currentGroup ? '' : 'is-on') + '"><span>все</span></button>';
    html += groups.map(function (g) {
      var n = S.itemsOfGroup(g.id).length;
      return '<button data-cat="' + esc(g.id) + '" class="' + (currentGroup === g.id ? 'is-on' : '') + '">' +
             '<span>' + esc(String(g.name).toLowerCase()) + '</span><i>' + n + '</i></button>';
    }).join('');
    wrap.innerHTML = html;

    $$('button', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.cat;
        if (id === 'all') { closeGroup(); return; }
        openGroup(id);
      });
    });
  }

  /* ============================================================
     СТРАНИЦА ГРУППЫ ТОВАРОВ
     Выезжает снизу вверх, оставляя зазор сверху. Новая группа
     перелистывается поверх старой, старая гаснет в фоне.
     ============================================================ */
  function groupPanelHTML(g) {
    var subs = S.catsOfGroup(g.id);
    var subHTML = '';
    if (subs.length > 1) {
      subHTML = '<div class="gpanel__subs mono">' +
        '<button data-sub="all" class="is-on"><span>все</span></button>' +
        subs.map(function (c) {
          return '<button data-sub="' + esc(c.id) + '"><span>' + esc(String(c.name).toLowerCase()) + '</span></button>';
        }).join('') + '</div>';
    }
    return '' +
      '<div class="gpanel__handle" data-ghandle aria-hidden="true"><i class="gpanel__grip"></i></div>' +
      '<button class="gpanel__close" data-gclose aria-label="Закрыть группу">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '<span>выйти из группы</span>' +
      '</button>' +
      '<div class="gpanel__inner">' +
        '<header class="gpanel__head">' +
          '<p class="gpanel__kicker mono">группа товаров</p>' +
          '<h2 class="gpanel__title">' + esc(g.name) + '<em>.</em></h2>' +
          (g.note ? '<p class="gpanel__note">' + esc(g.note) + '</p>' : '') +
          subHTML +
          '<button class="cardmode mono" data-cardmode aria-pressed="false">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<rect x="3" y="3" width="8" height="8"></rect>' +
              '<rect x="13" y="3" width="8" height="8"></rect>' +
              '<rect x="3" y="13" width="8" height="8"></rect>' +
              '<rect x="13" y="13" width="8" height="8"></rect>' +
            '</svg><span>сетка</span></button>' +
        '</header>' +
        '<div class="grid" data-ggrid></div>' +
        '<p class="gpanel__empty mono" data-gempty hidden>в этой группе пока пусто</p>' +
      '</div>';
  }

  function fillGroupGrid(panel, gid) {
    var list = S.itemsOfGroup(gid);
    if (groupCat !== 'all') list = list.filter(function (it) { return it.cat === groupCat; });
    var grid = $('[data-ggrid]', panel);
    $('[data-gempty]', panel).hidden = list.length > 0;
    renderCards(grid, list, true);
  }

  /* Свайп вниз за полоску-ручку закрывает группу. Работает и пальцем,
     и мышью: pointer-события одинаковы, а touch-action:none на ручке не
     даёт странице прокручиваться под пальцем во время перетаскивания. */
  function wireGrabToClose(panel) {
    var handle = $('[data-ghandle]', panel);
    var inner = $('.gpanel__inner', panel);
    var startX = 0, startY = 0, dy = 0, startT = 0;
    var armed = false, dragging = false, moved = false;

    /* После протягивания браузер может добить тапом по карточке под пальцем —
       гасим такой клик в фазе перехвата, пока не улеглось. */
    panel.addEventListener('click', function (e) {
      if (!moved) return;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    function scrim() { return $('.gsheet__scrim'); }
    function height() { return panel.getBoundingClientRect().height || 1; }

    /* Тянуть можно за что угодно, но пока содержимое прокручено — жест
       достаётся прокрутке. Ручка тянет всегда, даже из середины списка. */
    function begin(x, y, viaHandle) {
      startX = x; startY = y; dy = 0; startT = Date.now();
      armed = viaHandle || !inner || inner.scrollTop <= 0;
      dragging = !!viaHandle;
      if (dragging) panel.classList.add('is-dragging');
    }

    function move(x, y) {
      if (!armed) return false;
      var d = y - startY, dx = x - startX;
      if (!dragging) {
        // порог: вниз и вертикально, иначе это прокрутка или свайп вбок
        if (d > 10 && Math.abs(d) > Math.abs(dx)) {
          dragging = true;
          panel.classList.add('is-dragging');
        } else {
          if (d < -4 || Math.abs(dx) > 12) armed = false;
          return false;
        }
      }
      dy = Math.max(0, d);
      if (dy > 6) moved = true;
      panel.style.transform = 'translateY(' + dy + 'px)';
      var s = scrim();
      if (s) s.style.opacity = Math.max(0, 1 - dy / (height() * 0.9));
      return true;
    }

    function release() {
      armed = false;
      if (moved) setTimeout(function () { moved = false; }, 350);
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('is-dragging');
      var speed = dy / Math.max(1, Date.now() - startT);      // px/мс
      var s = scrim();
      // либо утащили заметно вниз, либо резко смахнули — но не на пару пикселей
      if (dy > height() * 0.26 || (speed > 0.55 && dy > 60)) {
        // закрываем: сначала снимаем is-up, и только потом отпускаем
        // инлайновый transform — иначе панель прыгнула бы вверх и поехала вниз
        closeGroup();
        requestAnimationFrame(function () {
          panel.style.transform = '';
          if (s) s.style.opacity = '';
        });
      } else {
        panel.style.transform = '';
        if (s) s.style.opacity = '';
      }
    }

    /* --- палец: слушаем всю панель, прокрутку перехватываем только
           когда жест уже опознан как «тянем вниз» --- */
    panel.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      begin(t.clientX, t.clientY, !!(handle && handle.contains(e.target)));
    }, { passive: true });

    panel.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      if (move(t.clientX, t.clientY)) e.preventDefault();
    }, { passive: false });

    panel.addEventListener('touchend', release);
    panel.addEventListener('touchcancel', release);

    /* --- мышь: только за полоску-ручку, иначе мешали бы выделение и клики --- */
    if (handle && window.PointerEvent) {
      handle.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch' || e.button) return;
        begin(e.clientX, e.clientY, true);
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      });
      handle.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        move(e.clientX, e.clientY);
      });
      handle.addEventListener('pointerup', function (e) {
        if (e.pointerType === 'touch') return;
        release();
      });
      handle.addEventListener('pointercancel', function (e) {
        if (e.pointerType === 'touch') return;
        release();
      });
    }
  }

  function openGroup(gid) {
    var g = S.group(gid);
    if (!g) return;
    if (currentGroup === gid) return;

    var wasOpen = !!currentGroup;
    currentGroup = gid;
    groupCat = 'all';

    var sheet = $('#gsheet');
    if (!$('.gsheet__scrim', sheet)) {
      var scrim = document.createElement('div');
      scrim.className = 'gsheet__scrim';
      scrim.addEventListener('click', closeGroup);
      sheet.insertBefore(scrim, sheet.firstChild);
    }

    var stack = $('#gsheetStack');
    var old = $$('.gpanel', stack);
    var panel = document.createElement('section');
    panel.className = 'gpanel';
    panel.dataset.g = gid;
    panel.innerHTML = groupPanelHTML(g);
    stack.appendChild(panel);

    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    if (!wasOpen) lockScroll(true);
    body.classList.add('is-gsheet');

    // reflow, иначе браузер склеит начальное и конечное состояние
    void panel.offsetWidth;
    panel.classList.add('is-up');
    old.forEach(function (p) {
      p.classList.add('is-under');
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 700);
    });

    fillGroupGrid(panel, gid);
    wireGrabToClose(panel);

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-gclose]')) { closeGroup(); return; }
      if (e.target.closest('[data-cardmode]')) { toggleCards(); return; }
      var sb = e.target.closest('[data-sub]');
      if (sb) {
        groupCat = sb.dataset.sub;
        $$('[data-sub]', panel).forEach(function (x) { x.classList.toggle('is-on', x === sb); });
        fillGroupGrid(panel, gid);
      }
    });

    renderFilters();
    if (location.hash !== '#/g/' + gid) history.replaceState(null, '', '#/g/' + gid);
  }

  function closeGroup(silent) {
    if (!currentGroup) return;
    currentGroup = null;
    var sheet = $('#gsheet');
    var panels = $$('.gpanel', $('#gsheetStack'));
    panels.forEach(function (p) { p.classList.remove('is-up'); });
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    body.classList.remove('is-gsheet');
    lockScroll(false);
    setTimeout(function () {
      var stack = $('#gsheetStack');
      if (!currentGroup && stack) stack.innerHTML = '';
    }, 780);
    renderFilters();
    if (!silent && location.hash.indexOf('#/g/') === 0) history.replaceState(null, '', '#/');
  }

  /* ---------------- карточка работы ---------------- */
  /* ------------------------------------------------------------
     Кадры внутри карточки работы: миниатюры, листание вбок и высота
     рамки по пропорциям снимка. Состояние держим здесь, а не внутри
     openProduct: до него дотягиваются и жест, и клавиши.
     ------------------------------------------------------------ */
  var sheetCar = null;

  /* ============================================================
     ЛЕНТА КАДРОВ
     Кадры лежат в строку на одной дорожке, дорожка едет за пальцем и
     доводится до ближайшего кадра — так же, как листается плёнка в
     телефоне. Раньше кадры лежали стопкой и перекрашивались
     прозрачностью: пальцем это не читалось как листание.
     Одна и та же механика в карточке работы и в услуге.
     ============================================================ */
  function makeCarousel(viewport, opts) {
    var o = opts || {};
    var track = document.createElement('div');
    track.className = 'track';
    viewport.appendChild(track);

    var nodes = [];         // сами <img>/<video>
    var at = 0;
    var swiped = false;

    // жест
    var live = false, decided = '', x0 = 0, y0 = 0, dx = 0;
    var lastX = 0, lastT = 0, vx = 0, pid = null;

    function width() { return viewport.clientWidth || 1; }
    function place(px, ease) {
      track.style.transition = ease ? 'transform .42s cubic-bezier(.22,.61,.36,1)' : 'none';
      track.style.transform = 'translate3d(' + px.toFixed(2) + 'px,0,0)';
    }
    function settle(ease) { place(-at * width(), ease !== false); }

    function go(i, ease) {
      var n = nodes.length; if (!n) return;
      at = Math.max(0, Math.min(n - 1, i));
      nodes.forEach(function (x, k) {
        x.classList.toggle('is-on', k === at);
        if (k !== at && x.pause) x.pause();
      });
      settle(ease);
      if (o.onChange) o.onChange(at);
    }
    function step(d) { go(at + d); }

    function endDrag(commit) {
      if (!live) return;
      live = false;
      viewport.classList.remove('is-dragging');
      if (pid !== null) { try { viewport.releasePointerCapture(pid); } catch (e) {} pid = null; }
      var moved = decided === 'x' && commit;
      decided = '';
      if (!moved || nodes.length < 2) { settle(); dx = 0; return; }
      swiped = Math.abs(dx) > 8;
      // порог — либо треть кадра, либо быстрый бросок
      var far = Math.abs(dx) > width() * 0.28 || Math.abs(vx) > 0.45;
      if (far) go(at + (dx < 0 ? 1 : -1)); else settle();
      dx = 0;
    }

    viewport.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      // метку протяжки снимаем здесь, а не в клике: если браузер
      // после жеста клик не пришлёт, она бы съела следующее касание
      swiped = false;
      if (nodes.length < 2) return;
      live = true; decided = ''; dx = 0; vx = 0;
      x0 = lastX = e.clientX; y0 = e.clientY; lastT = e.timeStamp || Date.now();
      pid = e.pointerId;
    });

    viewport.addEventListener('pointermove', function (e) {
      if (!live) return;
      var mx = e.clientX - x0, my = e.clientY - y0;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        // вертикаль отдаём странице: иначе карточку не прокрутить
        // пальцем по самому снимку
        decided = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
        if (decided === 'y') { live = false; settle(); return; }
        try { viewport.setPointerCapture(pid); } catch (err) {}
        viewport.classList.add('is-dragging');
      }
      var t = e.timeStamp || Date.now();
      if (t > lastT) vx = (e.clientX - lastX) / (t - lastT);
      lastX = e.clientX; lastT = t;
      dx = mx;
      // у краёв дорожка тянется вязко, а не улетает в пустоту
      var edge = (at === 0 && dx > 0) || (at === nodes.length - 1 && dx < 0);
      place(-at * width() + (edge ? dx * 0.3 : dx), false);
    });

    viewport.addEventListener('pointerup', function () { endDrag(true); });
    viewport.addEventListener('pointercancel', function () { endDrag(false); });

    return {
      /* Кадр кладём в свою ячейку: раньше кадры лежали друг на друге,
         и прозрачный перехватывал клики у видимого. */
      add: function (node) {
        var cell = document.createElement('div');
        cell.className = 'slide';
        cell.appendChild(node);
        track.appendChild(cell);
        nodes.push(node);
        return cell;
      },
      go: go,
      step: step,
      at: function () { return at; },
      count: function () { return nodes.length; },
      node: function (i) { return nodes[i]; },
      active: function () { return nodes[at]; },
      swiped: function () { return swiped; },
      resize: function () { settle(false); }
    };
  }

  /* Пропорция рамки на телефоне: кадр ложится от края до края, а не
     тонет в полях по бокам. Совсем вытянутые снимки подрезаем — иначе
     один кадр занял бы весь экран и до текста пришлось бы скроллить. */
  var AR_MIN = 0.62, AR_MAX = 1.9;
  function frameRatio(node) {
    if (!node) return 0;
    var w = node.naturalWidth || node.videoWidth || 0;
    var h = node.naturalHeight || node.videoHeight || 0;
    if (!w || !h) return 0;
    return Math.max(AR_MIN, Math.min(AR_MAX, w / h));
  }

  /* Высота рамки задаётся пикселями, а не aspect-ratio: пропорцию
     браузер не анимирует, и при листании рамка прыгала бы рывком. */
  function fitFrame(viewport, node) {
    var r = frameRatio(node);
    if (!r) return;
    viewport.style.setProperty('--sheet-ar', r.toFixed(4) + ' / 1');
    // ширину берём у родителя: у самой рамки она может быть выведена из
    // пропорции, и тогда высота считалась бы от собственной же высоты
    var host = viewport.parentNode;
    var w = (host && host.clientWidth) || viewport.clientWidth || 0;
    if (w) viewport.style.setProperty('--sheet-h', Math.round(w / r) + 'px');
  }

  function applyRatio() {
    if (sheetCar) fitFrame($('#prodImgWrap'), sheetCar.active());
  }

  function show(i) {
    if (sheetCar) sheetCar.go(i);
  }

  function openProduct(id) {
    var it = S.state.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    currentItem = it;
    // никакого перехода: панель просто выезжает сбоку поверх витрины
    fillProduct(it);
  }

  function fillProduct(it) {
    $('#prodCat').textContent = String(S.catName(it.cat)).toLowerCase();
    $('#prodTitle').textContent = it.title;
    $('#prodPrice').innerHTML = (it.old ? '<s style="opacity:.45;font-size:.68em">' + S.money(it.old) + '</s> ' : '') + S.money(it.price);
    var stEl = $('#prodStatus');
    stEl.textContent = S.statusLabel(it.status);
    stEl.className = 'mono st st--' + (it.status || 'available');
    $('#prodDesc').innerHTML = it.desc || '';
    $('#prodSpecs').innerHTML = (it.specs || []).map(function (s) {
      return '<li><span>' + esc(s[0]) + '</span><b>' + esc(s[1]) + '</b></li>';
    }).join('');

    var buyB = $('#buyBtn');
    buyB.disabled = it.status === 'sold';
    $('.cta__label', buyB).textContent = it.status === 'sold' ? 'продано' :
      it.status === 'order' ? 'заказать в telegram' : 'купить в telegram';

    var refs = (it.images && it.images.length) ? it.images : [null];
    var wrap = $('#prodImgWrap'); wrap.innerHTML = '';
    var thumbs = $('#prodThumbs'); thumbs.innerHTML = '';
    wrap.style.removeProperty('--sheet-ar');
    wrap.style.removeProperty('--sheet-h');

    var car = makeCarousel(wrap, {
      onChange: function (i) {
        var tb = $$('#prodThumbs button');
        tb.forEach(function (x, k) { x.classList.toggle('is-on', k === i); });
        if (tb[i] && tb[i].scrollIntoView) {
          tb[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        fitFrame(wrap, car.node(i));
        loadAround(i);
      }
    });
    sheetCar = car;

    /* Полные кадры подтягиваем вокруг текущего, а не все сразу: у работы
       бывает под два десятка снимков, и на телефоне это минуты ожидания
       и лишний трафик. Соседей греем заранее, чтобы листание не упиралось
       в пустую рамку. */
    var pending = [];
    function loadAround(i) {
      for (var k = i - 1; k <= i + 1; k++) {
        if (k >= 0 && k < pending.length && pending[k]) { pending[k](); pending[k] = null; }
      }
    }

    refs.forEach(function (ref, i) {
      var isVideo = ref && S.mediaKind(ref) === 'video';
      var node;

      if (isVideo) {
        node = document.createElement('video');
        node.controls = true; node.loop = true; node.playsInline = true;
        node.setAttribute('playsinline', '');
        node.preload = 'metadata';
        pending.push(function () {
          S.resolveMedia(ref).then(function (u) { if (u) node.src = u; });
        });
      } else {
        node = document.createElement('img');
        // без этого браузер начинает свой drag&drop и присылает
        // pointercancel — протяжка мышью не доживала до конца жеста
        node.draggable = false;
        node.decoding = 'async';
        pending.push(function () {
          if (!ref) { node.src = B.placeholder(it.id + it.title, 1200, 1500); return; }
          S.resolveMedia(ref).then(function (u) {
            if (u) setImg(node, u, 'view');
            else node.src = B.placeholder(it.id + i, 1200, 1500);
          });
        });
      }
      // клик по кадру — тот же полноэкранный просмотр, что и в «о мастере»
      node.addEventListener('click', function () {
        if (car.swiped()) return;                     // это была протяжка
        if (node.classList.contains('is-on')) openViewer(node, null, ref);
      });
      // как только известен настоящий размер — подгоняем высоту рамки
      node.addEventListener(isVideo ? 'loadedmetadata' : 'load', function () {
        if (car.active() === node) fitFrame(wrap, node);
      });
      car.add(node);

      if (refs.length > 1) {
        var b = document.createElement('button');
        b.className = (i === 0 ? 'is-on' : '') + (isVideo ? ' is-video' : '');
        var ti = document.createElement(isVideo ? 'video' : 'img');
        if (isVideo) { ti.muted = true; ti.preload = 'metadata'; }
        else { ti.loading = 'lazy'; ti.decoding = 'async'; }
        b.appendChild(ti);
        // лента миниатюр берёт уменьшённые копии: раньше она тянула
        // те же полноразмерные файлы, что и главный кадр
        if (ref) S.resolveMedia(ref).then(function (u) {
          if (!u) return;
          if (isVideo) ti.src = u + '#t=0.1'; else setImg(ti, u, 'thumb');
        });
        b.addEventListener('click', function () { car.go(i); });
        thumbs.appendChild(b);
      }
    });

    car.go(0, false);

    var bodyEl = $('.sheet__body');
    bodyEl.classList.remove('sheet__stagger');
    void bodyEl.offsetWidth;
    bodyEl.classList.add('sheet__stagger');
    $$('.sheet__body > *').forEach(function (el, i) { el.style.animationDelay = (0.16 + i * 0.055) + 's'; });

    if (!$('#product').classList.contains('is-open')) lockScroll(true);
    $('#product').classList.add('is-open');
    $('#product').setAttribute('aria-hidden', 'false');
  }

  function closeProduct() {
    if (!$('#product').classList.contains('is-open')) return;
    $$('#prodImgWrap video, #prodThumbs video').forEach(function (v) { v.pause(); });
    $('#product').classList.remove('is-open');
    $('#product').setAttribute('aria-hidden', 'true');
    lockScroll(false);
    currentItem = null;
  }

  /* ============================================================
     УСЛУГИ
     Отдельный раздел: не товар, а то, что делается вместе с человеком —
     аренда, занятия, турниры и уже проведённые мероприятия. У услуги
     может быть расписание слотов, а может и не быть.
     ============================================================ */
  function bookText(sv) {
    var lines = [
      'Здравствуйте! Интересует услуга с сайта:',
      '',
      '• ' + sv.title + (sv.kind ? ' (' + sv.kind + ')' : '')
    ];
    if (sv.price) lines.push('• Стоимость: ' + S.money(sv.price) + (sv.priceNote ? ' — ' + sv.priceNote : ''));
    return lines.join('\n');
  }

  function book(sv) {
    var text = bookText(sv);
    var open = function () { window.open(tgLink(), '_blank', 'noopener'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('Текст заявки скопирован — вставьте в чат'); })
        .catch(function () { toast('Открываю Telegram'); })
        .then(open, open);
    } else { toast('Открываю Telegram'); open(); }
  }

  function slotsHTML(sv) {
    if (!sv.showSlots || !(sv.slots || []).length) return '';
    return '<p class="slots__h">ближайшие слоты</p><ul class="slots">' +
      sv.slots.map(function (sl) {
        var left = sl.left === '' || sl.left === null || sl.left === undefined
          ? '' : Number(sl.left);
        var tag = left === '' ? ''
          : left > 0 ? '<em>' + left + ' ' + plural(left, 'место', 'места', 'мест') + '</em>'
                     : '<em class="is-none">мест нет</em>';
        return '<li class="slot"><b>' + esc(sl.when) + '</b>' +
          '<span>' + esc(sl.note || '') + '</span>' + tag + '</li>';
      }).join('') + '</ul>';
  }

  function renderServices() {
    var box = $('#services');
    if (!box) return;
    var list = (S.state.services || []).filter(function (x) { return !x.hidden; });
    var empty = $('#servicesEmpty');
    if (empty) empty.hidden = list.length > 0;
    box.innerHTML = '';

    list.forEach(function (sv) {
      var el = document.createElement('article');
      el.className = 'svc';
      var st = sv.status || 'open';
      var refs = (sv.images || []).filter(Boolean);

      el.innerHTML =
        '<div>' +
          '<div class="svc__media' + (refs.length ? '' : ' is-empty') + '"></div>' +
          '<div class="svc__thumbs"></div>' +
        '</div>' +
        '<div class="svc__body">' +
          (sv.kind ? '<p class="svc__kicker">' + esc(sv.kind) + '</p>' : '') +
          '<h3 class="svc__title">' + esc(sv.title) + '</h3>' +
          '<div class="svc__price">' +
            (sv.price ? '<span>' + S.money(sv.price) + '</span>' : '<span>по запросу</span>') +
            '<span class="st st--' + st + '">' + S.serviceLabel(st) + '</span>' +
          '</div>' +
          (sv.priceNote ? '<p class="svc__note">' + esc(sv.priceNote) + '</p>' : '') +
          '<div class="prose svc__desc">' + (sv.desc || '') + '</div>' +
          ((sv.specs || []).length
            ? '<ul class="specs mono">' + sv.specs.map(function (x) {
                return '<li><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></li>';
              }).join('') + '</ul>'
            : '') +
          slotsHTML(sv) +
          (st === 'closed' ? ''
            : '<button class="cta" data-book><span>' +
              (st === 'order' ? 'обсудить в telegram' : 'записаться в telegram') +
              '</span><svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M4 12h16m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
              '</svg></button>') +
        '</div>';

      if (refs.length) {
        /* Кадры услуги листаются той же лентой, что и кадры работы. */
        var media = $('.svc__media', el);
        var thumbs = $('.svc__thumbs', el);
        var scar = makeCarousel(media, {
          onChange: function (i) {
            $$('button', thumbs).forEach(function (b, k) { b.classList.toggle('is-on', k === i); });
            fitFrame(media, scar.node(i));
            svcLoad(i);
          }
        });

        var svcPending = [];
        function svcLoad(i) {
          for (var k = i - 1; k <= i + 1; k++) {
            if (k >= 0 && k < svcPending.length && svcPending[k]) { svcPending[k](); svcPending[k] = null; }
          }
        }

        refs.forEach(function (ref, i) {
          var isVideo = S.mediaKind(ref) === 'video';
          var node = document.createElement(isVideo ? 'video' : 'img');
          if (isVideo) {
            node.muted = true; node.loop = true; node.playsInline = true;
            node.setAttribute('playsinline', ''); node.controls = true;
            node.preload = 'metadata';
          } else { node.alt = sv.title; node.decoding = 'async'; node.draggable = false; }
          svcPending.push(function () {
            S.resolveMedia(ref).then(function (u) {
              if (!u) return;
              if (isVideo) node.src = u + '#t=0.1'; else setImg(node, u, 'view');
            });
          });
          // клик по кадру — тот же полноэкранный просмотр, что и у работ
          if (!isVideo) node.addEventListener('click', function () {
            if (scar.swiped()) return;                   // это была протяжка
            if (node.classList.contains('is-on')) openViewer(node, null, ref);
          });
          node.addEventListener(isVideo ? 'loadedmetadata' : 'load', function () {
            if (scar.active() === node) fitFrame(media, node);
          });
          scar.add(node);

          if (refs.length > 1) {
            var b = document.createElement('button');
            b.setAttribute('aria-label', 'кадр ' + (i + 1));
            var ti = document.createElement(isVideo ? 'video' : 'img');
            if (isVideo) { ti.muted = true; ti.preload = 'metadata'; }
            else { ti.loading = 'lazy'; ti.decoding = 'async'; }
            S.resolveMedia(ref).then(function (u) {
              if (!u) return;
              if (isVideo) ti.src = u + '#t=0.1'; else setImg(ti, u, 'thumb');
            });
            b.appendChild(ti);
            b.addEventListener('click', function () { scar.go(i); });
            thumbs.appendChild(b);
          }
        });

        scar.go(0, false);
      } else {
        // без фотографии колонка слева пустовала — кладём ту же
        // сгенерированную ботанику, что и у работ без снимков
        var ph = document.createElement('img');
        ph.alt = '';
        ph.src = B.placeholder(sv.id + sv.title, 900, 675);
        $('.svc__media', el).appendChild(ph);
      }

      var cta = $('[data-book]', el);
      if (cta) cta.addEventListener('click', function () { book(sv); });
      box.appendChild(el);
    });
  }

  /* ============================================================
     «О МАСТЕРЕ»: живая лента фотографий
     Снимки не анимируются ключевыми кадрами, а плавают: у каждого своя
     скорость, они отталкиваются от бортов, обходят центральный кадр и
     разбегаются от того снимка, на который навели курсор. На телефоне
     тап разворачивает кадр по центру экрана, остальные плывут дальше.
     ============================================================ */
  var driftRAF = 0;
  var driftTiles = [];
  var driftBox = null;
  var driftHover = null;
  var driftFocus = null;
  var driftScrim = null;
  var driftZoom = null;
  var hoverT = 0;
  var focusClosedAt = 0;

  var REP_R = 250;    // радиус «испуга», px
  var REP_F = 2000;   // сила отталкивания
  var SEP = 520;      // насколько кадры расталкивают друг друга
  var WANDER = 16;    // насколько сильно кадр сам меняет курс
  var VMAX = 520;

  function driftActive() {
    var v = $('.view[data-view="about"]');
    return v && v.classList.contains('is-active');
  }
  function touchLayout() {
    return window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }

  /* раскладка — про ширину окна, а это про то, чем по экрану водят */
  function coarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function stopDrift() {
    if (driftRAF) cancelAnimationFrame(driftRAF);
    driftRAF = 0;
    driftTiles = [];
    driftHover = null;
    closeFocus();
  }

  function renderDrift(force) {
    var box = $('#drift');
    if (!box) return;
    stopDrift();
    if (!force && !driftActive()) { box.innerHTML = ''; return; }

    var st = S.state.settings;
    var refs = (st.aboutPhotos || []).filter(Boolean);
    box.innerHTML = '';
    driftBox = box;
    if (!refs.length) return;

    // центральный кадр: настройка панели, иначе просто один из первых
    var centerRef = refs.indexOf(st.aboutCenter) >= 0 ? st.aboutCenter : refs[Math.min(3, refs.length - 1)];

    refs.forEach(function (ref, i) {
      var isCenter = ref === centerRef;
      var isVideo = S.mediaKind(ref) === 'video';
      var d = document.createElement('figure');
      d.className = 'drift__ph' + (isCenter ? ' is-center' : '');
      d.style.margin = '0';

      var img = document.createElement(isVideo ? 'video' : 'img');
      if (isVideo) {
        img.muted = true; img.loop = true; img.playsInline = true; img.autoplay = true;
        img.setAttribute('playsinline', '');
        img.preload = 'metadata';
      } else {
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
      }
      // без этого браузер начинает своё перетаскивание картинки
      // и забирает указатель у нашего обработчика
      img.draggable = false;
      d.appendChild(img);
      box.appendChild(d);
      S.resolveMedia(ref).then(function (u) {
        if (u) img.src = u + (isVideo ? '#t=0.1' : '');
        else d.remove();
      });

      // «случайность» детерминированная: раскладка не прыгает при перерисовке
      var k = (i * 37) % 11;
      var t = {
        el: d, ref: ref, center: isCenter, i: i,
        rot: ((k % 5) - 2) * 0.8,
        ang: (i * 2.399) % 6.283,
        spin: 0.22 + (k % 5) * 0.06,
        kw: isCenter ? 0.32 : (0.198 + (k % 5) * 0.029),
        // кольца разного радиуса: на одном десять кадров вставали в
        // пробку и глушили вращение, упираясь друг в друга
        orbit: ((k % 5) - 2) * 55,
        spinDir: 130 + (k % 4) * 26,     // одно направление на всех
        x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0
      };
      driftTiles.push(t);

      d.addEventListener('pointerenter', function () {
        if (touchLayout() || driftFocus) return;
        driftHover = t;
        d.classList.add('is-near');
      });
      d.addEventListener('pointerleave', function () {
        if (driftHover === t) driftHover = null;
        d.classList.remove('is-near');
      });
      d.addEventListener('click', function () {
        if (driftFocus === t) closeFocus(); else openFocus(t);
      });
    });

    layoutDrift();
    // размеры кадров зависят от того, какая картинка загрузилась
    setTimeout(layoutDrift, 400);
    setTimeout(layoutDrift, 1400);

    if (S.state.settings.aboutDrift && !B.reducedMotion) startDrift();
    else driftTiles.forEach(place);
  }

  /* Стартовая раскладка: центральный кадр в середине, остальные — кольцом */
  function layoutDrift() {
    if (!driftBox || !driftTiles.length) return;
    var W = driftBox.clientWidth, H = driftBox.clientHeight;
    if (!W || !H) return;
    var cx = W / 2, cy = H / 2;
    var others = driftTiles.filter(function (t) { return !t.center; });
    var n = Math.max(1, others.length);
    var oi = 0;

    // за основу берём меньшую сторону: на широком и низком поле доля
    // от ширины раздувала кадры, и на сильном отдалении они ломали вёрстку
    var base = Math.min(W, H * 1.25);
    driftTiles.forEach(function (t) {
      if (t === driftFocus) return;
      var w = Math.round(base * t.kw);
      w = Math.max(96, Math.min(t.center ? 420 : 300, w));
      var el = t.el;
      el.style.width = w + 'px';
      t.w = w;
      t.h = el.offsetHeight || Math.round(w * 1.25);

      if (t.center) {
        t.x = cx - t.w / 2;
        t.y = cy - t.h / 2;
        t.vx = t.vy = 0;
      } else if (t.placed !== true) {
        var a = (oi / n) * Math.PI * 2 + 0.6;
        var rx = W * 0.36, ry = H * 0.33;
        t.x = cx + Math.cos(a) * rx - t.w / 2 + ((t.i % 3) - 1) * 12;
        t.y = cy + Math.sin(a) * ry - t.h / 2 + ((t.i % 4) - 1.5) * 12;
        t.vx = Math.cos(a + 1.6) * 22;
        t.vy = Math.sin(a + 1.6) * 22;
        t.placed = true;
        oi++;
      } else {
        oi++;
      }
      clampTile(t, W, H);
      place(t);
    });
  }

  function clampTile(t, W, H) {
    t.x = Math.max(0, Math.min(W - t.w, t.x));
    t.y = Math.max(0, Math.min(H - t.h, t.y));
  }

  function place(t) {
    t.el.style.transform = 'translate3d(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px,0) rotate(' + t.rot + 'deg)';
  }

  function startDrift() {
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepDrift(dt, now);
      driftRAF = requestAnimationFrame(frame);
    }
    driftRAF = requestAnimationFrame(frame);
  }

  function stepDrift(dt, now) {
    if (!driftBox) return;
    var W = driftBox.clientWidth, H = driftBox.clientHeight;
    if (!W || !H) return;

    var center = null, srcX = null, srcY = null;
    driftTiles.forEach(function (t) { if (t.center) center = t; });
    var from = driftFocus || driftHover;
    if (from) { srcX = from.x + from.w / 2; srcY = from.y + from.h / 2; }

    var damp = Math.exp(-1.35 * dt);

    // расталкивание соседей: без него кадры сбивались в кучу и
    // перекрывали друг друга даже на широком экране
    var n = driftTiles.length, i, j, a, b, ddx, ddy, dd, need, sf;
    for (i = 0; i < n; i++) {
      a = driftTiles[i];
      for (j = i + 1; j < n; j++) {
        b = driftTiles[j];
        var aFix = a.center || a === driftFocus;
        var bFix = b.center || b === driftFocus;
        if (aFix && bFix) continue;
        ddx = (b.x + b.w / 2) - (a.x + a.w / 2);
        ddy = (b.y + b.h / 2) - (a.y + a.h / 2);
        dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        need = (Math.min(a.w, a.h) + Math.min(b.w, b.h)) * 0.32;
        if (dd >= need) continue;
        sf = (1 - dd / need) * SEP * dt;
        if (!aFix) { a.vx -= (ddx / dd) * sf; a.vy -= (ddy / dd) * sf; }
        if (!bFix) { b.vx += (ddx / dd) * sf; b.vy += (ddy / dd) * sf; }
      }
    }

    driftTiles.forEach(function (t) {
      if (t.center) { t.x = W / 2 - t.w / 2; t.y = H / 2 - t.h / 2; place(t); return; }
      if (t === driftFocus) return;                     // раскрытый кадр стоит
      if (t === driftHover) { t.vx *= 0.88; t.vy *= 0.88; place(t); return; }

      // собственный курс, медленно поворачивающийся
      t.ang += t.spin * dt;
      t.vx += Math.cos(t.ang) * WANDER * dt;
      t.vy += Math.sin(t.ang) * WANDER * dt;

      var tx = t.x + t.w / 2, ty = t.y + t.h / 2, dx, dy, d, f;

      // разбегаемся от кадра под курсором
      if (srcX !== null) {
        dx = tx - srcX; dy = ty - srcY;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < REP_R) {
          f = (1 - d / REP_R) * REP_F;
          t.vx += (dx / d) * f * dt;
          t.vy += (dy / d) * f * dt;
        }
      }

      // кружим вокруг центрального кадра: пружина тянет к своему кольцу,
      // касательная толкает по орбите. Без этого все снимки расходились
      // к бортам и там залипали.
      if (center) {
        var ccx = center.x + center.w / 2, ccy = center.y + center.h / 2;
        dx = tx - ccx; dy = ty - ccy;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        // орбита эллиптическая: по ширине места больше, чем по высоте,
        // и круглое кольцо било кадры о верхний и нижний борта
        var kx = center.w * 0.5 + t.w * 0.26;
        var ky = center.h * 0.42 + t.h * 0.2;
        // кольцо всегда чуть снаружи зоны центрального кадра: иначе
        // «не наезжай» и «держись кольца» тянули в разные стороны и
        // кадр замирал, упираясь в борт
        // кольцо обязано уместиться в рамку: если оно выходит за верх или
        // низ, кадр каждый оборот бьётся о борт, теряет ход и застывает
        var maxRx = Math.max(30, W * 0.5 - t.w * 0.5 - 4);
        var maxRy = Math.max(30, H * 0.5 - t.h * 0.5 - 4);
        var rx = Math.min(maxRx, Math.max(kx * 1.04, W * 0.5 - t.w * 0.55 + t.orbit * 0.5));
        var ry = Math.min(maxRy, Math.max(ky, H * 0.5 - t.h * 0.55 + t.orbit * 0.35));
        var u = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)) || 0.001;
        // чем дальше кадр от кольца, тем сильнее его тянет обратно:
        // после «испуга» он возвращается в темпе, а не ползёт
        var pull = (1 - u) * (u > 1 ? 620 : 340);
        t.vx += (dx / d) * pull * dt;
        t.vy += (dy / d) * pull * dt;
        t.vx += (-dy / d) * t.spinDir * dt;
        t.vy += (dx / d) * t.spinDir * dt;

        // и всё же не наезжаем на него вплотную
        var uk = Math.sqrt((dx / kx) * (dx / kx) + (dy / ky) * (dy / ky));
        if (uk < 1) {
          f = (1 - uk) * 700;
          t.vx += (dx / d) * f * dt;
          t.vy += (dy / d) * f * dt;
        }
      }

      t.vx *= damp; t.vy *= damp;
      var sp = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
      if (sp > VMAX) { t.vx = t.vx / sp * VMAX; t.vy = t.vy / sp * VMAX; }

      t.x += t.vx * dt;
      t.y += t.vy * dt;

      // борта: мягкий отскок
      if (t.x < 0) { t.x = 0; t.vx = Math.abs(t.vx) * 0.7; }
      if (t.y < 0) { t.y = 0; t.vy = Math.abs(t.vy) * 0.7; }
      if (t.x > W - t.w) { t.x = W - t.w; t.vx = -Math.abs(t.vx) * 0.7; }
      if (t.y > H - t.h) { t.y = H - t.h; t.vy = -Math.abs(t.vy) * 0.7; }

      place(t);
    });
  }

  /* ============================================================
     ПРОСМОТР КАДРА ВО ВЕСЬ ЭКРАН
     Одинаково работает и для ленты «о мастере», и для фотографий
     работы: снимок вписывается целиком, щипком или двойным касанием
     приближается, в увеличенном виде таскается пальцем.
     Слой живёт прямо в <body> — внутри секции затемнение перекрывало бы
     сам кадр, а fixed считался бы от анимированного предка.
     ============================================================ */
  var viewerEl = null, viewerImg = null, viewerClose = null;

  function openViewer(srcNode, onClose, fullRef) {
    closeViewer();
    viewerClose = onClose || null;

    if (!driftScrim) {
      driftScrim = document.createElement('div');
      driftScrim.className = 'drift__scrim';
      driftScrim.addEventListener('click', closeViewer);
      document.body.appendChild(driftScrim);
    }
    driftScrim.classList.add('is-on');

    var isVideo = srcNode && srcNode.tagName === 'VIDEO';
    viewerEl = document.createElement('div');
    viewerEl.className = 'drift__zoom';

    var big;
    if (isVideo) {
      big = document.createElement('video');
      big.muted = true; big.loop = true; big.autoplay = true;
      big.playsInline = true; big.setAttribute('playsinline', '');
      big.controls = true;
    } else {
      big = document.createElement('img');
      big.alt = '';
    }
    if (srcNode) big.src = srcNode.currentSrc || srcNode.src;
    /* Оригинал во всю величину тянем только здесь: в ленте достаточно
       уменьшённой копии, а полный файл нужен, лишь когда кадр раскрыли
       и его можно приблизить. Показываем сперва то, что уже загружено,
       и подменяем, когда оригинал доедет. */
    if (!isVideo && fullRef) {
      S.resolveMedia(fullRef).then(function (u) {
        if (!u || viewerImg !== big) return;
        var full = new Image();
        full.onload = function () { if (viewerImg === big) big.src = u; };
        full.src = u;
      });
    }
    viewerImg = big;
    viewerEl.appendChild(big);

    var x = document.createElement('button');
    x.className = 'drift__zoomclose';
    x.setAttribute('aria-label', 'Закрыть');
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', function (e) { e.stopPropagation(); closeViewer(); });
    viewerEl.appendChild(x);

    if (!isVideo) {
      var hint = document.createElement('p');
      hint.className = 'drift__zoomhint';
      // подсказка идёт по устройству ввода, а не по ширине окна: в узком
      // окне на десктопе мышью щипок не сделать, а двойной клик работает
      hint.textContent = coarsePointer() ? 'двойное касание или щипок — приблизить'
                                         : 'двойной клик — приблизить';
      viewerEl.appendChild(hint);
      wireZoom(viewerEl, big);
    }

    viewerEl.addEventListener('click', function (e) {
      if (e.target === viewerEl) closeViewer();
    });
    document.body.appendChild(viewerEl);
    lockScroll(true);
    driftZoom = viewerEl;
  }

  function closeViewer() {
    if (viewerEl) {
      if (viewerEl.parentNode) viewerEl.parentNode.removeChild(viewerEl);
      viewerEl = null; viewerImg = null; driftZoom = null;
      lockScroll(false);
    }
    if (driftScrim) driftScrim.classList.remove('is-on');
    var cb = viewerClose; viewerClose = null;
    if (cb) cb();
  }

  /* щипок, двойное касание и перетаскивание увеличенного кадра */
  function wireZoom(box, img) {
    var scale = 1, tx = 0, ty = 0;
    var pts = {}, startDist = 0, startScale = 1, startX = 0, startY = 0, panX = 0, panY = 0;
    var lastTap = 0;

    function paint() {
      var lim = Math.max(0, (scale - 1) * 0.5);
      var w = box.clientWidth || 1, h = img.clientHeight || 1;
      tx = Math.max(-w * lim, Math.min(w * lim, tx));
      ty = Math.max(-h * lim, Math.min(h * lim, ty));
      img.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
      box.classList.toggle('is-zoomed', scale > 1.02);
    }
    function reset() { scale = 1; tx = 0; ty = 0; paint(); }

    function grab(x, y) { startX = x; startY = y; panX = tx; panY = ty; }
    function toggle() { scale = scale > 1.02 ? 1 : 2.4; tx = ty = 0; paint(); }

    box.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        startScale = scale;
      } else if (ids.length === 1) {
        grab(e.clientX, e.clientY);
        // двойное касание считаем сами, но только для пальца: мышь
        // присылает ещё и dblclick, и приближение тут же откатывалось
        if (e.pointerType === 'touch') {
          var now = Date.now();
          // после срабатывания счётчик обнуляем: иначе третье касание
          // подряд снова читалось бы как двойное и гасило приближение
          if (now - lastTap < 320) { toggle(); lastTap = 0; }
          else lastTap = now;
        }
      }
      box.classList.add('is-panning');
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
    });

    box.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        scale = Math.max(1, Math.min(4, startScale * (d / startDist)));
        paint();
      } else if (scale > 1.02) {
        tx = panX + (e.clientX - startX);
        ty = panY + (e.clientY - startY);
        paint();
      }
    });

    function up(e) {
      delete pts[e.pointerId];
      var rest = Object.keys(pts);
      // палец, оставшийся после щипка, продолжает таскать кадр — но от
      // своего места, иначе снимок прыгнул бы к точке начала жеста
      if (rest.length === 1) grab(pts[rest[0]].x, pts[rest[0]].y);
      if (!rest.length) box.classList.remove('is-panning');
    }
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('dblclick', toggle);
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      scale = Math.max(1, Math.min(4, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (scale <= 1.02) { tx = ty = 0; }
      paint();
    }, { passive: false });

    reset();
  }

  /* ---- лента «о мастере»: кадр разворачивается по клику ---- */
  function openFocus(t) {
    closeFocus();
    driftFocus = t;
    t.el.classList.add('is-dim');
    openViewer($('img,video', t.el), function () {
      if (driftFocus) {
        driftFocus.el.classList.remove('is-dim');
        driftFocus = null;
        focusClosedAt = Date.now();
      }
    });
  }

  function closeFocus() {
    clearTimeout(hoverT);
    if (viewerEl) { closeViewer(); return; }
    if (driftFocus) {
      driftFocus.el.classList.remove('is-dim');
      driftFocus = null;
      focusClosedAt = Date.now();
    }
    if (driftScrim) driftScrim.classList.remove('is-on');
  }

  var lastW = window.innerWidth, reflowT = 0;
  window.addEventListener('resize', function () {
    if (!driftTiles.length) { lastW = window.innerWidth; return; }
    if (Math.abs(window.innerWidth - lastW) < 2) return;   // менялась только высота
    lastW = window.innerWidth;
    clearTimeout(reflowT);
    reflowT = setTimeout(layoutDrift, 120);
  });

  /* ---------------- разделы ---------------- */
  function currentRoute() {
    var h = location.hash || '';
    if (h.indexOf('#/') !== 0) return null;       // «#shelf» и подобное — якоря, не маршруты
    var name = h.slice(2);
    if (name.indexOf('g/') === 0) return 'home';
    if (name === '') return 'home';
    if (name === 'about' || name === 'contacts' || name === 'services') return name;
    return 'home';
  }
  function hashGroup() {
    var h = location.hash || '';
    return h.indexOf('#/g/') === 0 ? h.slice(4) : null;
  }

  function route(name, silent) {
    var views = $$('.view');
    var target = views.filter(function (v) { return v.dataset.view === name; })[0] || views[0];
    var apply = function () {
      views.forEach(function (v) { v.classList.toggle('is-active', v === target); });
      $$('.nav__links a').forEach(function (a) { a.classList.toggle('is-active', a.dataset.route === name); });
      window.scrollTo(0, 0);
      // ботанику героя перерисовываем при возврате: пока раздел был скрыт,
      // холст мог остаться нулевого размера
      if (name === 'home') { renderGrid(true); if (hero) hero.redraw(); }
      if (name === 'about') renderDrift(true);
      if (name === 'services') renderServices();
    };
    if (silent) { apply(); return; }
    wiper.run(Math.random() * 999, 1150, apply);
  }

  /* ---------------- загрузка ---------------- */
  function boot() {
    applyCardsMode(cardsMode());
    applySettings();
    renderFilters();
    renderGrid(false);
    route(currentRoute() || 'home', true);

    // опубликованное содержимое приезжает уже после первой отрисовки,
    // чтобы заставка не ждала сеть
    S.hydrate().then(function (r) {
      if (r && r.changed) { applySettings(); renderFilters(); renderGrid(false); renderDrift(); }
      var g = hashGroup();
      if (g) setTimeout(function () { openGroup(g); }, 300);
    });

    wiper = B.wipe($('#wipe-canvas'));
    hero = B.heroBotany($('#hero-botany'), {});
    pre = B.preloader($('#fern-canvas'), { density: S.state.settings.density });

    var minMs = B.reducedMotion ? 350 : (S.state.settings.preloaderMs || 2200);
    var t0 = performance.now();
    var assetsReady = false;
    var fill = $('#loadFill'), num = $('#loadNum');

    Promise.all([
      new Promise(function (r) {
        if (document.readyState === 'complete') r();
        else window.addEventListener('load', r, { once: true });
      }),
      (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()
    ]).then(function () { assetsReady = true; }, function () { assetsReady = true; });

    var started = false;
    function once() { if (!started) { started = true; startReveal(); } }

    (function tick() {
      var timeT = Math.min(1, (performance.now() - t0) / minMs);
      var p = assetsReady ? timeT : Math.min(timeT, 0.84);
      pre.set(p);
      fill.style.width = (p * 100).toFixed(1) + '%';
      num.textContent = p >= 1 ? '100' : ('0' + Math.floor(p * 100)).slice(-2);
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(once, 200);
    })();

    // страховка, если вкладка ушла в фон и rAF замер
    setTimeout(once, minMs + 1500);

    // последний рубеж: что бы ни случилось со сценой загрузки, страница
    // не должна остаться пустой
    setTimeout(function () {
      if (body.dataset.phase !== 'live') {
        revealed = true;
        body.dataset.phase = 'live';
        var el = $('#preloader');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    }, minMs + 6000);
  }

  var revealed = false;
  function startReveal() {
    body.dataset.phase = 'reveal';
    pre.reveal(function () {
      if (revealed) return;
      revealed = true;
      body.dataset.phase = 'live';
      pre.destroy();
      var el = $('#preloader');
      if (el && el.parentNode) setTimeout(function () { el.parentNode.removeChild(el); }, 900);
      setTimeout(function () { renderGrid(true); }, 200);
    });
  }

  /* ---------------- события ---------------- */
  function wire() {
    $('#prodClose').addEventListener('click', closeProduct);
    $('.sheet__scrim').addEventListener('click', closeProduct);
    $('#buyBtn').addEventListener('click', function () { if (currentItem) buy(currentItem); });

    // Escape закрывает по одному слою: сначала карточка, потом группа
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          !viewerEl && sheetCar && sheetCar.count() > 1 &&
          $('#product').classList.contains('is-open')) {
        sheetCar.step(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (e.key !== 'Escape') return;
      if (viewerEl) { closeViewer(); return; }
      if (driftFocus) { closeFocus(); return; }
      if ($('#product').classList.contains('is-open')) { closeProduct(); return; }
      if (currentGroup) closeGroup();
    });

    $$('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        closeGroup(true);
        var href = a.getAttribute('href');
        if (location.hash !== href) location.hash = href;
        else route(currentRoute() || 'home');
        setMenu(false);
      });
    });
    window.addEventListener('hashchange', function () {
      var g = hashGroup();
      if (g) { openGroup(g); return; }
      var r = currentRoute();
      if (r) { closeGroup(true); route(r); }
    });

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cardmode]');
      if (b && !b.closest('.gpanel')) toggleCards();
    });

    $('#burger').addEventListener('click', function () {
      setMenu(!$('#topbar').classList.contains('is-menu'));
    });

    window.addEventListener('scroll', function () {
      $('#topbar').classList.toggle('is-solid', (window.scrollY || 0) > 20);
    }, { passive: true });
  }

  function setMenu(on) {
    $('#topbar').classList.toggle('is-menu', on);
    $('#burger').setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  /* ---------------- публичное ---------------- */
  NS.ui = {
    applySettings: applySettings,
    refresh: function () {
      applySettings();
      renderFilters();
      renderGrid(false);
      renderDrift();
      renderServices();
      var panel = $('.gpanel');
      if (panel && currentGroup) fillGroupGrid(panel, currentGroup);
      if (hero) hero.redraw();
    },
    openGroup: openGroup,
    closeGroup: closeGroup,
    renderServices: renderServices,
    openProduct: openProduct,
    lockScroll: lockScroll,
    cardHTML: cardHTML,
    setCardImage: setCardImage,
    statusPill: statusPill,
    toast: toast
  };

  wire();
  boot();
})(window.FHh);
