/* Отрисовка: не падает ли что-нибудь. Стенд не видит картинки — он видит
   только исключения, — но этого хватает, чтобы поймать самое частое:
   обращение к полю, которого у предмета нет. Гоняем все панели, все
   вкладки лавки, все края, весь бестиарий и весь сюжет целиком. */
'use strict';
const { W, ok, note, head, done } = require('./harness.js');

function safely(what, fn) {
  try { fn(); return true; }
  catch (e) { note(what + ': ' + e.message + (e.stack ? '\n      ' + e.stack.split('\n')[1].trim() : '')); return false; }
}

head('Панели');
let allOk = true;
for (const p of [null, 'bag', 'skills', 'craft', 'bench', 'board', 'map', 'vendor', 'look']) {
  W.reset();
  W.getInv().push(W.mkArmor('cat', 3, 'ward'), W.mkXbow('siege', 2, 'flame'), W.mkSword('silver', 4, 'vamp'));
  W.addStack('essence', 5); W.addStack('herb', 9); W.addStack('boltbom', 4);
  W.getP().sk = { brew: 3, fletch: 3, tough: 2 }; W.getP().sp = 3;
  W.setPanel(p);
  if (p === 'vendor') W.setVendor({ ico: '🧔', n: 'Торговец', tabs: ['supply', 'bolt', 'alch'], town: { n: 'Броды' }, kd: 'ard' });
  if (p === 'bench') W.setBenchTab('trade');
  allOk = safely('панель ' + p, () => W.render()) && allOk;
}
ok(allOk, 'все девять панелей рисуются');

head('Вкладки лавки');
allOk = true;
W.reset(); W.setPanel('bench'); W.setBenchTab('trade');
for (const t of ['supply', 'bolt', 'alch', 'weapon', 'armor', 'bag', 'sell']) {
  W.setTradeTab(t);
  allOk = safely('вкладка ' + t, () => W.render()) && allOk;
}
ok(allOk, 'все семь вкладок лавки рисуются');

head('Бой со всем бестиарием разом');
W.reset(); W.setPanel(null); W.setPhase('FIGHT');
W.startContract(W.makeContract(W.JOBS.find(j => j.d > 1.8) || W.JOBS[0], 5));
for (const t of Object.keys(W.FOES)) W.spawnFoe(t, W.getP().x + 60, W.getP().y + 60);
const P = W.getP();
P.mut = 5; P.biz = 5; P.quen = 40; P.yrden = { x: P.x, y: P.y, t: 3, r: 58 };
ok(safely('бой', () => { for (let i = 0; i < 40; i++) { W.update(0.016); W.render(); } }),
   'бой со всеми ' + Object.keys(W.FOES).length + ' тварями, мутацией, щитом и ловушкой');

head('Все края');
allOk = true;
for (const id in W.LOCS) {
  const g = W.regionSpot(id), Pp = W.getP();
  Pp.x = g.mx; Pp.y = g.my; W.syncCam();
  allOk = safely('край ' + id, () => { W.update(0.016); W.render(); }) && allOk;
}
ok(allOk, 'все ' + Object.keys(W.LOCS).length + ' краёв рисуются');

head('Сюжет целиком');
W.reset(); W.setPhase('CAMP');
let fails = 0;
for (let i = 0; i < W.STORY.length; i++) {
  W.takeStory();
  const c = W.getTaken().find(x => x.story);
  if (!c) { fails++; break; }
  const sp = W.SPOTS[c.spot];
  const Pp = W.getP(); Pp.x = sp.x; Pp.y = sp.y; W.setPhase('FIGHT');
  W.update(0.016);
  if (!c.arrived) fails++;
  c.queue = 0; c.left = 0;
  W.setFoes(W.getFoes().filter(f => f.job !== c));
  W.update(0.016);
  if (W.getTaken().indexOf(c) >= 0) fails++;
  W.setPhase('CAMP');
}
note('пройдено заданий: ' + W.getStory() + ' из ' + W.STORY.length);
ok(fails === 0 && W.getStory() === W.STORY.length, 'сюжет проходится от начала до конца');
ok(safely('доска после сюжета', () => { W.setPanel('board'); W.render(); }),
   'доска рисуется и когда сюжет пройден');

done();
