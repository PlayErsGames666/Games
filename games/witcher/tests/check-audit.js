/* Целость мира: можно ли ко всему подойти, везде ли выходят твари,
   всюду ли ведут дороги. Это проверка не кода, а РАССТАНОВКИ — она ловит
   то, что не видно в диффе: избу, севшую на приметное место, человека,
   замурованного в стене, край, куда доска шлёт, а работать некому. */
'use strict';
const { W, ok, note, head, done } = require('./harness.js');
W.reset();

head('Ко всему можно подойти');
const blocked = [];
for (const k in W.SPOTS) {
  const s = W.SPOTS[k];
  for (const o of W.obstNear(s.x, s.y))
    if (Math.hypot(o.x - s.x, o.y - s.y) < o.r + 12) blocked.push(s.n + (o.hut ? ' (двор)' : ' (дерево)'));
}
ok(blocked.length === 0, 'все ' + Object.keys(W.SPOTS).length + ' приметных мест свободны' +
   (blocked.length ? ': ' + blocked.join(', ') : ''));
const pb = [];
for (const p of W.POWER)
  for (const o of W.obstNear(p.x, p.y)) if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 12) pb.push(p.n);
ok(pb.length === 0, 'все камни силы свободны' + (pb.length ? ': ' + pb.join(', ') : ''));
for (const [n, pt] of [['костёр', W.FIRE], ['верстак', W.BENCH], ['доска работ', W.BOARD], ['зеркало', W.MIRROR]]) {
  let hit = 0;
  for (const o of W.obstNear(pt.x, pt.y)) if (Math.hypot(o.x - pt.x, o.y - pt.y) < o.r + 12) hit++;
  ok(hit === 0, n + ' не зарос');
}

head('Поселения');
const clash = [];
for (let i = 0; i < W.TOWNS.length; i++) for (let j = i + 1; j < W.TOWNS.length; j++) {
  const a = W.TOWNS[i], b = W.TOWNS[j];
  if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) clash.push(a.n + '/' + b.n);
}
ok(clash.length === 0, 'деревни не налезают друг на друга' + (clash.length ? ': ' + clash : ''));
const huts = {};
for (const o of W.getObst()) if (o.hut) huts[o.town] = (huts[o.town] || 0) + 1;
const gutted = W.TOWNS.filter(t => (huts[t.k] || 0) < t.huts - 1);
ok(gutted.length === 0, 'ни одна деревня не потеряла больше одной избы' +
   (gutted.length ? ': ' + gutted.map(t => t.n + ' ' + (huts[t.k] || 0) + '/' + t.huts) : ''));

head('Люди');
const walled = [];
for (const p of W.NPCS()) for (const o of W.obstNear(p.x, p.y)) {
  if (o.hut && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 2) walled.push(p.n + ' в ' + p.town.n);
}
ok(walled.length === 0, 'ни один из ' + W.NPCS().length + ' человек не замурован в избе' +
   (walled.length ? ': ' + walled.join(', ') : ''));
const outside = W.NPCS().filter(p => Math.hypot(p.x - p.town.x, p.y - p.town.y) > p.town.r);
ok(outside.length === 0, 'никого не вытолкнуло за околицу');
const unreachable = [];
for (const p of W.NPCS()) {
  let can = false;
  for (let a = 0; a < 16 && !can; a++) {
    const ang = a / 16 * 6.283, x = p.x + Math.cos(ang) * 26, y = p.y + Math.sin(ang) * 26;
    let f = true;
    for (const o of W.obstNear(x, y)) if (Math.hypot(o.x - x, o.y - y) < o.r + 9) f = false;
    if (f) can = true;
  }
  if (!can) unreachable.push(p.n + ' в ' + p.town.n);
}
ok(unreachable.length === 0, 'к каждому человеку есть подход' +
   (unreachable.length ? ': ' + unreachable.join(', ') : ''));

head('Дороги');
/* Конец дороги обязан куда-то приводить: к околице, к приметному месту —
   ИЛИ к другой дороге. Развилка — такой же пункт назначения; без этого
   условия проверка врала на каждом перекрёстке. */
const orphans = [];
for (let pi = 0; pi < W.PATHS.length; pi++) {
  const p = W.PATHS[pi];
  for (const e of [p[0], p[p.length - 1]]) {
    let near = W.TOWNS.some(t => Math.hypot(t.x - e.x, t.y - e.y) < t.r + 200);
    for (const k in W.SPOTS) if (Math.hypot(W.SPOTS[k].x - e.x, W.SPOTS[k].y - e.y) < 300) near = true;
    for (let qi = 0; qi < W.PATHS.length && !near; qi++) {
      if (qi === pi) continue;
      for (const q of W.PATHS[qi]) if (Math.hypot(q.x - e.x, q.y - e.y) < 60) near = true;
    }
    if (!near) orphans.push(e.x + ',' + e.y);
  }
}
ok(orphans.length === 0, 'все ' + (W.PATHS.length * 2) +
   ' концов дорог ведут к деревне, месту или развилке' +
   (orphans.length ? ': повисли ' + orphans.join(' · ') : ''));

head('Твари выходят в каждом краю');
for (const id of Object.keys(W.LOCS).filter(x => x !== 'camp')) {
  const job = W.JOBS.find(j => j.loc === id);
  if (!job) { ok(false, W.LOCS[id].n + ': нет ни одной работы'); continue; }
  W.reset(); W.setPhase('CAMP');
  const c = W.makeContract(job, 3);
  W.startContract(c);
  const g = W.regionSpot(id), P = W.getP();
  P.x = g.mx; P.y = g.my; W.syncCam();
  let n = 0;
  for (let i = 0; i < 600 && n < 3; i++) { W.update(0.05); n = W.getFoes().filter(f => f.job === c).length; }
  ok(n >= 3, (W.LOCS[id].ico + ' ' + W.LOCS[id].n).padEnd(14) + 'твари по контракту выходят');
}

head('Сюжет');
let sbad = 0;
for (let i = 0; i < W.STORY.length; i++) {
  W.reset(); W.setStory(i); W.setPhase('CAMP');
  W.takeStory();
  const c = W.getTaken().find(x => x.story);
  if (!c) { sbad++; note('задание ' + (i + 1) + ' не берётся'); continue; }
  const sp = W.SPOTS[c.spot];
  if (!sp) { sbad++; note('у задания ' + (i + 1) + ' нет места ' + c.spot); continue; }
  const P = W.getP(); P.x = sp.x; P.y = sp.y; W.setPhase('FIGHT'); W.syncCam();
  W.update(0.016);
  if (!c.arrived) { sbad++; note('до «' + sp.n + '» нельзя дойти'); continue; }
  let n = 0;
  for (let k = 0; k < 400 && n < 2; k++) { W.update(0.05); n = W.getFoes().length; }
  if (n < 2) { sbad++; note('на «' + sp.n + '» за 20 с вышло ' + n + ' тварей'); }
}
ok(sbad === 0, 'все ' + W.STORY.length + ' сюжетных мест берутся, доходятся и запускают бой');

done();
