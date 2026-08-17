/* Что и сколько печётся: первый кадр, плитки земли, значки.

   Три числа, за которыми стоит следить:
     · ПЕРВЫЙ КАДР — это заминка на входе в игру. Было 98676 заливок (вся
       земля одной картиной плюс карта мира по пикселю), стало около 4500.
     · ПЛИТКИ ЗЕМЛИ — сколько печётся за долгий переход. Если их сильно
       больше, чем клеток в мире, значит плитки толкутся: выбрасываем и
       печём одно и то же.
     · ЗНАЧКИ — если их печётся сотнями, переполняется кэш, и они пекутся
       по кругу. Это уже случалось: 209 пар «знак+размер» против кэша в 320
       с учётом цвета не помещались. */
'use strict';
const { makeProbe, walker } = require('./probe.js');
const { W, N, made, zero } = makeProbe();

zero();
W.reset();
const beforeFirst = made.length;
W.update(0.016); W.render();
const first = { ...N };
const bigOnes = made.slice(beforeFirst).filter(c => c.width > 200);
console.log('ПЕРВЫЙ КАДР');
console.log('  заливок: ' + ((first.fillRect || 0) + (first.fill || 0)) +
            ' · putImageData: ' + (first.putImageData || 0) +
            ' · крупных холстов испечено: ' + bigOnes.length +
            ' (' + bigOnes.map(c => c.width + '×' + c.height).join(', ') + ')');
console.log('  (для памяти: до разбивки земли на плитки тут было 98676 заливок)');

const FRAMES = +(process.argv[2] || 20000);
const P = W.getP();
W.setPanel(null);
const step = walker(P, 140);
made.length = 0; zero();
let bakeFrames = 0, worst = 0;
for (let i = 0; i < FRAMES; i++) {
  const before = (N.fillRect || 0) + (N.fill || 0);
  step(0.016); P.hp = 1000;
  W.update(0.016); W.render();
  const d = (N.fillRect || 0) + (N.fill || 0) - before;
  if (d > 2000) { bakeFrames++; if (d > worst) worst = d; }
}
const chunks = made.filter(c => c.width === 432);
const icons = made.filter(c => c.width > 1 && c.width < 200);
const cells = Math.ceil(W.WORLD_W / 768) * Math.ceil(W.WORLD_H / 768);
console.log('\nПЕРЕХОД ЧЕРЕЗ ВСЮ ЗЕМЛЮ (' + FRAMES + ' кадров ≈ ' + Math.round(FRAMES * 0.016 / 60) + ' мин игры)');
console.log('  плиток земли испечено: ' + chunks.length + ' при ' + cells + ' клетках в мире' +
            (chunks.length > cells * 2.5 ? '   ← ТОЛКУТСЯ' : ''));
console.log('  значков испечено: ' + icons.length +
            (icons.length > 500 ? '   ← кэш переполняется' : ''));
console.log('  кадров, в которых что-то пеклось: ' + bakeFrames +
            ' (' + (100 * bakeFrames / FRAMES).toFixed(2) + '%) · самый тяжёлый: ' + worst + ' заливок');
const px = chunks.reduce((s, c) => s + c.width * c.height, 0) / Math.max(1, chunks.length);
console.log('  память: плиток держим не больше 16 → ' + ((16 * px * 4) / 1048576).toFixed(1) + ' МБ');
