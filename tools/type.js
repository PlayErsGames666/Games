/* =======================================================================
   КЕГЛЬ В HUD — свести к шкале.

   Было 28 разных кеглей на 280 надписей, и 27% текста — мельче десяти
   пикселей: 7, 8, 9. У одного «Ведьмака» пятнадцать размеров, от 7 до 118.
   Именно это и читается «сложно»: глазу негде отдохнуть, всё одинаково
   важно и всё одинаково мелко.

   ШКАЛА. Четыре ступени на мелкий и средний текст:

       9  — мелочь: единицы, подписи под кнопкой. НИЖЕ НЕ ОПУСКАЕМСЯ.
       11 — обычная надпись: счётчики, названия, подсказки.
       14 — важное: заголовок полосы, имя цели.

   Крупное (17 и выше) НЕ ТРОГАЕМ. Там у каждой игры своё геройское число —
   счёт в понге кеглем 64, таймер в астероиде, «Игра окончена» во весь
   экран, — и сводить их к общей ступени значит стереть игры в одну. Шкала
   нужна там, где текста много и он спорит сам с собой, а не там, где
   надпись одна и она главная.

     node tools/type.js plan    — что и на что поменяется
     node tools/type.js apply   — поменять
     node tools/type.js check   — не завелось ли текста мельче девяти

   Размеры, посчитанные на ходу (font = size + 'px ...', txt(..., k*2, ...)),
   мы не видим и не трогаем: они зависят от игры, и им место в её коде.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FLOOR = 9, KEEP_ABOVE = 16;
const RUNGS = [9, 11, 14];

/* Куда попадает размер. Ниже девяти — поднимаем: такой текст не читается
   вовсе, а не «читается мелко». Выше шестнадцати — оставляем как есть. */
function rung(px) {
  if (px > KEEP_ABOVE) return px;
  if (px <= FLOOR) return FLOOR;
  /* На равном расстоянии округляем ВВЕРХ, а не вниз. Ходовой десятый кегль
     лежит ровно между девятью и одиннадцатью, и «вниз» увело бы полсотни
     надписей в мельчайшую ступень — то есть сделало бы ровно то, от чего
     мы уходим. Читаемость важнее близости к прежнему числу. */
  let best = RUNGS[0];
  for (const r of RUNGS) if (Math.abs(r - px) <= Math.abs(best - px)) best = r;
  return best;
}

// ctx.font = '10px Segoe UI'  и  ctx.font = 'bold 12px …'
const FONT = /(font\s*=\s*['"](?:bold\s+)?)(\d+(?:\.\d+)?)(px)/g;
// свои рисовалки: txt(строка, x, y, кегль, цвет, выключка)
const TXT = /(\btxt\(\s*[^,]+?,\s*[^,]+?,\s*[^,]+?,\s*)(\d+(?:\.\d+)?)(\s*,)/g;

function files() {
  const out = [];
  for (const g of fs.readdirSync(path.join(ROOT, 'games'))) {
    const p = path.join(ROOT, 'games', g, 'game.js');
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

function run(write) {
  const moves = new Map();          // «было→стало» => сколько
  let touched = 0, files_ = 0;
  const perFile = [];
  for (const p of files()) {
    const text = fs.readFileSync(p, 'utf8');
    let hits = 0;
    const bump = (all, head, num, tail) => {
      const was = parseFloat(num), now = rung(was);
      if (now === was) return all;
      const k = was + '→' + now;
      moves.set(k, (moves.get(k) || 0) + 1);
      hits++;
      return head + now + tail;
    };
    let next = text.replace(FONT, bump).replace(TXT, bump);
    if (!hits) continue;
    files_++; touched += hits;
    perFile.push([path.relative(ROOT, p).replace(/\\/g, '/'), hits]);
    if (write) fs.writeFileSync(p, next);
  }
  return { moves, touched, files: files_, perFile };
}

function plan() {
  const { moves, touched, files, perFile } = run(false);
  console.log('надписей поменяется: ' + touched + ' в ' + files + ' играх\n');
  for (const [k, n] of [...moves].sort((a, b) => b[1] - a[1]))
    console.log('  ' + k.padEnd(10) + ' x' + n);
  console.log('\nпо играм:');
  for (const [f, n] of perFile.sort((a, b) => b[1] - a[1]))
    console.log('  ' + f.padEnd(30) + ' — ' + n);
}
function apply() {
  const { touched, files } = run(true);
  console.log('поменяно ' + touched + ' надписей в ' + files + ' играх');
}
/* Мерка стережёт только НИЖНЮЮ границу: текста мельче девяти в проекте быть
   не должно. Всё прочее — вкус игры, и запрещать его нечего. */
function check() {
  const bad = [];
  for (const p of files()) {
    const text = fs.readFileSync(p, 'utf8');
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    for (const re of [FONT, TXT]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) if (parseFloat(m[2]) < FLOOR) bad.push(rel + ': ' + m[2] + 'px');
    }
  }
  if (!bad.length) { console.log('кегль в порядке: текста мельче ' + FLOOR + ' нет'); process.exit(0); }
  console.error('');
  console.error('  ✋ ТЕКСТ МЕЛЬЧЕ ' + FLOOR + ' ПИКСЕЛЕЙ: ' + bad.length);
  for (const b of [...new Set(bad)].slice(0, 10)) console.error('      ' + b);
  console.error('');
  console.error('      node tools/type.js apply');
  console.error('');
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'plan') plan();
else if (cmd === 'apply') apply();
else if (cmd === 'check') check();
else { console.log('node tools/type.js plan | apply | check'); process.exit(2); }
