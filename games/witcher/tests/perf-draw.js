/* Сколько игра просит у холста в каждом краю.

   Ради этого замера и затевалась вся возня со значками. Было так:

     лагерь   ctx.font=  63 · fillText  72 (emoji  60)
     чаща     ctx.font=  89 · fillText  98 (emoji  85)
     скалы    ctx.font= 106 · fillText 115 (emoji 102)

   Каждый смайлик — самая дорогая операция холста, и чем гуще край, тем
   тяжелее кадр: отсюда и подлагивания на переходах. Стало ~30 emoji ВЕЗДЕ.

   Если этот ряд снова расползётся по краям — значит кто-то опять рисует
   смайлики напрямую вместо drawIco, либо кэш значков переполняется. */
'use strict';
const { makeProbe } = require('./probe.js');
const { W, N, zero } = makeProbe();

W.reset(); W.setPanel(null);
W.update(0.016); W.render();

const rows = [];
for (const id of Object.keys(W.LOCS)) {
  const g = W.regionSpot(id), P = W.getP();
  P.x = g.mx; P.y = g.my; W.syncCam();
  for (let i = 0; i < 10; i++) { W.update(0.016); W.render(); }   // прогрев: печь значков разовая
  zero();
  const F = 60;
  for (let i = 0; i < F; i++) { W.update(0.016); W.render(); }
  rows.push({
    край: W.LOCS[id].ico + ' ' + W.LOCS[id].n,
    'ctx.font=': Math.round((N['font='] || 0) / F),
    fillText: Math.round((N.fillText || 0) / F),
    fillRect: Math.round((N.fillRect || 0) / F),
    drawImage: Math.round((N.drawImage || 0) / F),
    'дуг': Math.round((N.arc || 0) / F),
  });
}
console.table(rows);
const f = rows.map(r => r['ctx.font=']);
const spread = Math.max(...f) - Math.min(...f);
console.log('разброс «ctx.font=» по краям: ' + spread +
            (spread <= 12 ? '  — ровно, значки берутся из печати'
                          : '  — РАСПОЛЗЛОСЬ: кто-то рисует смайлики напрямую или кэш переполнен'));
