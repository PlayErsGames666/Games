/* Вольный мир: жители краёв, задержка перед нападением и три повадки.
   Главное здесь — не «работает ли», а «ведёт ли себя так, как обещано»:
   мирный злится навсегда, пугливый убегает, никто не бросается сразу. */
'use strict';
const { W, ok, note, head, done } = require('./harness.js');

function place(loc) {
  W.reset(); W.setPanel(null);
  const g = W.regionSpot(loc), P = W.getP();
  P.x = g.mx; P.y = g.my; W.syncCam(); W.update(0.016);
  return P;
}

head('Мир заселён и без всякого контракта');
place('meadow'); W.setFoes([]);
for (let i = 0; i < 900; i++) W.update(0.05);
const foes = W.getFoes();
note('на лугах через 45 секунд: ' + foes.length + ' тварей — ' +
     [...new Set(foes.map(f => W.FOES[f.t].n))].join(', '));
ok(foes.length > 0, 'вольные твари появляются сами, без работы');
ok(foes.length <= W.WILD_CAP, 'их не больше дюжины (' + foes.length + ')');
ok(foes.every(f => W.LOCS[W.getLoc()].live.indexOf(f.t) >= 0), 'все — жители этого края');
ok(foes.every(f => f.free), 'все помечены вольными, а не контрактными');

head('Никто не бросается сразу');
place('woods'); W.setFoes([]);
const P2 = W.getP();
W.spawnFoe('wolfen', P2.x + 120, P2.y, null, true);
const wolf = W.getFoes()[0];
ok(!wolf.mad && !wolf.seen, 'волколак выпущен спокойным, а не «в аггро»');
let ticks = 0;
while (!wolf.seen && ticks < 300) { W.update(0.016); ticks++; }
note('заметил через ' + (ticks * 0.016).toFixed(2) + ' с (в справочнике ' + W.FOES.wolfen.notice + ' с)');
ok(ticks > 5, 'между «увидел» и «пошёл бить» есть пауза — это твоя секунда');
ok(wolf.mad, 'заметив, злая тварь идёт бить');

head('Мирный злится от удара — и навсегда');
place('grove'); W.setFoes([]);
const P3 = W.getP();
W.spawnFoe('boar', P3.x + 60, P3.y, null, true);
const boar = W.getFoes()[0];
for (let i = 0; i < 120; i++) W.update(0.016);
ok(!boar.mad, 'кабан рядом, но не нападает');
W.hurtFoe(boar, 5, 'sword');
ok(boar.mad, 'ударил — разозлился');
for (let i = 0; i < 300; i++) W.update(0.016);
ok(boar.mad, 'и через пять секунд всё ещё злой — не передумает');

head('Пугливый убегает');
place('meadow'); W.setFoes([]);
const P4 = W.getP();
W.spawnFoe('deer', P4.x + 60, P4.y, null, true);
const deer = W.getFoes()[0];
const d0 = Math.hypot(deer.x - P4.x, deer.y - P4.y);
W.hurtFoe(deer, 3, 'sword');
ok(deer.flee, 'олень пустился наутёк');
for (let i = 0; i < 120; i++) W.update(0.016);
const d1 = Math.hypot(deer.x - P4.x, deer.y - P4.y);
note('расстояние: было ' + Math.round(d0) + ' → стало ' + Math.round(d1));
ok(d1 > d0 + 100, 'и правда убежал, а не топчется на месте');

head('С живности шкура, а не золото');
place('meadow'); W.setFoes([]);
const P5 = W.getP(); W.setGold(0);
W.spawnFoe('deer', P5.x + 40, P5.y, null, true);
W.hurtFoe(W.getFoes()[0], 99999, 'sword');
const drops = W.getDrops();
const gold = drops.filter(d => d.it.k === 'gold').length;
const hide = drops.filter(d => d.it.k === 'stack' && d.it.id === 'hide').reduce((a, d) => a + d.it.n, 0);
note('с оленя выпало: золота ' + gold + ' · шкур ' + hide);
ok(gold === 0, 'у оленя нет кошеля');
ok(hide > 0, 'зато есть шкура — ради неё и охотятся');

head('Зачёт в работу: и вид, и край');
W.reset(); W.setPhase('CAMP');
const job = W.makeContract(W.JOBS.find(j => j.loc === 'swamp' && j.pool.indexOf('drowner') >= 0), 3);
W.startContract(job);
const g = W.regionSpot('swamp'), P6 = W.getP();
P6.x = g.mx; P6.y = g.my; W.syncCam(); W.update(0.016);
W.setFoes([]);
const left0 = job.left;
W.spawnFoe('drowner', P6.x + 40, P6.y, null, true);
W.hurtFoe(W.getFoes()[0], 99999, 'sword');
ok(job.left === left0 - 1, 'вольный утопец на болоте засчитан в работу про утопцев на болоте');
const g2 = W.regionSpot('meadow');
P6.x = g2.mx; P6.y = g2.my; W.syncCam(); W.update(0.016);
W.setFoes([]);
const left1 = job.left;
W.spawnFoe('drowner', P6.x + 40, P6.y, null, true);
W.hurtFoe(W.getFoes()[0], 99999, 'sword');
ok(job.left === left1, 'тот же утопец на лугах в зачёт не идёт — край не тот');

head('Деревня: живность внутри, нечисть снаружи');
W.reset(); W.setPanel(null);
const town = W.TOWNS.find(t => (W.LOCS[W.locAt(t.x, t.y)].live || []).indexOf('sheep') >= 0) || W.TOWNS[0];
const P7 = W.getP(); P7.x = town.x; P7.y = town.y; W.syncCam();
W.setFoes([]);
W.spawnFoe('sheep', town.x + 20, town.y, null, true);
W.spawnFoe('nekker', town.x + 20, town.y, null, true);
for (let i = 0; i < 30; i++) W.update(0.016);
const sh = W.getFoes().find(f => f.t === 'sheep'), nk = W.getFoes().find(f => f.t === 'nekker');
ok(sh && Math.hypot(sh.x - town.x, sh.y - town.y) < town.r, 'овца осталась в деревне');
ok(!nk || Math.hypot(nk.x - town.x, nk.y - town.y) >= town.r, 'накера из деревни вытолкнуло');

head('Отставшие расходятся, кормушки нет');
place('meadow'); W.setFoes([]);
const P8 = W.getP();
for (let i = 0; i < 400; i++) W.update(0.05);
const before = W.getFoes().length;
P8.x = Math.max(50, Math.min(W.WORLD_W - 50, P8.x + 3000)); W.syncCam();
for (let i = 0; i < 60; i++) W.update(0.05);
const after = W.getFoes().filter(f => f.free && !f.mad).length;
note('было вольных ' + before + ' → после ухода за 3000 шагов осталось ' + after);
ok(after < before, 'отставшие вольные твари расходятся');

head('Вольная тварь не растёт от контракта к контракту');
W.reset(); W.setCi(0);
W.setFoes([]); W.spawnFoe('hare', 3000, 3000, null, true);
const hp0 = W.getFoes()[0].max;
W.setCi(20);
W.setFoes([]); W.spawnFoe('hare', 3000, 3000, null, true);
const hp20 = W.getFoes()[0].max;
note('заяц на первом контракте ' + hp0 + ' здоровья, на двадцать первом ' + hp20);
ok(hp0 === hp20, 'заяц на двадцатом походе такой же, как на первом');

head('Отрисовка всех повадок');
let drew = true;
try {
  place('grove'); W.setFoes([]);
  const Px = W.getP();
  for (const t of Object.keys(W.FOES)) W.spawnFoe(t, Px.x + 60, Px.y + 40, null, true);
  for (let i = 0; i < 40; i++) { W.update(0.016); W.render(); }
} catch (e) { drew = false; note('падение: ' + e.message); }
ok(drew, 'все двадцать три твари рисуются во всех повадках');

done();
