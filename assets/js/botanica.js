/* ============================================================
   botanica.js — генеративная ботаника на canvas 2D.
   Всё рисуется заливками без контуров (no-lineart):
   вайи папоротника, перья-листочки, силуэты подлеска.
   ============================================================ */
window.FHh = window.FHh || {};

(function (NS) {
  'use strict';

  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- мелочи ---------------- */
  function rng(seed) {                       // mulberry32
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function hex2rgb(h) {
    h = (h || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]; }

  /* Ботаника берёт цвета из палитры сайта. Внутренние имена остались
     прежними (moss / brass), но приходят они из ролей: зелень вай — из
     --botany, тёплый акцент — из rust. Значения там всегда живым hex,
     а не через var(), иначе canvas их не разберёт. */
  function palette() {
    var moss = hex2rgb(cssVar('--botany', '#1f6b52'));
    var ink = hex2rgb(cssVar('--ink', '#231f20'));
    var brass = hex2rgb(cssVar('--rust', '#d9772f'));
    var paper = hex2rgb(cssVar('--paper', '#eedbb3'));
    return {
      moss: moss, ink: ink, brass: brass, paper: paper,
      deep: mix(moss, ink, .55),
      light: mix(moss, paper, .42),
      warm: mix(moss, brass, .35)
    };
  }

  function fitCanvas(cv, maxDpr) {
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 1.75);
    var r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h, dpr: dpr };
  }

  /* ============================================================
     ЛИСТ И ВАЙЯ
     ============================================================ */

  function leaf(g, len, wid, fill) {
    // рисуется в локальных координатах: черешок в (0,0), кончик по +X
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * .18, -wid, len * .68, -wid * .82, len, 0);
    g.bezierCurveTo(len * .68, wid * .82, len * .18, wid, 0, 0);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  /**
   * Вайя папоротника.
   * f: {x,y,ang,len,segs,curve,pinna,width,seed,detail,group,tone}
   * grow 0..1 — насколько раскрылась; curl 0..1 — насколько ещё свёрнута улитка.
   */
  function frond(g, f, grow, curl, pal, alpha) {
    if (grow <= 0.001) return;
    var R = rng(f.seed);
    var segs = f.segs;
    var step = f.len / segs;
    var x = 0, y = 0, a = 0;
    var curlAmt = f.curlAmt === undefined ? 3.05 : f.curlAmt;
    var toneA = f.tone === 'deep' ? pal.deep : f.tone === 'warm' ? pal.warm : pal.moss;
    var toneB = f.tone === 'deep' ? pal.moss : pal.light;

    // 1) считаем скелет
    var pts = [], i, t;
    for (i = 0; i <= segs; i++) {
      t = i / segs;
      pts.push([x, y, a, t]);
      // f.curve — полный изгиб вайи в радианах; curlAmt — витки улитки на кончике
      a += f.curve / segs + curl * curlAmt * (6.0 / segs) * Math.pow(t, 1.6);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
    }

    var shown = grow * segs;
    var jitter = [];
    for (i = 0; i <= segs; i++) jitter.push(R());

    g.save();
    g.translate(f.x, f.y);
    g.rotate(f.ang);

    // 2) рахис (стебель) — заливка без обводки
    var last = Math.min(segs, Math.floor(shown));
    if (last > 1) {
      g.beginPath();
      var w0 = f.width;
      for (i = 0; i <= last; i++) {
        t = i / segs;
        var wv = w0 * (1 - t) * 0.5 + .35;
        g.lineTo(pts[i][0] + Math.cos(pts[i][2] + Math.PI / 2) * wv,
                 pts[i][1] + Math.sin(pts[i][2] + Math.PI / 2) * wv);
      }
      for (i = last; i >= 0; i--) {
        t = i / segs;
        var wv2 = w0 * (1 - t) * 0.5 + .35;
        g.lineTo(pts[i][0] - Math.cos(pts[i][2] + Math.PI / 2) * wv2,
                 pts[i][1] - Math.sin(pts[i][2] + Math.PI / 2) * wv2);
      }
      g.closePath();
      g.fillStyle = rgba(pal.deep, .55 * alpha);
      g.fill();
    }

    // 3) перья
    var skip = f.detail ? 1 : 2;
    for (i = 2; i <= segs; i += skip) {
      var loc = shown - i;
      if (loc <= 0) break;
      var open = clamp(loc / 4.5, 0, 1);
      open = easeOut(open);
      t = i / segs;
      var p = pts[i];
      // длина пера: максимум в нижней трети, сходит на нет к кончику
      var pl = f.pinna * Math.sin(Math.PI * Math.pow(t, .62)) * (0.78 + jitter[i] * 0.42);
      pl *= open;
      if (pl < .6) continue;
      var pw = pl * (0.30 + jitter[i] * 0.09);
      var droop = (0.22 + jitter[i] * 0.2) * (1 - t) + curl * 0.5;
      var col = rgba(mix(toneA, toneB, t * .75 + jitter[i] * .2), (0.38 + jitter[i] * 0.34) * alpha);

      var s;
      for (s = -1; s <= 1; s += 2) {
        g.save();
        g.translate(p[0], p[1]);
        g.rotate(p[2] + s * (1.02 + droop * s * 0.12) - s * 0.28 * (1 - t));
        // мягкий край: крупный полупрозрачный силуэт + плотное ядро
        leaf(g, pl * 1.16, pw * 1.22, rgba(toneA, 0.12 * alpha * open));
        leaf(g, pl, pw, col);
        if (f.detail && pl > 9) {           // доли пера — узнаваемая «резная» кромка
          var k;
          for (k = 1; k <= 3; k++) {
            var kt = k / 4;
            g.save();
            g.translate(pl * kt * .9, 0);
            g.rotate(-0.5 - kt * .3);
            leaf(g, pl * (0.34 - kt * .06), pw * .5, rgba(mix(toneA, toneB, .5), 0.16 * alpha * open));
            g.restore();
          }
        }
        g.restore();
      }
    }

    // 4) «улитка» на кончике, пока вайя не раскрылась
    if (curl > 0.04 && last > 1) {
      var tip = pts[Math.min(segs, Math.max(1, last))];
      g.save();
      g.translate(tip[0], tip[1]);
      g.rotate(tip[2]);
      var rr = f.pinna * 0.55 * curl;
      g.beginPath();
      var turns = 2.4, k2;
      for (k2 = 0; k2 <= 60; k2++) {
        var q = k2 / 60;
        var ang2 = q * Math.PI * 2 * turns;
        var rad = rr * (1 - q * .92);
        g.lineTo(Math.cos(ang2) * rad + rr, Math.sin(ang2) * rad);
      }
      g.strokeStyle = rgba(pal.deep, .5 * alpha * curl);
      g.lineWidth = Math.max(1, f.width * .8 * curl);
      g.lineCap = 'round';
      g.stroke();
      g.restore();
    }

    g.restore();
  }

  /* Конструктор набора вай под размер экрана */
  function buildFronds(w, h, seed, density) {
    var R = rng(seed);
    var out = [];
    var scale = Math.min(w, h) / 760;
    var base = Math.max(w, h);
    var n = Math.round((window.innerWidth < 720 ? 7 : 12) * (density || 1));
    var i;
    for (i = 0; i < n; i++) {
      var side = i % 2 === 0 ? -1 : 1;                     // левая / правая кулиса
      var deep = i > n * 0.5;
      // раскладываем по всей высоте кадра, а не только по низу
      var slot = (i % Math.ceil(n / 2)) / Math.max(1, Math.ceil(n / 2) - 1);
      var yy = h * (0.06 + slot * 0.98 + (R() - .5) * 0.16);
      var up = yy > h * 0.55 ? -1 : 1;                     // низ растёт вверх, верх — вниз
      out.push({
        x: side < 0 ? -w * 0.05 - R() * w * 0.05 : w * 1.05 + R() * w * 0.05,
        y: yy,
        ang: side < 0 ? up * (0.34 + R() * 0.62) : Math.PI - up * (0.34 + R() * 0.62),
        len: base * (0.42 + R() * 0.34) * (deep ? .74 : 1),
        segs: deep ? 32 : 44,
        curve: -0.55 - R() * 0.85,
        curlAmt: 2.6 + R() * 1.2,
        pinna: (32 + R() * 22) * scale * (deep ? .78 : 1),
        width: (3.6 + R() * 2.4) * scale,
        seed: (seed + i * 977) >>> 0,
        detail: !deep,
        group: side,
        tone: deep ? 'deep' : (R() > .72 ? 'warm' : 'moss'),
        depth: deep ? 0.5 : 1,
        phase: R() * 6.28
      });
    }
    // пара «нижних» вай — растут снизу вверх, дают глубину кадра
    for (i = 0; i < Math.round(3 * (density || 1)); i++) {
      out.push({
        x: w * (0.2 + R() * 0.6), y: h * 1.06,
        ang: -Math.PI / 2 + (R() - .5) * .5,
        len: base * (0.3 + R() * 0.22),
        segs: 34, curve: -0.6 - R() * 0.7, curlAmt: 3.1,
        pinna: (26 + R() * 18) * scale, width: 3.4 * scale,
        seed: (seed + 5000 + i * 31) >>> 0,
        detail: false, group: R() > .5 ? 1 : -1, tone: 'deep', depth: .5, phase: R() * 6.28
      });
    }
    return out;
  }

  /* ============================================================
     ПРЕЛОАДЕР
     ============================================================ */
  function preloader(canvas, opts) {
    opts = opts || {};
    var pal = palette();
    var maxDpr = window.innerWidth < 720 ? 1.25 : 1.75;
    var fit = fitCanvas(canvas, maxDpr);
    var fronds = buildFronds(fit.w, fit.h, 20260906, opts.density || 1);
    var progress = 0, shown = 0;
    var REVEAL_MS = 1150;
    var reveal = 0, revealT0 = 0, done = null, raf = 0, t0 = performance.now();
    var lastNow = t0;
    var alive = true;

    function resize() {
      fit = fitCanvas(canvas, window.innerWidth < 720 ? 1.25 : 1.75);
      fronds = buildFronds(fit.w, fit.h, 20260906, opts.density || 1);
    }
    window.addEventListener('resize', resize);

    function draw(now) {
      if (!alive) return;
      var g = fit.g, w = fit.w, h = fit.h;
      var time = (now - t0) / 1000;
      var dt = Math.min(120, now - lastNow); lastNow = now;

      // догоняющее заполнение по времени, а не по числу кадров:
      // вкладка в фоне не должна оставлять вайи недоросшими
      shown += (progress - shown) * (1 - Math.exp(-dt / 210));
      var grow = easeOut(clamp(shown, 0, 1));
      var curl = 1 - easeInOut(clamp(shown * 1.12, 0, 1));

      g.clearRect(0, 0, w, h);

      // «наплыв кадра»: камера едет вперёд, кулисы разъезжаются
      var rv = easeInOut(reveal);
      g.save();
      g.translate(w / 2, h / 2);
      g.scale(1 + rv * 0.85, 1 + rv * 0.85);
      g.translate(-w / 2, -h / 2);

      var i;
      for (i = 0; i < fronds.length; i++) {
        var f = fronds[i];
        var sway = Math.sin(time * 0.38 + f.phase) * 0.016 * (RM ? 0 : 1);
        var saved = { x: f.x, ang: f.ang };
        f.x += f.group * rv * w * 0.55 * f.depth;
        f.ang += sway + f.group * rv * 0.22;
        var a = (0.55 + f.depth * 0.45) * (1 - rv * 0.85);
        frond(g, f, clamp(grow * (0.75 + f.depth * 0.35), 0, 1), curl, pal, a);
        f.x = saved.x; f.ang = saved.ang;
      }
      g.restore();

      if (revealT0) {
        reveal = clamp((now - revealT0) / REVEAL_MS, 0, 1);
        if (reveal >= 1 && done) { var cb = done; done = null; cb(); }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return {
      set: function (p) { progress = clamp(p, 0, 1); },
      reveal: function (cb) {
        revealT0 = performance.now();
        done = cb;
        // страховка: если вкладка ушла в фон и rAF замер — доводим сцену принудительно
        setTimeout(function () {
          if (done) { var c = done; done = null; reveal = 1; c(); }
        }, REVEAL_MS + 450);
      },
      destroy: function () {
        alive = false; cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      }
    };
  }

  /* ============================================================
     БОТАНИКА ГЕРОЯ — АКЦЕНТ, А НЕ ОБОИ
     Две-три крупные вайи заякорены в углы кадра и обрамляют
     заголовок, центр остаётся пустым. Рисуется ОДИН раз
     (и заново при смене размера), никакого цикла кадров.
     ============================================================ */
  function heroBotany(canvas, opts) {
    opts = opts || {};
    var rt = 0;

    function draw() {
      if (RM) return;
      // Раздел может быть скрыт (display:none) — тогда холст нулевого
      // размера, и пересборка ужала бы битмап до 1×1. Вернувшись на
      // главную, посетитель увидел бы пустой герой без папоротников.
      var box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;

      var fit = fitCanvas(canvas, window.innerWidth < 720 ? 1.25 : 1.75);
      var g = fit.g, w = fit.w, h = fit.h;
      g.clearRect(0, 0, w, h);
      if (!w || !h) return;

      var pal = palette();
      var mobile = w < 720;
      var base = Math.min(w, h);
      var scale = base / 720;
      var R = rng(20260906);

      // тонкие дуги — «рамка» кадра (приём из референса iris)
      g.save();
      g.strokeStyle = rgba(pal.brass, mobile ? .16 : .22);
      g.lineWidth = 1;
      var arcs = [
        [w * 0.5, h * 1.32, base * 1.02],
        [w * 0.5, h * 1.32, base * 1.24]
      ];
      arcs.forEach(function (a) {
        g.beginPath();
        g.arc(a[0], a[1], a[2], Math.PI * 1.06, Math.PI * 1.94);
        g.stroke();
      });
      g.restore();

      // якоря по углам: центр кадра остаётся чистым под типографику
      // углы кадра: вайи идут почти вдоль кромки и не заходят в центр
      var anchors = mobile
        ? [
            { x: -w * .16, y: h * 1.0, ang: -0.30, len: .95, a: .8, tone: 'moss', detail: true },
            { x: w * 1.16, y: -h * .02, ang: Math.PI - 0.30, len: .8, a: .5, tone: 'deep', detail: false }
          ]
        : [
            { x: -w * .1, y: h * 1.08, ang: -0.22, len: 1.0, a: .85, tone: 'moss', detail: true },
            { x: w * 1.12, y: -h * .04, ang: Math.PI - 0.26, len: .8, a: .62, tone: 'deep', detail: true },
            { x: w * 1.1, y: h * 1.06, ang: Math.PI + 0.24, len: .62, a: .45, tone: 'warm', detail: false }
          ];

      anchors.forEach(function (an, i) {
        var f = {
          x: an.x, y: an.y, ang: an.ang,
          len: Math.max(w, h) * (0.56 * an.len),
          segs: an.detail ? 44 : 34,
          curve: -0.62 - R() * 0.42,
          curlAmt: 2.8,
          pinna: (40 + R() * 18) * scale * an.len,
          width: 5 * scale,
          seed: (778 + i * 313) >>> 0,
          detail: an.detail,
          tone: an.tone
        };
        g.save();
        g.globalAlpha = an.a * (opts.alpha === undefined ? 1 : opts.alpha);
        frond(g, f, 1, 0, pal, 1);
        g.restore();
      });
    }
    draw();

    function onResize() { clearTimeout(rt); rt = setTimeout(draw, 240); }
    window.addEventListener('resize', onResize);

    return {
      redraw: draw,
      destroy: function () { window.removeEventListener('resize', onResize); }
    };
  }

  /* ============================================================
     ПЕРЕХОД-ЗАНАВЕС ИЗ ЛИСТВЫ
     Лист запекается в спрайт, кадр — только drawImage,
     без построения путей и заливок на каждый лист.
     ============================================================ */
  var LEAF_L = 96, LEAF_W = 30, LEAF_PAD = 5;
  var leafBank = {}, leafBankKey = '';

  function leafSprite(pal, key, color) {
    if (leafBankKey !== key) { leafBank = {}; leafBankKey = key; }
    if (leafBank[color]) return leafBank[color];
    var c = document.createElement('canvas');
    c.width = LEAF_L + LEAF_PAD * 2;
    c.height = LEAF_W * 2 + LEAF_PAD * 2;
    var g = c.getContext('2d');
    g.translate(LEAF_PAD, LEAF_W + LEAF_PAD);
    // мягкий край: широкий полупрозрачный силуэт + плотное ядро,
    // чтобы лист не читался плоской кляксой
    g.globalAlpha = 0.34; leaf(g, LEAF_L, LEAF_W * 1.14, color);
    g.globalAlpha = 0.62; leaf(g, LEAF_L * 0.94, LEAF_W * 0.9, color);
    g.globalAlpha = 1;
    leafBank[color] = c;
    return c;
  }

  /* Маленькие веточки для перехода: запекаются один раз на палитру.
     Одиночные листья на просвет читались одинаковыми овалами. */
  var SPRIG_L = 150;
  var sprigBank = [], sprigKey = '';
  function sprigSprite(pal, key, i) {
    if (sprigKey !== key) { sprigBank = []; sprigKey = key; }
    if (sprigBank[i]) return sprigBank[i];
    var R = rng(9000 + i * 137);
    var size = Math.ceil(SPRIG_L * 1.6);
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var ox = size * 0.1, oy = size / 2;
    g.translate(ox, oy);
    frond(g, {
      x: 0, y: 0, ang: 0,
      len: SPRIG_L, segs: 20,
      curve: -0.45 - R() * 0.6, curlAmt: 2.2,
      pinna: 15 + R() * 9, width: 1.5,
      seed: (700 + i * 57) >>> 0, detail: false,
      tone: i % 3 === 0 ? 'deep' : i % 3 === 1 ? 'moss' : 'warm'
    }, 1, 0, pal, 1);
    sprigBank[i] = { cv: c, ox: ox, oy: oy };
    return sprigBank[i];
  }

  function wipe(canvas) {
    var running = false;

    /**
     * Переход-«вдох»: кадр мягко забирается бумажным цветом сайта, сквозь
     * него плывёт негустая листва, в середине экран перекрыт полностью —
     * там и подменяется содержимое, — потом всё так же мягко расходится.
     * Обе половины по ease-in-out, подмена по таймеру, а не по кадру.
     */
    function run(seed, dur, onMid) {
      if (RM) { if (onMid) onMid(); return Promise.resolve(); }
      if (running) { if (onMid) onMid(); return Promise.resolve(); }
      running = true;

      var pal = palette();
      var pkey = pal.moss.join() + pal.deep.join();
      var fit = fitCanvas(canvas, Math.min(window.devicePixelRatio || 1, 1.5));
      var w = fit.w, h = fit.h, g = fit.g;
      var R = rng(seed || 1);
      var mobile = w < 720;
      var N = mobile ? 9 : 16;
      var scale = Math.min(w, h) / 900;
      var drift = Math.max(90, h * 0.16);        // листва плывёт, а не пролетает

      var leaves = [], i;
      for (i = 0; i < N; i++) {
        leaves.push({
          x: R() * w,
          y: R() * (h + drift * 2) - drift,
          len: (110 + R() * 240) * (0.55 + scale),
          ang: R() * 6.283,
          spin: (R() - .5) * 0.55,
          dx: (R() - .5) * drift * 0.5,
          dy: -drift * (0.4 + R() * 0.8),
          d: R() * 0.28,                         // своя фаза появления
          a: 0.13 + R() * 0.17,
          sprite: sprigSprite(pal, pkey, i % 9)
        });
      }

      dur = dur || 1150;
      var T_IN = 0.40, T_OUT = 0.60;             // между ними кадр закрыт целиком

      var vign = g.createRadialGradient(w * .5, h * .5, Math.min(w, h) * .2,
                                        w * .5, h * .5, Math.max(w, h) * .75);
      vign.addColorStop(0, rgba(pal.paper, 0));
      vign.addColorStop(1, rgba(pal.deep, .10));

      canvas.classList.add('is-on');
      var start = performance.now(), mid = false, finished = false;

      function finish(res) {
        if (finished) return;
        finished = true;
        g.clearRect(0, 0, w, h);
        canvas.classList.remove('is-on');
        running = false;
        res();
      }

      return new Promise(function (res) {
        function step(now) {
          if (finished) return;
          var t = clamp((now - start) / dur, 0, 1);

          // плотность полога: 0 → 1 (ease-in-out), выдержка, 1 → 0 (ease-in-out)
          var veil = t < T_IN ? easeInOut(t / T_IN)
                   : t < T_OUT ? 1
                   : 1 - easeInOut((t - T_OUT) / (1 - T_OUT));

          g.clearRect(0, 0, w, h);
          if (veil <= 0.001) { if (t < 1) { requestAnimationFrame(step); } else { finish(res); } return; }

          g.globalAlpha = veil;
          g.fillStyle = rgba(pal.paper, 1);
          g.fillRect(0, 0, w, h);
          g.fillStyle = vign;
          g.fillRect(0, 0, w, h);
          g.globalAlpha = 1;

          // листва: медленный подъём, плотность идёт за пологом
          var e = easeInOut(t);
          for (i = 0; i < leaves.length; i++) {
            var b = leaves[i];
            var lt = clamp((t - b.d) / (1 - b.d), 0, 1);
            if (lt <= 0) continue;
            var k = b.len / SPRIG_L;
            g.save();
            g.translate(b.x + b.dx * e, b.y + b.dy * e);
            g.rotate(b.ang + b.spin * e);
            g.scale(k, k);
            g.globalAlpha = b.a * veil;
            g.drawImage(b.sprite.cv, -b.sprite.ox, -b.sprite.oy);
            g.restore();
          }

          if (t < 1) requestAnimationFrame(step);
          else finish(res);
        }

        // подмена содержимого ровно в середине выдержки, по времени, а не по
        // кадру: иначе при редких кадрах она попадает на просвет
        setTimeout(function () { if (!mid) { mid = true; if (onMid) onMid(); } },
                   dur * (T_IN + T_OUT) / 2);

        // страховка на случай троттлинга вкладки
        setTimeout(function () {
          if (!mid) { mid = true; if (onMid) onMid(); }
          finish(res);
        }, dur + 600);

        requestAnimationFrame(step);
      });
    }
    return { run: run };
  }

  /* ============================================================
     ПРОЦЕДУРНАЯ ЗАГЛУШКА КАРТИНКИ
     (пока к работе не приложено фото)
     ============================================================ */
  var phCache = {};
  function placeholder(key, w, h) {
    var pal = palette();
    // палитра входит в ключ кэша: сменили тему в админке — заставки перерисуются
    var ck = key + '|' + w + 'x' + h + '|' + pal.paper.join() + pal.moss.join() + pal.ink.join();
    if (phCache[ck]) return phCache[ck];
    var R = rng(hash(key));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');

    // приглушённый лесной грунт — карточка должна читаться как изображение,
    // а не как пустое место
    var depth = .52 + R() * .24;
    var tintA = mix(pal.paper, pal.moss, depth * .7);
    var tintB = mix(pal.paper, pal.deep, depth + .26);
    var gr = g.createLinearGradient(w * .1, 0, w * .75, h);
    gr.addColorStop(0, 'rgb(' + tintA.join(',') + ')');
    gr.addColorStop(1, 'rgb(' + tintB.join(',') + ')');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);

    // сноп света сверху
    var lx = w * (.25 + R() * .5);
    var rg = g.createRadialGradient(lx, h * .18, 0, lx, h * .3, Math.max(w, h) * .85);
    rg.addColorStop(0, rgba(pal.paper, .38));
    rg.addColorStop(.55, rgba(pal.paper, .07));
    rg.addColorStop(1, rgba(pal.paper, 0));
    g.fillStyle = rg; g.fillRect(0, 0, w, h);

    var scale = Math.min(w, h) / 620;
    var n = 5 + Math.floor(R() * 3), i;
    for (i = 0; i < n; i++) {
      var side = i % 2 ? 1 : -1;
      var yy = h * (.12 + (i / n) * .95 + (R() - .5) * .2);
      var up = yy > h * .5 ? -1 : 1;
      var far = i >= n - 2;
      var f = {
        x: side < 0 ? -w * .08 : w * 1.08,
        y: yy,
        ang: side < 0 ? up * (0.3 + R() * .55) : Math.PI - up * (0.3 + R() * .55),
        len: Math.max(w, h) * (.6 + R() * .55),
        segs: 36, curve: -0.5 - R() * 0.8, curlAmt: 2.8,
        pinna: (34 + R() * 24) * scale * (far ? .7 : 1),
        width: 4.2 * scale,
        seed: (hash(key) + i * 131) >>> 0,
        detail: !far,
        tone: far ? 'deep' : (i % 3 === 2 ? 'warm' : 'moss')
      };
      g.save();
      g.globalAlpha = far ? .3 + R() * .2 : .55 + R() * .35;
      frond(g, f, 1, 0, pal, 1);
      g.restore();
    }

    // виньетка + зерно
    var vg = g.createRadialGradient(w * .5, h * .45, Math.min(w, h) * .25, w * .5, h * .5, Math.max(w, h) * .78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,24,18,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);

    g.globalAlpha = .06;
    for (i = 0; i < (w * h) / 700; i++) {
      g.fillStyle = R() > .5 ? '#000' : '#fff';
      g.fillRect(R() * w, R() * h, 1, 1);
    }
    g.globalAlpha = 1;

    var url = c.toDataURL('image/jpeg', 0.82);
    phCache[ck] = url;
    return url;
  }

  NS.bot = {
    // низкоуровневое — пригодится для отладки и замеров
    frond: frond,
    buildFronds: buildFronds,
    preloader: preloader,
    heroBotany: heroBotany,
    wipe: wipe,
    placeholder: placeholder,
    palette: palette,
    reducedMotion: RM
  };
})(window.FHh);
