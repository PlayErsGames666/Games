/* =======================================================================
   ШТАМП ВЕРСИИ В ССЫЛКАХ — поставить и проверить.

   Все локальные css и js подключаются с «?v=ГГГГММДД-N». GitHub Pages
   отдаёт файлы с длинным кешем, и без смены штампа вернувшийся игрок
   продолжает крутить старую копию: правка есть в репозитории, а человек
   видит «ничего не изменилось».

   Правило годами жило одной строкой в README и звучало у́же, чем нужно:
   «поменял что-то в shared/ — подними версию». Про game.js самой игры там
   не было ни слова, и потому её правки штамп не двигали НИ РАЗУ: ведьмак
   так и остался на 20260819-9, пока остальные ушли на 20260817-10. Ловится
   это только тем, что кто-то заметит несходство глазами, — то есть никогда.

     node tools/version.js bump    — проставить свежий штамп во все index.html
     node tools/version.js check   — не забыт ли штамп в том, что уже в индексе

   check зовётся крючком .githooks/pre-commit и валит коммит, если в него
   попал подключаемый файл, а штамп остался прежним.
   ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STAMP = /(\?v=)(\d{8}-\d+)/g;

// Все страницы репозитория: штамп стоит в каждой и всегда один и тот же.
function pages() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  })(ROOT);
  return out;
}

// Какие штампы сейчас стоят: обычно один, но после забытой правки — вразнобой.
function stampsIn(text) {
  const found = new Set();
  let m;
  STAMP.lastIndex = 0;
  while ((m = STAMP.exec(text))) found.add(m[2]);
  return found;
}
function allStamps() {
  const all = new Set();
  for (const p of pages()) for (const s of stampsIn(fs.readFileSync(p, 'utf8'))) all.add(s);
  return [...all].sort();
}

/* Следующий штамп: сегодняшнее число, а порядковый — на единицу больше
   того, что уже стоит сегодня. Правок в день бывает несколько, и одной
   даты не хватает: браузер не перечитает файл, пока строка та же. */
function nextStamp() {
  const d = new Date();
  const today = d.getFullYear() +
                String(d.getMonth() + 1).padStart(2, '0') +
                String(d.getDate()).padStart(2, '0');
  let n = 0;
  for (const s of allStamps()) {
    const [day, num] = s.split('-');
    if (day === today) n = Math.max(n, +num);
    /* Штамп из БУДУЩЕГО (часы сбиты, правка приехала из другой ветки) не
       трогаем вовсе, но и не даём себя обогнать: иначе новый штамп вышел
       бы меньше старого, и браузер счёл бы файл прежним. */
    if (day > today) return day + '-' + (+num + 1);
  }
  return today + '-' + (n + 1);
}

function bump() {
  const stamp = process.argv[3] || nextStamp();
  if (!/^\d{8}-\d+$/.test(stamp)) {
    console.error('штамп пишется как ГГГГММДД-N, а не «' + stamp + '»');
    process.exit(1);
  }
  let files = 0, spots = 0;
  for (const p of pages()) {
    const text = fs.readFileSync(p, 'utf8');
    let hits = 0;
    const next = text.replace(STAMP, (all, head, old) => { if (old !== stamp) hits++; return head + stamp; });
    if (!hits) continue;
    fs.writeFileSync(p, next);
    files++; spots += hits;
    console.log('  ' + path.relative(ROOT, p).replace(/\\/g, '/') + ' — ссылок ' + hits);
  }
  console.log(files ? '\nштамп ' + stamp + ': страниц ' + files + ', ссылок ' + spots
                    : 'штамп ' + stamp + ' уже стоял везде');
}

/* Подключаемое — это то, что игра тянет по ссылке со штампом: её game.js и
   style.css, общее из shared/, меню в корне. Стенды и документы сюда не
   входят: их браузер не грузит, и кеш о них ничего не знает. */
function shipped(f) {
  if (!/\.(js|css)$/.test(f)) return false;
  if (f.startsWith('tools/')) return false;
  if (f.includes('/tests/')) return false;
  if (f.startsWith('docs/')) return false;
  return true;
}

function check() {
  let staged;
  try {
    staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
                          { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    console.error('не вышло спросить git, что в индексе: ' + e.message);
    process.exit(1);
  }
  const touched = staged.filter(shipped);
  if (!touched.length) process.exit(0);            // подключаемого не тронули — и штамп ни при чём

  const now = allStamps();
  let was;
  try {
    was = new Set();
    for (const p of pages()) {
      const rel = path.relative(ROOT, p).replace(/\\/g, '/');
      let old = '';
      try { old = execFileSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, encoding: 'utf8' }); }
      catch (e) { continue; }                      // новой страницы в HEAD ещё нет
      for (const s of stampsIn(old)) was.add(s);
    }
    was = [...was].sort();
  } catch (e) { was = []; }

  const moved = now.length !== was.length || now.some((s, i) => s !== was[i]);
  if (!moved) {
    console.error('');
    console.error('  ✋ ШТАМП ВЕРСИИ НЕ ПОДНЯТ');
    console.error('');
    console.error('  В коммит попало подключаемое:');
    for (const f of touched.slice(0, 8)) console.error('      ' + f);
    if (touched.length > 8) console.error('      …и ещё ' + (touched.length - 8));
    console.error('');
    console.error('  Штамп остался ' + (now.join(', ') || '—') + ', а браузер игрока');
    console.error('  сверяет файлы по ссылке: не поменялась ссылка — не перечитает.');
    console.error('  Правка уедет в репозиторий и не доедет до человека.');
    console.error('');
    console.error('      node tools/version.js bump && git add -u');
    console.error('');
    process.exit(1);
  }
  if (now.length > 1) {
    console.error('');
    console.error('  ✋ ШТАМПЫ РАЗЪЕХАЛИСЬ: ' + now.join(', '));
    console.error('  Он один на весь репозиторий — иначе не сказать, что у игрока в кеше.');
    console.error('');
    console.error('      node tools/version.js bump && git add -u');
    console.error('');
    process.exit(1);
  }
  process.exit(0);
}

const cmd = process.argv[2];
if (cmd === 'bump') bump();
else if (cmd === 'check') check();
else {
  console.log('node tools/version.js bump [ГГГГММДД-N]  — проставить штамп везде');
  console.log('node tools/version.js check              — не забыт ли он в индексе');
  console.log('\nсейчас стоит: ' + (allStamps().join(', ') || '—'));
  process.exit(2);
}
