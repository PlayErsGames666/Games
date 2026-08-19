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

/* САМЫЙ ДОРОГОЙ БАГ ЭТОЙ ЧАСТИ ИГРЫ. Повадка — правило ВОЛЬНОГО мира, а
   контрактную цель зовут по имени: она обязана идти к ведьмаку, какой бы
   смирной ни была её порода. Условие стояло «злой, если free=false И порода
   wild», и работы по кабанам, псам и медведям ломались напрочь: цели
   выходили из очереди и РАЗБРЕДАЛИСЬ. Очередь пустела, счёт оставался
   нетронутым, и работа не закрывалась никогда.
   Одиннадцать работ с доски из семидесяти двух. */
head('Контрактную цель выпускают злой — любой породы');
for (const t of ['boar', 'bruin', 'hound', 'drowner', 'archer', 'aurochs']) {
  place('field'); W.setFoes([]);
  const p = W.getP();
  W.spawnFoe(t, p.x + 300, p.y, null, false);          // free=false, то есть по контракту
  const f = W.getFoes()[0];
  ok(f.mad, W.FOES[t].n + ' (повадка ' + W.FOES[t].mood + ') выпущен уже злым');
  ok(f.seen, '   и не рисует «!», будто ещё присматривается');
}
{
  place('field'); W.setFoes([]);
  const p = W.getP();
  W.spawnFoe('boar', p.x + 300, p.y, null, true);       // а вольный — по своей повадке
  ok(!W.getFoes()[0].mad, 'а вольный кабан по-прежнему мирный, пока не тронешь');
}

head('И потому работа по мирному зверю закрывается');
for (const name of ['Кабанья потрава', 'Псы потравили стадо', 'Медведь в дубраве']) {
  W.reset(); W.setPanel(null);
  const job = W.makeContract(W.JOBS.find(j => j.t === name), 3);
  W.startContract(job);
  const g = W.regionSpot(job.loc), P = W.getP();
  P.x = g.mx; P.y = g.my; W.syncCam(); W.update(0.016);
  let n = 0;
  // стоим на месте и бьём тех, кто подошёл на выстрел: ходить по краю за
  // разбежавшимися целями игра не обещает
  while (W.getTaken().indexOf(job) >= 0 && n++ < 3000) {
    P.hp = 1e9;
    for (const f of W.getFoes().slice())
      if (!f.dead && f.job === job && Math.hypot(f.x - P.x, f.y - P.y) < 350) W.hurtFoe(f, 1e9, 'sword');
    W.update(0.05);
  }
  /* На провале говорим то, что ВИДНО, а не то, что кажется. Прежняя строка
     объявляла очередь пустой, не заглянув в неё ни разу, — а вся разница
     между «цель заклинило» и «выпускать перестало» именно там. */
  const stuck = W.getFoes().filter(f => f.job === job && !f.dead)
    .map(f => W.FOES[f.t].n + ' в ' + Math.hypot(f.x - P.x, f.y - P.y).toFixed(0) + ' шагах');
  ok(W.getTaken().indexOf(job) < 0,
     '«' + name + '» закрылась' + (n < 3000 ? ' за ' + (n * 0.05).toFixed(0) + ' с' :
       ': НЕ ЗАКРЫЛАСЬ, осталось ' + job.left + '/' + job.n +
       ' · в очереди ' + job.queue +
       ' · на поле ' + (stuck.length ? stuck.join(', ') : 'пусто')));
}

/* ====================  КЛИН В ЧАЩЕ  ====================
   Тварь ходит к ведьмаку по прямой, а деревья её держат: уткнулась —
   отворачивает вбок и обходит. Отворот был один и тот же на всякую попытку,
   и там, где его не хватало, зверь бился в ту же щель до конца похода.

   Место нашлось прочёсыванием: (6207, 2543) в чаще, ведьмак на (5868, 2844).
   Бандит, вышедший там, за полтораста секунд наматывал 1930 шагов и не
   приближался НИ НА ШАГ из своих 451. Работа при этом закрыться уже не
   могла — очередь пуста, счёт не сходится. Один прогон «Кабаньей потравы»
   из ста тридцати кончался этим, и мигание стенда было не мигание, а она.

   Земля считается от постоянного зерна, поэтому место воспроизводится
   само по себе, и мерка ставит зверя ровно туда. */
head('Заклинившая в чаще тварь выбирается и доходит');
{
  W.reset(); W.setPanel(null); W.setPhase('FIGHT');
  const P = W.getP();
  P.x = 5868; P.y = 2844; W.syncCam();
  W.setFoes([]);
  W.spawnFoe('bandit', 6212, 2553, null, false);       // free=false — по контракту, уже злой
  const f = W.getFoes()[0];
  const d0 = Math.hypot(f.x - P.x, f.y - P.y);
  let best = d0, secs = 0;
  for (let i = 0; i < 3000 && best > 30; i++) {
    P.hp = 1e9;                                        // мерка про дорогу, а не про бой
    W.update(0.05); secs += 0.05;
    best = Math.min(best, Math.hypot(f.x - P.x, f.y - P.y));
  }
  note('вышел в ' + d0.toFixed(0) + ' шагах, подошёл на ' + best.toFixed(0) +
       ' за ' + secs.toFixed(0) + ' с');
  ok(best < 30, 'из клина между деревьями тварь выбирается сама');
  ok(secs < 60, 'и не за полдня: ' + secs.toFixed(0) + ' с');
}

/* Отворот обязан РАСТИ. Один и тот же на всякую попытку — ровно то, из-за
   чего клин и держал: не хватило раз, не хватит и на сотый. */
head('Отворот от преграды нарастает до разворота назад');
{
  const first = W.slideTurn({ stuck: 0 }), last = W.slideTurn({ stuck: W.STUCK_MAX });
  note('первая попытка отворачивает на ' + (first * 57.3).toFixed(0) +
       '°, последняя — на ' + (last * 57.3).toFixed(0) + '°');
  ok(first > 0.5, 'первая попытка отворачивает заметно, а не на волосок');
  ok(last > first, 'каждая следующая шире прежней');
  ok(last > 2.4 && last < Math.PI,
     'последняя пятится почти назад — а назад дорога свободна, зверь по ней и пришёл');
}

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

/* Здесь стенд однажды сам себя обманул: он считал оставшихся с оговоркой
   «и не злых» — ровно тех, кого уборка и так убирала. Злые же не убирались
   НИКОГДА, и это осталось незамеченным. Считаем всех подряд. */
head('Отставшие расходятся, кормушки нет');
place('meadow'); W.setFoes([]);
const P8 = W.getP();
for (let i = 0; i < 400; i++) W.update(0.05);
const before = W.getFoes().length;
P8.x = Math.max(50, Math.min(W.WORLD_W - 50, P8.x + 3000)); W.syncCam();
for (let i = 0; i < 60; i++) W.update(0.05);
const after = W.getFoes().filter(f => f.free).length;
note('было вольных ' + before + ' → после ухода за 3000 шагов осталось ' + after);
ok(after < before, 'отставшие вольные твари расходятся');

/* Злость ставится навсегда и не только ударом: всякой твари с повадкой wild
   её ставит само внимание. Если такая не расходится, она держит место в
   дюжине до конца похода — и вольный мир глохнет по дороге. */
head('Злая тоже теряет след');
function chase(type, hit) {
  place('swamp'); W.setFoes([]);
  const p = W.getP();
  W.spawnFoe(type, p.x + 150, p.y, null, true);
  const f = W.getFoes()[0];
  for (let i = 0; i < 40; i++) { p.hp = 1e9; W.update(0.05); }   // дать заметить
  if (hit) W.hurtFoe(f, 1, 'sword');
  const wasMad = f.mad;
  p.x = W.WORLD_W - 300; p.y = W.WORLD_H - 300; W.syncCam();
  // ведьмака держим живым: иначе его добьют вольные твари нового края, endGame
  // вычистит foes — и «разошлись» будет означать «все погибли вместе с игроком»
  for (let i = 0; i < 600; i++) { p.hp = 1e9; W.update(0.05); }
  return { wasMad, left: W.getFoes().indexOf(f) >= 0 };
}
const dr = chase('drowner', false);
ok(dr.wasMad, 'утопец разозлился, просто заметив, — удара не понадобилось');
ok(!dr.left, 'и всё же разошёлся, когда ведьмак ушёл за тридевять земель');
const bo = chase('boar', true);
ok(bo.wasMad && !bo.left, 'тронутый кабан тоже теряет след и уходит');
note('срок забвения: ' + W.WILD_FORGET + ' с дальше ' + W.WILD_NEAR + ' шагов');

head('А место в дюжине освобождается для нового края');
place('swamp'); W.setFoes([]);
const P9 = W.getP();
for (let i = 0; i < W.WILD_CAP; i++) W.spawnFoe('drowner', P9.x + 160 + i * 8, P9.y + i * 8, null, true);
for (let i = 0; i < 60; i++) { P9.hp = 1e9; W.update(0.05); }
const angry = W.getFoes().filter(f => f.free && f.mad).length;
note('злых вольных набралось: ' + angry + ' из ' + W.WILD_CAP);
P9.x = W.WORLD_W - 300; P9.y = W.WORLD_H - 300; W.syncCam();
for (let i = 0; i < 1200; i++) { P9.hp = 1e9; W.update(0.05); }
const near = W.getFoes().filter(f => f.free && Math.hypot(f.x - P9.x, f.y - P9.y) < W.WILD_NEAR).length;
note('через минуту в новом краю рядом с игроком: ' + near + ' вольных');
ok(near > angry, 'новый край заселяется, а не стоит пустым при занятом потолке');

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
