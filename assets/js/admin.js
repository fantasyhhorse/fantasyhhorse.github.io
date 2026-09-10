/* ============================================================
   admin.js — панель управления (конструктор витрины).
   Открыть: точка в футере · Ctrl+Shift+A · #/admin
   Три касания по строке копирайта — вход с телефона.
   ============================================================ */
window.FHh = window.FHh || {};

(function (NS) {
  'use strict';

  var S = NS.store;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var TABS = [
    { id: 'items',  name: 'Работы' },
    { id: 'services', name: 'Услуги' },
    { id: 'groups', name: 'Группы' },
    { id: 'cats',   name: 'Категории' },
    { id: 'look',   name: 'Оформление' },
    { id: 'text',   name: 'Тексты' },
    { id: 'photos', name: 'Фото мастера' },
    { id: 'data',   name: 'Данные' }
  ];
  var tab = 'items';
  var editing = null;     // id редактируемой работы или null
  var editingSvc = null;  // id редактируемой услуги или null
  var itemQuery = '';   // поиск по списку работ
  var dirty = false;
  var unlocked = false;

  /* ---------------- где панель вообще разрешена ----------------
     Настоящая защита опубликованного сайта — не пускать панель на боевой
     домен вовсе (config.js: admin: 'local'). Проверка пароля выполняется
     в браузере и защищает только от случайного захода. */
  var CFG = window.FHH_CONFIG || {};
  function isLocalHost() {
    var h = location.hostname;
    return location.protocol === 'file:' ||
           h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
  }
  var ADMIN_ALLOWED = (CFG.admin === 'always' || CFG.admin === 'remote') ? true
                    : CFG.admin === 'off' ? false
                    : isLocalHost();
  // в режиме remote панель есть на опубликованном сайте, но не афишируется:
  // точку в подвале убираем, вход только по #/admin или Ctrl+Shift+A
  var SHOW_DOT = ADMIN_ALLOWED && (isLocalHost() || CFG.admin === 'always');
  var CAN_PUBLISH_HERE = CFG.admin === 'remote' && !!((CFG.github || {}).owner);
  // на опубликованном сайте паролю верить негде: проверять его пришлось бы
  // по файлу, который лежит в открытом репозитории. Поэтому там вход по токену
  var TOKEN_LOGIN = CAN_PUBLISH_HERE && !isLocalHost();
  var TOKEN_KEY = 'fhh.gh.token';
  function ghToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setGhToken(v) {
    try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function sha256(str) {
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      })
      .catch(function () { return null; });
  }

  function checkPass(value) {
    var st = S.state.settings;
    if (st.adminPassHash) {
      return sha256(value).then(function (h) {
        return h ? h === st.adminPassHash : false;
      });
    }
    return Promise.resolve(value === String(st.adminPass || ''));
  }

  /* ---------------- служебное ---------------- */
  function status(msg) { $('#adminStatus').textContent = msg || ''; }
  function touch() { dirty = true; status('есть несохранённые изменения'); }

  function persist(quiet) {
    var ok = S.save();
    dirty = false;
    status(ok ? 'сохранено ' + new Date().toLocaleTimeString('ru-RU') : 'не удалось сохранить (нет доступа к localStorage)');
    NS.ui.refresh();
    if (!quiet) NS.ui.toast(ok ? 'Изменения сохранены' : 'Браузер запретил сохранение');
  }

  function field(label, inner, hint) {
    return '<label class="field"><span>' + label + '</span>' + inner + '</label>' +
      (hint ? '<p class="hint">' + hint + '</p>' : '');
  }
  function input(key, val, type, attrs) {
    return '<input type="' + (type || 'text') + '" data-k="' + key + '" value="' + esc(val) + '"' +
      (attrs ? ' ' + attrs : '') + '>';
  }
  function area(key, val) {
    return '<textarea data-k="' + key + '">' + esc(val) + '</textarea>';
  }
  function itemById(id) {
    return S.state.items.filter(function (x) { return x.id === id; })[0];
  }

  /* ============================================================
     ВКЛАДКА: РАБОТЫ
     ============================================================ */
  function matches(it, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return (it.title || '').toLowerCase().indexOf(q) >= 0 ||
           String(S.catName(it.cat)).toLowerCase().indexOf(q) >= 0 ||
           String(S.groupName(S.groupOfItem(it))).toLowerCase().indexOf(q) >= 0 ||
           String(it.id).toLowerCase().indexOf(q) >= 0;
  }

  function viewItems() {
    if (editing) return viewItemEditor();
    var st = S.state;
    var shown = 0;

    var rows = st.items.map(function (it, i) {
      if (!matches(it, itemQuery)) return '';
      shown++;
      var badge = it.hidden ? 'скрыта' : S.statusLabel(it.status);
      var gname = S.groupName(S.groupOfItem(it));
      var warn = [];
      if (!String(it.title || '').trim()) warn.push('нет названия');
      if (!it.cat || !S.cat(it.cat)) warn.push('нет категории');
      if (!(it.images || []).length) warn.push('нет фото');
      if (it.status !== 'sold' && !Number(it.price)) warn.push('нет цены');

      return '<div class="arow" data-i="' + i + '" draggable="true">' +
        '<img class="arow__thumb" data-thumb="' + i + '" alt="">' +
        '<div><p class="arow__t">' + esc(it.title || '(без названия)') + '</p>' +
        '<p class="arow__m">' + esc(gname ? gname + ' · ' : '') + esc(S.catName(it.cat)) +
          ' · ' + S.money(it.price) + ' · ' + badge +
          (warn.length ? ' · <b style="color:#a04a3a;font-weight:500">' + warn.join(', ') + '</b>' : '') +
        '</p></div>' +
        '<div class="arow__btns">' +
          '<span class="arow__handle" title="Перетащить">⠿</span>' +
          '<button data-act="up" title="Выше">↑</button>' +
          '<button data-act="down" title="Ниже">↓</button>' +
          '<button data-act="status" title="Сменить статус">' + badge + '</button>' +
          '<button data-act="edit">Изменить</button>' +
          '<button data-act="show" title="Открыть на сайте">Смотреть</button>' +
          '<button data-act="copy">Дубль</button>' +
          '<button data-act="hide">' + (it.hidden ? 'Показать' : 'Скрыть') + '</button>' +
          '<button data-act="del">Удалить</button>' +
        '</div></div>';
    }).join('');

    return '<div class="toolbar">' +
        '<button class="btn btn--solid" data-act="new">+ Новая работа</button>' +
        '<label class="field grow" style="margin:0"><span>Поиск по названию, категории, группе</span>' +
          '<input type="search" id="itemSearch" value="' + esc(itemQuery) + '" placeholder="например: уздечка"></label>' +
      '</div>' +
      '<p class="hint">Порядок в списке = порядок в витрине. Строки можно перетаскивать. ' +
        'Показано ' + shown + ' из ' + st.items.length + '.</p>' +
      (rows || '<p class="hint">Ничего не нашлось.</p>');
  }

  function afterItems() {
    var st = S.state;
    $$('[data-thumb]').forEach(function (img) {
      var it = st.items[+img.dataset.thumb];
      var ref = (it.images || [])[0];
      if (ref) S.resolveImage(ref).then(function (u) { img.src = u || NS.bot.placeholder(it.id + it.title, 160, 160); });
      else img.src = NS.bot.placeholder(it.id + it.title, 160, 160);
    });

    var search = $('#itemSearch');
    if (search) {
      search.addEventListener('input', function () {
        itemQuery = search.value;
        var pos = search.selectionStart;
        render();
        var s2 = $('#itemSearch');
        if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var row = e.target.closest('.arow');
      var i = row ? +row.dataset.i : -1;
      var act = b.dataset.act;

      if (act === 'new') {
        var it = {
          id: S.uid(), title: 'Новая работа', cat: (st.categories[0] || {}).id || '',
          price: 0, old: null, status: 'available', desc: '<p></p>', specs: [], images: []
        };
        st.items.unshift(it); editing = it.id; itemQuery = ''; touch(); render(); return;
      }
      if (i < 0) return;
      if (act === 'edit') { editing = st.items[i].id; render(); return; }
      if (act === 'show') { showOnSite(st.items[i]); return; }
      if (act === 'status') {
        var order = ['available', 'order', 'sold'];
        var cur = order.indexOf(st.items[i].status);
        st.items[i].status = order[(cur + 1) % order.length];
        touch(); render(); return;
      }
      if (act === 'up' && i > 0) { st.items.splice(i - 1, 0, st.items.splice(i, 1)[0]); touch(); render(); return; }
      if (act === 'down' && i < st.items.length - 1) { st.items.splice(i + 1, 0, st.items.splice(i, 1)[0]); touch(); render(); return; }
      if (act === 'copy') {
        var c = S.clone(st.items[i]); c.id = S.uid(); c.title += ' (копия)';
        st.items.splice(i + 1, 0, c); touch(); render(); return;
      }
      if (act === 'hide') { st.items[i].hidden = !st.items[i].hidden; touch(); render(); return; }
      if (act === 'del') {
        if (!confirm('Удалить «' + st.items[i].title + '»? Действие необратимо после сохранения.')) return;
        (st.items[i].images || []).forEach(function (r) { S.dropImage(r); });
        st.items.splice(i, 1); touch(); render(); return;
      }
    };

    // drag & drop порядка
    var dragFrom = -1;
    $$('.arow').forEach(function (row) {
      row.addEventListener('dragstart', function () { dragFrom = +row.dataset.i; row.classList.add('is-drag'); });
      row.addEventListener('dragend', function () { row.classList.remove('is-drag'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var to = +row.dataset.i;
        if (dragFrom < 0 || dragFrom === to) return;
        S.state.items.splice(to, 0, S.state.items.splice(dragFrom, 1)[0]);
        touch(); render();
      });
    });
  }

  /* Показать работу на сайте, не закрывая панель насовсем: панель прячется,
     открывается карточка. Возврат — обычным закрытием карточки. */
  function showOnSite(it) {
    if (dirty) persist(true);
    $('#admin').classList.remove('is-open');
    NS.ui.lockScroll(false);
    NS.ui.openProduct(it.id);
    NS.ui.toast('Карточка на сайте. Панель откроется снова по Ctrl+Shift+A');
  }

  /* ---------------- редактор одной работы ---------------- */
  function viewItemEditor() {
    var st = S.state;
    var it = itemById(editing);
    if (!it) { editing = null; return viewItems(); }

    var cats = st.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === it.cat ? ' selected' : '') + '>' +
             esc(c.name) + ' — ' + esc(S.groupName(c.group)) + '</option>';
    }).join('');

    var specs = (it.specs || []).map(function (s, i) {
      return '<div class="specrow" data-spec="' + i + '" draggable="true">' +
        '<span class="specrow__grip" title="Перетащить">⠿</span>' +
        field('Параметр', '<input type="text" data-sk="' + i + '" value="' + esc(s[0]) + '">') +
        field('Значение', '<input type="text" data-sv="' + i + '" value="' + esc(s[1]) + '">') +
        '<label class="field"><span>&nbsp;</span>' +
        '<button class="btn btn--ghost btn--sm" data-act="specdel" data-i="' + i + '" title="Удалить строку">×</button></label>' +
        '</div>';
    }).join('');

    return '<div class="editor split">' +
      '<div>' +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="back">← К списку</button>' +
        '<button class="btn btn--ghost" data-act="showsite">Смотреть на сайте</button>' +
        '<span class="hint" style="margin:0">Артикул: ' + esc(it.id) +
          ' · группа: ' + esc(S.groupName(S.groupOfItem(it)) || '—') + '</span>' +
      '</div>' +

      '<h4>Основное</h4>' +
      field('Название', input('title', it.title)) +
      '<div class="cols">' +
        field('Категория', '<select data-k="cat">' + cats + '</select>') +
        field('Статус', '<select data-k="status">' +
          '<option value="available"' + (it.status === 'available' ? ' selected' : '') + '>В наличии</option>' +
          '<option value="order"' + (it.status === 'order' ? ' selected' : '') + '>Под заказ</option>' +
          '<option value="sold"' + (it.status === 'sold' ? ' selected' : '') + '>Продано</option>' +
        '</select>') +
        field('Цена', input('price', it.price, 'number')) +
        field('Старая цена (для зачёркивания)', input('old', it.old == null ? '' : it.old, 'number')) +
      '</div>' +
      '<p class="hint">Статус «продано» и «под заказ» показывается дважды: плашкой на обложке ' +
        'и подписью рядом с ценником.</p>' +

      '<h4>Фото и видео</h4>' +
      '<div class="imgs" id="imgList"></div>' +
      '<div class="drop" id="drop">Перетащите файлы сюда или нажмите, чтобы выбрать. ' +
        'Можно сразу несколько. Первое в ряду — обложка витрины.</div>' +
      '<input type="file" id="fileInp" accept="image/*,video/*" multiple hidden>' +
      '<p class="hint">Фотографии ужимаются до 1600 px и переводятся в webp, видео кладётся как есть ' +
      '(до 40 МБ — иначе вставьте ссылкой). Порядок задаётся стрелками, кнопка «обложка» ставит кадр первым. ' +
      'Если у картинки прозрачный фон, витрина подложит под неё ботаническую заставку.</p>' +
      field('Или ссылка на файл', '<input type="text" id="imgUrl" placeholder="https://… (jpg, png, mp4)">') +
      '<button class="btn btn--ghost" data-act="imgurl" style="margin-bottom:20px">Добавить по ссылке</button>' +

      '<h4>Описание</h4>' +
      field('HTML описания', area('desc', it.desc || ''), 'Можно использовать &lt;p&gt;, &lt;h3&gt;, &lt;ul&gt;&lt;li&gt;, &lt;a&gt;, &lt;b&gt;, &lt;em&gt;.') +

      '<h4>Характеристики</h4>' + specs +
      '<div class="toolbar"><button class="btn btn--ghost" data-act="specadd">+ Строка</button>' +
      '<span class="hint" style="margin:0">Строки можно перетаскивать за ⠿.</span></div>' +
      '</div>' +

      /* живой предпросмотр: та же вёрстка карточки, что и на витрине */
      '<aside class="preview">' +
        '<p class="preview__label">как это выглядит в витрине</p>' +
        '<div class="preview__card"><article class="card is-in" id="previewCard"></article></div>' +
        '<p class="preview__note">Предпросмотр обновляется на каждом нажатии клавиши. ' +
          'Цвета и шрифты — текущие, из вкладки «Оформление».</p>' +
      '</aside>' +
      '</div>';
  }

  function drawPreview() {
    var it = itemById(editing);
    var card = $('#previewCard');
    if (!it || !card) return;
    card.innerHTML = NS.ui.cardHTML(it);
    NS.ui.setCardImage($('.card__img', card), it);
  }

  function afterItemEditor() {
    var it = itemById(editing);
    if (!it) return;

    /* Лента медиа работы: порядок = порядок показа, первое — обложка */
    function drawImgs() {
      var wrap = $('#imgList');
      wrap.innerHTML = '';
      (it.images || []).forEach(function (ref, i) {
        var video = S.mediaKind(ref) === 'video';
        var d = document.createElement('figure');
        d.className = 'imgs__item' + (i === 0 ? ' is-cover' : '') + (video ? ' is-video' : '');
        d.style.margin = '0';
        d.innerHTML =
          (video ? '<video muted playsinline preload="metadata"></video>' : '<img alt="">') +
          '<div class="imgs__btns">' +
            '<button data-mv="-1" title="Левее">←</button>' +
            (i === 0 ? '' : '<button data-cover="1" title="Сделать обложкой">★</button>') +
            '<button data-mv="1" title="Правее">→</button>' +
            '<button data-del="1" title="Убрать">×</button>' +
          '</div>';
        wrap.appendChild(d);
        S.resolveMedia(ref).then(function (u) { $('img,video', d).src = u + (video ? '#t=0.1' : ''); });
        if (!video) S.hasAlpha(ref).then(function (yes) { if (yes) d.classList.add('is-alpha'); });

        d.addEventListener('click', function (e) {
          var b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.del) {
            S.dropImage(it.images[i]);
            it.images.splice(i, 1);
          } else if (b.dataset.cover) {
            it.images.unshift(it.images.splice(i, 1)[0]);
          } else if (b.dataset.mv) {
            var to = i + Number(b.dataset.mv);
            if (to < 0 || to >= it.images.length) return;
            it.images.splice(to, 0, it.images.splice(i, 1)[0]);
          }
          touch(); drawImgs(); drawPreview();
        });
      });
      if (!it.images || !it.images.length) {
        wrap.innerHTML = '<p class="hint" style="margin:0">Медиа нет — в витрине покажется сгенерированная ботаническая заставка.</p>';
      }
    }
    drawImgs();
    drawPreview();

    function ingest(files) {
      var arr = Array.prototype.slice.call(files).filter(function (f) {
        return /^(image|video)\//.test(f.type);
      });
      if (!arr.length) return;
      status('обработка файлов…');
      var errs = [];
      Promise.all(arr.map(function (f) {
        return S.ingestFile(f).catch(function (e) { errs.push(f.name + ': ' + e.message); return null; });
      })).then(function (refs) {
        var ok = refs.filter(Boolean);
        it.images = (it.images || []).concat(ok);
        touch(); drawImgs(); drawPreview();
        status('добавлено: ' + ok.length + (errs.length ? ' · пропущено: ' + errs.length : ''));
        if (errs.length) alert('Не удалось добавить:\n\n' + errs.join('\n'));
      });
    }

    var drop = $('#drop'), inp = $('#fileInp');
    drop.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function () { ingest(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer) ingest(e.dataTransfer.files); });

    $('#adminBody').oninput = function (e) {
      var t = e.target;
      if (t.dataset.k) {
        var k = t.dataset.k;
        var v = t.value;
        if (k === 'price') v = Number(v) || 0;
        if (k === 'old') v = v === '' ? null : (Number(v) || null);
        it[k] = v; touch();
      }
      if (t.dataset.sk !== undefined) { it.specs[+t.dataset.sk][0] = t.value; touch(); }
      if (t.dataset.sv !== undefined) { it.specs[+t.dataset.sv][1] = t.value; touch(); }
      drawPreview();
    };
    $('#adminBody').onchange = $('#adminBody').oninput;

    // перетаскивание строк характеристик
    var from = -1;
    $$('.specrow').forEach(function (row) {
      row.addEventListener('dragstart', function () { from = +row.dataset.spec; row.classList.add('is-drag'); });
      row.addEventListener('dragend', function () { row.classList.remove('is-drag'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var to = +row.dataset.spec;
        if (from < 0 || from === to) return;
        it.specs.splice(to, 0, it.specs.splice(from, 1)[0]);
        touch(); render();
      });
    });

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'back') { editing = null; render(); }
      if (act === 'showsite') { showOnSite(it); }
      if (act === 'specadd') { it.specs = it.specs || []; it.specs.push(['', '']); touch(); render(); }
      if (act === 'specdel') { it.specs.splice(+b.dataset.i, 1); touch(); render(); }
      if (act === 'imgurl') {
        var u = $('#imgUrl').value.trim();
        if (u) { it.images = (it.images || []).concat([u]); $('#imgUrl').value = ''; touch(); drawImgs(); drawPreview(); }
      }
    };
  }

  /* ============================================================
     ВКЛАДКА: УСЛУГИ
     Не товар: своё описание, слоты и статус записи.
     ============================================================ */
  var SVC_STATUS = [
    ['open', 'Запись открыта'],
    ['order', 'По договорённости'],
    ['closed', 'Сейчас не провожу']
  ];

  function svcById(id) {
    return (S.state.services || []).filter(function (x) { return x.id === id; })[0];
  }

  function viewServices() {
    if (editingSvc) return viewServiceEditor();
    var list = S.state.services || [];
    var rows = list.map(function (sv, i) {
      var slots = (sv.slots || []).length;
      return '<div class="arow" data-i="' + i + '" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div style="min-width:0">' +
          '<p class="arow__t">' + esc(sv.title || '(без названия)') + '</p>' +
          '<p class="arow__m">' + esc(sv.kind || 'без вида') + ' · ' +
            (sv.price ? S.money(sv.price) : 'по запросу') + ' · ' +
            S.serviceLabel(sv.status) +
            (sv.hidden ? ' · скрыта' : '') +
            (slots ? ' · слотов: ' + slots + (sv.showSlots ? '' : ' (скрыты)') : '') +
          '</p>' +
        '</div>' +
        '<div class="arow__btns">' +
          '<button data-act="sup">↑</button><button data-act="sdown">↓</button>' +
          '<button data-act="sedit">Изменить</button>' +
          '<button data-act="scopy">Дубль</button>' +
          '<button data-act="shide">' + (sv.hidden ? 'Показать' : 'Скрыть') + '</button>' +
          '<button data-act="sdel">Удалить</button>' +
        '</div></div>';
    }).join('');

    return '<div class="editor" style="max-width:none">' +
      '<p class="hint">Раздел «услуги» — про то, что делается вместе с человеком: ' +
      'аренда, занятия, турниры, уже проведённые мероприятия. У каждой услуги может быть ' +
      'расписание слотов, а может и не быть — тогда просто уберите галочку показа.</p>' +
      '<div class="toolbar"><button class="btn btn--solid" data-act="snew">+ Новая услуга</button>' +
      '<button class="btn btn--ghost" data-act="sshow">Смотреть на сайте</button></div>' +
      (rows || '<p class="hint">Пока ни одной услуги.</p>') + '</div>';
  }

  function viewServiceEditor() {
    var sv = svcById(editingSvc);
    if (!sv) { editingSvc = null; return viewServices(); }

    var specs = (sv.specs || []).map(function (x, i) {
      return '<div class="specrow" data-spec="' + i + '">' +
        '<span class="specrow__grip">·</span>' +
        field('Параметр', '<input type="text" data-vk="' + i + '" value="' + esc(x[0]) + '">') +
        field('Значение', '<input type="text" data-vv="' + i + '" value="' + esc(x[1]) + '">') +
        '<label class="field"><span>&nbsp;</span><button class="btn btn--ghost btn--sm" ' +
        'data-act="vspecdel" data-i="' + i + '">×</button></label></div>';
    }).join('');

    var slots = (sv.slots || []).map(function (sl, i) {
      return '<div class="specrow" data-slot="' + i + '" style="grid-template-columns:24px 1fr 1fr 90px auto">' +
        '<span class="specrow__grip">·</span>' +
        field('Когда', '<input type="text" data-slw="' + i + '" value="' + esc(sl.when || '') + '" placeholder="суббота, 11:00">') +
        field('Примечание', '<input type="text" data-sln="' + i + '" value="' + esc(sl.note || '') + '" placeholder="начинающие">') +
        field('Мест', '<input type="number" data-sll="' + i + '" value="' + (sl.left === '' || sl.left == null ? '' : sl.left) + '">') +
        '<label class="field"><span>&nbsp;</span><button class="btn btn--ghost btn--sm" ' +
        'data-act="slotdel" data-i="' + i + '">×</button></label></div>';
    }).join('');

    return '<div class="editor">' +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="sback">← К списку</button>' +
        '<span class="hint" style="margin:0">Код: ' + esc(sv.id) + '</span>' +
      '</div>' +

      '<h4>Основное</h4>' +
      field('Название', '<input type="text" data-v="title" value="' + esc(sv.title) + '">') +
      '<div class="cols">' +
        field('Вид', '<input type="text" data-v="kind" value="' + esc(sv.kind || '') + '" placeholder="аренда, занятие, портфолио">') +
        field('Статус', '<select data-v="status">' + SVC_STATUS.map(function (o) {
          return '<option value="' + o[0] + '"' + (sv.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select>') +
        field('Цена (пусто — «по запросу»)', '<input type="number" data-v="price" value="' + (sv.price == null ? '' : sv.price) + '">') +
        field('Приписка к цене', '<input type="text" data-v="priceNote" value="' + esc(sv.priceNote || '') + '" placeholder="за занятие, группа до 6">') +
      '</div>' +

      '<h4>Фото и видео</h4>' +
      '<div class="imgs" id="svcImgs"></div>' +
      '<div class="drop" id="svcDrop">Перетащите файлы сюда или нажмите. Первый кадр — главный.</div>' +
      '<input type="file" id="svcFile" accept="image/*,video/*" multiple hidden>' +

      '<h4>Описание</h4>' +
      field('HTML описания', '<textarea data-v="desc">' + esc(sv.desc || '') + '</textarea>',
            'Здесь можно расписать подробно — раздел для того и сделан.') +

      '<h4>Характеристики</h4>' + specs +
      '<div class="toolbar"><button class="btn btn--ghost" data-act="vspecadd">+ Строка</button></div>' +

      '<h4>Слоты и даты</h4>' +
      field('Показывать расписание',
        '<select data-v="showSlots"><option value="1"' + (sv.showSlots ? ' selected' : '') + '>показывать</option>' +
        '<option value="0"' + (!sv.showSlots ? ' selected' : '') + '>скрыть совсем</option></select>',
        'Если расписание не нужно — уберите, и на сайте его не будет.') +
      slots +
      '<div class="toolbar"><button class="btn btn--ghost" data-act="slotadd">+ Слот</button>' +
      '<span class="hint" style="margin:0">Поле «мест» можно оставить пустым — тогда счётчик не показывается.</span></div>' +
      '</div>';
  }

  function afterServices() {
    if (editingSvc) return afterServiceEditor();
    var list = S.state.services || [];

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var row = e.target.closest('.arow');
      var i = row ? +row.dataset.i : -1;
      var act = b.dataset.act;

      if (act === 'snew') {
        var sv = { id: S.uid(), title: 'Новая услуга', kind: '', price: null, priceNote: '',
                   status: 'open', desc: '<p></p>', specs: [], images: [], slots: [], showSlots: 0 };
        list.unshift(sv); editingSvc = sv.id; touch(); render(); return;
      }
      if (act === 'sshow') {
        if (dirty) persist(true);
        $('#admin').classList.remove('is-open');
        NS.ui.lockScroll(false);
        location.hash = '#/services';
        NS.ui.toast('Раздел услуг на сайте. Панель — Ctrl+Shift+A');
        return;
      }
      if (i < 0) return;
      if (act === 'sedit') { editingSvc = list[i].id; render(); return; }
      if (act === 'sup' && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); touch(); render(); return; }
      if (act === 'sdown' && i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); touch(); render(); return; }
      if (act === 'scopy') {
        var c = S.clone(list[i]); c.id = S.uid(); c.title += ' (копия)';
        list.splice(i + 1, 0, c); touch(); render(); return;
      }
      if (act === 'shide') { list[i].hidden = !list[i].hidden; touch(); render(); return; }
      if (act === 'sdel') {
        if (!confirm('Удалить «' + list[i].title + '»?')) return;
        (list[i].images || []).forEach(function (r) { S.dropImage(r); });
        list.splice(i, 1); touch(); render(); return;
      }
    };
  }

  function afterServiceEditor() {
    var sv = svcById(editingSvc);
    if (!sv) return;

    function drawImgs() {
      var wrap = $('#svcImgs');
      wrap.innerHTML = '';
      (sv.images || []).forEach(function (ref, i) {
        var video = S.mediaKind(ref) === 'video';
        var d = document.createElement('figure');
        d.className = 'imgs__item' + (i === 0 ? ' is-cover' : '') + (video ? ' is-video' : '');
        d.style.margin = '0';
        d.innerHTML = (video ? '<video muted playsinline preload="metadata"></video>' : '<img alt="">') +
          '<div class="imgs__btns">' +
            '<button data-mv="-1">←</button>' +
            (i === 0 ? '' : '<button data-cover="1">★</button>') +
            '<button data-mv="1">→</button><button data-del="1">×</button></div>';
        wrap.appendChild(d);
        S.resolveMedia(ref).then(function (u) { $('img,video', d).src = u + (video ? '#t=0.1' : ''); });
        d.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.dataset.del) { S.dropImage(sv.images[i]); sv.images.splice(i, 1); }
          else if (b.dataset.cover) sv.images.unshift(sv.images.splice(i, 1)[0]);
          else if (b.dataset.mv) {
            var to = i + Number(b.dataset.mv);
            if (to < 0 || to >= sv.images.length) return;
            sv.images.splice(to, 0, sv.images.splice(i, 1)[0]);
          }
          touch(); drawImgs();
        });
      });
      if (!(sv.images || []).length) {
        wrap.innerHTML = '<p class="hint" style="margin:0">Без фото услуга покажется одним текстом.</p>';
      }
    }
    drawImgs();

    var drop = $('#svcDrop'), inp = $('#svcFile');
    function ingest(files) {
      var arr = Array.prototype.slice.call(files).filter(function (f) { return /^(image|video)\//.test(f.type); });
      if (!arr.length) return;
      status('обработка файлов…');
      Promise.all(arr.map(function (f) { return S.ingestFile(f).catch(function () { return null; }); }))
        .then(function (refs) {
          sv.images = (sv.images || []).concat(refs.filter(Boolean));
          touch(); drawImgs(); status('добавлено: ' + refs.filter(Boolean).length);
        });
    }
    drop.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function () { ingest(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer) ingest(e.dataTransfer.files); });

    $('#adminBody').oninput = function (e) {
      var t = e.target;
      if (t.dataset.v) {
        var k = t.dataset.v, v = t.value;
        if (k === 'price') v = v === '' ? null : (Number(v) || null);
        if (k === 'showSlots') v = Number(v);
        sv[k] = v; touch();
      }
      if (t.dataset.vk !== undefined) { sv.specs[+t.dataset.vk][0] = t.value; touch(); }
      if (t.dataset.vv !== undefined) { sv.specs[+t.dataset.vv][1] = t.value; touch(); }
      if (t.dataset.slw !== undefined) { sv.slots[+t.dataset.slw].when = t.value; touch(); }
      if (t.dataset.sln !== undefined) { sv.slots[+t.dataset.sln].note = t.value; touch(); }
      if (t.dataset.sll !== undefined) {
        sv.slots[+t.dataset.sll].left = t.value === '' ? '' : (Number(t.value) || 0); touch();
      }
    };
    $('#adminBody').onchange = $('#adminBody').oninput;

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'sback') { editingSvc = null; render(); }
      if (act === 'vspecadd') { sv.specs = sv.specs || []; sv.specs.push(['', '']); touch(); render(); }
      if (act === 'vspecdel') { sv.specs.splice(+b.dataset.i, 1); touch(); render(); }
      if (act === 'slotadd') {
        sv.slots = sv.slots || [];
        sv.slots.push({ when: '', note: '', left: '' });
        sv.showSlots = 1; touch(); render();
      }
      if (act === 'slotdel') { sv.slots.splice(+b.dataset.i, 1); touch(); render(); }
    };
  }

  /* ============================================================
     ВКЛАДКА: ГРУППЫ ТОВАРОВ
     ============================================================ */
  function viewGroups() {
    var st = S.state;
    var rows = st.groups.map(function (g, i) {
      var cats = S.catsOfGroup(g.id);
      var n = S.itemsOfGroup(g.id).length;
      return '<div class="arow" data-i="' + i + '" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div style="min-width:0">' +
          '<div class="cols" style="grid-template-columns:1fr 1fr">' +
            field('Название группы', '<input type="text" data-gn="' + i + '" value="' + esc(g.name) + '">') +
            field('Код (латиницей)', '<input type="text" data-gi="' + i + '" value="' + esc(g.id) + '">') +
          '</div>' +
          field('Подпись на странице группы', '<textarea data-gd="' + i + '" style="min-height:64px">' + esc(g.note || '') + '</textarea>') +
          '<p class="hint" style="margin:0">Категорий: ' + cats.length +
            (cats.length ? ' (' + cats.map(function (c) { return esc(c.name); }).join(', ') + ')' : '') +
            ' · работ: ' + n + '</p>' +
        '</div>' +
        '<div class="arow__btns">' +
          '<button data-act="gup">↑</button><button data-act="gdown">↓</button>' +
          '<button data-act="gshow">Смотреть</button>' +
          '<button data-act="gdel">Удалить</button>' +
        '</div></div>';
    }).join('');

    return '<div class="editor" style="max-width:none">' +
      '<p class="hint">Группа — это то, что посетитель выбирает в витрине: при клике страница группы ' +
      'выезжает снизу поверх сайта. Категории внутри группы работают подфильтром.</p>' +
      '<div class="toolbar"><button class="btn btn--solid" data-act="gnew">+ Группа</button></div>' +
      rows + '</div>';
  }

  function afterGroups() {
    $('#adminBody').oninput = function (e) {
      var t = e.target, gs = S.state.groups;
      if (t.dataset.gn !== undefined) { gs[+t.dataset.gn].name = t.value; touch(); }
      if (t.dataset.gd !== undefined) { gs[+t.dataset.gd].note = t.value; touch(); }
      if (t.dataset.gi !== undefined) {
        var i = +t.dataset.gi, oldId = gs[i].id, nid = t.value.trim();
        if (!nid) return;
        S.state.categories.forEach(function (c) { if (c.group === oldId) c.group = nid; });
        gs[i].id = nid; touch();
      }
    };
    $('#adminBody').onchange = $('#adminBody').oninput;

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var row = e.target.closest('.arow'); var i = row ? +row.dataset.i : -1;
      var gs = S.state.groups;
      if (b.dataset.act === 'gnew') {
        gs.push({ id: 'group' + (gs.length + 1), name: 'Новая группа', note: '' });
        touch(); render(); return;
      }
      if (i < 0) return;
      if (b.dataset.act === 'gup' && i > 0) { gs.splice(i - 1, 0, gs.splice(i, 1)[0]); touch(); render(); }
      if (b.dataset.act === 'gdown' && i < gs.length - 1) { gs.splice(i + 1, 0, gs.splice(i, 1)[0]); touch(); render(); }
      if (b.dataset.act === 'gshow') {
        if (dirty) persist(true);
        $('#admin').classList.remove('is-open');
        NS.ui.lockScroll(false);
        NS.ui.openGroup(gs[i].id);
        NS.ui.toast('Страница группы на сайте. Панель — Ctrl+Shift+A');
      }
      if (b.dataset.act === 'gdel') {
        if (gs.length < 2) { alert('Должна остаться хотя бы одна группа.'); return; }
        var used = S.catsOfGroup(gs[i].id);
        if (used.length && !confirm('В группе ' + used.length + ' категор(ия/ии). Они переедут в «' +
            (gs[i === 0 ? 1 : 0].name) + '». Удалить группу?')) return;
        var to = gs[i === 0 ? 1 : 0].id;
        used.forEach(function (c) { c.group = to; });
        gs.splice(i, 1); touch(); render();
      }
    };
  }

  /* ============================================================
     ВКЛАДКА: КАТЕГОРИИ
     ============================================================ */
  function viewCats() {
    var st = S.state;
    var rows = st.categories.map(function (c, i) {
      var used = st.items.filter(function (x) { return x.cat === c.id; }).length;
      var opts = st.groups.map(function (g) {
        return '<option value="' + esc(g.id) + '"' + (g.id === c.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
      }).join('');
      return '<div class="arow" data-i="' + i + '" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
          field('Название', '<input type="text" data-cn="' + i + '" value="' + esc(c.name) + '">') +
          field('Код (латиницей)', '<input type="text" data-ci="' + i + '" value="' + esc(c.id) + '">') +
          field('Группа', '<select data-cg="' + i + '">' + opts + '</select>') +
        '</div>' +
        '<div class="arow__btns"><button data-act="cup">↑</button><button data-act="cdown">↓</button>' +
        '<button data-act="cdel">Удалить (' + used + ')</button></div></div>';
    }).join('');
    return '<div class="editor" style="max-width:none">' +
      '<p class="hint">Категория — подфильтр внутри группы. Например, «Хоббихорсы» и «Амуниция» ' +
      'обе живут в группе HobbyHorsing.</p>' +
      '<div class="toolbar"><button class="btn btn--ghost" data-act="cnew">+ Категория</button></div>' + rows + '</div>';
  }

  function afterCats() {
    $('#adminBody').oninput = function (e) {
      var t = e.target, cats = S.state.categories;
      if (t.dataset.cn !== undefined) { cats[+t.dataset.cn].name = t.value; touch(); }
      if (t.dataset.cg !== undefined) { cats[+t.dataset.cg].group = t.value; touch(); }
      if (t.dataset.ci !== undefined) {
        var i = +t.dataset.ci, oldId = cats[i].id, nid = t.value.trim();
        if (!nid) return;
        S.state.items.forEach(function (it) { if (it.cat === oldId) it.cat = nid; });
        cats[i].id = nid; touch();
      }
    };
    $('#adminBody').onchange = $('#adminBody').oninput;
    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var row = e.target.closest('.arow'); var i = row ? +row.dataset.i : -1;
      var cats = S.state.categories;
      if (b.dataset.act === 'cnew') {
        cats.push({ id: 'cat' + (cats.length + 1), name: 'Новая категория', group: (S.state.groups[0] || {}).id });
        touch(); render();
      }
      if (i < 0) return;
      if (b.dataset.act === 'cup' && i > 0) { cats.splice(i - 1, 0, cats.splice(i, 1)[0]); touch(); render(); }
      if (b.dataset.act === 'cdown' && i < cats.length - 1) { cats.splice(i + 1, 0, cats.splice(i, 1)[0]); touch(); render(); }
      if (b.dataset.act === 'cdel') {
        var used = S.state.items.filter(function (x) { return x.cat === cats[i].id; }).length;
        if (used && !confirm('В категории ' + used + ' работ(ы). Они останутся без категории. Удалить?')) return;
        cats.splice(i, 1); touch(); render();
      }
    };
  }

  /* ============================================================
     ВКЛАДКА: ОФОРМЛЕНИЕ
     Палитра из пяти цветов + роли: какой цвет куда идёт.
     Свои палитры сохраняются рядом со встроенными.
     ============================================================ */
  function paletteStrip(p) {
    return 'linear-gradient(90deg,' + p.paper + ' 0 34%,' + p.olive + ' 34% 54%,' +
      p.rust + ' 54% 74%,' + p.emerald + ' 74% 88%,' + p.ink + ' 88% 100%)';
  }

  function viewLook() {
    var st = S.state.settings;
    var list = S.allPalettes();
    var sw = list.map(function (p) {
      var own = !p.builtinLocked && (S.state.palettes || []).some(function (x) { return x.id === p.id; });
      return '<button class="swatch' + (st.paletteId === p.id ? ' is-on' : '') + '" data-pal="' + esc(p.id) + '">' +
        '<i style="background:' + paletteStrip(p) + '"></i>' +
        '<b>' + esc(p.name) + '</b>' +
        (own ? '<small>своя</small>' : '<small>встроенная</small>') +
        (own ? '<span class="swatch__del" data-paldel="' + esc(p.id) + '" title="Удалить палитру">×</span>' : '') +
        '</button>';
    }).join('');

    var colors = S.TOKENS.map(function (t) {
      return field(t.name, '<input type="color" data-s="' + t.k + '" value="' + esc(st[t.k]) + '">');
    }).join('');

    var roles = S.ROLES.map(function (r) {
      var opts = S.TOKENS.map(function (t) {
        return '<button class="role__opt' + (st[r.k] === t.k ? ' is-on' : '') + '" data-role="' + r.k +
          '" data-token="' + t.k + '" title="' + esc(t.name) + '" ' +
          'style="background:' + esc(st[t.k]) + '"></button>';
      }).join('');
      return '<div class="role"><b>' + esc(r.name) + '</b><small>' + esc(r.hint) + '</small>' +
        '<div class="role__opts">' + opts + '</div></div>';
    }).join('');

    return '<div class="editor">' +
      '<h4>Палитры</h4>' +
      '<p class="hint">Цвета сайта не зашиты в код: пять базовых оттенков и пять ролей. ' +
      'Меняйте — сайт перекрашивается сразу, включая иконку вкладки.</p>' +
      '<div class="swatches">' + sw + '</div>' +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="palsave">Сохранить текущие цвета как палитру</button>' +
      '</div>' +

      '<h4>Цвета</h4>' +
      '<div class="cols">' + colors + '</div>' +

      '<h4>Акценты: что каким цветом</h4>' +
      '<div class="roles">' + roles + '</div>' +

      '<h4>Типографика</h4>' +
      '<div class="cols">' +
        field('Акцентный шрифт', '<select data-s="fontDisplay">' +
          S.FONTS.map(function (f) {
            return '<option value="' + f.id + '"' + (st.fontDisplay === f.id ? ' selected' : '') +
              '>' + esc(f.name) + '</option>';
          }).join('') +
          '<option value="custom"' + (st.fontDisplay === 'custom' ? ' selected' : '') + '>' +
            (st.fontCustomName ? 'Свой: ' + esc(st.fontCustomName) : 'Свой файл…') + '</option>' +
        '</select>', 'Заголовки, логотип и кнопки. Подписи остаются руническими.') +
        field('Масштаб шрифта: <b id="vFs">' + st.fontScale + '</b>',
          '<input type="range" min="0.9" max="1.25" step="0.01" data-s="fontScale" value="' + st.fontScale + '">') +
      '</div>' +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="fontup">Загрузить свой шрифт</button>' +
        '<input type="file" id="fontInp" accept=".woff2,.woff,.ttf,.otf" hidden>' +
        (st.fontCustom ? '<button class="btn btn--ghost" data-act="fontdel">Убрать свой шрифт</button>' : '') +
        '<span class="hint" style="margin:0">woff2, woff, ttf или otf до 4 МБ. Файл уедет ' +
        'в репозиторий вместе с фотографиями.</span>' +
      '</div>' +
      field('Подписи', '<select data-s="fontPreset">' +
        '<option value="rune"' + (st.fontPreset === 'rune' ? ' selected' : '') + '>рунические (Jura)</option>' +
        '<option value="clean"' + (st.fontPreset === 'clean' ? ' selected' : '') + '>спокойные</option>' +
      '</select>') +

      '<h4>Декор и движение</h4>' +
      field('Лайнарт головы фоном',
        '<select data-s="lineart"><option value="1"' + (st.lineart ? ' selected' : '') + '>показывать</option>' +
        '<option value="0"' + (!st.lineart ? ' selected' : '') + '>убрать</option></select>',
        'Водяной знак из паспорта хорса в герое и цветном блоке.') +
      field('Интенсивность анимаций: <b id="vAnim">' + st.anim + '</b>',
        '<input type="range" min="0.3" max="1.6" step="0.05" data-s="anim" value="' + st.anim + '">') +
      field('Плотность ботаники: <b id="vDens">' + st.density + '</b>',
        '<input type="range" min="0.3" max="2" step="0.1" data-s="density" value="' + st.density + '">',
        'Влияет на количество вай в прелоадере и фоне. Меньше — быстрее на слабых устройствах.') +
      field('Длительность прелоадера, мс', '<input type="number" step="100" data-s="preloaderMs" value="' + st.preloaderMs + '">') +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="replay">Проиграть заставку заново</button>' +
      '</div>' +
      '</div>';
  }

  function afterLook() {
    $('#adminBody').oninput = function (e) {
      var t = e.target;
      if (!t.dataset.s) return;
      var k = t.dataset.s;
      var v;
      if (t.type === 'range' || t.type === 'number') v = Number(t.value);
      else if (k === 'lineart') v = Number(t.value);
      else v = t.value;
      S.state.settings[k] = v;
      if (k === 'anim') $('#vAnim').textContent = v;
      if (k === 'density') $('#vDens').textContent = v;
      if (k === 'fontScale') $('#vFs').textContent = v;
      if (S.TOKENS.some(function (x) { return x.k === k; })) S.state.settings.paletteId = '';
      NS.ui.applySettings();
      touch();
    };
    $('#adminBody').onchange = $('#adminBody').oninput;

    var fi = $('#fontInp');
    if (fi) fi.addEventListener('change', function () {
      var file = fi.files[0];
      fi.value = '';
      if (!file) return;
      status('загружаем шрифт…');
      S.ingestFont(file).then(function (ref) {
        var st = S.state.settings;
        if (st.fontCustom) S.dropImage(st.fontCustom);
        st.fontCustom = ref;
        st.fontCustomName = file.name;
        st.fontDisplay = 'custom';
        NS.ui.applySettings();
        touch(); render();
        status('шрифт загружен: ' + file.name);
      }).catch(function (err) {
        status('шрифт не загружен');
        alert('Не получилось: ' + err.message);
      });
    });

    $('#adminBody').onclick = function (e) {
      var del = e.target.closest('[data-paldel]');
      if (del) {
        e.stopPropagation();
        var id = del.dataset.paldel;
        if (!confirm('Удалить свою палитру?')) return;
        S.state.palettes = (S.state.palettes || []).filter(function (p) { return p.id !== id; });
        touch(); render(); return;
      }
      var th = e.target.closest('[data-pal]');
      if (th) {
        var p = S.allPalettes().filter(function (x) { return x.id === th.dataset.pal; })[0];
        if (p) {
          S.TOKENS.forEach(function (t) { S.state.settings[t.k] = p[t.k]; });
          S.state.settings.paletteId = p.id;
          NS.ui.applySettings(); touch(); render();
        }
        return;
      }
      var ro = e.target.closest('[data-role]');
      if (ro) {
        S.state.settings[ro.dataset.role] = ro.dataset.token;
        NS.ui.applySettings(); touch(); render();
        return;
      }
      var b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'replay') { persist(true); location.reload(); }
      if (b.dataset.act === 'fontup') { $('#fontInp').click(); }
      if (b.dataset.act === 'fontdel') {
        S.dropImage(S.state.settings.fontCustom);
        S.state.settings.fontCustom = '';
        S.state.settings.fontCustomName = '';
        if (S.state.settings.fontDisplay === 'custom') S.state.settings.fontDisplay = 'jura';
        NS.ui.applySettings(); touch(); render();
      }
      if (b.dataset.act === 'palsave') {
        var name = prompt('Название палитры:', 'Моя палитра');
        if (!name) return;
        var np = { id: S.uid(), name: name };
        S.TOKENS.forEach(function (t) { np[t.k] = S.state.settings[t.k]; });
        S.state.palettes = (S.state.palettes || []).concat([np]);
        S.state.settings.paletteId = np.id;
        touch(); render(); NS.ui.toast('Палитра сохранена');
      }
    };
  }

  /* ============================================================
     ВКЛАДКА: ТЕКСТЫ
     ============================================================ */
  function viewText() {
    var st = S.state.settings;
    return '<div class="editor">' +
      '<h4>Шапка и герой</h4>' +
      '<div class="cols">' +
        field('Название в шапке', input('siteTitle', st.siteTitle)) +
        field('Подпись рядом с названием', input('siteTagline', st.siteTagline), 'Идёт в заголовок вкладки браузера.') +
        field('Telegram (без @)', input('telegram', st.telegram)) +
        field('Валюта', input('currency', st.currency)) +
      '</div>' +
      '<div class="cols">' +
        field('Метка 1', input('heroTag1', st.heroTag1)) +
        field('Метка 2', input('heroTag2', st.heroTag2)) +
        field('Метка 3', input('heroTag3', st.heroTag3)) +
      '</div>' +
      '<div class="cols">' +
        field('Заголовок, строка 1', input('heroLine1', st.heroLine1)) +
        field('Заголовок, строка 2 (цветная)', input('heroLine2', st.heroLine2)) +
      '</div>' +
      field('Подзаголовок', area('heroSub', st.heroSub)) +
      field('Подпись внизу героя', input('heroFootL', st.heroFootL)) +
      '<h4>Цветной блок</h4>' +
      field('Крупная строка', area('bandLead', st.bandLead)) +
      field('Текст блока (HTML)', area('bandText', st.bandText)) +
      '<h4>Страница «Услуги»</h4>' + field('Вступление (HTML)', area('servicesLead', st.servicesLead)) +
      '<h4>Страница «О мастере»</h4>' + field('HTML', area('aboutText', st.aboutText)) +
      '<h4>Страница «Контакты»</h4>' + field('HTML', area('contactsText', st.contactsText)) +
      '<h4>Подвал</h4>' + field('Строка в футере', input('footerNote', st.footerNote)) +
      '</div>';
  }

  function afterText() {
    $('#adminBody').oninput = function (e) {
      var k = e.target.dataset.k; if (!k) return;
      S.state.settings[k] = e.target.value;
      NS.ui.applySettings();
      touch();
    };
    $('#adminBody').onchange = $('#adminBody').oninput;
  }

  /* ============================================================
     ВКЛАДКА: ФОТО МАСТЕРА
     Лента, которая дрейфует на странице «о мастере».
     ============================================================ */
  function viewPhotos() {
    var st = S.state.settings;
    var list = (st.aboutPhotos || []);
    var cells = list.map(function (ref, i) {
      var video = S.mediaKind(ref) === 'video';
      var isCenter = ref === st.aboutCenter;
      return '<figure class="photo' + (video ? ' is-video' : '') + (isCenter ? ' is-center' : '') +
        '" data-p="' + i + '" style="margin:0">' +
        (video ? '<video muted playsinline preload="metadata" data-pimg="' + i + '"></video>'
               : '<img alt="" data-pimg="' + i + '">') +
        '<div class="photo__btns">' +
          '<button data-act="pleft" title="Левее">←</button>' +
          '<button data-act="pcenter" title="' + (isCenter ? 'Сейчас в центре' : 'Поставить в центр') + '">★</button>' +
          '<button data-act="pright" title="Правее">→</button>' +
          '<button data-act="pdel" title="Убрать">×</button>' +
        '</div></figure>';
    }).join('');

    return '<div class="editor">' +
      '<h4>Фотографии на странице «о мастере»</h4>' +
      '<p class="hint">Снимки сами плавают по полю рядом с текстом: у каждого своя скорость, ' +
      'а от того, на который навели курсор, соседи разбегаются. Кадр, отмеченный ★, стоит в центре ' +
      'и показывается крупнее — остальные кружат вокруг него. На телефоне тап по снимку ' +
      'разворачивает его посреди экрана, фон продолжает плыть.</p>' +
      '<div class="toolbar">' +
        '<button class="btn btn--solid" data-act="padd">+ Добавить фотографии</button>' +
        '<input type="file" id="photoInp" accept="image/*,video/*" multiple hidden>' +
        '<button class="btn btn--ghost" data-act="preset">Вернуть исходную подборку</button>' +
      '</div>' +
      '<div class="cols">' +
      field('Дрейф',
        '<select data-s="aboutDrift"><option value="1"' + (st.aboutDrift ? ' selected' : '') + '>включён</option>' +
        '<option value="0"' + (!st.aboutDrift ? ' selected' : '') + '>выключен (фото просто стоят)</option></select>') +
      field('Сторона ленты (на широком экране)',
        '<select data-s="aboutSide">' +
        '<option value="right"' + (st.aboutSide !== 'left' ? ' selected' : '') + '>справа от текста</option>' +
        '<option value="left"' + (st.aboutSide === 'left' ? ' selected' : '') + '>слева от текста</option></select>',
        'На телефоне лента всегда под текстом.') +
      '</div>' +
      (cells ? '<div class="photos">' + cells + '</div>'
             : '<p class="hint">Фотографий нет — блок на странице «о мастере» не показывается.</p>') +
      '</div>';
  }

  function afterPhotos() {
    var st = S.state.settings;
    $$('[data-pimg]').forEach(function (img) {
      var r = st.aboutPhotos[+img.dataset.pimg];
      S.resolveMedia(r).then(function (u) { img.src = u ? u + (S.mediaKind(r) === 'video' ? '#t=0.1' : '') : ''; });
    });

    $('#adminBody').oninput = function (e) {
      var t = e.target;
      if (t.dataset.s === 'aboutDrift') {
        st.aboutDrift = Number(t.value);
        NS.ui.refresh(); touch();
      }
      if (t.dataset.s === 'aboutSide') {
        st.aboutSide = t.value;
        NS.ui.refresh(); touch();
      }
    };
    $('#adminBody').onchange = $('#adminBody').oninput;

    var inp = $('#photoInp');
    if (inp) inp.addEventListener('change', function () {
      var files = Array.prototype.slice.call(inp.files).filter(function (f) { return /^(image|video)\//.test(f.type); });
      inp.value = '';
      if (!files.length) return;
      status('обработка фотографий…');
      Promise.all(files.map(function (f) { return S.ingestFile(f, 1200).catch(function () { return null; }); }))
        .then(function (refs) {
          st.aboutPhotos = st.aboutPhotos.concat(refs.filter(Boolean));
          touch(); NS.ui.refresh(); render(); status('добавлено: ' + refs.filter(Boolean).length);
        });
    });

    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var cell = e.target.closest('[data-p]');
      var i = cell ? +cell.dataset.p : -1;
      var act = b.dataset.act;
      if (act === 'padd') { $('#photoInp').click(); return; }
      if (act === 'preset') {
        if (!confirm('Вернуть подборку, с которой сайт приехал?')) return;
        st.aboutPhotos = S.MASTER_PHOTOS.slice();
        touch(); NS.ui.refresh(); render(); return;
      }
      if (i < 0) return;
      if (act === 'pcenter') { st.aboutCenter = st.aboutPhotos[i]; }
      if (act === 'pleft' && i > 0) { st.aboutPhotos.splice(i - 1, 0, st.aboutPhotos.splice(i, 1)[0]); }
      if (act === 'pright' && i < st.aboutPhotos.length - 1) { st.aboutPhotos.splice(i + 1, 0, st.aboutPhotos.splice(i, 1)[0]); }
      if (act === 'pdel') {
        if (st.aboutPhotos[i] === st.aboutCenter) st.aboutCenter = '';
        S.dropImage(st.aboutPhotos[i]);
        st.aboutPhotos.splice(i, 1);
      }
      touch(); NS.ui.refresh(); render();
    };
  }

  /* ============================================================
     ВКЛАДКА: ДАННЫЕ
     ============================================================ */
  function viewData() {
    var st = S.state;
    var bytes = 0;
    try { bytes = (localStorage.getItem('fhh.site.v1') || '').length; } catch (e) {}
    var noPhoto = st.items.filter(function (i) { return !(i.images || []).length; }).length;

    return '<div class="editor">' +
      '<h4>Бэкап</h4>' +
      '<p class="hint">Экспорт складывает в один JSON и тексты, и фотографии (включая ленту «о мастере»). ' +
      'Этим же файлом сайт восстанавливается на другом компьютере или в другом браузере.</p>' +
      '<div class="toolbar">' +
        '<button class="btn btn--ghost" data-act="exp">Скачать бэкап</button>' +
        '<button class="btn btn--ghost" data-act="imp">Загрузить бэкап</button>' +
        '<input type="file" id="impFile" accept="application/json,.json" hidden>' +
      '</div>' +
      (CAN_PUBLISH_HERE ? (
        '<h4>Опубликовать прямо отсюда</h4>' +
        '<p class="hint">Отправляет витрину в репозиторий <b>' +
          esc(((CFG.github || {}).owner || '') + '/' + ((CFG.github || {}).repo || '')) +
        '</b> одним коммитом, дальше GitHub Action пересоберёт сайт сам — примерно через минуту.<br>' +
        'Фотографии и видео уезжают <b>отдельными файлами</b> в <b>assets/media/</b>, а не внутрь ' +
        'site.json: посетитель не качает всю витрину одним куском, а браузер кеширует картинки. ' +
        'Уже выложенные файлы повторно не отправляются.<br>' +
        'Нужен <b>fine-grained</b> токен GitHub: только этот репозиторий, ' +
        'разрешение <b>Contents: Read and write</b>, срок 30–90 дней. ' +
        'Токен хранится до закрытия вкладки и никуда, кроме GitHub, не отправляется.</p>' +
        '<p class="hint" id="pubSize">считаем объём публикации…</p>' +
        '<div class="cols">' +
          field('Токен GitHub', '<input type="password" id="ghToken" placeholder="' +
            (ghToken() ? 'токен уже введён при входе' : 'github_pat_…') + '">') +
          '<label class="field"><span>&nbsp;</span>' +
          '<button class="btn btn--solid" data-act="ghpub" style="width:100%">Опубликовать</button></label>' +
        '</div>' +
        '<div class="toolbar"><button class="btn btn--ghost" data-act="ghforget">Забыть токен</button></div>'
      ) : '') +

      '<h4>Публикация сайта</h4>' +
      '<p class="hint">Витрина, которую видят посетители, лежит в файле ' +
      '<b>data/site.json</b> в репозитории. Кнопка ниже собирает этот файл из текущего ' +
      'содержимого вместе с фотографиями — положите его в папку <b>data/</b>, ' +
      'закоммитьте и запушьте: GitHub Action выложит сайт сам.</p>' +
      '<div class="toolbar">' +
        '<button class="btn btn--solid" data-act="publish">Файл для публикации (site.json)</button>' +
      '</div>' +

      '<h4>Доступ</h4>' +
      '<p class="hint">Режим панели задаётся в <b>assets/js/config.js</b>. Сейчас: <b>' +
        esc(CFG.admin || 'local') + '</b>' +
        (ADMIN_ALLOWED ? '' : ' — на этом адресе панель была бы закрыта') + '.<br>' +
      (CFG.admin === 'remote'
        ? 'Режим <b>remote</b>: панель открывается и на опубликованном сайте, но только ' +
          'по адресу #/admin или Ctrl+Shift+A — точки в подвале там нет. ' +
          '<b>Там вход не по паролю, а по токену GitHub</b>: пароль пришлось бы ' +
          'проверять по файлу из открытого репозитория, а токен — настоящий секрет, ' +
          'который нигде не публикуется и отзывается одной кнопкой. Пароль ниже ' +
          'действует только на этом компьютере.<br>'
        : '') +
      'При значении <b>local</b> панель не открывается на опубликованном домене ' +
      'ничем: ни точкой в подвале, ни Ctrl+Shift+A, ни адресом #/admin. Это и есть ' +
      'настоящая защита. Пароль ниже — только от случайного захода на вашем же ' +
      'компьютере: проверка идёт в браузере.</p>' +
      '<div class="cols">' +
        field('Новый пароль', '<input type="password" id="newPass" placeholder="оставьте пустым, чтобы не менять">') +
        '<label class="field"><span>&nbsp;</span>' +
        '<button class="btn btn--ghost" data-act="setpass" style="width:100%">Сменить пароль</button></label>' +
      '</div>' +
      '<p class="hint">' + (st.settings.adminPassHash
        ? 'Сейчас хранится хеш пароля — открытым текстом он в файлах не лежит.'
        : 'Сейчас пароль хранится открытым текстом (' + esc(st.settings.adminPass) + '). Смените его, чтобы вместо него сохранился хеш.') + '</p>' +

      '<h4>Состояние</h4>' +
      '<p class="hint">Работ: ' + st.items.length +
      ' · услуг: ' + (st.services || []).length +
      ' · групп: ' + st.groups.length +
      ' · категорий: ' + st.categories.length +
      ' · своих палитр: ' + (st.palettes || []).length +
      ' · фото мастера: ' + (st.settings.aboutPhotos || []).length +
      ' · файлов в браузере: ' + S.usedBlobRefs().length +
      ' · объём текстовых данных: ' + Math.round(bytes / 1024) + ' КБ' +
      (noPhoto ? '<br><b style="color:#a04a3a">Работ без фотографий: ' + noPhoto + '</b>' : '') +
      '</p>' +
      '<div class="toolbar">' +
        '<button class="btn btn--danger" data-act="reset">Сбросить к демо-содержимому</button>' +
      '</div>' +
      '</div>';
  }

  function afterData() {
    var sizeBox = $('#pubSize');
    if (sizeBox && S.publishSize) {
      S.publishSize().then(function (r) {
        var mb = r.bytes / (1024 * 1024);
        var txt = r.files
          ? 'К отправке: ' + r.files + ' новых файл(ов), ' + mb.toFixed(1) + ' МБ' +
            (r.videos ? ' (из них видео: ' + r.videos + ')' : '')
          : 'Новых файлов нет — уедет только сам site.json.';
        // у GitHub жёсткий потолок 100 МБ на файл и мягкий 1 ГБ на сайт Pages
        if (r.biggest > 90 * 1024 * 1024) {
          txt += '<br><b style="color:#a04a3a">Есть файл тяжелее 90 МБ — GitHub его не примет.</b>';
        } else if (mb > 25) {
          txt += '<br><b style="color:#a04a3a">Больше 25 МБ за раз: отправка может оборваться. ' +
                 'Публикуйте частями или сожмите видео.</b>';
        }
        sizeBox.innerHTML = txt;
      }).catch(function () { sizeBox.textContent = ''; });
    }

    $('#adminBody').oninput = function (e) {
      var k = e.target.dataset.k; if (!k) return;
      S.state.settings[k] = e.target.value; touch();
    };
    $('#adminBody').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'exp') doExport();
      if (b.dataset.act === 'publish') doExport('site.json');
      if (b.dataset.act === 'ghforget') { setGhToken(''); render(); NS.ui.toast('Токен забыт'); }
      if (b.dataset.act === 'ghpub') {
        var tok = ($('#ghToken').value || '').trim() || ghToken();
        if (!tok) { alert('Вставьте токен GitHub'); return; }
        if (dirty) persist(true);
        b.disabled = true;
        status('отправляем на GitHub…');
        S.publishToGitHub(tok, null, status).then(function (res) {
          setGhToken(tok);
          $('#ghToken').value = '';
          b.disabled = false;
          status('опубликовано, коммит ' + res.commit +
            ' · файлов: ' + res.files +
            ' · site.json: ' + Math.round(res.json / 1024) + ' КБ');
          NS.ui.toast('Отправлено. Сайт обновится через минуту');
          render();
        }).catch(function (err) {
          b.disabled = false;
          status('не опубликовано');
          alert('Не получилось опубликовать.\n\n' + err.message);
        });
      }
      if (b.dataset.act === 'setpass') {
        var v = $('#newPass').value;
        if (!v) { alert('Введите новый пароль'); return; }
        sha256(v).then(function (h) {
          if (!h) { alert('Браузер не даёт посчитать хеш (нужен https или localhost). Пароль оставлен как есть.'); return; }
          S.state.settings.adminPassHash = h;
          S.state.settings.adminPass = '';
          persist();
          render();
          NS.ui.toast('Пароль изменён');
        });
      }
      if (b.dataset.act === 'imp') $('#impFile').click();
      if (b.dataset.act === 'reset') {
        if (!confirm('Вернуть демо-содержимое? Все ваши работы и тексты в этом браузере будут потеряны.')) return;
        S.reset(); dirty = false; NS.ui.refresh(); render(); NS.ui.toast('Сброшено к демо-содержимому');
      }
    };
    var f = $('#impFile');
    if (f) f.addEventListener('change', function () {
      var file = f.files[0]; if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        S.importJSON(String(fr.result)).then(function () {
          NS.ui.refresh(); render(); NS.ui.toast('Бэкап загружен');
        }).catch(function (err) { alert('Не удалось прочитать файл: ' + err.message); });
      };
      fr.readAsText(file);
      f.value = '';
    });
  }

  function doExport(name) {
    status('готовим файл…');
    S.exportJSON().then(function (json) {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name || ('fhh-site-' + new Date().toISOString().slice(0, 10) + '.json');
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      status('файл скачан: ' + a.download);
    });
  }

  /* ============================================================
     КАРКАС
     ============================================================ */
  var VIEWS = {
    items:  { view: viewItems,  after: function () { editing ? afterItemEditor() : afterItems(); } },
    services: { view: viewServices, after: afterServices },
    groups: { view: viewGroups, after: afterGroups },
    cats:   { view: viewCats,   after: afterCats },
    look:   { view: viewLook,   after: afterLook },
    text:   { view: viewText,   after: afterText },
    photos: { view: viewPhotos, after: afterPhotos },
    data:   { view: viewData,   after: afterData }
  };

  function render() {
    $('#adminTabs').innerHTML = TABS.map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (t.id === tab ? 'is-on' : '') + '">' + t.name + '</button>';
    }).join('');

    var b = $('#adminBody');
    b.onclick = null; b.oninput = null; b.onchange = null;

    var v = VIEWS[tab] || VIEWS.items;
    var keep = b.scrollTop;
    b.innerHTML = v.view();
    v.after();
    b.scrollTop = (tab === 'items' && !editing) ? keep : 0;
  }

  function open() {
    if (!ADMIN_ALLOWED) return;              // на опубликованном домене панели нет
    if (!unlocked) { showLock(); return; }
    $('#admin').classList.add('is-open');
    $('#admin').setAttribute('aria-hidden', 'false');
    NS.ui.lockScroll(true);
    render();
    status('');
  }
  function close() {
    if (dirty && !confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
    $('#admin').classList.remove('is-open');
    $('#admin').setAttribute('aria-hidden', 'true');
    NS.ui.lockScroll(false);
    if (location.hash === '#/admin') location.hash = '#/';
  }

  function showLock() {
    var box = $('#lockForm');
    var title = $('p', box), inp = $('#lockPass');
    if (TOKEN_LOGIN) {
      title.textContent = 'вход по токену GitHub';
      inp.placeholder = ghToken() ? 'токен запомнен — просто нажмите «Войти»' : 'github_pat_…';
      inp.autocomplete = 'off';
    } else {
      title.textContent = 'вход в панель управления';
      inp.placeholder = 'пароль';
    }
    $('#lock').classList.add('is-open');
    setTimeout(function () { inp.focus(); }, 60);
  }
  function hideLock() { $('#lock').classList.remove('is-open'); $('#lockErr').textContent = ''; $('#lockPass').value = ''; }

  /* ---------------- привязки ---------------- */
  if (!SHOW_DOT) {
    var dot = $('#adminOpen');
    if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
  }

  /* ---------------- вход с телефона ----------------
     Точки в подвале на опубликованном сайте нет, а набирать #/admin на
     телефоне неудобно. Скрытый жест: три быстрых нажатия на строку
     копирайта внизу страницы. Случайно так не попадёшь. */
  (function () {
    var mark = $('.foot [data-bind="footerNote"]') || $('.foot');
    if (!mark || !ADMIN_ALLOWED) return;
    var taps = 0, last = 0;
    mark.style.webkitTapHighlightColor = 'transparent';
    mark.addEventListener('click', function () {
      var now = Date.now();
      taps = (now - last < 700) ? taps + 1 : 1;
      last = now;
      if (taps >= 3) { taps = 0; open(); }
    });
  })();
  $('#adminOpen') && $('#adminOpen').addEventListener('click', open);
  $('#adminClose').addEventListener('click', close);
  $('.admin__scrim').addEventListener('click', close);
  $('#saveBtn').addEventListener('click', function () { persist(); render(); });
  $('#expBtn').addEventListener('click', doExport);
  $('#impBtn').addEventListener('click', function () { tab = 'data'; render(); setTimeout(function () { $('#impFile').click(); }, 50); });

  $('#adminTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab; editing = null; editingSvc = null; render();
  });

  $('#lockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#lockPass').value;
    var err = $('#lockErr');

    if (TOKEN_LOGIN) {
      var tok = v || ghToken();
      if (!tok) { err.textContent = 'Вставьте токен'; return; }
      err.textContent = 'проверяем токен…';
      S.checkGitHubToken(tok).then(function (ok) {
        if (ok) { setGhToken(tok); unlocked = true; hideLock(); open(); }
        else err.textContent = 'Токен не подошёл: истёк, обрезан или выдан не на этот репозиторий';
      });
      return;
    }

    checkPass(v).then(function (ok) {
      if (ok) { unlocked = true; hideLock(); open(); }
      else err.textContent = 'Неверный пароль';
    });
  });
  $('#lock').addEventListener('click', function (e) { if (e.target === $('#lock')) hideLock(); });

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
      e.preventDefault(); open();
    }
    if (e.key === 'Escape' && $('#admin').classList.contains('is-open')) close();
    if (e.ctrlKey && (e.key === 's' || e.key === 'S') && $('#admin').classList.contains('is-open')) {
      e.preventDefault(); persist(); render();
    }
  });

  function checkHash() { if (location.hash === '#/admin') open(); }
  window.addEventListener('hashchange', checkHash);
  setTimeout(checkHash, 400);

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  NS.admin = { open: open, close: close };
})(window.FHh);
