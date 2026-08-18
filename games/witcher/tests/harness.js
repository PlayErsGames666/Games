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
   уже спотыкался — следил за длиной подписи, а срезало её положением.

   И ведём сдвиг холста: мир рисуется под translate камеры и подрезан окном
   (clip), поэтому мировые подписи — имена тварей, названия мест — меряются
   в шагах мира, а не в пикселях экрана. Не различать их значит ловить
   «костёр за краем холста» там, где костёр просто далеко. Помечаем world. */
const drawn = [], marks = [];
/* Какими КРАСКАМИ рисовали. Ни одного пикселя стенд наружу не отдаёт, зато
   fillStyle и strokeStyle перед заливкой — отдаёт. Только этим и проверяется
   «взят ли цвет из переданного облика, а не из глобального»: краска — всё,
   что от картинки вообще доступно проверке.

   Включается ТОЛЬКО на время одного вызова (paints()): держи запись всегда —
   и за прогон в ней осядут сотни тысяч строк ни для чего. */
let paint = null;
/* Поворот холста и координаты-пустышки — ещё два следа, по которым картинку
   видно, не видя пикселей.

   spin: лежачий ведьмак от стоячего отличается ТОЛЬКО доворотом холста —
   ни краски, ни текста у него своих нет. Пишем углы ctx.rotate.

   nanw: холст молча глотает путь с NaN в координатах — ни ошибки, ни следа,
   просто пусто на экране. Проверка «не упало» такое пропускает целиком.
   Записываем имя каждого вызова, которому дали не-число. */
let spin = null, nanw = null;
/* То же, что paints(), но с ГУСТОТОЙ мазка: {k:'fill'|'stroke', c, a, w}.
   Одной краски мало там, где правило написано не про цвет, а про прозрачность
   («граница ярче стихии, стихия всегда сквозь»): цвет у горящего пламени и у
   границы разный, а вот кто из них гуще — видно только по globalAlpha. */
let inks = null;
function nanArgs(k, a) {
  if (!nanw) return;
  for (const v of a) if (typeof v === 'number' && v !== v) { nanw.push(k); return; }
}
/* Куда легли точки пути — единственный след ГЕОМЕТРИИ, который холст готов
   отдать: сама краска и поворот фигуры от неё не зависят. Копится только
   moveTo/lineTo. В x/y лежат аргументы КАК ЕСТЬ, в местных осях фигуры;
   в sx/sy — то же место на холсте, со сдвигом и увеличением. Включается на
   время одного вызова, как paints().

   Увеличение (ctx.scale) ведём наравне со сдвигом ради превью у зеркала: оно
   рисуется через translate → scale → translate, и если хоть один сдвиг забыть,
   фигура уедет в несколько раз дальше от угла вместо того, чтобы вырасти на
   месте. По одним лишь местным осям такую ошибку не поймать: они те же. */
let trace = null, arcw = null;
/* Путь, набранный со времени последнего beginPath. Нужен только затем, чтобы
   отдать дугу вместе с той краской, какой её ДЕЙСТВИТЕЛЬНО провели. */
let pathBuf = [];
function flushPath(kind, col, t) {
  for (const el of pathBuf) {
    arcw.push(Object.assign({ k: kind, c: col,
                              al: t.globalAlpha === undefined ? 1 : t.globalAlpha,
                              w: t.lineWidth === undefined ? 1 : t.lineWidth }, el));
  }
}
let tstack = [{ tx: 0, ty: 0, sx: 1, sy: 1, clipped: false }];
const ttop = () => tstack[tstack.length - 1];
// местные оси → холст: сперва растянуть, потом сдвинуть
const scrX = x => ttop().tx + ttop().sx * x;
const scrY = y => ttop().ty + ttop().sy * y;
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'save') return () => tstack.push(Object.assign({}, ttop()));
      if (k === 'restore') return () => { if (tstack.length > 1) tstack.pop(); };
      if (k === 'translate') return (x, y) => {
        nanArgs(k, [x, y]);
        const s = ttop(); s.tx += s.sx * x; s.ty += s.sy * y;
      };
      if (k === 'scale') return (x, y) => {
        nanArgs(k, [x, y]);
        const s = ttop(); s.sx *= x; s.sy *= (y === undefined ? x : y);
      };
      if (k === 'rotate') return a => { nanArgs(k, [a]); if (spin) spin.push(a); };
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => {
        nanArgs(k, [x, y]);
        if (trace) trace.push({ k, x, y, sx: scrX(x), sy: scrY(y) });
      };
      /* Дуги — отдельным списком, а не вместе с moveTo/lineTo: у знаков вся
         граница нарисована одной дугой, и без её радиуса не проверить, не
         врёт ли обещанная дальность. В trace их подмешивать нельзя — там уже
         считают «точки пути», и центр дуги за точку пути не сойдёт.

         Дуга КЛАДЁТСЯ в путь, а записывается только когда её обвели или
         залили — и стиль снимается в тот же миг. Раньше снимали в момент
         ctx.arc, а холст так не работает: путь строят сперва, краску ставят
         после (ровно так нарисована граница знака), и в записи оседал стиль
         ПРЕДЫДУЩЕЙ фигуры. Одну дугу можно обвести дважды — двумя записями
         она и выйдет, что честно: на экране два мазка. */
      if (k === 'beginPath') return () => { pathBuf = []; };
      if (k === 'arc') return (x, y, r, a0, a1, ccw) => {
        nanArgs(k, [x, y, r, a0, a1]);
        if (ccw !== undefined && typeof ccw !== 'boolean') nanArgs(k, [ccw]);
        pathBuf.push({ x, y, r, a0, a1, ccw: !!ccw, sx: scrX(x), sy: scrY(y), rs: r * ttop().sx });
      };
      if (k === 'clip') return () => { ttop().clipped = true; };
      if (k === 'setTransform') return () => { tstack = [{ tx: 0, ty: 0, sx: 1, sy: 1, clipped: false }]; };
      if (k === 'fillText') return (s, x, y) => {
        drawn.push(String(s));
        marks.push({ s: String(s), x: scrX(x), y: scrY(y), al: t.textAlign || 'left',
                     size: parseFloat(t.font) || 10, w: String(s).length * 5,
                     world: ttop().clipped });
      };
      if (k === 'measureText') return s => ({ width: String(s).length * 5 });
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: [] });
      if (k === 'fill' || k === 'fillRect') return (...a) => {
        nanArgs(k, a);
        if (paint) paint.push(String(t.fillStyle));
        if (inks) inks.push({ k: 'fill', c: String(t.fillStyle),
                              a: t.globalAlpha === undefined ? 1 : t.globalAlpha });
        if (arcw && k === 'fill') flushPath('fill', String(t.fillStyle), t);
      };
      if (k === 'stroke' || k === 'strokeRect') return (...a) => {
        nanArgs(k, a);
        if (paint) paint.push(String(t.strokeStyle));
        if (inks) inks.push({ k: 'stroke', c: String(t.strokeStyle),
                              a: t.globalAlpha === undefined ? 1 : t.globalAlpha,
                              w: t.lineWidth === undefined ? 1 : t.lineWidth });
        if (arcw && k === 'stroke') flushPath('stroke', String(t.strokeStyle), t);
      };
      if (k in t) return t[k];
      return (...a) => { nanArgs(k, a); };
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
/* События ОКНА, а не документа: 'blur' приходит только сюда. Пока стенд их
   не знал, window.addEventListener в игре просто ронял загрузку — а заодно
   ничем не проверялось, отпускает ли игра зажатые клавиши при уходе со
   вкладки. Ровно там и жило «ведьмак идёт сам после Alt-Tab». */
const winHandlers = {};
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
sandbox.addEventListener = (type, fn) => { (winHandlers[type] || (winHandlers[type] = [])).push(fn); };
sandbox.removeEventListener = () => {};
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
// Событие окна: winEvent('blur') — ушли со вкладки.
function winEvent(type, ev) { for (const fn of winHandlers[type] || []) fn(ev || { type }); }
// Зажать клавишу и НЕ отпускать: keydown без парного keyup.
function keyDown(code, opt) {
  const e = Object.assign({ code, repeat: false, target: null, preventDefault() {} }, opt || {});
  for (const fn of docHandlers.keydown || []) fn(e);
}
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
function frameMarks() { frame(); return marks.filter(m => !m.world); }
// а если понадобятся и мировые — вот они целиком
function frameMarksAll() { frame(); return marks.slice(); }
function span(m) {
  const x0 = m.al === 'center' ? m.x - m.w / 2 : m.al === 'right' ? m.x - m.w : m.x;
  return { x0, x1: x0 + m.w };
}
// Все краски, которыми рисовали внутри fn: paints(() => W.drawPawn(...)).
function paints(fn) {
  paint = [];
  try { fn(); return paint; } finally { paint = null; }
}
// Мазки внутри fn вместе с прозрачностью: [{k, c, a, w}, ...].
function paintsFull(fn) {
  inks = [];
  try { fn(); return inks; } finally { inks = null; }
}
/* Все дуги, которые внутри fn ОБВЕЛИ или ЗАЛИЛИ:
   [{k:'stroke'|'fill', c, al, w, x, y, r, a0, a1, ccw, sx, sy, rs}, ...].
   Дуга, построенная и брошенная без stroke/fill, сюда не попадёт — её и на
   экране нет. Обведённая дважды даст две записи с разной краской. */
function arcs(fn) {
  arcw = []; pathBuf = [];
  try { fn(); return arcw; } finally { arcw = null; pathBuf = []; }
}
// Все повороты холста внутри fn, в радианах: spins(() => W.drawPawn(...)).
function spins(fn) {
  spin = [];
  try { fn(); return spin; } finally { spin = null; }
}
// Имена вызовов холста, которым внутри fn дали NaN вместо числа.
function nans(fn) {
  nanw = [];
  try { fn(); return nanw; } finally { nanw = null; }
}
// Точки moveTo/lineTo внутри fn, как есть: [{k:'moveTo'|'lineTo', x, y}, ...].
function traces(fn) {
  trace = [];
  try { fn(); return trace; } finally { trace = null; }
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
                   key, keyDown, winEvent, frame, frameMarks, frameMarksAll, span, said, click, tap, buttons,
                   paints, paintsFull, spins, nans, traces, arcs,
                   peek: name => vm.runInContext(name, sandbox) };
