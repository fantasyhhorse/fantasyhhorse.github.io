/* ============================================================
   store.js — модель данных, хранилище, дефолтный контент.
   Метаданные -> localStorage, изображения -> IndexedDB (blob).

   Схема 2: цвета живут не в CSS, а в настройках (палитра + роли),
   товары собраны в группы, у страницы «о мастере» своя лента фото.
   ============================================================ */
window.FHh = window.FHh || {};

(function (NS) {
  'use strict';

  var LS_KEY = 'fhh.site.v1';
  var DB_NAME = 'fhh-media';
  var DB_STORE = 'img';
  var SCHEMA = 2;

  /* ---------------- палитра ----------------
     Пять базовых цветов паспорта хорса. Всё остальное на сайте —
     производные от них (см. style.css) или роли (ниже). */
  var TOKENS = [
    { k: 'paper',   name: 'Бумага (тёплый бежевый)' },
    { k: 'ink',     name: 'Чернила (чёрный)' },
    { k: 'rust',    name: 'Рыжий' },
    { k: 'olive',   name: 'Зелёно-бежевый' },
    { k: 'emerald', name: 'Изумруд (печать)' }
  ];

  /* Роли — куда именно попадает цвет. Значение роли = ключ токена,
     поэтому смена палитры мгновенно перекрашивает весь сайт. */
  var ROLES = [
    { k: 'roleAccent', name: 'Главный акцент', hint: 'вторая строка заголовка, точки у названий разделов, ссылки' },
    { k: 'roleBand',   name: 'Цветной блок',   hint: 'фон блока-манифеста на главной' },
    { k: 'roleBadge',  name: 'Метка «под заказ»', hint: 'плашка на обложке работы' },
    { k: 'roleSeal',   name: 'Печать',         hint: 'штамп-гиппогриф, подчёркивания, служебные детали' },
    { k: 'roleLogo',   name: 'Детали логотипа', hint: 'палки за головой маскота в шапке и на вкладке браузера' },
    { k: 'roleBotany', name: 'Папоротники',    hint: 'вайи на заставке, в шапке героя и на подложках работ' }
  ];

  var BUILTIN_PALETTES = [
    { id: 'passport', name: 'Паспорт хорса', paper: '#eedbb3', ink: '#231f20', rust: '#d9772f', olive: '#9b8f6d', emerald: '#1f6b52' },
    { id: 'ember',    name: 'Уголь и рыжина', paper: '#f2e7d2', ink: '#1a1614', rust: '#c85c22', olive: '#8b8560', emerald: '#2a6b57' },
    { id: 'fern',     name: 'Папоротник',     paper: '#ececea', ink: '#15171a', rust: '#a86a38', olive: '#3f5c46', emerald: '#2f6360' },
    { id: 'night',    name: 'Полночный лес',  paper: '#16150f', ink: '#efe3c8', rust: '#e0913f', olive: '#a29b74', emerald: '#5fae8e' },
    { id: 'glass',    name: 'Витраж',         paper: '#f0ece1', ink: '#171a21', rust: '#bf6231', olive: '#7d8a63', emerald: '#1c6f68' }
  ];

  /* ---------------- акцентный шрифт ----------------
     Заголовки, логотип и кнопки. Все варианты с кириллицей; своё
     начертание грузится файлом и живёт рядом с фотографиями. */
  var FONTS = [
    { id: 'jura',       name: 'Jura — рунический',        family: '"Jura"',           spec: 'Jura:wght@300;400;500;600;700' },
    { id: 'unbounded',  name: 'Unbounded — плотный',      family: '"Unbounded"',      spec: 'Unbounded:wght@400;600;700' },
    { id: 'ruslan',     name: 'Ruslan Display — славянский', family: '"Ruslan Display"', spec: 'Ruslan+Display' },
    { id: 'philosopher', name: 'Philosopher — мягкий',    family: '"Philosopher"',    spec: 'Philosopher:wght@400;700' },
    { id: 'yeseva',     name: 'Yeseva One — акцидентный', family: '"Yeseva One"',     spec: 'Yeseva+One' },
    { id: 'marmelad',   name: 'Marmelad — округлый',      family: '"Marmelad"',       spec: 'Marmelad' },
    { id: 'play',       name: 'Play — техничный',         family: '"Play"',           spec: 'Play:wght@400;700' },
    { id: 'manrope',    name: 'Manrope — спокойный',      family: '"Manrope"',        spec: 'Manrope:wght@400;500;600;700' }
  ];

  var MASTER_PHOTOS = [
    'assets/img/master/m01.webp', 'assets/img/master/m02.webp', 'assets/img/master/m03.webp',
    'assets/img/master/m04.webp', 'assets/img/master/m05.webp', 'assets/img/master/m06.webp',
    'assets/img/master/m07.webp', 'assets/img/master/m08.webp', 'assets/img/master/m09.webp',
    'assets/img/master/m10.webp', 'assets/img/master/m11.webp'
  ];

  /* ---------------- дефолтный контент ---------------- */
  var DEFAULTS = {
    schema: SCHEMA,

    settings: {
      siteTitle: 'FHh',
      siteTagline: 'мастерская ручной работы',
      telegram: 'kip_rina',
      heroTag1: 'ручная работа',
      heroTag2: 'штучный тираж',
      heroTag3: 'отправка по России',
      heroLine1: 'fantasy',
      heroLine2: 'handmade.',
      heroSub: 'Хоббихорсы и амуниция, витражи, игрушки и крафтовые вещи — сделанные так, будто выросли в лесу.',
      heroFootL: 'мастерская · Рина Киприянова',
      bandLead: 'каждая работа существует в одном экземпляре',
      bandText:
        '<p>Я не повторяю модели: даже если основа похожа, характер, цвет и фурнитура ' +
        'собираются заново — под конкретную лошадь или под конкретного человека.</p>' +
        '<p>Готовое из витрины уезжает сразу. Всё остальное делается под заказ: ' +
        'обсуждаем породу, масть, гриву, амуницию и сроки в Telegram.</p>',
      footerNote: '© FHh · Рина Киприянова',
      currency: '₽',
      aboutText:
        '<p>Меня зовут Рина Киприянова. Я делаю вещи руками: хоббихорсов и амуницию для них, витражи, ' +
        'мягкие игрушки и крафтовые предметы для дома.</p>' +
        '<p>Каждая работа существует в одном экземпляре. Я не повторяю модели: даже если основа похожа, ' +
        'характер, цвет и фурнитура собираются заново под конкретную лошадь или конкретного человека.</p>' +
        '<h3>Как это работает</h3>' +
        '<p>Готовые работы из витрины можно забрать сразу. Всё остальное — под заказ: обсуждаем ' +
        'породу, масть, гриву, амуницию и сроки в Telegram.</p>',
      contactsText:
        '<p>Все вопросы, заказы и предзаказы — в Telegram. Отвечаю в течение дня.</p>' +
        '<h3>Доставка</h3>' +
        '<p>СДЭК и Почта России по России, отправка в течение 1–3 дней после оплаты. ' +
        'Самовывоз обсуждается отдельно.</p>' +
        '<h3>Оплата</h3>' +
        '<p>Перевод по номеру телефона. Работы под заказ — предоплата 50%.</p>',

      /* оформление: палитра */
      paper: '#eedbb3',
      ink: '#231f20',
      rust: '#d9772f',
      olive: '#9b8f6d',
      emerald: '#1f6b52',
      paletteId: 'passport',

      /* оформление: роли */
      roleAccent: 'rust',
      roleBand: 'olive',
      roleBadge: 'rust',
      roleSeal: 'emerald',
      roleLogo: 'olive',
      roleBotany: 'emerald',

      /* оформление: типографика */
      fontPreset: 'rune',      // rune | clean — насколько рунические подписи
      fontDisplay: 'jura',     // акцентный шрифт: id из FONTS или 'custom'
      fontCustom: '',          // ссылка на загруженный файл шрифта
      fontCustomName: '',
      fontScale: 1,

      /* оформление: движение */
      anim: 1,
      density: 1,
      preloaderMs: 2200,
      lineart: 1,             // фоновый лайнарт головы как декор

      /* раздел «услуги» */
      servicesLead:
        '<p>Здесь всё, что я могу предложить как мастер: не только вещи из витрины, ' +
        'но и то, что делается вместе с вами — аренда, тренировки, турниры и уже ' +
        'проведённые мероприятия.</p>',

      /* «о мастере» */
      aboutPhotos: MASTER_PHOTOS.slice(),
      aboutDrift: 1,
      aboutCenter: MASTER_PHOTOS[3],   // кадр покрупнее в центре ленты
      aboutSide: 'right',              // с какой стороны от текста плавает лента

      adminPass: 'fern',
      adminPassHash: ''
    },

    palettes: [],   // пользовательские палитры (встроенные лежат в BUILTIN_PALETTES)

    /* Услуги — не товар: у них есть слоты, даты и своё описание.
       status: open — запись открыта, order — по договорённости,
       closed — сейчас не проводится. Слоты можно скрыть целиком. */
    services: [
      {
        id: 's1', title: 'Аренда хоббихорсов', kind: 'аренда',
        price: 700, priceNote: 'за голову в сутки', status: 'open',
        desc: '<p>Даю хорсов напрокат на съёмки, фестивали, дни рождения и пробные ' +
              'тренировки — чтобы попробовать до того, как заказывать своего.</p>' +
              '<p>В комплекте голова, палка и оголовье. Залог возвращается при возврате ' +
              'в целости, мелкие потёртости — не страшно.</p>',
        specs: [['Минимальный срок', '1 сутки'], ['Залог', '3 000 ₽'],
                ['Где забрать', 'самовывоз или курьер по городу']],
        images: [], slots: [], showSlots: 0
      },
      {
        id: 's2', title: 'Тренировка по hobbyhorsing', kind: 'занятие',
        price: 1500, priceNote: 'за занятие, группа до 6 человек', status: 'open',
        desc: '<p>Разбираем посадку, работу руки, прыжковую технику и связки для ' +
              'выездковых схем. Хорса можно взять мой — он входит в занятие.</p>' +
              '<p>Первое занятие пробное: приходите посмотреть, подходит ли вам это вообще.</p>',
        specs: [['Длительность', '1 час 20 минут'], ['Возраст', 'от 8 лет'],
                ['Что взять', 'спортивную обувь и воду']],
        images: [],
        slots: [
          { when: 'суббота, 11:00', note: 'начинающие', left: 3 },
          { when: 'суббота, 13:00', note: 'продолжающие', left: 1 },
          { when: 'среда, 18:30', note: 'свободная тренировка', left: 5 }
        ],
        showSlots: 1
      },
      {
        id: 's3', title: 'Соревнования и судейство', kind: 'мероприятие',
        price: null, priceNote: 'стоимость зависит от формата', status: 'order',
        desc: '<p>Собираю турнир под ключ: маршруты, схемы, стартовые протоколы, ' +
              'судейство и награды. Могу приехать судьёй на ваш старт.</p>',
        specs: [['Форматы', 'конкур, выездка, троеборье'],
                ['Участников', 'от 10 до 60'], ['Срок подготовки', 'от 3 недель']],
        images: [], slots: [], showSlots: 0
      },
      {
        id: 's4', title: 'Портфолио: турнир «Осенний лист»', kind: 'портфолио',
        price: null, priceNote: '', status: 'closed',
        desc: '<p>Двухдневный старт на 40 участников: конкур и выездка, собственные ' +
              'маршруты, наградная стенка и фотозона из папоротников.</p>',
        specs: [['Когда', 'октябрь 2025'], ['Участников', '40'], ['Роль', 'организатор и судья']],
        images: [], slots: [], showSlots: 0
      }
    ],

    /* «ссылка на медиа -> путь файла в репозитории»: чтобы при следующей
       публикации не заливать уже выложенные фотографии заново */
    mediaPub: {},

    groups: [
      { id: 'hobbyhorsing', name: 'HobbyHorsing', note: 'Хоббихорсы и амуниция к ним — одна семья: голова, палка, оголовье и вальтрап собираются в комплект.' },
      { id: 'glass',        name: 'Витражи',      note: 'Тиффани, спаянное стекло и подвески, которые ловят утренний свет.' },
      { id: 'handmade',     name: 'Хендмейд',     note: 'Всё остальное, что сделано руками: игрушки, крафт, интерьерные мелочи. Пока без строгой систематизации.' }
    ],

    categories: [
      { id: 'hh',    name: 'Хоббихорсы', group: 'hobbyhorsing' },
      { id: 'ammo',  name: 'Амуниция',   group: 'hobbyhorsing' },
      { id: 'glass', name: 'Витражи',    group: 'glass' },
      { id: 'toys',  name: 'Игрушки',    group: 'handmade' },
      { id: 'craft', name: 'Крафт',      group: 'handmade' }
    ],

    items: [
      {
        id: 'i1', title: 'Мшистый', cat: 'hh', price: 12500, old: null,
        status: 'available',
        desc: '<p>Хоббихорс размера S на буковой палке. Голова — шерстяной драп цвета мокрого мха, ' +
              'грива из смеси искусственных локонов трёх оттенков.</p>',
        specs: [['Размер', 'S · 100 см'], ['Материал', 'драп, бук'], ['Срок изготовления', 'в наличии']],
        images: []
      },
      {
        id: 'i2', title: 'Папоротниковая уздечка', cat: 'ammo', price: 3400, old: 3900,
        status: 'available',
        desc: '<p>Уздечка на размер S–M. Натуральная кожа растительного дубления, ' +
              'латунная фурнитура, ручное тиснение вайи папоротника на налобнике.</p>',
        specs: [['Размер', 'S–M'], ['Материал', 'кожа, латунь'], ['Цвет', 'коньячный']],
        images: []
      },
      {
        id: 'i3', title: 'Витраж «Заросли»', cat: 'glass', price: 21000, old: null,
        status: 'order',
        desc: '<p>Панно 30×40 см в технике Тиффани. Опаловое и катедральное стекло, ' +
              'патинированная пайка. Подвес в комплекте.</p>',
        specs: [['Размер', '30 × 40 см'], ['Техника', 'Тиффани'], ['Срок', '3–4 недели']],
        images: []
      },
      {
        id: 'i4', title: 'Лесной дух', cat: 'toys', price: 4800, old: null,
        status: 'sold',
        desc: '<p>Интерьерная игрушка ростом 26 см. Мохер, стеклянные глаза, ' +
              'подвижные соединения на дисках.</p>',
        specs: [['Рост', '26 см'], ['Материал', 'мохер, опилки'], ['Тираж', '1 из 1']],
        images: []
      },
      {
        id: 'i5', title: 'Вороной', cat: 'hh', price: 15900, old: null,
        status: 'available',
        desc: '<p>Хоббихорс размера M. Плотный флис, скульптурная лепка морды, ' +
              'грива и хвост из канекалона.</p>',
        specs: [['Размер', 'M · 105 см'], ['Материал', 'флис, дерево'], ['Вес', '1,1 кг']],
        images: []
      },
      {
        id: 'i6', title: 'Вальтрап «Вайя»', cat: 'ammo', price: 2600, old: null,
        status: 'available',
        desc: '<p>Вальтрап из шерстяного сукна с вышивкой папоротника, кант — вощёный шнур.</p>',
        specs: [['Размер', 'универсальный'], ['Материал', 'сукно'], ['Уход', 'ручная стирка']],
        images: []
      },
      {
        id: 'i7', title: 'Сюнкатэ (подсвечник)', cat: 'craft', price: 5200, old: null,
        status: 'available',
        desc: '<p>Подсвечник из латуни и стекла, форма собрана из силуэтов листьев. ' +
              'Под чайную свечу.</p>',
        specs: [['Высота', '17 см'], ['Материал', 'латунь, стекло'], ['Тираж', 'малая серия']],
        images: []
      },
      {
        id: 'i8', title: 'Витражная подвеска «Спора»', cat: 'glass', price: 1900, old: null,
        status: 'available',
        desc: '<p>Небольшая подвеска-suncatcher диаметром 9 см. Ловит утренний свет.</p>',
        specs: [['Диаметр', '9 см'], ['Техника', 'Тиффани'], ['Крепление', 'леска + кольцо']],
        images: []
      }
    ]
  };

  /* ---------------- утилиты ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function deepFill(target, src) {
    // добавляет отсутствующие ключи из src (миграция старых сохранений)
    Object.keys(src).forEach(function (k) {
      if (target[k] === undefined) target[k] = clone(src[k]);
    });
    return target;
  }

  /* Переезд со схемы 1 (paper/ink/moss/brass, категории без групп).
     Цвета старой схемы намеренно не тащим: палитра сменилась целиком,
     иначе владелец увидел бы серую бумагу с новыми акцентами. */
  function migrate(site) {
    if (!site || site.schema === SCHEMA) return site;

    var st = site.settings || (site.settings = {});
    ['paper', 'ink', 'moss', 'brass'].forEach(function (k) { delete st[k]; });
    delete st.paletteId;

    if (!Array.isArray(site.groups) || !site.groups.length) site.groups = clone(DEFAULTS.groups);

    var byId = {};
    site.groups.forEach(function (g) { byId[g.id] = true; });
    var fallback = site.groups[site.groups.length - 1].id;
    (site.categories || []).forEach(function (c) {
      if (!c.group || !byId[c.group]) {
        // старые коды категорий раскладываем по смыслу, остальное — в «прочее»
        c.group = (c.id === 'hh' || c.id === 'ammo') ? 'hobbyhorsing'
                : (c.id === 'glass') ? 'glass' : fallback;
      }
    });

    // «Ирина» → «Рина» в текстах, которые владелец уже правил
    ['heroFootL', 'footerNote', 'aboutText', 'contactsText', 'bandText'].forEach(function (k) {
      if (typeof st[k] === 'string') st[k] = st[k].replace(/Ирина Киприянова/g, 'Рина Киприянова');
    });

    site.schema = SCHEMA;
    return site;
  }

  function normalize(site) {
    migrate(site);
    site.settings = deepFill(site.settings || {}, DEFAULTS.settings);
    if (!Array.isArray(site.items)) site.items = clone(DEFAULTS.items);
    if (!Array.isArray(site.categories)) site.categories = clone(DEFAULTS.categories);
    if (!Array.isArray(site.groups) || !site.groups.length) site.groups = clone(DEFAULTS.groups);
    if (!Array.isArray(site.palettes)) site.palettes = [];
    if (!Array.isArray(site.services)) site.services = clone(DEFAULTS.services);
    if (!site.mediaPub || typeof site.mediaPub !== 'object') site.mediaPub = {};
    if (!Array.isArray(site.settings.aboutPhotos)) site.settings.aboutPhotos = MASTER_PHOTOS.slice();
    return site;
  }

  /* ---------------- IndexedDB для картинок ---------------- */
  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        if (!rq.result.objectStoreNames.contains(DB_STORE)) rq.result.createObjectStore(DB_STORE);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbPromise;
  }

  function idbPut(key, blob) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, key);
        tx.oncomplete = function () { res(key); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(DB_STORE, 'readonly');
        var rq = tx.objectStore(DB_STORE).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = res;
        tx.onerror = res;
      });
    });
  }

  /* ---------------- медиа: фото и видео ----------------
     Ссылка на медиа — строка. Варианты:
       idb:<key>   — картинка, лежит в IndexedDB этого браузера
       vdb:<key>   — видео, лежит в IndexedDB этого браузера
       assets/…    — файл в репозитории (так выглядит опубликованное)
       https://…   — внешняя ссылка
     Видео узнаётся по префиксу vdb:, по префиксу video: или по расширению. */
  var VIDEO_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;
  var VIDEO_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
  var MAX_VIDEO = 40 * 1024 * 1024;

  function mediaKind(ref) {
    if (!ref) return 'image';
    if (ref.indexOf('fnt:') === 0 || /\.(woff2?|ttf|otf)(\?|#|$)/i.test(ref)) return 'font';
    if (ref.indexOf('vdb:') === 0 || ref.indexOf('video:') === 0) return 'video';
    return VIDEO_RE.test(ref) ? 'video' : 'image';
  }
  function isBlobRef(ref) {
    return !!ref && (ref.indexOf('idb:') === 0 || ref.indexOf('vdb:') === 0 ||
                     ref.indexOf('fnt:') === 0);
  }
  function blobKey(ref) { return ref.slice(4); }

  var urlCache = {};
  var blobExt = {};

  function resolveMedia(ref) {
    if (!ref) return Promise.resolve('');
    if (ref.indexOf('video:') === 0) return Promise.resolve(ref.slice(6));
    if (!isBlobRef(ref)) return Promise.resolve(ref);
    if (urlCache[ref]) return Promise.resolve(urlCache[ref]);
    return idbGet(blobKey(ref)).then(function (blob) {
      if (!blob) return '';
      var u = URL.createObjectURL(blob);
      urlCache[ref] = u;
      return u;
    }).catch(function () { return ''; });
  }

  function mediaBlob(ref) {
    if (!isBlobRef(ref)) return Promise.resolve(null);
    return idbGet(blobKey(ref)).catch(function () { return null; });
  }

  /* расширение для файла, который уедет в репозиторий */
  function refExt(ref, blob) {
    if (ref.indexOf('fnt:') === 0) {
      var dot = ref.lastIndexOf('.');
      return dot > 4 ? ref.slice(dot + 1) : 'woff2';
    }
    if (blobExt[ref]) return blobExt[ref];
    var t = (blob && blob.type) || '';
    if (VIDEO_EXT[t]) return VIDEO_EXT[t];
    if (t === 'image/webp') return 'webp';
    if (t === 'image/png') return 'png';
    if (t === 'image/jpeg') return 'jpg';
    if (t === 'image/gif') return 'gif';
    return mediaKind(ref) === 'video' ? 'mp4' : 'webp';
  }

  /* ---------------- прозрачный фон ----------------
     Если у картинки есть заметная прозрачная область, витрина подкладывает
     под неё ту же сгенерированную ботаническую заставку, что и у работ без
     фото: вырезанный предмет не висит в пустоте. Считаем один раз на ссылку. */
  var alphaCache = {};
  function hasAlpha(ref) {
    if (!ref || mediaKind(ref) === 'video') return Promise.resolve(false);
    if (alphaCache[ref] !== undefined) return Promise.resolve(alphaCache[ref]);
    return resolveMedia(ref).then(function (u) {
      if (!u) return false;
      return new Promise(function (res) {
        var im = new Image();
        // чужой домен без CORS испачкает канву — тогда считаем картинку непрозрачной
        if (/^https?:\/\//i.test(u) && u.indexOf(location.origin) !== 0) im.crossOrigin = 'anonymous';
        im.onload = function () {
          try {
            var n = 48;
            var sc = Math.min(1, n / Math.max(im.naturalWidth, im.naturalHeight, 1));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(im.naturalWidth * sc));
            c.height = Math.max(1, Math.round(im.naturalHeight * sc));
            var g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(im, 0, 0, c.width, c.height);
            var d = g.getImageData(0, 0, c.width, c.height).data;
            var clear = 0, total = d.length / 4, i;
            for (i = 3; i < d.length; i += 4) if (d[i] < 245) clear++;
            // одиночные полупрозрачные точки по краю есть у многих картинок,
            // поэтому фон считаем прозрачным только начиная с заметной доли
            res(clear > total * 0.06);
          } catch (e) { res(false); }
        };
        im.onerror = function () { res(false); };
        im.src = u;
      });
    }).then(function (v) { alphaCache[ref] = v; return v; });
  }

  /* ---------------- приём файла ----------------
     Картинки ужимаются и переводятся в webp. Видео кладём как есть:
     перекодировать его в браузере нечем, а исходник обычно уже сжат. */
  function ingestFile(file, maxSide) {
    if (/^video\//.test(file.type)) return ingestVideo(file);
    maxSide = maxSide || 1600;
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) { rej(new Error('not an image')); return; }
      var img = new Image();
      var fr = new FileReader();
      fr.onload = function () { img.src = fr.result; };
      fr.onerror = rej;
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.round(w * s), ch = Math.round(h * s);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, cw, ch);
        c.toBlob(function (blob) {
          if (!blob) { rej(new Error('encode failed')); return; }
          var key = uid();
          idbPut(key, blob).then(function () {
            var ref = 'idb:' + key;
            urlCache[ref] = URL.createObjectURL(blob);
            res(ref);
          }).catch(rej);
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { rej(new Error('decode failed')); };
      fr.readAsDataURL(file);
    });
  }

  function ingestVideo(file) {
    if (file.size > MAX_VIDEO) {
      return Promise.reject(new Error('Видео тяжелее 40 МБ: сожмите его или вставьте ссылкой'));
    }
    var key = uid();
    return idbPut(key, file).then(function () {
      var ref = 'vdb:' + key;
      urlCache[ref] = URL.createObjectURL(file);
      blobExt[ref] = VIDEO_EXT[file.type] || 'mp4';
      return ref;
    });
  }

  /* все ссылки на локальные медиа, которые сейчас используются */
  function usedBlobRefs() {
    var refs = [];
    function want(r) { if (isBlobRef(r) && refs.indexOf(r) < 0) refs.push(r); }
    (state.items || []).forEach(function (it) { (it.images || []).forEach(want); });
    (state.services || []).forEach(function (sv) { (sv.images || []).forEach(want); });
    ((state.settings || {}).aboutPhotos || []).forEach(want);
    want((state.settings || {}).fontCustom);
    return refs;
  }

  /* Своё начертание кладём как есть: расширение зашиваем в ссылку, иначе
     после перезагрузки не из чего собрать имя файла для публикации. */
  function ingestFont(file) {
    var m = /\.(woff2|woff|ttf|otf)$/i.exec(file.name || '');
    var ext = m ? m[1].toLowerCase() : 'woff2';
    if (file.size > 4 * 1024 * 1024) {
      return Promise.reject(new Error('Файл шрифта тяжелее 4 МБ'));
    }
    var key = uid() + '.' + ext;
    return idbPut(key, file).then(function () {
      var ref = 'fnt:' + key;
      urlCache[ref] = URL.createObjectURL(file);
      return ref;
    });
  }

  /* ---------------- состояние ---------------- */
  var state = null;

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* приватный режим */ }
    if (raw) {
      try {
        state = normalize(JSON.parse(raw));
        return state;
      } catch (e) { /* битый JSON — берём дефолт */ }
    }
    state = clone(DEFAULTS);
    return state;
  }

  function save() {
    try {
      state.savedAt = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- опубликованное содержимое ----------------
     data/site.json — то, что видят посетители сайта. Правки в браузере
     (localStorage) перекрывают его только пока они свежее публикации:
     как только выкладывается новый файл, он побеждает и у владельца тоже. */
  function hydrate() {
    var cfg = window.FHH_CONFIG || {};
    var url = cfg.dataUrl;
    if (!url) return Promise.resolve({ source: 'local', changed: false });

    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (pack) {
        if (!pack) return { source: 'local', changed: false };
        var site = pack.site || pack;
        if (!site || !site.settings || !site.items) return { source: 'local', changed: false };

        var published = Date.parse(pack.publishedAt || site.publishedAt || 0) || 0;
        var localAt = Date.parse((state && state.savedAt) || 0) || 0;
        if (localAt && localAt >= published) {
          return { source: 'local', changed: false, published: published };
        }

        var media = pack.media || {};
        return Promise.all(Object.keys(media).map(function (ref) {
          return fetch(media[ref]).then(function (r) { return r.blob(); })
            .then(function (b) { return idbPut(ref.slice(4), b); })
            .catch(function () { return null; });
        })).then(function () {
          // свой хеш пароля важнее опубликованного, но только если он вообще
          // задан: у нового посетителя его нет, и тогда работает опубликованный
          var keepPass = state && state.settings ? state.settings.adminPass : undefined;
          var keepHash = state && state.settings ? state.settings.adminPassHash : '';
          normalize(site);
          if (keepPass !== undefined) site.settings.adminPass = keepPass;
          if (keepHash) site.settings.adminPassHash = keepHash;
          site.savedAt = pack.publishedAt || site.publishedAt || new Date().toISOString();
          state = site;
          urlCache = {}; alphaCache = {};
          try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
          return { source: 'published', changed: true, published: published };
        });
      })
      .catch(function () { return { source: 'local', changed: false }; });
  }

  function reset() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state = clone(DEFAULTS);
    return state;
  }

  function exportJSON() {
    // выгружаем вместе с картинками в base64, чтобы бэкап был самодостаточным
    var refs = usedBlobRefs();

    return Promise.all(refs.map(function (r) {
      return mediaBlob(r).then(function (blob) {
        if (!blob) return null;
        return new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () { res({ ref: r, data: fr.result }); };
          fr.onerror = function () { res(null); };
          fr.readAsDataURL(blob);
        });
      }).catch(function () { return null; });
    })).then(function (list) {
      var media = {};
      list.forEach(function (x) { if (x) media[x.ref] = x.data; });
      var now = new Date().toISOString();
      // ни пароль, ни его хеш в публичный файл не попадают: на опубликованном
      // сайте вход в панель идёт по токену GitHub, проверять там нечего
      var pub = clone(state);
      delete pub.settings.adminPass;
      delete pub.settings.adminPassHash;
      return JSON.stringify({ v: 2, exported: now, publishedAt: now, site: pub, media: media }, null, 2);
    });
  }

  function importJSON(text) {
    var pack = JSON.parse(text);
    var site = pack.site || pack;
    if (!site.settings || !site.items) throw new Error('Не похоже на бэкап сайта');
    var media = pack.media || {};
    var keys = Object.keys(media);
    return Promise.all(keys.map(function (ref) {
      return fetch(media[ref]).then(function (r) { return r.blob(); })
        .then(function (b) { return idbPut(ref.slice(4), b); })
        .catch(function () { return null; });
    })).then(function () {
      var keepPass = state && state.settings ? state.settings.adminPass : undefined;
      var keepHash = state && state.settings ? state.settings.adminPassHash : undefined;
      normalize(site);
      if (site.settings.adminPass === undefined && keepPass !== undefined) site.settings.adminPass = keepPass;
      if (!site.settings.adminPassHash && keepHash) site.settings.adminPassHash = keepHash;
      state = site;
      urlCache = {}; alphaCache = {};
      save();
      return state;
    });
  }

  /* ---------------- публикация прямо из браузера ----------------
     Пишем витрину в репозиторий через Git Data API одним коммитом.
     Токен приходит параметром, нигде не сохраняется и не логируется. */
  function ghError(r) {
    return r.json().catch(function () { return {}; }).then(function (e) {
      var msg = e.message || ('HTTP ' + r.status);
      if (r.status === 401) msg = 'Токен не принят: истёк или скопирован не полностью';
      if (r.status === 403) msg = 'Нет прав на запись. Проверьте, что у токена стоит Contents: Read and write и выбран нужный репозиторий';
      if (r.status === 404) msg = 'Репозиторий или ветка не найдены — проверьте раздел github в config.js';
      if (r.status === 409) msg = 'Файл на GitHub успел измениться. Обновите страницу и опубликуйте заново';
      throw new Error(msg);
    });
  }

  /* Проверка токена: обращаемся к самому репозиторию. Ответ 200 означает,
     что токен настоящий и выдан на этот репозиторий. */
  function checkGitHubToken(token) {
    var cfg = (window.FHH_CONFIG || {}).github || {};
    if (!cfg.owner || !cfg.repo) return Promise.resolve(false);
    return fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* Файлы медиа уезжают в репозиторий отдельными файлами, а не base64 внутри
     site.json. Так посетитель не качает всю витрину одним куском, GitHub Pages
     отдаёт картинки с кешем, а сам site.json остаётся в пару десятков КБ.
     Всё — одним коммитом через Git Data API, иначе Actions пересобирал бы
     сайт на каждый файл. */
  var MEDIA_DIR = 'assets/media';

  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        res(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = function () { rej(new Error('не удалось прочитать файл')); };
      fr.readAsDataURL(blob);
    });
  }

  /* Что именно уедет: новые файлы + карта «ссылка -> путь в репозитории» */
  function collectMedia() {
    var pub = state.mediaPub || (state.mediaPub = {});
    var refs = usedBlobRefs();
    var map = {}, fresh = [];
    return refs.reduce(function (chain, ref) {
      return chain.then(function () {
        if (pub[ref]) { map[ref] = pub[ref]; return null; }
        return mediaBlob(ref).then(function (blob) {
          if (!blob) return null;
          var path = MEDIA_DIR + '/' + blobKey(ref) + '.' + refExt(ref, blob);
          map[ref] = path;
          return blobToBase64(blob).then(function (b64) {
            fresh.push({ ref: ref, path: path, base64: b64, bytes: blob.size });
          });
        });
      });
    }, Promise.resolve()).then(function () {
      return { map: map, fresh: fresh };
    });
  }

  /* Копия витрины для публикации: локальные ссылки заменены путями файлов */
  function publishPack(map) {
    var pub = clone(state);
    delete pub.settings.adminPass;
    delete pub.settings.adminPassHash;
    delete pub.mediaPub;
    (pub.items || []).forEach(function (it) {
      it.images = (it.images || []).map(function (r) { return map[r] || r; });
    });
    (pub.services || []).forEach(function (sv) {
      sv.images = (sv.images || []).map(function (r) { return map[r] || r; });
    });
    pub.settings.aboutPhotos = (pub.settings.aboutPhotos || []).map(function (r) { return map[r] || r; });
    var now = new Date().toISOString();
    pub.savedAt = now;
    return JSON.stringify({ v: 2, exported: now, publishedAt: now, site: pub, media: {} }, null, 2);
  }

  function publishToGitHub(token, message, onStep) {
    var cfg = (window.FHH_CONFIG || {}).github || {};
    if (!cfg.owner || !cfg.repo) {
      return Promise.reject(new Error('В config.js не заполнен раздел github'));
    }
    var branch = cfg.branch || 'main';
    var path = cfg.path || 'data/site.json';
    var base = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo;
    var H = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
    var step = onStep || function () {};

    function post(url, body) {
      return fetch(base + url, { method: 'POST', headers: H, body: JSON.stringify(body) })
        .then(function (r) { return r.ok ? r.json() : ghError(r); });
    }
    function get(url) {
      return fetch(base + url, { headers: H })
        .then(function (r) { return r.ok ? r.json() : ghError(r); });
    }

    var pack, files, headSha, treeSha, bytes = 0;

    step('собираем файлы…');
    return collectMedia().then(function (m) {
      files = m.fresh;
      pack = publishPack(m.map);
      bytes = pack.length + files.reduce(function (n, f) { return n + f.bytes; }, 0);

      // 1. новые медиа -> git-блобы
      var i = 0;
      return files.reduce(function (chain, f) {
        return chain.then(function () {
          step('загружаем файл ' + (++i) + ' из ' + files.length + '…');
          return post('/git/blobs', { content: f.base64, encoding: 'base64' })
            .then(function (r) { f.sha = r.sha; });
        });
      }, Promise.resolve());
    }).then(function () {
      step('читаем ветку…');
      return get('/git/ref/heads/' + encodeURIComponent(branch));
    }).then(function (r) {
      headSha = r.object.sha;
      return get('/git/commits/' + headSha);
    }).then(function (c) {
      treeSha = c.tree.sha;
      step('собираем коммит…');
      var tree = files.map(function (f) {
        return { path: f.path, mode: '100644', type: 'blob', sha: f.sha };
      });
      tree.push({ path: path, mode: '100644', type: 'blob', content: pack });
      return post('/git/trees', { base_tree: treeSha, tree: tree });
    }).then(function (t) {
      return post('/git/commits', {
        message: message || ('Витрина: обновление содержимого' +
          (files.length ? ' (+' + files.length + ' файл(ов) медиа)' : '')),
        tree: t.sha,
        parents: [headSha]
      });
    }).then(function (c) {
      step('обновляем ветку…');
      return fetch(base + '/git/refs/heads/' + encodeURIComponent(branch), {
        method: 'PATCH', headers: H, body: JSON.stringify({ sha: c.sha })
      }).then(function (r) { return r.ok ? r.json() : ghError(r); })
        .then(function () { return c; });
    }).then(function (c) {
      // запоминаем, что эти файлы уже в репозитории — второй раз не польются
      files.forEach(function (f) { state.mediaPub[f.ref] = f.path; });
      save();
      return { commit: (c.sha || '').slice(0, 7), bytes: bytes, files: files.length, json: pack.length };
    });
  }

  /* Оценка веса публикации — панель показывает её до отправки */
  function publishSize() {
    var refs = usedBlobRefs();
    var pub = state.mediaPub || {};
    var newRefs = refs.filter(function (r) { return !pub[r]; });
    return Promise.all(newRefs.map(mediaBlob)).then(function (list) {
      var bytes = 0, videos = 0, biggest = 0;
      list.forEach(function (b, i) {
        if (!b) return;
        bytes += b.size;
        if (b.size > biggest) biggest = b.size;
        if (mediaKind(newRefs[i]) === 'video') videos++;
      });
      return { files: newRefs.length, bytes: bytes, videos: videos, biggest: biggest };
    });
  }

  /* ---------------- справочники по витрине ---------------- */
  function cat(id) {
    return (state.categories || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  function group(id) {
    return (state.groups || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  function groupOfItem(it) {
    var c = cat(it && it.cat);
    return c ? c.group : '';
  }
  function catsOfGroup(gid) {
    return (state.categories || []).filter(function (c) { return c.group === gid; });
  }
  function itemsOfGroup(gid) {
    return (state.items || []).filter(function (it) { return !it.hidden && groupOfItem(it) === gid; });
  }

  /* ---------------- публичный API ---------------- */
  NS.store = {
    DEFAULTS: DEFAULTS,
    TOKENS: TOKENS,
    ROLES: ROLES,
    BUILTIN_PALETTES: BUILTIN_PALETTES,
    MASTER_PHOTOS: MASTER_PHOTOS,
    SCHEMA: SCHEMA,
    get state() { return state || load(); },
    load: load,
    save: save,
    hydrate: hydrate,
    publishToGitHub: publishToGitHub,
    publishSize: publishSize,
    checkGitHubToken: checkGitHubToken,
    reset: reset,
    uid: uid,
    clone: clone,
    resolveImage: resolveMedia,
    resolveMedia: resolveMedia,
    mediaKind: mediaKind,
    isBlobRef: isBlobRef,
    hasAlpha: hasAlpha,
    ingestFile: ingestFile,
    ingestFont: ingestFont,
    FONTS: FONTS,
    usedBlobRefs: usedBlobRefs,
    dropImage: function (ref) {
      if (isBlobRef(ref)) { delete urlCache[ref]; delete alphaCache[ref]; return idbDel(blobKey(ref)); }
      return Promise.resolve();
    },
    exportJSON: exportJSON,
    importJSON: importJSON,
    cat: cat,
    group: group,
    groupOfItem: groupOfItem,
    catsOfGroup: catsOfGroup,
    itemsOfGroup: itemsOfGroup,
    catName: function (id) { var c = cat(id); return c ? c.name : ''; },
    groupName: function (id) { var g = group(id); return g ? g.name : ''; },
    /* цвет роли: roleAccent -> 'rust' -> '#d9772f' */
    roleColor: function (role) {
      var st = state.settings;
      var tok = st[role];
      return st[tok] || tok || st.ink;
    },
    allPalettes: function () {
      return BUILTIN_PALETTES.concat(state.palettes || []);
    },
    statusLabel: function (s) {
      return s === 'sold' ? 'продано' : s === 'order' ? 'под заказ' : 'в наличии';
    },
    serviceLabel: function (s) {
      return s === 'closed' ? 'сейчас не провожу'
           : s === 'order' ? 'по договорённости' : 'запись открыта';
    },
    money: function (n) {
      if (n === null || n === undefined || n === '') return '—';
      return Number(n).toLocaleString('ru-RU') + ' ' + state.settings.currency;
    }
  };

  load();
})(window.FHh);
