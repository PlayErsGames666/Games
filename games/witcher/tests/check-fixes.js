/* Четыре починки, каждая — с настоящим багом за спиной.
   Проверки написаны так, чтобы падать, если баг вернётся. */
'use strict';
const { W, store, ok, note, head, done } = require('./harness.js');

head('Выброс вещей');
W.reset(); W.setPanel(null);
const it = W.mkArmor('heavy', 0, null);
W.getInv().push(it);
W.dropItem(it);
for (let i = 0; i < 60; i++) W.update(0.016);
ok(W.getInv().indexOf(it) < 0 && W.getDrops().length === 1,
   'вещь осталась лежать, пока стоишь над ней');
const P = W.getP();
P.x += 120;
for (let i = 0; i < 3; i++) W.update(0.016);
ok(W.getDrops()[0] && !W.getDrops()[0].hold, 'отошёл — вещь снова обычная добыча');
P.x -= 120;
for (let i = 0; i < 3; i++) W.update(0.016);
ok(W.getInv().indexOf(it) >= 0 && !W.getDrops().length, 'вернулся — поднял обратно');

W.reset(); W.setPanel(null);
W.addStack('ore', 70);
const st1 = W.loadState();
W.dropItem(W.getInv().find(i => i.id === 'ore'));
for (let i = 0; i < 60; i++) W.update(0.016);
const st2 = W.loadState();
note('вес ' + W.carried().toFixed(1) + '/' + W.capacity() +
     ' · перегруз был ' + st1.lvl + ', стал ' + st2.lvl);
ok(st1.lvl === 1 && st2.lvl === 0 && W.countStack('ore') === 0,
   'из перегруза можно выбраться, выбросив лишнее');

W.reset(); W.setPanel(null);
W.setFoes([]); W.spawnFoe('drowner', 1500, 700);
const Pl = W.getP(); Pl.x = 1500; Pl.y = 700; W.syncCam();
const g0 = W.getGold();
W.hurtFoe(W.getFoes()[0], 99999, 'sword');
for (let i = 0; i < 30; i++) W.update(0.016);
ok(W.getGold() > g0, 'добыча с твари по-прежнему прыгает в карман');

head('Здоровье при загрузке похода');
W.reset();
W.getP().sk = { tough: 5 };
W.getP().hp = W.maxHP();
const full = W.maxHP();
W.setPhase('CAMP'); W.saveRun();
W.reset(); W.loadRun();
note('maxHP с «Закалкой» 5: ' + full + ' · после загрузки hp ' + W.getP().hp);
ok(W.getP().hp === full, 'здоровье не срезается за навык «Закалка»');

W.reset(); W.getP().sk = { tough: 5 }; W.getP().hp = 42;
W.setPhase('CAMP'); W.saveRun(); W.reset(); W.loadRun();
ok(W.getP().hp === 42, 'раненый остаётся раненым, а не долечивается');

W.reset(); W.getP().hp = 77; W.setPhase('CAMP'); W.saveRun();
const raw = JSON.parse(store['witcher_run']); delete raw.sk;
store['witcher_run'] = JSON.stringify(raw);
W.reset(); W.loadRun();
ok(W.getP().hp === 77, 'старая запись без навыков грузится по-прежнему');

head('Цены на верстаке');
function sellSword(prep) {
  W.reset(); W.setPanel('bench'); W.setBenchTab('work');
  prep();
  const s = W.mkSword('steel', 4, null);
  W.getInv().push(s); W.setGold(0);
  W.render();                                          // как в игре: сперва рисуем, потом жмут
  W.sell(s);
  return W.getGold();
}
const atCamp = sellSword(() => {});
const afterTopi = sellSword(() => W.setMarket('topi'));
const afterKurgan = sellSword(() => W.setMarket('kurgan'));
note('у костра ' + atCamp + ' · после Топей ' + afterTopi + ' · после Кургана ' + afterKurgan);
ok(atCamp === afterTopi && atCamp === afterKurgan,
   'верстак всегда торгует по лагерному уделу, а не по последнему встречному');
W.reset();
W.setVendor({ ico: '🧔', n: 'Торговец', tabs: ['supply'], town: { n: 'Озёрки' }, kd: 'topi' });
W.setMarket('topi'); W.setPanel('vendor'); W.render();
ok(W.getMarket() === 'topi', 'у деревенского торговца остаётся его удел');

head('Доска работ при трёх взятых');
W.reset(); W.setPhase('CAMP');
for (let i = 0; i < 3; i++) W.startContract(W.makeContract(W.JOBS[i], 0));
const P3 = W.getP(); P3.x = W.BOARD.x; P3.y = W.BOARD.y;
W.setPanel('board');
let drew = true;
try { W.render(); } catch (e) { drew = false; note('падение: ' + e.message); }
ok(drew, 'доска открывается и рисуется с тремя работами на руках');
const before = W.getTaken().length;
W.takeStory();
ok(W.getTaken().length === before, 'взять четвёртую всё равно нельзя');
W.reset(); W.setPhase('CAMP');
for (let i = 0; i < 2; i++) W.startContract(W.makeContract(W.JOBS[i], 0));
W.takeStory();
ok(W.getTaken().some(c => c.story), 'с двумя работами сюжетное дело берётся');

done();
