/* Земля: размеры, потолки, расстановка руками и совместимость старых записей.
   Земля росла дважды, и каждый рост ломал что-нибудь из этого списка. */
'use strict';
const { W, store, ok, note, head, done } = require('./harness.js');
W.reset();

head('Размеры и потолки');
note('мир ' + W.WORLD_W + '×' + W.WORLD_H + ' · клеток ' + W.TW + '×' + W.TH +
     ' = ' + (W.TW * W.TH / 1000).toFixed(0) + 'k · опорных точек ' + W.SEEDS.length);
ok(W.SEEDS.length <= 255,
   'опорных точек не больше 255 — карта краёв лежит в Uint8Array');
ok(W.TW * W.TH < 4e6, 'клеток по силам одному массиву');

head('Ничего не уехало за край');
let out = 0;
for (const s of W.SEEDS) if (s.x < 0 || s.y < 0 || s.x > W.WORLD_W || s.y > W.WORLD_H) out++;
for (const k in W.SPOTS) { const s = W.SPOTS[k]; if (s.x < 0 || s.y < 0 || s.x > W.WORLD_W || s.y > W.WORLD_H) out++; }
for (const t of W.TOWNS) if (t.x < 0 || t.y < 0 || t.x > W.WORLD_W || t.y > W.WORLD_H) out++;
for (const p of W.POWER) if (p.x < 0 || p.y < 0 || p.x > W.WORLD_W || p.y > W.WORLD_H) out++;
for (const p of W.PATHS) for (const q of p) if (q.x < 0 || q.y < 0 || q.x > W.WORLD_W || q.y > W.WORLD_H) out++;
ok(out === 0, 'все расставленные руками точки внутри земли');
ok(W.locAt(W.FIRE.x, W.FIRE.y) === 'camp', 'лагерь остался лагерем');
ok(W.inCamp(W.FIRE.x, W.FIRE.y), 'костёр внутри круга лагеря');

head('Края и стрелка контракта');
const seen = {};
for (const s of W.SEEDS) seen[s.id] = (seen[s.id] || 0) + 1;
const missing = Object.keys(W.LOCS).filter(id => !seen[id]);
ok(missing.length === 0, 'у каждого края есть опорные точки' +
   (missing.length ? ': нет у ' + missing.join(', ') : ''));
/* Стрелка контракта ведёт в regionSpot. Раньше он возвращал ОПОРНУЮ ТОЧКУ,
   а она сама в своём краю лежать не обязана — межа считается со смещением,
   и сосед её накрывает. Игрок приходил на «болото», которого там нет. */
let wrong = [];
for (const id in W.LOCS) {
  const g = W.regionSpot(id);
  if (W.locAt(g.mx, g.my) !== id) wrong.push(W.LOCS[id].n);
}
ok(wrong.length === 0, 'стрелка каждого края ведёт в этот самый край' +
   (wrong.length ? ': врёт для ' + wrong.join(', ') : ''));

head('Старые записи похода');
/* Земля росла дважды, и координаты в записи надо растянуть тем же
   множителем, каким рос мир, иначе вернувшийся игрок окажется за
   тридевять земель от костра. */
for (const [wv, k] of [[undefined, 3.5], [2, 2], [3, 1]]) {
  W.reset(); W.setPhase('CAMP'); W.saveRun();
  const raw = JSON.parse(store['witcher_run']);
  raw.x = 2765; raw.y = 2065;
  if (wv === undefined) delete raw.wv; else raw.wv = wv;
  store['witcher_run'] = JSON.stringify(raw);
  W.reset(); W.loadRun();
  ok(Math.abs(W.getP().x - 2765 * k) < 1,
     'запись версии ' + (wv === undefined ? '1 (без поля)' : wv) +
     ': 2765 → ' + Math.round(W.getP().x) + ', ждали ' + 2765 * k);
}

head('Битая запись не роняет игру');
W.reset(); W.setPhase('CAMP'); W.saveRun();
const bad = JSON.parse(store['witcher_run']);
Object.assign(bad, {
  inv: [{ k: 'sword', metal: 'ЧУЖОЙ', tier: 99 }, null, 5],
  armor: { k: 'armor', type: 'нет' },
  offers: [{ t: 1, pool: ['нет'], loc: 'нет', n: -5, gold: 'x' }],
  sk: { tough: 999, чужой: 5 }, lvl: -3, gold: 'abc', x: 'nan', y: null,
  power: ['woods', 'ЧУЖОЙ', 42, null],
});
store['witcher_run'] = JSON.stringify(bad);
W.reset();
let loaded = false;
try { loaded = W.loadRun(); } catch (e) { note('падение: ' + e.message); }
ok(loaded, 'правленая руками запись грузится без падения');
ok(W.getInv().length === 0, 'чужие вещи из неё отсеяны');
ok(W.getGold() === 0 && W.getP().lvl === 1, 'чушь в числах приведена к разумному');
ok(W.getPower().size === 1 && W.getPower().has('woods'), 'из камней силы взяты только знакомые ключи');

head('Запись облика — такая же битая, такая же безопасная');
{
  store['witcher_look'] = ' {{{';
  let fell = false;
  try { W.loadLook(); } catch (e) { fell = true; }
  ok(!fell, 'мусор в записи облика не роняет игру');
  ok(W.getLook().hair === 'mane', 'взято умолчание');
}

done();
