/* =======================================================================
   СТЕНД — обвязка, на которой гоняются все проверки.

   Игра написана под браузер: холст, localStorage, requestAnimationFrame.
   Ничего этого в node нет, а проверять хочется — поэтому подставляем
   заглушки и запускаем game.js как есть, без единой правки в самой игре.

   Наружу игра смотрит через globalThis.__W — это её собственные ручки,
   объявленные в самом конце game.js. Стенд ничего не знает о внутренностях
   и не лезет в замыкания: что не выставлено в __W, то и не проверяется.

   ВАЖНО про время. Песочница vm заметно медленнее обычного кода: доступ к
   глобалям идёт через посредника. Замеры ВНУТРИ стенда годятся только для
   сравнения «до и после» на одном и том же стенде — переносить их в
   миллисекунды браузера нельзя. Один раз на этом уже обожглись: стройка
   мира показала 9.2 секунды, а на деле их 0.2.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = process.env.WITCHER_GAME || path.join(__dirname, '..', 'game.js');

/* Холст-заглушка. Рисовать некуда, поэтому все действия — пустышки, но
   измерения (measureText) отвечают правдоподобно: без этого обрезка длинных
   имён зациклилась бы. */
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return s => ({ width: String(s).length * 5 });
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: [] });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeCanvas(w, h) {
  return {
    width: w || 520, height: h || 640, _ctx: null,
    getContext() { return this._ctx || (this._ctx = makeCtx()); },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
    addEventListener() {}, style: {},
  };
}

const store = {};
const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Date, RegExp,
  Infinity, NaN, Uint8Array, Uint8ClampedArray, isFinite, parseInt, parseFloat,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  requestAnimationFrame: () => 0,
  document: {
    getElementById: id => (id === 'game' ? sandbox.__canvas : null),
    createElement: () => makeCanvas(1, 1),
    addEventListener() {},
    fullscreenElement: null,
  },
  devicePixelRatio: 1,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.__canvas = makeCanvas();
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(GAME, 'utf8'), sandbox, { filename: GAME });

if (!sandbox.__W) throw new Error('game.js не выставил globalThis.__W — стенду не за что взяться');

/* ---- счёт проверок ---------------------------------------------------
   ok() пишет строку и запоминает провал; done() подводит итог и ставит
   код возврата, чтобы run.js увидел падение, а не только прочитал текст. */
let failed = 0, passed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ок  ' + msg); }
  else { failed++; console.log(' БАГ  ' + msg); }
  return !!cond;
}
function note(msg) { console.log('  ·   ' + msg); }
function head(msg) { console.log('\n=== ' + msg + ' ==='); }
function done() {
  console.log('');
  if (failed) { console.log('УПАЛО ПРОВЕРОК: ' + failed + ' из ' + (failed + passed)); process.exitCode = 1; }
  else console.log('все проверки прошли (' + passed + ')');
  return failed;
}

module.exports = { W: sandbox.__W, store, sandbox, ok, note, head, done, makeCanvas, GAME };
