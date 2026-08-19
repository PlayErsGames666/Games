/* =======================================================================
   КЛАВИШИ В ПОДСКАЗКАХ — один вид записи.

   В проекте два вида, и оба нужны — но каждый на своём месте:

     СТРОКА-ПОДСКАЗКА — через тире, части через « · »:
         'WASD — импульс · Shift — точный · E — док'

     ЯРЛЫК КНОПКИ И УПОМИНАНИЕ ВНУТРИ ФРАЗЫ — в скобках, после действия:
         'поворот (R)'
         'Выбрось лишнее (I) или продай у костра'

   Второй вид не прихоть: тире внутри фразы ломает саму фразу — «Выбрось
   лишнее I — или продай» уже не по-русски. А на кнопке в полсотни пикселей
   тире просто не влезает.

   ЧЕГО НЕ ДОЛЖНО БЫТЬ — записи ВПРИТЫК, «R поворот». Она читается как
   начало фразы, а не как клавиша, и в одной строке уживалась с тире:
   'ЛКМ ставить · протянуть — дорожка · ПКМ снести · T скорость · P пауза'.
   Пять таких мест было в обороне, заводе и ведьмаке.

     node tools/keys.js check   — не завелось ли записи впритык

   Мерка нарочно УЗКАЯ. Широкая ловила «Жми E ещё раз», «I или ✕ — закрыть»
   и «в 3 клетках» — то есть кричала на ровном месте, а мерка, которой не
   верят, не мерка. Поэтому: только латинская заглавная и названные клавиши,
   только перед русским словом, и с оговорками на слова-связки.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const NAMED = ['WASD', 'ЛКМ', 'ПКМ', 'СКМ', 'Space', 'Enter', 'Esc', 'Escape',
               'Shift', 'Ctrl', 'Alt', 'Tab', 'Пробел'];
// Связки: после них идёт не действие, а продолжение фразы.
const SKIP = ['или', 'ещё', 'еще', 'раз', 'и', 'а', 'но'];

const KEY = '(?:' + NAMED.join('|') + '|[A-Z])';
const TIGHT = new RegExp('(?<![\\wА-Яа-яё])(' + KEY + ')\\s+([а-яё]{3,})', 'g');
const STR = /'([^'\n]{3,140})'|"([^"\n]{3,140})"/g;

function files() {
  const out = [];
  for (const g of fs.readdirSync(path.join(ROOT, 'games'))) {
    const p = path.join(ROOT, 'games', g, 'game.js');
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

function check() {
  const bad = [];
  for (const p of files()) {
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      STR.lastIndex = 0;
      let sm;
      while ((sm = STR.exec(line))) {
        const s = sm[1] || sm[2];
        if (!/[а-яА-Я]/.test(s)) continue;
        TIGHT.lastIndex = 0;
        let m;
        while ((m = TIGHT.exec(s))) {
          if (SKIP.indexOf(m[2]) >= 0) continue;
          bad.push(rel + ':' + (i + 1) + '  «' + m[1] + ' ' + m[2] + '»  в строке: ' + s.slice(0, 70));
        }
      }
    });
  }
  if (!bad.length) { console.log('клавиши в порядке: записи впритык нет'); process.exit(0); }
  console.error('');
  console.error('  ✋ КЛАВИША ЗАПИСАНА ВПРИТЫК: ' + bad.length);
  for (const b of bad.slice(0, 10)) console.error('      ' + b);
  console.error('');
  console.error('  В строке-подсказке пиши через тире: «R — поворот»');
  console.error('  На кнопке и внутри фразы — в скобках: «поворот (R)»');
  console.error('');
  process.exit(1);
}

if (process.argv[2] === 'check') check();
else { console.log('node tools/keys.js check'); process.exit(2); }
