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
/* Всё, что игра НАПИСАЛА на экране за кадр. Подсказки, ценники и подписи —
   локальные переменные внутри отрисовки, наружу их не достать; а врут они
   не реже, чем считает бой. Подменяем fillText и собираем строки. */
/* Кроме самого текста запоминаем, ГДЕ он нарисован и какой выключкой: без
   этого не проверить, влезает ли строка в отведённое место. На этом стенд
   уже спотыкался — следил за длиной подписи, а срезало её положением. */
const drawn = [], marks = [];
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'fillText') return (s, x, y) => {
        drawn.push(String(s));
        marks.push({ s: String(s), x, y, al: t.textAlign || 'left',
                     size: parseFloat(t.font) || 10, w: String(s).length * 5 });
      };
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
const canvasHandlers = {};
function makeCanvas(w, h) {
  return {
    width: w || 520, height: h || 640, _ctx: null,
    getContext() { return this._ctx || (this._ctx = makeCtx()); },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
    // мышь по холсту тоже надо уметь: пояс, руны и зелья живут только там
    addEventListener(type, fn) { (canvasHandlers[type] || (canvasHandlers[type] = [])).push(fn); },
    style: {},
  };
}

const store = {};
const docHandlers = {};
/* Кнопки под игрой (⚔ сменить меч, 🎒 инвентарь, 🩸 мутация, ⏸ пауза…).
   Раньше getElementById отвечал на них null, onBtn молча ничего не вешал —
   и весь этот ряд не проверялся ничем. Ровно там и жило «мутацию можно
   сжечь на паузе»: клавиша R закрыта, а кнопка рядом с ней открыта. */
const buttons = {};
function makeButton(id) {
  return buttons[id] || (buttons[id] = {
    id, textContent: '', fns: [],
    addEventListener(type, fn) { if (type === 'click') this.fns.push(fn); },
    blur() {},
  });
}
const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Date, RegExp,
  Infinity, NaN, Uint8Array, Uint8ClampedArray, isFinite, parseInt, parseFloat,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  requestAnimationFrame: () => 0,
  /* Клавиатуру раньше глушили вместе со всем document — и весь разбор нажатий
     не проверялся ничем. Так и уцелело «E у доски закрывает тоже»: строки в
     interact() были, добраться до них было нельзя. Ловим обработчики. */
  document: {
    getElementById: id => (id === 'game' ? sandbox.__canvas : makeButton(id)),
    createElement: () => makeCanvas(1, 1),
    addEventListener(type, fn) { (docHandlers[type] || (docHandlers[type] = [])).push(fn); },
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

/* ---- клавиатура и то, что вышло на экран ---------------------------- */
// Нажатие. code — как в браузере: 'KeyE', 'Digit1', 'Escape'.
function key(code, opt) {
  const e = Object.assign({ code, repeat: false, target: null, preventDefault() {} }, opt || {});
  for (const fn of docHandlers.keydown || []) fn(e);
  for (const fn of docHandlers.keyup || []) fn({ code });
}
// Кадр отрисовки + все строки, которые он написал.
function frame() {
  drawn.length = 0; marks.length = 0;
  sandbox.__W.render();
  return drawn.slice();
}
/* Те же строки, но с местом: {s, x, y, al, size, w}. Границы по горизонтали
   считает span(): для выключки по центру и вправо начало отсчитывается от
   ширины, как это делает сам холст. */
function frameMarks() { frame(); return marks.slice(); }
function span(m) {
  const x0 = m.al === 'center' ? m.x - m.w / 2 : m.al === 'right' ? m.x - m.w : m.x;
  return { x0, x1: x0 + m.w };
}
// Есть ли среди написанного строка с таким куском.
function said(lines, part) { return lines.some(s => s.indexOf(part) >= 0); }
// Нажать кнопку под игрой по её id из index.html.
function click(id) {
  const b = buttons[id];
  if (!b) throw new Error('такой кнопки игра не заводила: ' + id);
  for (const fn of b.fns) fn();
  return b;
}
// Клик по холсту: бьём по последней подходящей кнопке, ровно как pointerdown.
function tap(x, y) {
  for (const fn of canvasHandlers.pointerdown || []) {
    fn({ clientX: x, clientY: y, button: 0, preventDefault() {} });
  }
}

module.exports = { W: sandbox.__W, store, sandbox, ok, note, head, done, makeCanvas, GAME,
                   key, frame, frameMarks, span, said, click, tap, buttons,
                   peek: name => vm.runInContext(name, sandbox) };
