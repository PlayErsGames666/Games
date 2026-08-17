/* Прогнать все проверки разом.

     node games/witcher/tests/run.js          — все
     node games/witcher/tests/run.js wild     — только те, чьё имя содержит «wild»

   Каждая проверка запускается своим процессом: если одна упадёт насмерть,
   остальные всё равно отработают, и в конце будет видно, что именно сломалось.
   Код возврата — 1, если упала хоть одна: годится для крючка на коммит. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const filter = process.argv[2] || '';
const checks = fs.readdirSync(dir)
  .filter(f => /^check-.+\.js$/.test(f))
  .filter(f => !filter || f.includes(filter))
  .sort();

if (!checks.length) { console.log('нечего гонять' + (filter ? ' по «' + filter + '»' : '')); process.exit(0); }

const t0 = Date.now();
const bad = [];
for (const f of checks) {
  const name = f.replace(/^check-|\.js$/g, '');
  process.stdout.write('──── ' + name + ' ' + '─'.repeat(Math.max(0, 56 - name.length)) + '\n');
  try {
    const out = execFileSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
    process.stdout.write(out.replace(/^/gm, '  '));
  } catch (e) {
    if (e.stdout) process.stdout.write(String(e.stdout).replace(/^/gm, '  '));
    if (e.stderr) process.stdout.write(String(e.stderr).replace(/^/gm, '  '));
    bad.push(name);
  }
}
console.log('\n' + '═'.repeat(62));
console.log('проверок пройдено: ' + (checks.length - bad.length) + ' из ' + checks.length +
            ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
if (bad.length) { console.log('УПАЛИ: ' + bad.join(', ')); process.exit(1); }
console.log('всё чисто');
