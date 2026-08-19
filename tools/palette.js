/* =======================================================================
   ПАЛИТРА ПРОЕКТА — свести кричащие цвета к одной семье.

   Было 92 разных ярких цвета на 25 игр: в каждой смысловой семье по
   шесть-семь почти одинаковых («#ff5a4a», «#ff7a6a», «#ff7a5a», «#ff9f1c»,
   «#ffb43a», «#f2b134», «#ffd166» — все «тревожно-тёплые»). Различить их
   нельзя, а глаз спотыкается о каждый: набор читался пёстрым и утомлял.

   ПРАВИЛО ЗАМЕНЫ. У цвета сохраняем ТОН — по нему игра и узнаётся, — а
   насыщенность приводим к общей. Светлоту не равняем в одну, а раскладываем
   по трём ступеням: тёмная, основная, светлая. Без ступеней внутри семьи
   пропали бы различия, которые ЗНАЧАТ: у пакмана четыре призрака, у
   выживания всходы и спелое, у ведьмака сталь и серебро.

   Так 92 цвета сходятся к двум десяткам, и все они — одной крови.

     node tools/palette.js plan    — что и на что поменяется, ничего не трогая
     node tools/palette.js apply   — заменить
     node tools/palette.js check   — не завелось ли новых кричащих

   Тёмное (фоны, земля, панели) не трогаем вовсе: атмосфера у каждой игры
   своя, и сводить её к общей — значит стереть игры в одну.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Что считаем КРИЧАЩИМ. Насыщенность выше 60 и светлота в середине: такой
   цвет тянет взгляд на себя. Тёмное и бледное сюда не попадает. */
const LOUD_S = 60, LOUD_L = [35, 80];

const HEX = /#([0-9a-fA-F]{6})\b/g;
/* Тот же цвет проект пишет двумя способами: «#c9a227» в одном месте и
   «rgba(201,162,39,.22)» в другом — это ведьмачье золото и там, и там.
   Трогать только hex значило бы РАЗДВОИТЬ его: половина ушла бы в общую
   семью, половина осталась бы кричать. Ловим и числовую запись, а хвост с
   прозрачностью не трогаем — он про густоту, а не про цвет.
   Закрывающую скобку не требуем: цвет бывает склеен из кусков, вида
   'rgba(255,120,36,' + густота + ')'. */
const RGB = /(rgba?\(\s*)(\d{1,3})(\s*,\s*)(\d{1,3})(\s*,\s*)(\d{1,3})/g;
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('');
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function toHsl(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let s = 0, hh = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) hh = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh /= 6;
  }
  return [hh * 360, s * 100, l * 100];
}
function toHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const q = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + q(r) + q(g) + q(b);
}
const isLoud = hex => {
  const [, s, l] = toHsl(hex);
  return s > LOUD_S && l > LOUD_L[0] && l < LOUD_L[1];
};

/* Семь смысловых семей. Тон округляем к середине своей семьи: соседние
   оттенки внутри семьи сходятся в один, а семьи остаются различимы. */
const FAMILIES = [
  { n: 'тревога',   from: 340, to: 20,  hue: 5   },
  { n: 'внимание',  from: 20,  to: 52,  hue: 38  },
  { n: 'золото',    from: 52,  to: 70,  hue: 52  },
  { n: 'успех',     from: 70,  to: 165, hue: 145 },
  { n: 'холод',     from: 165, to: 210, hue: 196 },
  { n: 'синий',     from: 210, to: 255, hue: 220 },
  { n: 'магия',     from: 255, to: 340, hue: 268 },
];
function familyOf(h) {
  for (const f of FAMILIES) {
    if (f.from < f.to) { if (h >= f.from && h < f.to) return f; }
    else if (h >= f.from || h < f.to) return f;
  }
  return FAMILIES[0];
}
/* Три ступени светлоты. Границы взяты по тому, как цвета в проекте и так
   лежали: ниже 52 — «глухие», выше 68 — «выбеленные», между — основные. */
const RUNGS = [{ max: 52, l: 46 }, { max: 68, l: 60 }, { max: 999, l: 74 }];
const SAT = 62;

function canon(hex) {
  const [h, , l] = toHsl(hex);
  const f = familyOf(h);
  const rung = RUNGS.find(r => l < r.max);
  return toHex(f.hue, SAT, rung.l);
}

/* Файлы, где живёт цвет: сами игры, их стили, меню и общий каркас.

   И СТЕНДЫ ТОЖЕ. Часть мерок держит цвет строкой — «на второй ступени жилы
   своей, яркой краской», «кольцо ровно одно» — и сверяет по ней. Оставь их
   в стороне при замене, и пятнадцать мерок упадут на ровном месте: игра
   перекрасилась, а мерка ищет прежнее. Стенд тут не посторонний, он часть
   той же палитры, и меняться обязан вместе с ней.

   Правильнее было бы, чтобы мерка СПРАШИВАЛА цвет у игры, а не повторяла
   его. Где цвет выставлен наружу (ARMOR[k].c, SKINS.fair.c, POTIONS[k].c),
   так и сделано; где нет — например, горящий контур зверя, — строка пока
   единственный способ, и её мы ведём отсюда. */
function paintFiles() {
  const out = [];
  for (const g of fs.readdirSync(path.join(ROOT, 'games'))) {
    for (const f of ['game.js', 'style.css']) {
      const p = path.join(ROOT, 'games', g, f);
      if (fs.existsSync(p)) out.push(p);
    }
    const t = path.join(ROOT, 'games', g, 'tests');
    if (fs.existsSync(t)) {
      for (const f of fs.readdirSync(t)) if (f.endsWith('.js')) out.push(path.join(t, f));
    }
  }
  for (const f of ['menu.css', 'menu.js']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) out.push(p);
  }
  /* ВСЁ shared/, а не один base.css. Общий слой красит панель комнаты и
     кнопку полного экрана во всех играх сразу, и цвет, заведённый там, самый
     заметный из возможных — а мерка его не видела вовсе. */
  const sh = path.join(ROOT, 'shared');
  if (fs.existsSync(sh)) {
    for (const f of fs.readdirSync(sh)) if (/\.(js|css)$/.test(f)) out.push(path.join(sh, f));
  }
  return out;
}

function run(write) {
  const map = new Map();
  let touched = 0, files = 0;
  const perFile = [];
  for (const p of paintFiles()) {
    const text = fs.readFileSync(p, 'utf8');
    let hits = 0;
    let next = text.replace(HEX, (all) => {
      const low = all.toLowerCase();
      if (!isLoud(low)) return all;
      const to = canon(low);
      if (to === low) return all;
      map.set(low, to); hits++;
      return to;
    });
    next = next.replace(RGB, (all, p1, r, s1, g, s2, b) => {
      const low = rgbToHex(r, g, b);
      if (!isLoud(low)) return all;
      const to = canon(low);
      if (to === low) return all;
      const c3 = hexToRgb(to);
      map.set(low, to); hits++;
      return p1 + c3[0] + s1 + c3[1] + s2 + c3[2];
    });
    if (!hits) continue;
    files++; touched += hits;
    perFile.push([path.relative(ROOT, p).replace(/\\/g, '/'), hits]);
    if (write) fs.writeFileSync(p, next);
  }
  return { map, touched, files, perFile };
}

function plan() {
  const { map, touched, files, perFile } = run(false);
  const byTo = new Map();
  for (const [from, to] of map) { if (!byTo.has(to)) byTo.set(to, []); byTo.get(to).push(from); }
  console.log('было разных кричащих: ' + map.size + ' → станет: ' + byTo.size);
  console.log('замен: ' + touched + ' в ' + files + ' файлах\n');
  const named = [...byTo.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [to, froms] of named) {
    const [h] = toHsl(to);
    console.log('  ' + to + '  (' + familyOf(h).n + ')  ← ' + froms.sort().join(' '));
  }
  console.log('\nпо файлам:');
  for (const [f, n] of perFile.sort((a, b) => b[1] - a[1])) console.log('  %s — %d', f, n);
}

function apply() {
  const { map, touched, files } = run(true);
  console.log('заменено ' + touched + ' вхождений в ' + files + ' файлах; цветов было ' +
              map.size + ', стало ' + new Set(map.values()).size);
}

/* Мерка: новых кричащих в проекте заводиться не должно. Считаем те, что не
   совпадают со своим же приведённым видом, — то есть выбиваются из семьи. */
function check() {
  const bad = [];
  for (const p of paintFiles()) {
    const text = fs.readFileSync(p, 'utf8');
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    let m;
    HEX.lastIndex = 0;
    while ((m = HEX.exec(text))) {
      const low = ('#' + m[1]).toLowerCase();
      if (isLoud(low) && canon(low) !== low) bad.push(rel + ': ' + low);
    }
    RGB.lastIndex = 0;
    while ((m = RGB.exec(text))) {
      const low = rgbToHex(m[2], m[4], m[6]);
      if (isLoud(low) && canon(low) !== low) bad.push(rel + ': rgb(' + m[2] + ',' + m[4] + ',' + m[6] + ')');
    }
  }
  if (!bad.length) { console.log('палитра ровная: кричащих вне семьи нет'); process.exit(0); }
  console.error('');
  console.error('  ✋ ЦВЕТА ВНЕ ОБЩЕЙ ПАЛИТРЫ: ' + bad.length);
  for (const b of [...new Set(bad)].slice(0, 12)) console.error('      ' + b);
  console.error('');
  console.error('      node tools/palette.js plan   — посмотреть, на что заменится');
  console.error('      node tools/palette.js apply  — заменить');
  console.error('');
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'plan') plan();
else if (cmd === 'apply') apply();
else if (cmd === 'check') check();
else {
  console.log('node tools/palette.js plan | apply | check');
  process.exit(2);
}
