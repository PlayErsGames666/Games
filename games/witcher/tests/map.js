/* Карта земли буквами — чтобы посмотреть, что вышло, не открывая игру.

     node games/witcher/tests/map.js          — карта и что где стоит
     node games/witcher/tests/map.js holes    — плюс список самых пустых мест

   Пригодилось дважды: сперва показало, что земля — несколько гигантских
   однотонных пятен (чаща на весь север, скалы на весь восток), потом — что
   первая же попытка их раздробить заменила одну монотонность другой. */
'use strict';
const { W } = require('./harness.js');
W.reset();

const COLS = 70, ROWS = 34;
const cw = W.WORLD_W / COLS, ch = W.WORLD_H / ROWS;
const CH = {
  camp: '@', field: '.', road: '=', woods: 'T', swamp: '~', barrow: '^', ruins: '#',
  shore: '_', farm: 'f', crag: 'A', heath: '-', lake: 'w', burn: 'b', meadow: 'm', grove: 'g',
};
const grid = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) row.push(CH[W.locAt(c * cw + cw / 2, r * ch + ch / 2)] || '?');
  grid.push(row);
}
const put = (x, y, ch2) => {
  const c = Math.floor(x / cw), r = Math.floor(y / ch);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = ch2;
};
for (const p of W.PATHS) for (const q of p) put(q.x, q.y, 'o');
for (const k in W.SPOTS) put(W.SPOTS[k].x, W.SPOTS[k].y, '*');
for (const p of W.POWER) put(p.x, p.y, 'P');
for (const t of W.TOWNS) put(t.x, t.y, 'O');

console.log('   ' + Array.from({ length: COLS }, (_, i) => i % 10).join(''));
grid.forEach((row, r) => console.log(String(r).padStart(2) + ' ' + row.join('')));
console.log('\nкрая:');
let line = '  ';
for (const id in CH) { line += CH[id] + ' ' + W.LOCS[id].n + '   '; if (line.length > 62) { console.log(line); line = '  '; } }
if (line.trim()) console.log(line);
console.log('  O деревня   * приметное место   P камень силы   o узел тропы');
console.log('\nклетка = ' + Math.round(cw) + '×' + Math.round(ch) + ' шагов · мир ' + W.WORLD_W + '×' + W.WORLD_H);

const area = {};
const step = 3;
for (let ty = 0; ty < W.TH; ty += step) for (let tx = 0; tx < W.TW; tx += step) {
  const c = W.locAt(tx * W.TILE + 12, ty * W.TILE + 12);
  area[c] = (area[c] || 0) + 1;
}
const tot = Object.values(area).reduce((a, b) => a + b, 0);
console.log('\nдоля земли по краям:');
for (const [k, v] of Object.entries(area).sort((a, b) => b[1] - a[1]))
  console.log('  ' + (W.LOCS[k].ico + ' ' + W.LOCS[k].n).padEnd(16) + (100 * v / tot).toFixed(1) + '%');
console.log('\nна земле: ' + W.SEEDS.length + ' опорных точек · ' + W.TOWNS.length + ' поселений · ' +
            W.NPCS().length + ' человек · ' + Object.keys(W.SPOTS).length + ' приметных мест · ' +
            W.PATHS.length + ' дорог · ' + W.POWER.length + ' камней силы · ' +
            W.getObst().length + ' преград · ' + W.JOBS.length + ' работ на доске');

if (process.argv[2] === 'holes') {
  console.log('\nсамые пустые места (до ближайшей деревни, места или камня):');
  const holes = [];
  for (let y = 400; y < W.WORLD_H - 400; y += 200) for (let x = 400; x < W.WORLD_W - 400; x += 200) {
    let d = Infinity;
    for (const t of W.TOWNS) d = Math.min(d, Math.hypot(t.x - x, t.y - y));
    for (const k in W.SPOTS) d = Math.min(d, Math.hypot(W.SPOTS[k].x - x, W.SPOTS[k].y - y));
    for (const p of W.POWER) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
    holes.push({ x, y, d: Math.round(d) });
  }
  holes.sort((a, b) => b.d - a.d);
  const picked = [];
  for (const h of holes) {
    if (picked.every(p => Math.hypot(p.x - h.x, p.y - h.y) > 1200)) picked.push(h);
    if (picked.length >= 12) break;
  }
  for (const h of picked)
    console.log('  ' + String(h.x).padStart(6) + ',' + String(h.y).padStart(5) +
                ' — пусто на ' + String(h.d).padStart(4) + ' шагов · ' + W.LOCS[W.locAt(h.x, h.y)].n);
}
