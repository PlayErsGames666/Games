/* Доска работ: цела ли она, хватает ли выбора в начале и есть ли куда
   расти к концу. Доска — единственный источник работы, и если она бедна,
   походы становятся одинаковыми. */
'use strict';
const { W, ok, note, head, done } = require('./harness.js');
W.reset();

head('Работы целы');
note('всего работ: ' + W.JOBS.length);
ok(W.JOBS.every(j => W.LOCS[j.loc] && j.pool.length && j.pool.every(t => W.FOES[t]) && j.d > 0),
   'у каждой работы понятный край, бестиарий и тяжесть');
const names = W.JOBS.map(j => j.t);
ok(new Set(names).size === names.length, 'нет работ-двойников');

head('Покрытие');
const byLoc = {};
for (const j of W.JOBS) byLoc[j.loc] = (byLoc[j.loc] || 0) + 1;
const thin = Object.keys(W.LOCS).filter(id => id !== 'camp' && (byLoc[id] || 0) < 4);
ok(thin.length === 0, 'у каждого края не меньше четырёх работ' +
   (thin.length ? ': мало в ' + thin.map(i => W.LOCS[i].n).join(', ') : ''));
const byFoe = {};
for (const j of W.JOBS) for (const t of j.pool) byFoe[t] = (byFoe[t] || 0) + 1;
const rare = Object.keys(W.FOES).filter(t => !W.FOES[t].fauna && (byFoe[t] || 0) < 3);
ok(rare.length === 0, 'каждая тварь бестиария встречается хотя бы в трёх работах' +
   (rare.length ? ': редко ' + rare.map(t => W.FOES[t].n).join(', ') : ''));
const fauna = Object.keys(W.FOES).filter(t => W.FOES[t].fauna && byFoe[t]);
ok(fauna.length === 0, 'живность в контракты не попадает — она жители, а не цели');

head('Доска на разных контрактах');
for (const k of [0, 1, 3, 5, 8, 15]) {
  const pool = W.JOBS.filter(j => j.d <= 0.92 + k * 0.18);
  const mons = pool.filter(j => W.jobFam(j) === 'monster').length;
  const sizes = new Set(); const golds = [];
  for (let i = 0; i < 200; i++) { const b = W.rollBoard(k); sizes.add(b.length); for (const c of b) golds.push(c.gold); }
  note('контракт ' + String(k + 1).padStart(2) + ': доступно ' + String(pool.length).padStart(2) +
       ' (нечисть ' + mons + ', люди ' + (pool.length - mons) + ')' +
       ' · на доске ' + [...sizes].join('/') + ' · плата ' + Math.min(...golds) + '–' + Math.max(...golds));
  ok(sizes.size === 1 && sizes.has(3), 'на доске ровно три работы (контракт ' + (k + 1) + ')');
  ok(mons > 0 && pool.length - mons > 0,
     'есть и про нечисть, и про людей — иначе один меч пролежит в ножнах (контракт ' + (k + 1) + ')');
}

head('Первые походы не повторяются');
const seen = new Set();
for (let i = 0; i < 300; i++) W.rollBoard(0).forEach(c => seen.add(c.t));
const early = W.JOBS.filter(j => j.d <= 0.92).length;
note('на первой доске за 300 раздач встретилось ' + seen.size + ' разных работ из ' + early);
ok(seen.size >= 12, 'выбора в начале похода хватает');

head('Есть куда расти');
const late = W.JOBS.filter(j => j.d > 1.55).length;
note('тяжёлых работ (d > 1.55): ' + late + ' · самая тяжёлая d = ' + Math.max(...W.JOBS.map(j => j.d)));
ok(late >= 8, 'к концу похода доска не упирается в потолок');

done();
