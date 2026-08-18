/* =======================================================================
   ОБВЯЗКА ДЛЯ ЗАМЕРОВ — отдельно от harness.js, и не по лени.

   В harness.js холст сделан через Proxy: так короче и надёжнее для проверок.
   Но Proxy сам по себе недёшев, и в замере он съедал бы то, что мы меряем.
   Здесь холст — обычный объект с пустышками и счётчиками: он почти ничего
   не стоит, зато считает, сколько раз игра что попросила.

   Считаем не миллисекунды браузера (их отсюда не увидеть), а ЧИСЛО ОПЕРАЦИЙ:
   сколько за кадр присваиваний ctx.font, сколько fillText, сколько заливок.
   Именно они и оказывались виноваты во всех просадках, что тут ловились.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = process.env.WITCHER_GAME || path.join(__dirname, '..', 'game.js');
const NOOP = ['beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'closePath', 'clip', 'rect',
  'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'setLineDash',
  'stroke', 'fillRect', 'strokeRect', 'fill', 'drawImage', 'fillText', 'strokeText', 'putImageData'];

function makeProbe() {
  const N = {};
  const bump = k => { N[k] = (N[k] || 0) + 1; };
  const made = [];                                     // все испечённые холсты
  function makeCtx() {
    const c = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      lineCap: '', lineJoin: '', imageSmoothingEnabled: true, textAlign: '', textBaseline: '',
    };
    for (const k of NOOP) c[k] = () => bump(k);
    c.measureText = s => { bump('measureText'); return { width: String(s).length * 5 }; };
    c.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    c.createRadialGradient = () => { bump('gradient'); return { addColorStop() {} }; };
    c.createLinearGradient = c.createRadialGradient;
    // присваивание шрифта — самая дорогая мелочь в холсте, считаем отдельно
    let f = '';
    Object.defineProperty(c, 'font', { get: () => f, set: v => { bump('font='); f = v; } });
    return c;
  }
  function makeCanvas(w, h, track) {
    const cv = {
      width: w || 520, height: h || 640, _ctx: null,
      getContext() { return this._ctx || (this._ctx = makeCtx()); },
      getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
      addEventListener() {}, style: {},
    };
    if (track) made.push(cv);
    return cv;
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
      createElement: () => makeCanvas(1, 1, true),
      addEventListener() {}, fullscreenElement: null,
    },
    devicePixelRatio: 1,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  // window.addEventListener('blur', ...) в игре: без пустышки замер падал на
  // загрузке игры и молчал об этом до самого запуска. Считать нечего, если
  // игра не завелась.
  sandbox.addEventListener = () => {};
  sandbox.__canvas = makeCanvas();
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GAME, 'utf8'), sandbox, { filename: GAME });
  return {
    W: sandbox.__W, N, made, store,
    zero() { for (const k in N) delete N[k]; },
  };
}

/* Кружной обход всей земли — общий маршрут для всех замеров, чтобы цифры
   разных дней можно было класть рядом. */
const WAY = [[5530, 4130], [7350, 1330], [10500, 2600], [10600, 7100],
             [2450, 6476], [770, 5600], [1400, 1800], [5530, 4130]];
function walker(P, speed) {
  let leg = 0, t = 0;
  return function step(dt) {
    const a = WAY[leg], b = WAY[(leg + 1) % WAY.length];
    t += dt * speed / Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t >= 1) { t = 0; leg = (leg + 1) % WAY.length; }
    P.x = a[0] + (b[0] - a[0]) * t;
    P.y = a[1] + (b[1] - a[1]) * t;
  };
}

module.exports = { makeProbe, walker, WAY };
