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

    var n = S.state.items.filter(function (i) { return !i.hidden; }).length;
    $('#heroCount').textContent = n + ' ' + plural(n, 'работа', 'работы', 'работ') + ' в витрине';

    paintMarks();
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

  /* Подложка под вырезанное изображение: та же сгенерированная ботаника,
     что показывается у работ без фото. Иначе PNG с прозрачным фоном висел бы
     на голой бумаге. */
  function backdrop(el, it, w, h) {
    el.classList.add('is-cutout');
    el.style.backgroundImage = 'url("' + B.placeholder(it.id + it.title, w, h) + '")';
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
      node.src = u || B.placeholder(it.id + it.title, 720, 900);
    });
    S.hasAlpha(ref).then(function (yes) { if (yes) backdrop(node, it, 720, 900); });
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
  var sheetNodes = [], sheetAt = 0, sheetSwiped = false;

  /* Высота рамки на телефоне считается из этой доли: кадр тогда
     ложится от края до края, не уменьшаясь и не оставляя полей. */
  function applyRatio() {
    var n = sheetNodes[sheetAt];
    if (!n) return;
    var w = n.naturalWidth || n.videoWidth || 0;
    var h = n.naturalHeight || n.videoHeight || 0;
    if (w && h) $('#prodImgWrap').style.setProperty('--sheet-ar', w + ' / ' + h);
  }

  function show(i) {
    if (!sheetNodes.length) return;
    var n = sheetNodes.length;
    sheetAt = ((i % n) + n) % n;
    sheetNodes.forEach(function (x, k) {
      x.classList.toggle('is-on', k === sheetAt);
      if (k !== sheetAt && x.pause) x.pause();
    });
    var tb = $$('#prodThumbs button');
    tb.forEach(function (x, k) { x.classList.toggle('is-on', k === sheetAt); });
    if (tb[sheetAt] && tb[sheetAt].scrollIntoView) {
      tb[sheetAt].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    applyRatio();
  }

  /* Жест вбок переключает кадр. Вертикаль отдаём странице, иначе
     карточку нельзя было бы прокрутить пальцем по самому снимку;
     после протяжки гасим клик, чтобы не открылся полный просмотр. */
  function wireSwipe(box) {
    if (box.dataset.swipe) return;
    box.dataset.swipe = '1';
    var x0 = 0, y0 = 0, live = false;

    box.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      // метку протяжки снимаем здесь, а не в клике: если браузер
      // после жеста клик не пришлёт, она бы съела следующее касание
      sheetSwiped = false;
      x0 = e.clientX; y0 = e.clientY; live = true;
    });
    box.addEventListener('pointerup', function (e) {
      if (!live) return;
      live = false;
      if (sheetNodes.length < 2) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      sheetSwiped = true;
      show(sheetAt + (dx < 0 ? 1 : -1));
    });
    box.addEventListener('pointercancel', function () { live = false; });
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
    sheetNodes = []; sheetAt = 0;
    wrap.style.removeProperty('--sheet-ar');

    refs.forEach(function (ref, i) {
      var isVideo = ref && S.mediaKind(ref) === 'video';
      var node;

      if (isVideo) {
        node = document.createElement('video');
        node.controls = true; node.loop = true; node.playsInline = true;
        node.setAttribute('playsinline', '');
        node.preload = 'metadata';
        S.resolveMedia(ref).then(function (u) {
          if (u) node.src = u;
          if (i === 0) requestAnimationFrame(function () { node.classList.add('is-on'); });
        });
      } else {
        node = document.createElement('img');
        var set = function (u) {
          node.src = u;
          if (i === 0) requestAnimationFrame(function () { node.classList.add('is-on'); });
        };
        if (ref) {
          S.resolveMedia(ref).then(function (u) { set(u || B.placeholder(it.id + i, 1200, 1500)); });
          S.hasAlpha(ref).then(function (yes) { if (yes) backdrop(node, it, 1200, 1500); });
        } else {
          set(B.placeholder(it.id + it.title, 1200, 1500));
        }
      }
      // клик по кадру — тот же полноэкранный просмотр, что и в «о мастере»
      node.addEventListener('click', function () {
        if (sheetSwiped) return;                      // это была протяжка
        if (node.classList.contains('is-on')) openViewer(node);
      });
      // как только известен настоящий размер — подгоняем высоту рамки
      node.addEventListener(isVideo ? 'loadedmetadata' : 'load', function () {
        if (sheetNodes[sheetAt] === node) applyRatio();
      });
      if (!isVideo && node.complete && node.naturalWidth) applyRatio();
      sheetNodes.push(node);
      wrap.appendChild(node);

      if (refs.length > 1) {
        var b = document.createElement('button');
        b.className = (i === 0 ? 'is-on' : '') + (isVideo ? ' is-video' : '');
        var ti = document.createElement(isVideo ? 'video' : 'img');
        if (isVideo) { ti.muted = true; ti.preload = 'metadata'; }
        b.appendChild(ti);
        if (ref) S.resolveMedia(ref).then(function (u) { ti.src = u + (isVideo ? '#t=0.1' : ''); });
        else ti.src = node.src;
        b.addEventListener('click', function () { show(i); });
        thumbs.appendChild(b);
      }
    });

    applyRatio();
    wireSwipe(wrap);

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
        var media = $('.svc__media', el);
        var thumbs = $('.svc__thumbs', el);
        var show = function (i) {
          var ref = refs[i];
          var isVideo = S.mediaKind(ref) === 'video';
          media.innerHTML = '';
          var node = document.createElement(isVideo ? 'video' : 'img');
          if (isVideo) {
            node.muted = true; node.loop = true; node.playsInline = true;
            node.setAttribute('playsinline', ''); node.controls = true;
          } else { node.alt = esc(sv.title); node.loading = 'lazy'; }
          S.resolveMedia(ref).then(function (u) {
            if (u) node.src = u + (isVideo ? '#t=0.1' : '');
          });
          if (!isVideo) node.addEventListener('click', function () { openViewer(node); });
          media.appendChild(node);
          $$('button', thumbs).forEach(function (b, k) { b.classList.toggle('is-on', k === i); });
        };
        if (refs.length > 1) {
          refs.forEach(function (ref, i) {
            var b = document.createElement('button');
            b.setAttribute('aria-label', 'кадр ' + (i + 1));
            var isVideo = S.mediaKind(ref) === 'video';
            var ti = document.createElement(isVideo ? 'video' : 'img');
            if (isVideo) { ti.muted = true; ti.preload = 'metadata'; }
            S.resolveMedia(ref).then(function (u) {
              if (u) ti.src = u + (isVideo ? '#t=0.1' : '');
            });
            b.appendChild(ti);
            b.addEventListener('click', function () { show(i); });
            thumbs.appendChild(b);
          });
        }
        show(0);
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

  function openViewer(srcNode, onClose) {
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
      hint.textContent = touchLayout() ? 'двойное касание или щипок — приблизить'
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

    box.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        startScale = scale;
      } else if (ids.length === 1) {
        startX = e.clientX; startY = e.clientY; panX = tx; panY = ty;
        var now = Date.now();
        if (now - lastTap < 320) { scale = scale > 1.02 ? 1 : 2.4; tx = ty = 0; paint(); }
        lastTap = now;
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
      if (!Object.keys(pts).length) box.classList.remove('is-panning');
    }
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('dblclick', function () { scale = scale > 1.02 ? 1 : 2.4; tx = ty = 0; paint(); });
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
          !viewerEl && sheetNodes.length > 1 &&
          $('#product').classList.contains('is-open')) {
        show(sheetAt + (e.key === 'ArrowRight' ? 1 : -1));
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
