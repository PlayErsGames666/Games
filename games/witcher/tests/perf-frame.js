/* Во что обходится кадр на длинном переходе через всю землю.

   Смотреть надо не на абсолютные миллисекунды (песочница медленнее браузера
   в десятки раз), а на две вещи:
     · РОВНЫЙ ли ряд по краям — если в одном краю кадр вдвое дороже, значит
       что-то считается по густоте края, а не по окну;
     · не РАСТЁТ ли ряд к концу — значит что-то копится и не убирается.  */
'use strict';
const { makeProbe, walker } = require('./probe.js');
const { W, N, zero } = makeProbe();

W.reset(); W.setPanel(null); W.setPhase('CAMP');
W.startContract(W.makeContract(W.JOBS.find(j => j.loc === 'woods'), 3));
const P = W.getP();
const step = walker(P, 140);

W.update(0.016); W.render();                           // прогрев: печь земли и карты разовая
zero();

const FRAMES = +(process.argv[2] || 12000);
const CHUNK = Math.max(1, Math.round(FRAMES / 6));
const rows = [];
let uSum = 0, rSum = 0, frames = 0;
const t0 = process.hrtime.bigint();
for (let i = 0; i < FRAMES; i++) {
  step(0.016); P.hp = 1000;                            // нас не убить, мы меряем
  const a = process.hrtime.bigint(); W.update(0.016);
  const b = process.hrtime.bigint(); W.render();
  const c = process.hrtime.bigint();
  uSum += Number(b - a) / 1e6; rSum += Number(c - b) / 1e6; frames++;
  if (frames === CHUNK) {
    rows.push({
      край: W.LOCS[W.getLoc()].n,
      твари: W.getFoes().length,
      добыча: W.getDrops().length,
      'update мс': +(uSum / frames).toFixed(3),
      'render мс': +(rSum / frames).toFixed(3),
      'font=': +((N['font='] || 0) / frames).toFixed(1),
      fillText: +((N.fillText || 0) / frames).toFixed(1),
      fillRect: +((N.fillRect || 0) / frames).toFixed(1),
    });
    uSum = rSum = frames = 0; zero();
  }
}
console.table(rows);
console.log('всего ' + ((Number(process.hrtime.bigint() - t0)) / 1e6).toFixed(0) + ' мс на ' + FRAMES + ' кадров');
console.log('\nчего ждать: ряд «font=» и «fillText» ровный по всем краям (значки печёные),');
console.log('«твари» держится в пределах дюжины с небольшим (вольный мир не копится),');
console.log('«добыча» не растёт бесконечно, «update»/«render» не ползут вверх к концу.');
