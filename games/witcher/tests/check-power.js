/* Места силы: очко навыка даром, но ровно один раз с камня. */
'use strict';
const { W, store, ok, note, head, done } = require('./harness.js');

head('Камни стоят там, где обещано');
W.reset(); W.setPanel(null);
ok(W.POWER.length === 8, 'камней восемь');
const wrongLoc = W.POWER.filter(p => W.locAt(p.x, p.y) !== p.k);
ok(wrongLoc.length === 0, 'каждый камень в своём краю — имя не врёт' +
   (wrongLoc.length ? ': ' + wrongLoc.map(p => p.n).join(', ') : ''));
const inTown = W.POWER.filter(p => W.townAt(p.x, p.y) || W.inCamp(p.x, p.y));
ok(inTown.length === 0, 'ни один не в деревне и не в лагере');
let grown = 0;
for (const p of W.POWER)
  for (const o of W.obstNear(p.x, p.y)) if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 20) grown++;
ok(grown === 0, 'ни на одном не выросло дерево');
const far = W.POWER.map(p => Math.round(Math.hypot(p.x - W.FIRE.x, p.y - W.FIRE.y)));
note('от костра: ' + Math.min(...far) + '…' + Math.max(...far) + ' шагов');
ok(Math.min(...far) > 1400, 'за очком надо идти — ближний камень не у костра');

head('Очко даётся один раз');
const P = W.getP();
const sp0 = P.sp, xp0 = P.xp, lvl0 = P.lvl;
for (const p of W.POWER) { P.x = p.x; P.y = p.y; W.interact(); }
ok(P.sp === sp0 + 8, 'восемь камней дали восемь очков');
ok(P.xp === xp0 && P.lvl === lvl0, 'опыт и ступень не тронуты — это не награда за бой');
const spAfter = P.sp;
for (const p of W.POWER) { P.x = p.x; P.y = p.y; W.interact(); }
ok(P.sp === spAfter, 'второй заход по тем же камням не даёт ничего');

head('Взятое переживает закрытую вкладку');
W.setPhase('CAMP'); W.saveRun();
W.reset(); W.loadRun();
ok(W.getPower().size === 8, 'запись помнит все восемь');
const P2 = W.getP(), spLoaded = P2.sp;
for (const p of W.POWER) { P2.x = p.x; P2.y = p.y; W.interact(); }
ok(P2.sp === spLoaded, 'после загрузки повторно взять нельзя');
W.reset();
ok(W.getPower().size === 0, '«Заново» — это новое прохождение, камни снова горят');

head('Камень не перебивает лагерь');
W.reset();
const P3 = W.getP();
P3.x = W.BOARD.x; P3.y = W.BOARD.y; W.interact();
ok(W.getPower().size === 0, 'у доски работ E открывает доску, а не ищет камень');

head('Отрисовка');
let drew = true;
for (const p of [null, 'map', 'skills']) {
  W.reset(); W.setPanel(p);
  try { W.render(); } catch (e) { drew = false; note('панель ' + p + ': ' + e.message); }
}
W.reset(); W.setPanel(null);
const P4 = W.getP();
P4.x = W.POWER[0].x; P4.y = W.POWER[0].y; W.syncCam();
try { W.update(0.016); W.render(); W.interact(); W.update(0.016); W.render(); }
catch (e) { drew = false; note('у камня: ' + e.message); }
ok(drew, 'камень рисуется и непочатым, и погасшим');

done();
