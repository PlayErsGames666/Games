/* Мутация в две ступени. Вторая — не улучшение, а срыв: в неё попадают
   только из первой, отменить нельзя, и платится она дважды — здоровьем
   в бою и отравой после. Проверяем и выгоду, и цену: без цены это была бы
   просто кнопка «стать сильнее». */
'use strict';
const { W, store, ok, note, head, done } = require('./harness.js');

function fresh() {
  W.reset(); W.setPanel(null);
  const P = W.getP();
  P.mutGauge = 100;
  return P;
}

head('В срыв попадают только из первой ступени');
let P = fresh();
P.mutGauge = 0;
W.toggleMutation();
ok(P.mut <= 0 && P.mut2 <= 0, 'на пустой шкале не включается вовсе');
P.mutGauge = 100;
W.toggleMutation();
ok(P.mut > 0 && P.mut2 <= 0, 'первая ступень встаёт со шкалы');
ok(P.mutGauge === 0, 'шкала обнулилась');
W.toggleMutation();
ok(P.mut2 > 0, 'второе нажатие срывает дальше');
const at2 = P.mut2;
W.toggleMutation();
ok(P.mut2 === at2, 'третье нажатие ничего не меняет — дальше некуда');

head('Зверь бьёт втрое и лечится вдвое');
P = fresh();
const sw = P.silver;
const base = W.swordDamage(sw, 'monster');
W.toggleMutation();
const d1 = W.swordDamage(sw, 'monster');
W.toggleMutation();
const d2 = W.swordDamage(sw, 'monster');
note('урон мечом: обычный ' + base.toFixed(1) + ' → ебатня ' + d1.toFixed(1) + ' → зверь ' + d2.toFixed(1));
ok(Math.abs(d1 / base - 2.2) < 0.01, 'первая ступень — ровно ×2.2');
ok(Math.abs(d2 / base - 3.4) < 0.01, 'вторая — ровно ×3.4');

P = fresh();
P.xbow = W.mkXbow('hunter', 0, null);
const xb = W.xbowDamage();
W.toggleMutation(); W.toggleMutation();
note('урон арбалетом: ' + xb.toFixed(1) + ' → ' + W.xbowDamage().toFixed(1));
ok(Math.abs(W.xbowDamage() / xb - 3.4) < 0.01, 'арбалет тоже втрое');

P = fresh();
P.hp = 50;
W.toggleMutation();
W.setFoes([]); W.spawnFoe('drowner', P.x + 40, P.y);
const before1 = P.hp;
W.hurtFoe(W.getFoes()[0], 40, 'sword');
const heal1 = P.hp - before1;
P = fresh(); P.hp = 50;
W.toggleMutation(); W.toggleMutation();
W.setFoes([]); W.spawnFoe('drowner', P.x + 40, P.y);
const before2 = P.hp;
W.hurtFoe(W.getFoes()[0], 40, 'sword');
const heal2 = P.hp - before2;
note('с сорока урона возвращается: ебатня ' + heal1.toFixed(1) + ' · зверь ' + heal2.toFixed(1));
ok(Math.abs(heal2 / heal1 - 2) < 0.05, 'зверю кровь возвращает вдвое больше');

head('И платит за это');
P = fresh();
const takeNorm = W.damageTaken(50);
W.toggleMutation();
const take1 = W.damageTaken(50);
W.toggleMutation();
const take2 = W.damageTaken(50);
note('входящий удар из 50: обычный ' + takeNorm.toFixed(1) + ' → ебатня ' + take1.toFixed(1) + ' → зверь ' + take2.toFixed(1));
ok(take2 > take1 && take1 > takeNorm, 'зверь стеклянней всех');

P = fresh();
W.toggleMutation(); W.toggleMutation();
ok(P.tox === 100, 'отрава мгновенно на пределе (' + P.tox + ')');
ok(P.toxLock > 0, 'мутаген повис на ' + Math.round(P.toxLock) + ' секунд');
// за порогом в 70 здоровье течёт само
P.hp = 200;
const hp0 = P.hp;
for (let i = 0; i < 20; i++) W.update(0.05);           // секунда
note('за секунду срыва здоровье само утекло на ' + (hp0 - P.hp).toFixed(1));
ok(P.hp < hp0, 'выживаешь, только пока убиваешь');

head('Знаки и зелья отрезаны');
P = fresh();
W.addStack('swallow', 3);
W.toggleMutation();
const mp1 = P.mp;
W.castRune(0);
ok(P.mp < mp1, 'на первой ступени знаки работают');
const sw1 = W.countStack('swallow');
W.drink('swallow');
ok(W.countStack('swallow') === sw1 - 1, 'и зелья пьются');
W.toggleMutation();
const mp2 = P.mp, sw2 = W.countStack('swallow');
P.runeCd = [0, 0, 0, 0];
W.castRune(0); W.castRune(1);
ok(P.mp === mp2, 'зверю знаки недоступны — энергия не тронута');
W.drink('swallow');
ok(W.countStack('swallow') === sw2, 'и склянка осталась в сумке');

head('Отрава сходит вчетверо медленнее');
function decay(lock) {
  const p = fresh();
  p.tox = 100; p.toxLock = lock; p.mut = 0; p.mut2 = 0; p.hp = 100000;
  for (let i = 0; i < 100; i++) W.update(0.05);        // пять секунд
  return 100 - p.tox;
}
const fast = decay(0), slow = decay(999);
note('за пять секунд отрава упала: обычная на ' + fast.toFixed(1) + ' · мутагенная на ' + slow.toFixed(1));
ok(Math.abs(fast / Math.max(0.01, slow) - 4) < 0.35, 'мутагенная сходит примерно вчетверо медленнее');

head('Мёдом мутаген не вымыть');
P = fresh(); P.tox = 100; P.toxLock = 0; W.addStack('honey', 2);
W.drink('honey');
const normHoney = 100 - P.tox;
P = fresh(); P.tox = 100; P.toxLock = 40; W.addStack('honey', 2);
W.drink('honey');
const lockHoney = 100 - P.tox;
note('Белый мёд снимает: обычно ' + normHoney + ' · при мутагене ' + lockHoney);
ok(Math.abs(lockHoney / normHoney - 0.5) < 0.02, 'мёд берёт ровно вполсилы');

head('Цену не пересидеть и не переждать');
P = fresh();
W.toggleMutation(); W.toggleMutation();
W.setPhase('CAMP'); W.saveRun();
W.reset(); W.loadRun();
note('после закрытой вкладки: отрава ' + Math.round(W.getP().tox) + ', мутаген ' + Math.round(W.getP().toxLock) + 'с');
ok(W.getP().toxLock > 0, 'мутаген едет вместе с записью похода');
ok(W.getP().mut <= 0 && W.getP().mut2 <= 0, 'а сама мутация не переживает — она только в бою');

head('Смерть обнуляет всё');
P = fresh();
W.toggleMutation(); W.toggleMutation();
W.setPhase('CAMP');
W.hurtPlayer(1e6, null);
W.rise();
ok(W.getP().mut <= 0 && W.getP().mut2 <= 0 && W.getP().toxLock === 0 && W.getP().tox === 0,
   'после подъёма у костра ни мутации, ни мутагена');

head('Отрисовка обеих ступеней');
let drew = true;
try {
  P = fresh(); W.setPhase('FIGHT');
  W.setFoes([]); W.spawnFoe('nekker', P.x + 50, P.y);
  W.toggleMutation();
  for (let i = 0; i < 10; i++) { W.update(0.016); W.render(); }
  W.toggleMutation();
  for (let i = 0; i < 10; i++) { W.update(0.016); W.render(); }
  P.mut = 0; P.mut2 = 0;
  for (let i = 0; i < 10; i++) { W.update(0.016); W.render(); }
} catch (e) { drew = false; note('падение: ' + e.message); }
ok(drew, 'обе ступени и остаточный мутаген рисуются');

done();
