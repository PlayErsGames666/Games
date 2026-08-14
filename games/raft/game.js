const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CW = 480, CH = 360, CELL = 30;
const CX = CW / 2, CY = CH / 2;

// --- баланс ---
const THIRST_RATE = 1.5, HUNGER_RATE = 1.2;
const REACH = 118, GRAB = 26;
const PURIFY_RATE = 0.30, WATER_MAX = 6, DRINK = 34;
const ROD_EVERY = 9, EAT_RAW = 24, EAT_COOKED = 48;
const DEBRIS_EVERY = 1.5, PULL_SPEED = 260, HOOK_CD = 0.45;
const SHARK_FIRST = 15, SHARK_EVERY = 22, SHARK_HP = 3, SHARK_BITE = 15, SHARK_SPEED = 46;
const SHARK_BITE_RANGE = CELL * 0.85, SPEAR_REACH = 132, JAB_KNOCK = 46;

const DEB = {
  log:     { ico: '🪵', give: 'wood', n: 2 },
  barrel:  { ico: '🛢️', give: 'plastic', n: 2 },
  plastic: { ico: '🧴', give: 'plastic', n: 1 },
  fish:    { ico: '🐟', give: 'food', n: 1 },
};
const DEB_KEYS = ['log', 'barrel', 'plastic', 'fish'];
const DEB_WEIGHT = [0.30, 0.16, 0.28, 0.26];

const BUILDS = [
  { id: 'purifier', ico: '💧', name: 'Опреснитель', cost: { plastic: 3, wood: 1 }, once: true },
  { id: 'rod',      ico: '🎣', name: 'Удочка',      cost: { wood: 2, plastic: 2 }, once: true },
  { id: 'fire',     ico: '🔥', name: 'Костёр',      cost: { wood: 4 },             once: true },
  { id: 'expand',   ico: '➕', name: 'Плот +1',     cost: { wood: 3, plastic: 1 }, once: false },
];
const ACTS = [
  { id: 'drink',  ico: '🥤', name: 'Пить',     key: 'Q' },
  { id: 'eat',    ico: '🍽️', name: 'Есть',     key: 'E' },
  { id: 'repair', ico: '🔧', name: 'Починить', key: 'R', cost: { wood: 2 } },
];

// --- состояние ---
let thirst, hunger, integrity, res, water, built, raft, player, players, debris, shark;
const MAXP = 4;                       // хозяин плота + трое гостей
var net = null, netAcc = 0;
function isNet() { return net && net.isOnline(); }
function meSeat() { return isNet() ? net.me : 0; }
function host() { return !isNet() || net.isHost(); }
function mkPlayer(gone) { return { tx: 0, ty: 0, px: CX, py: CY, cd: 0, gone: !!gone }; }
let time, best, over, overCause, paused, anim, msg, msgTimer, hurtT;
let debrisAcc, rodAcc, sharkTimer, hookCd, lastFrame = null;

best = +(localStorage.getItem('raft_best') || 0);

function reset() {
  thirst = 100; hunger = 100; integrity = 100;
  res = { wood: 0, plastic: 0, food: 0 }; water = 0;
  built = { purifier: false, rod: false, fire: false };
  raft = []; for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) raft.push({ x, y });
  players = []; for (let i = 0; i < MAXP; i++) players.push(mkPlayer(i !== 0));
  if (isNet() && net.isHost()) for (const sl of net.slots()) players[sl].gone = false;
  player = players[meSeat()]; player.gone = false;
  debris = []; shark = null;
  time = 0; over = false; overCause = ''; paused = false; anim = 0; hurtT = 0;
  debrisAcc = 0; rodAcc = 0; sharkTimer = SHARK_FIRST; hookCd = 0;
  message('Кликай по мусору в круге — притянешь крюком. Копи ресурсы и крафти!');
  buildPanels(); updateUI();
}

function message(t) { msg = t; msgTimer = 3.2; const m = document.getElementById('msg'); if (m) m.textContent = t; }

// --- плот ---
function hasTile(x, y) { return raft.some(t => t.x === x && t.y === y); }
function tilePx(x, y) { return { px: CX + x * CELL, py: CY + y * CELL }; }
function addRaftTile() {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cand = [];
  for (const t of raft) for (const [dx, dy] of dirs) { const nx = t.x + dx, ny = t.y + dy; if (!hasTile(nx, ny) && !cand.some(c => c.x === nx && c.y === ny)) cand.push({ x: nx, y: ny }); }
  if (cand.length) raft.push(cand[(Math.random() * cand.length) | 0]);
}

// --- ресурсы / крафт ---
function canAfford(cost) { if (!cost) return true; for (const k in cost) if ((res[k] || 0) < cost[k]) return false; return true; }
function pay(cost) { if (!cost) return; for (const k in cost) res[k] -= cost[k]; }
function costStr(cost) { return cost ? Object.keys(cost).map(k => cost[k] + ({ wood: '🪵', plastic: '♻️', food: '🐟' })[k]).join(' ') : ''; }

function build(id) {
  const b = BUILDS.find(x => x.id === id); if (!b) return;
  if (b.once && built[id]) { message(b.name + ' уже построен'); return; }
  if (!canAfford(b.cost)) { message('Не хватает ресурсов на «' + b.name + '»'); return; }
  pay(b.cost);
  if (b.id === 'expand') { addRaftTile(); integrity = Math.min(100, integrity + 10); message('➕ Плот расширен, +целостность'); }
  else { built[id] = true; message(b.ico + ' ' + b.name + ' построен'); }
  updateUI();
}

function doAct(id) {
  if (id === 'drink') { if (water >= 1) { water--; thirst = Math.min(100, thirst + DRINK); message('🥤 Глоток пресной воды'); } else message('Нет пресной воды — построй опреснитель'); }
  else if (id === 'eat') { if (res.food >= 1) { res.food--; hunger = Math.min(100, hunger + (built.fire ? EAT_COOKED : EAT_RAW)); message(built.fire ? '🍽️ Сытная еда с костра' : '🐟 Съел рыбу'); } else message('Нет рыбы — налови крюком или удочкой'); }
  else if (id === 'repair') { const c = { wood: 2 }; if (!canAfford(c)) { message('Нужно 2🪵 на ремонт'); return; } if (integrity >= 100) { message('Плот и так целый'); return; } pay(c); integrity = Math.min(100, integrity + 20); message('🔧 Плот подлатан'); }
  updateUI();
}

// --- мусор / крюк ---
function spawnDebris() {
  let r = Math.random(), i = 0, acc = 0; for (; i < DEB_WEIGHT.length; i++) { acc += DEB_WEIGHT[i]; if (r <= acc) break; }
  const type = DEB_KEYS[Math.min(i, DEB_KEYS.length - 1)];
  const y = 44 + Math.random() * (CH - 88);
  debris.push({ x: CW + 22, y, vx: -(30 + Math.random() * 20), vy: (Math.random() - 0.5) * 6, type, ph: Math.random() * 6.28, hooked: false });
}
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function collect(d) {
  const info = DEB[d.type]; res[info.give] = (res[info.give] || 0) + info.n;
  message('🪝 +' + info.n + ' ' + info.ico); updateUI();
}
function hookNearest(seat) {
  const p = players[seat]; if (!p || p.cd > 0) return false;
  let best = null, bd = REACH + 1;
  for (const d of debris) { if (d.hooked) continue; const dd = dist(d.x, d.y, p.px, p.py); if (dd <= REACH && dd < bd) { bd = dd; best = d; } }
  // кто зацепил, к тому мусор и поедет: иначе вдвоём тянут в разные стороны
  if (best) { best.hooked = true; best.by = seat; p.cd = HOOK_CD; return true; }
  return false;
}

// --- акула / копьё ---
function makeShark() {
  const fromRight = Math.random() < 0.5;
  return { x: fromRight ? CW + 30 : -30, y: 40 + Math.random() * (CH - 80), hp: SHARK_HP, bitten: false, jabCd: 0 };
}
function jabShark(seat) {
  const p = players[seat]; if (!shark || !p) return false;
  if (dist(shark.x, shark.y, p.px, p.py) > SPEAR_REACH) return false;
  shark.hp--;
  const a = Math.atan2(shark.y - p.py, shark.x - p.px);
  shark.x += Math.cos(a) * JAB_KNOCK; shark.y += Math.sin(a) * JAB_KNOCK;
  if (shark.hp <= 0) { shark = null; sharkTimer = SHARK_EVERY; message('🔱 Акула отогнана!'); }
  else message('🔱 Тычок копьём! (' + shark.hp + ')');
  return true;
}
function nearestRaftPx(x, y) { let b = null, bd = 1e9; for (const t of raft) { const p = tilePx(t.x, t.y); const d = dist(x, y, p.px, p.py); if (d < bd) { bd = d; b = p; } } return b; }
function stepShark(dt) {
  if (!shark) return;
  const tgt = nearestRaftPx(shark.x, shark.y);
  const a = Math.atan2(tgt.py - shark.y, tgt.px - shark.x);
  shark.x += Math.cos(a) * SHARK_SPEED * dt; shark.y += Math.sin(a) * SHARK_SPEED * dt;
  if (dist(shark.x, shark.y, tgt.px, tgt.py) <= SHARK_BITE_RANGE) {
    integrity = Math.max(0, integrity - SHARK_BITE); hurtT = 0.4; message('🦈 Акула укусила плот! (−целостность)');
    shark = null; sharkTimer = SHARK_EVERY;             // укусила и нырнула — успей отогнать в следующий раз
    if (integrity <= 0) endGame('Плот разбит акулой');
  }
}

// --- обновление ---
function endGame(cause) { if (over) return; over = true; overCause = cause; if (time > best) { best = Math.floor(time); localStorage.setItem('raft_best', best); } }

function update(dt) {
  anim += dt;
  if (over || paused) return;
  // гость плот не считает: он рисует присланное, иначе два плота разойдутся
  if (isNet() && !net.isHost()) {
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) { const m = document.getElementById('msg'); if (m) m.textContent = ''; } }
    if (hurtT > 0) hurtT = Math.max(0, hurtT - dt);
    for (const p of players) if (!p.gone) { const pt = tilePx(p.tx, p.ty); p.px += (pt.px - p.px) * Math.min(1, dt * 12); p.py += (pt.py - p.py) * Math.min(1, dt * 12); }
    return;
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) { const m = document.getElementById('msg'); if (m) m.textContent = ''; } }
  if (hurtT > 0) hurtT = Math.max(0, hurtT - dt);
  if (hookCd > 0) hookCd = Math.max(0, hookCd - dt);
  time += dt;

  // движение всех выживших к своим клеткам (плавно)
  for (const p of players) {
    if (p.gone) continue;
    if (p.cd > 0) p.cd = Math.max(0, p.cd - dt);
    const pt = tilePx(p.tx, p.ty);
    p.px += (pt.px - p.px) * Math.min(1, dt * 12);
    p.py += (pt.py - p.py) * Math.min(1, dt * 12);
  }

  // показатели
  thirst = Math.max(0, thirst - THIRST_RATE * dt);
  hunger = Math.max(0, hunger - HUNGER_RATE * dt);
  if (built.purifier) water = Math.min(WATER_MAX, water + PURIFY_RATE * dt);
  if (built.rod) { rodAcc += dt; if (rodAcc >= ROD_EVERY) { rodAcc = 0; res.food++; message('🎣 Удочка поймала рыбу'); } }

  // мусор
  debrisAcc += dt; if (debrisAcc >= DEBRIS_EVERY) { debrisAcc = 0; spawnDebris(); }
  for (const d of debris) {
    if (d.hooked) {
      const owner = players[d.by || 0] || players[0];
      const a = Math.atan2(owner.py - d.y, owner.px - d.x);
      d.x += Math.cos(a) * PULL_SPEED * dt; d.y += Math.sin(a) * PULL_SPEED * dt;
      if (dist(d.x, d.y, owner.px, owner.py) < CELL * 0.7) d.collected = true;
    } else { d.x += d.vx * dt; d.y += d.vy * dt + Math.sin(anim * 2 + d.ph) * 4 * dt; }
  }
  for (const d of debris) if (d.collected) collect(d);
  debris = debris.filter(d => !d.collected && d.x > -40 && d.x < CW + 60);

  // акула
  if (!shark) { sharkTimer -= dt; if (sharkTimer <= 0) shark = makeShark(); }
  else stepShark(dt);

  // гибель
  if (thirst <= 0) endGame('Погиб от жажды');
  else if (hunger <= 0) endGame('Погиб от голода');
  else if (integrity <= 0) endGame('Плот затонул');

  updateUI();
  if (isNet() && net.isHost()) { netAcc += dt; if (netAcc >= 1 / 15) { netAcc = 0; broadcast(); } }
}

// --- ввод ---
function move(seat, dx, dy) { if (over || paused) return; const p = players[seat]; if (!p) return; const nx = p.tx + dx, ny = p.ty + dy; if (hasTile(nx, ny)) { p.tx = nx; p.ty = ny; } }
function clickAt(mx, my, seat) {
  if (over) { if (host()) reset(); return; }
  if (paused) return;
  const p = players[seat]; if (!p) return;
  if (shark && dist(shark.x, shark.y, mx, my) < 34 && dist(shark.x, shark.y, p.px, p.py) <= SPEAR_REACH) { jabShark(seat); return; }
  let best = null, bd = GRAB + 1;
  for (const d of debris) { if (d.hooked) continue; if (dist(d.x, d.y, p.px, p.py) > REACH) continue; const dd = dist(d.x, d.y, mx, my); if (dd <= GRAB && dd < bd) { bd = dd; best = d; } }
  if (best && p.cd <= 0) { best.hooked = true; best.by = seat; p.cd = HOOK_CD; }
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  myClick((e.clientX - r.left) * (CW / r.width), (e.clientY - r.top) * (CH / r.height));
});
document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (over) { if (e.code === 'Enter') { if (host()) reset(); else net.send({ t: 'again' }); } return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (document.fullscreenElement && e.code === 'Escape') return; myPause(); e.preventDefault(); return; }
  if (paused) return;
  if (e.repeat) return;
  const M = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  if (M[e.code]) { myMove(M[e.code][0], M[e.code][1]); e.preventDefault(); return; }
  if (e.code === 'Space') { myHook(); e.preventDefault(); }
  else if (e.code === 'KeyJ') myJab();
  else if (e.code === 'KeyQ') myAct('drink');
  else if (e.code === 'KeyE') myAct('eat');
  else if (e.code === 'KeyR') myAct('repair');
  else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= BUILDS.length) myBuild(BUILDS[n - 1].id); }
});
/* Весь ввод идёт через один роутер: хозяин плота применяет действие сразу,
   гость просит хозяина. Так плот у всех один и тот же — а не четыре
   расходящихся копии. */
function myMove(dx, dy) { if (host()) move(meSeat(), dx, dy); else net.send({ t: 'mv', dx: dx, dy: dy }); }
function myHook() { if (host()) hookNearest(meSeat()); else net.send({ t: 'hook' }); }
function myJab() { if (host()) jabShark(meSeat()); else net.send({ t: 'jab' }); }
function myClick(x, y) {
  if (host()) { clickAt(x, y, meSeat()); return; }
  // на экране «плот потерян» тап гостя должен просить новый забег, а не
  // уходить в никуда: пакеты клика хозяин в этот момент игнорирует
  net.send(over ? { t: 'again' } : { t: 'clk', x: x, y: y });
}
function myAct(id) { if (host()) doAct(id); else net.send({ t: 'act', id: id }); }
function myBuild(id) { if (host()) build(id); else net.send({ t: 'build', id: id }); }
function myPause() { if (host()) { paused = !paused; updatePauseBtn(); } else net.send({ t: 'pause' }); }
function updatePauseBtn() { const b = document.getElementById('pause'); if (b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

// --- UI-панели ---
function buildPanels() {
  const bp = document.getElementById('builds'); bp.innerHTML = '';
  BUILDS.forEach((b, i) => {
    const d = document.createElement('div'); d.className = 'slot'; d.dataset.id = b.id;
    d.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="si">' + b.ico + '</span><span class="sn">' + b.name + '</span><span class="sc">' + costStr(b.cost) + '</span>';
    d.addEventListener('click', () => myBuild(b.id)); bp.appendChild(d);
  });
  const ap = document.getElementById('acts'); ap.innerHTML = '';
  ACTS.forEach(a => {
    const d = document.createElement('div'); d.className = 'slot'; d.dataset.act = a.id;
    d.innerHTML = '<span class="key">' + a.key + '</span><span class="si">' + a.ico + '</span><span class="sn">' + a.name + '</span><span class="sc">' + (a.cost ? costStr(a.cost) : '') + '</span>';
    d.addEventListener('click', () => myAct(a.id)); ap.appendChild(d);
  });
}
function updateUI() {
  document.getElementById('time').textContent = Math.floor(time);
  document.getElementById('best').textContent = best;
  const bar = (id, v, danger) => { const f = document.getElementById(id); f.style.width = Math.max(0, v) + '%'; f.style.background = v < 22 ? '#ef476f' : danger; };
  bar('fThirst', thirst, '#4cc9f0'); bar('fHunger', hunger, '#ffd166'); bar('fRaft', integrity, '#2fbf71');
  document.getElementById('rWood').textContent = res.wood;
  document.getElementById('rPlastic').textContent = res.plastic;
  document.getElementById('rFood').textContent = res.food;
  document.getElementById('rWater').textContent = Math.floor(water);
  document.querySelectorAll('#builds .slot').forEach(s => { const b = BUILDS.find(x => x.id === s.dataset.id); const done = b.once && built[b.id]; s.classList.toggle('done', !!done); s.classList.toggle('dim', done || !canAfford(b.cost)); });
  document.querySelectorAll('#acts .slot').forEach(s => {
    const ok = s.dataset.act === 'drink' ? water >= 1 : s.dataset.act === 'eat' ? res.food >= 1 : canAfford({ wood: 2 });
    s.classList.toggle('dim', !ok);
  });
}

// --- отрисовка ---
function drawRaft() {
  for (const t of raft) {
    const p = tilePx(t.x, t.y), s = CELL, x = p.px - s / 2, y = p.py - s / 2;
    ctx.fillStyle = ((t.x + t.y) & 1) ? '#a9793f' : '#96682f'; ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(60,35,10,.55)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(60,35,10,.3)'; ctx.beginPath(); ctx.moveTo(x + s / 2, y + 2); ctx.lineTo(x + s / 2, y + s - 2); ctx.stroke();
  }
}
function drawStructures() {
  ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const spots = { purifier: [-1, -1], rod: [1, -1], fire: [-1, 1] };
  for (const k in spots) if (built[k]) { const o = spots[k]; if (hasTile(o[0], o[1])) { const p = tilePx(o[0], o[1]); ctx.fillText(BUILDS.find(b => b.id === k).ico, p.px, p.py - 2); } }
}
function render() {
  const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#0f4a6e'); g.addColorStop(1, '#0a2b42');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) { const y = ((i * 54 + anim * 16) % (CH + 40)) - 20; ctx.beginPath(); for (let x = 0; x <= CW; x += 24) ctx.lineTo(x, y + Math.sin((x + anim * 40) / 40) * 4); ctx.stroke(); }

  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(player.px, player.py, REACH, 0, 7); ctx.stroke(); ctx.setLineDash([]);   // круг досягаемости — только вокруг себя

  drawRaft(); drawStructures();

  // мусор
  ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of debris) {
    if (d.hooked) { const o = players[d.by || 0] || players[0]; ctx.strokeStyle = '#d9c8a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.px, o.py); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    ctx.fillText(DEB[d.type].ico, d.x, d.y);
  }

  // выжившие: свой жёлтый, остальные — своими цветами, чтобы не путаться
  const COLS = ['#ffd166', '#4cc9f0', '#2fbf71', '#ef476f'];
  players.forEach((p, i) => {
    if (p.gone) return;
    ctx.fillStyle = '#0d1b26'; ctx.beginPath(); ctx.ellipse(p.px, p.py + 9, 8, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = COLS[i % COLS.length]; ctx.beginPath(); ctx.arc(p.px, p.py, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d1b26'; ctx.beginPath(); ctx.arc(p.px + 2, p.py - 1, 2.2, 0, 7); ctx.fill();
    if (i === meSeat() && isNet()) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.px, p.py, 11, 0, 7); ctx.stroke(); }
  });

  // акула
  if (shark) {
    const inReach = dist(shark.x, shark.y, player.px, player.py) <= SPEAR_REACH;
    ctx.font = '26px serif'; ctx.fillText('🦈', shark.x, shark.y);
    if (inReach) { ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(shark.x, shark.y, 17, 0, 7); ctx.stroke(); }
  }

  if (hurtT > 0) { const a = Math.min(0.5, hurtT * 1.4); const vg = ctx.createRadialGradient(CX, CY, CH * 0.15, CX, CY, CH * 0.8); vg.addColorStop(0, 'rgba(200,20,35,0)'); vg.addColorStop(1, 'rgba(200,20,35,' + a + ')'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH); }

  if (paused && !over) { ctx.fillStyle = 'rgba(8,20,30,.6)'; ctx.fillRect(0, 0, CW, CH); ctx.fillStyle = '#eaf6ff'; ctx.textAlign = 'center'; ctx.font = 'bold 28px Segoe UI'; ctx.fillText('⏸ ПАУЗА', CX, CY - 4); ctx.font = '14px Segoe UI'; ctx.fillText('P / Esc — продолжить', CX, CY + 20); }
  if (over) {
    ctx.fillStyle = 'rgba(5,15,25,.72)'; ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'center'; ctx.fillStyle = '#4cc9f0'; ctx.font = 'bold 34px Georgia, serif'; ctx.fillText('ПЛОТ ПОТЕРЯН', CX, CY - 26);
    ctx.fillStyle = '#eaf6ff'; ctx.font = '17px Segoe UI'; ctx.fillText(overCause, CX, CY + 4);
    ctx.font = '15px Segoe UI'; ctx.fillText('Продержался ' + Math.floor(time) + 'с · рекорд ' + best + 'с', CX, CY + 28);
    ctx.fillStyle = '#9fd6e8'; ctx.fillText('Enter / тап — заново', CX, CY + 54);
  }
}


/* =========================  ОНЛАЙН: ОДИН ПЛОТ НА ВСЕХ  =========================
   Плот, ресурсы, вода и постройки общие — это одна команда, а не четыре
   отдельные робинзонады. Своё у каждого только тело: клетка, крюк и копьё.
   Считает хозяин комнаты и 15 раз в секунду шлёт картину мира. */
function broadcast() {
  net.send({
    t: 'st', th: thirst, hu: hunger, ig: integrity, res: res, w: water, b: built,
    raft: raft, tm: time, ov: over, oc: overCause, pa: paused,
    p: players.map(p => ({ tx: p.tx, ty: p.ty, px: p.px, py: p.py, g: p.gone })),
    d: debris.map(d => ({ x: d.x, y: d.y, t: d.type, h: !!d.hooked, by: d.by || 0 })),
    sh: shark ? { x: shark.x, y: shark.y, hp: shark.hp } : null
  });
}
function seatIn(slot) { if (players[slot]) { players[slot] = mkPlayer(false); message('🛟 Игрок ' + (slot + 1) + ' забрался на плот'); } broadcast(); }
function seatOut(slot) { if (players[slot]) players[slot].gone = true; message('Игрок ' + (slot + 1) + ' покинул плот'); broadcast(); }

net = NET.create({
  prefix: 'raft', max: MAXP,
  onOpen: () => { reset(); },
  onJoin: (slot) => seatIn(slot),
  onLeave: (slot) => seatOut(slot),
  onWelcome: () => { player = players[net.me]; message('Ты на плоту! Жди картинку от хозяина…'); },
  onClose: () => { message('Хозяин плота вышел'); },
  onData: (m, slot) => {
    if (net.isHost()) {
      if (over && m.t !== 'again') return;
      if (m.t === 'mv') move(slot, m.dx, m.dy);
      else if (m.t === 'hook') hookNearest(slot);
      else if (m.t === 'jab') jabShark(slot);
      else if (m.t === 'clk') clickAt(m.x, m.y, slot);
      else if (m.t === 'act') doAct(m.id);
      else if (m.t === 'build') build(m.id);
      else if (m.t === 'pause') { paused = !paused; updatePauseBtn(); }
      else if (m.t === 'again') reset();
      broadcast();
      return;
    }
    if (m.t !== 'st') return;
    thirst = m.th; hunger = m.hu; integrity = m.ig; res = m.res; water = m.w; built = m.b;
    raft = m.raft; time = m.tm; over = m.ov; overCause = m.oc; paused = m.pa;
    for (let i = 0; i < players.length; i++) {
      const s = m.p[i]; if (!s) continue;
      const p = players[i];
      p.tx = s.tx; p.ty = s.ty; p.gone = s.g;
      if (i !== net.me) { p.px = s.px; p.py = s.py; }    // своё тело двигаем сами — так оно не дёргается
    }
    player = players[net.me];
    debris = m.d.map(d => ({ x: d.x, y: d.y, type: d.t, hooked: d.h, by: d.by, vx: 0, vy: 0, ph: 0 }));
    shark = m.sh ? { x: m.sh.x, y: m.sh.y, hp: m.sh.hp, jabCd: 0 } : null;
    updateUI();
  }
});
NET.lobby(document.getElementById('netbar'), net);

function frame(now) { if (lastFrame === null) lastFrame = now; let dt = (now - lastFrame) / 1000; lastFrame = now; if (dt > 0.05) dt = 0.05; update(dt); render(); requestAnimationFrame(frame); }

document.getElementById('pause').addEventListener('click', () => { if (!over) myPause(); });
document.getElementById('restart').addEventListener('click', reset);

reset();
requestAnimationFrame(frame);

if (typeof globalThis !== 'undefined') globalThis.__R = {
  reset, update, build, doAct, hookNearest, jabShark, stepShark, spawnDebris, makeShark, move, hasTile, addRaftTile,
  getThirst: () => thirst, setThirst: v => { thirst = v; }, getHunger: () => hunger, setHunger: v => { hunger = v; },
  getIntegrity: () => integrity, setIntegrity: v => { integrity = v; }, getWater: () => water, getRes: () => res, setRes: v => { res = v; },
  getBuilt: () => built, getOver: () => over, getCause: () => overCause, getRaft: () => raft, getDebris: () => debris,
  getShark: () => shark, setShark: v => { shark = v; }, getPlayer: () => player, setSharkTimer: v => { sharkTimer = v; },
  BUILDS, DEB, SHARK_HP, SHARK_BITE, WATER_MAX, EAT_RAW, EAT_COOKED,
};
