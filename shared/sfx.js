/* =======================================================================
   ЗВУК — один на все игры, без единого внешнего файла.

   Игры тут открываются двойным щелчком по index.html, поэтому подгружать
   mp3/ogg нельзя: с file:// они не всегда доедут, да и таскать мегабайты
   ради удара мечом глупо. Всё синтезируется на месте из пары осцилляторов
   и щепотки шума — весь «саундтрек» весит четыре килобайта текста.

   Браузер не даёт звучать, пока человек не тронул страницу, поэтому
   звуковой движок заводится ЛЕНИВО, на первом же нажатии или клике.
   До этого все вызовы sfx() просто молчат и ничего не ломают.

   Пользоваться: sfx('hit'), sfx('coin'), sfx.toggle(), sfx.on.
   ======================================================================= */
(function (global) {
  'use strict';

  const KEY = 'sfx_off';
  let ctx = null, master = null;
  let off = false;
  try { off = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function boot() {
    if (ctx || off) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;                              // старый браузер — просто тишина
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  // вкладку могли открыть и сразу свернуть — контекст засыпает, будим по требованию
  function wake() { if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } }

  /* Голос: осциллятор с горкой громкости. Частота умеет ехать (f → f2) —
     этого хватает и на «вжух» меча, и на «дзинь» кроны. */
  function voice(o) {
    const c = boot(); if (!c) return; wake();
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2 && o.f2 !== o.f) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.t);
    const vol = (o.v == null ? 0.3 : o.v);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, o.t * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.t + 0.02);
  }
  /* Шум: короткий кусок случайной волны через фильтр. Это удары, шаги,
     тетива и всё, у чего нет высоты тона. */
  function noise(o) {
    const c = boot(); if (!c) return; wake();
    const t0 = c.currentTime + (o.at || 0);
    const n = Math.max(1, Math.floor(c.sampleRate * o.t));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = o.hp ? 'highpass' : 'lowpass';
    f.frequency.setValueAtTime(o.cut || 1200, t0);
    if (o.cut2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cut2), t0 + o.t);
    const g = c.createGain(); g.gain.value = (o.v == null ? 0.25 : o.v);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + o.t + 0.02);
  }

  /* Словарь звуков. Каждый — три-четыре строчки, зато слышно, что происходит:
     сталь звенит, арбалет щёлкает тетивой, знаки гудят, крона звякает. */
  const BANK = {
    swing:  () => { noise({ t: 0.13, cut: 3000, cut2: 700, v: 0.16, hp: true }); },
    hit:    () => { noise({ t: 0.09, cut: 1800, cut2: 300, v: 0.3 }); voice({ f: 190, f2: 90, t: 0.1, type: 'square', v: 0.14 }); },
    hitwrong: () => { noise({ t: 0.07, cut: 900, cut2: 400, v: 0.12 }); },
    kill:   () => { voice({ f: 240, f2: 70, t: 0.28, type: 'sawtooth', v: 0.2 }); noise({ t: 0.2, cut: 1400, cut2: 200, v: 0.2 }); },
    bolt:   () => { noise({ t: 0.05, cut: 5000, v: 0.2, hp: true }); voice({ f: 900, f2: 1700, t: 0.09, type: 'triangle', v: 0.1 }); },
    blast:  () => { noise({ t: 0.34, cut: 2200, cut2: 120, v: 0.42 }); voice({ f: 120, f2: 40, t: 0.32, type: 'sawtooth', v: 0.22 }); },
    hurt:   () => { voice({ f: 150, f2: 60, t: 0.22, type: 'sawtooth', v: 0.24 }); },
    die:    () => { voice({ f: 300, f2: 45, t: 0.9, type: 'sawtooth', v: 0.26 }); voice({ f: 150, f2: 30, t: 1.0, type: 'sine', v: 0.2, at: 0.05 }); },
    rise:   () => { voice({ f: 180, f2: 460, t: 0.5, type: 'sine', v: 0.2 }); voice({ f: 270, f2: 690, t: 0.5, type: 'triangle', v: 0.12, at: 0.06 }); },
    igni:   () => { noise({ t: 0.42, cut: 700, cut2: 2600, v: 0.24 }); },
    aard:   () => { voice({ f: 420, f2: 70, t: 0.3, type: 'sine', v: 0.3 }); noise({ t: 0.22, cut: 900, cut2: 200, v: 0.2 }); },
    quen:   () => { voice({ f: 330, f2: 660, t: 0.4, type: 'sine', v: 0.18 }); voice({ f: 495, t: 0.4, type: 'sine', v: 0.1, at: 0.03 }); },
    yrden:  () => { voice({ f: 700, f2: 220, t: 0.45, type: 'triangle', v: 0.2 }); },
    coin:   () => { voice({ f: 1180, t: 0.09, type: 'square', v: 0.1 }); voice({ f: 1720, t: 0.11, type: 'square', v: 0.08, at: 0.05 }); },
    pick:   () => { voice({ f: 620, f2: 880, t: 0.08, type: 'triangle', v: 0.14 }); },
    drink:  () => { voice({ f: 300, f2: 520, t: 0.24, type: 'sine', v: 0.18 }); },
    craft:  () => { voice({ f: 480, f2: 720, t: 0.12, type: 'square', v: 0.12 }); voice({ f: 720, f2: 980, t: 0.14, type: 'square', v: 0.1, at: 0.09 }); },
    forge:  () => { noise({ t: 0.12, cut: 2600, cut2: 500, v: 0.3 }); voice({ f: 1400, f2: 700, t: 0.3, type: 'triangle', v: 0.12, at: 0.02 }); },
    ui:     () => { voice({ f: 520, t: 0.045, type: 'square', v: 0.07 }); },
    deny:   () => { voice({ f: 200, f2: 130, t: 0.14, type: 'square', v: 0.1 }); },
    quest:  () => { voice({ f: 523, t: 0.16, type: 'triangle', v: 0.14 });
                    voice({ f: 659, t: 0.16, type: 'triangle', v: 0.14, at: 0.13 });
                    voice({ f: 784, t: 0.3,  type: 'triangle', v: 0.16, at: 0.26 }); },
    level:  () => { voice({ f: 392, t: 0.14, type: 'square', v: 0.12 });
                    voice({ f: 523, t: 0.14, type: 'square', v: 0.12, at: 0.11 });
                    voice({ f: 784, t: 0.36, type: 'square', v: 0.14, at: 0.22 }); },
    mutate: () => { voice({ f: 90, f2: 220, t: 0.7, type: 'sawtooth', v: 0.26 }); noise({ t: 0.5, cut: 400, cut2: 1800, v: 0.16 }); },
  };

  /* Ограничитель: в бою «попадание» может прилететь пятнадцать раз за кадр
     (разрывной болт по толпе), и без этого получится треск вместо звука. */
  const last = {};
  function sfx(name, gap) {
    if (off) return;
    const b = BANK[name]; if (!b) return;
    const now = (ctx ? ctx.currentTime : Date.now() / 1000);
    const g = gap == null ? 0.045 : gap;
    if (last[name] != null && now - last[name] < g) return;
    last[name] = now;
    try { b(); } catch (e) {}                          // звук не должен ронять игру НИКОГДА
  }
  sfx.on = !off;
  sfx.toggle = function () {
    off = !off;
    sfx.on = !off;
    try { localStorage.setItem(KEY, off ? '1' : '0'); } catch (e) {}
    if (!off) { boot(); sfx('ui'); }
    return sfx.on;
  };
  sfx.volume = function (v) { if (boot()) master.gain.value = Math.max(0, Math.min(1, v)); };

  // первый же тычок или нажатие заводит звук: раньше браузер всё равно молчит
  const kick = () => { boot(); wake(); };
  global.addEventListener('pointerdown', kick, { passive: true });
  global.addEventListener('keydown', kick, { passive: true });

  global.sfx = sfx;
})(window);
