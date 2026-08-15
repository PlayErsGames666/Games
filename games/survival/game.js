const T = 28, MAPW = 44, MAPH = 44;
const GRASS = 0, WATER = 1, TREE = 2, ROCK = 3, BUSH = 4, WALL = 5, TABLE = 6, FARM = 7;
const CYCLE = 150;   // сутки длиннее: светлый день ~96с вместо 44с
const FIRE_R = 3, TORCH_TIME = 40, FIRE_FUEL = 75, HUNGER_RATE = 0.3;   // факел/костёр/голод — под длинные сутки
const WALL_HP = 5, CROP_STAGE_TIME = 16, CROP_MAX = 3;   // 3 стадии роста ~48с
const MOB_CAP = 6, MOB_HP = 3, MOB_DMG = 8, MOB_SPEED = 4;
const SLIME_CAP = 5, SLIME_HP = 2, SLIME_DMG = 4, SLIME_SPEED = 3, SLIME_REST = 0.75;
// урон — только вплотную; SPAWN_GRACE — передышка после появления,
// BITE_WINDUP — сколько моб должен простоять рядом до первого укуса
const BITE_RANGE = 1.15, BITE_WINDUP = 0.45, SPAWN_GRACE = 1.5;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
/* Логический размер экрана. В окне он такой, как в разметке, а в ПОЛНЫЙ
   ЭКРАН игра перестраивается под монитор: высота остаётся прежней (буквы
   и полоски не едут), а ширина считается из пропорции экрана — видно
   больше мира, а не крупнее. Раньше картинка просто уезжала целиком и на
   широком мониторе стояла столбиком посреди чёрного поля. */
let CW = canvas.width, CH = canvas.height;
const BASE_W = CW, BASE_H = CH;
function setLogicalSize(w, h) {
  CW = Math.round(w); CH = Math.round(h);
  /* Переставляем и саму битмапу: в css у холста height:auto, и высота
     считается из её пропорции. Не тронешь — после выхода из полного
     экрана холст в окне сплющится. */
  canvas.width = CW; canvas.height = CH;
  night.width = CW; night.height = CH;               // холст темноты того же размера
}
window.__fsResize = function (sw, sh) {
  const w = Math.round(BASE_H * sw / Math.max(1, sh));
  setLogicalSize(Math.max(BASE_W, Math.min(BASE_W * 3, w)), BASE_H);
};
window.__fsRestore = function () { setLogicalSize(BASE_W, BASE_H); };
const night = document.createElement('canvas'); night.width = CW; night.height = CH;
const nctx = night.getContext('2d');

let msgText = 'Собирай ресурсы, к ночи разведи костёр — ночью выходят мобы!';

let tiles, res, players, mobs, crops, inv, health, hunger, warmth, fires, clock, over, best, anim, msgTimer, lastFrame;
let paused, particles, hitFx, lastHarvest, selSlot = 0, mobSpawnAcc = 0, slimeSpawnAcc = 0, hurtT = 0;
let deathT = 0, deathShown = false, deathCause = '', deathDay = 0;
const MAXP = 4;                       // хост + до трёх гостей
let role = 'solo', peer = null, conn = null, conns = [], connected = false, me = 0, netAcc = 0;
let sessionStarted = false;
// ввод гостей по их слотам: remoteHeld[2] — это то, что жмёт игрок из слота 2
let remoteHeld = [];
let inAcc = 0, lastIn = '';
function blankHeld() { return { up: false, down: false, left: false, right: false, gather: false }; }
function activePlayers() { return (players || []).filter(p => p && !p.gone); }
const held = { up: false, down: false, left: false, right: false, gather: false };
let dirOrder = [];
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// каталог предметов; назначаются в хотбар из рюкзака (по умолчанию хотбар ПУСТ)
const ITEMS = {
  meat:  { ico: '🍖', name: 'Мясо',    kind: 'food',  food: 'meat' },
  berry: { ico: '🍓', name: 'Ягоды',   kind: 'food',  food: 'berry' },
  torch: { ico: '🕯️', name: 'Факел',   kind: 'torch', cost: { wood: 1 } },
  fire:  { ico: '🔥', name: 'Костёр',  kind: 'place', tile: -1, cost: { wood: 2, stone: 1 } },
  wall:  { ico: '🧱', name: 'Стена',   kind: 'place', tile: WALL, cost: { stone: 2 } },
  table: { ico: '🛠️', name: 'Верстак', kind: 'place', tile: TABLE, cost: { wood: 4 } },
  farm:  { ico: '🌱', name: 'Грядка',  kind: 'place', tile: FARM, cost: { wood: 2 }, needTable: true },
  plant: { ico: '🌰', name: 'Посадить', kind: 'plant', cost: { berries: 1 } },
};
const ASSIGNABLE = ['torch', 'fire', 'wall', 'table', 'farm', 'plant', 'berry', 'meat'];
let hot = [null, null, null, null, null, null, null, null, null];
let invOpen = false, selItem = null;

best = parseInt(localStorage.getItem('survivalBest') || '0', 10);
const rnd = n => Math.floor(Math.random() * n);
const inb = (x, y) => x >= 0 && x < MAPW && y >= 0 && y < MAPH;
const ckey = (x, y) => x + ',' + y;

function makePlayer(tx, ty) { return { tx, ty, px: (tx + 0.5) * T, py: (ty + 0.5) * T, dir: { x: 0, y: 1 }, moving: false, ox: 0, oy: 0, fx: 0, fy: 0, mt: 0, chop: 0, gcd: 0, torch: 0, npx: null, npy: null }; }
function makeMob(tx, ty, type) { type = type || 'zombie'; return { type, tx, ty, px: (tx + 0.5) * T, py: (ty + 0.5) * T, moving: false, ox: 0, oy: 0, fx: 0, fy: 0, mt: 0, hp: type === 'slime' ? SLIME_HP : MOB_HP, cd: SPAWN_GRACE, touch: 0, hopCd: rnd(2) * 0.3, npx: null, npy: null }; }

function genMap() {
  tiles = []; res = [];
  for (let y = 0; y < MAPH; y++) { tiles[y] = []; res[y] = []; for (let x = 0; x < MAPW; x++) { tiles[y][x] = GRASS; res[y][x] = 0; } }
  for (let b = 0; b < 6; b++) { let wx = rnd(MAPW), wy = rnd(MAPH); for (let s = 0; s < 26; s++) { if (inb(wx, wy)) tiles[wy][wx] = WATER; wx += rnd(3) - 1; wy += rnd(3) - 1; } }
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) if (tiles[y][x] === GRASS) {
    const r = Math.random();
    if (r < 0.10) { tiles[y][x] = TREE; res[y][x] = 3; }
    else if (r < 0.15) { tiles[y][x] = ROCK; res[y][x] = 3; }
    else if (r < 0.19) { tiles[y][x] = BUSH; res[y][x] = 2; }
  }
  const cx = MAPW >> 1, cy = MAPH >> 1;
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inb(x, y)) { tiles[y][x] = GRASS; res[y][x] = 0; }
  return { cx, cy };
}
function passable(x, y) { return inb(x, y) && (tiles[y][x] === GRASS || tiles[y][x] === FARM); }

function startWorld(n) {
  const { cx, cy } = genMap();
  const spots = [[cx, cy], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1]];
  players = [];
  for (let i = 0; i < n; i++) { const s = spots[i]; players.push(makePlayer(s[0], s[1])); }
  mobs = []; crops = {};
  inv = { wood: 0, stone: 0, berries: 0, ore: 0, meat: 0, slime: 0 };
  health = 100; hunger = 100; warmth = 100;
  fires = []; clock = 0; over = false; anim = 0; msgTimer = 0;
  paused = false; particles = []; hitFx = {}; lastHarvest = null; mobSpawnAcc = 0; slimeSpawnAcc = 0; hurtT = 0;
  deathT = 0; deathShown = false; deathCause = ''; deathDay = 0;
}
function spawnDeathBurst() {
  const cols = ['#ef233c', '#ff6b6b', '#ffd166', '#edf2f4', '#b3141c'];
  for (const p of players) for (let i = 0; i < 26; i++) {
    const ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180;
    particles.push({ x: p.px, y: p.py, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60, life: 0.7 + Math.random() * 0.6, max: 1.3, size: 2 + Math.random() * 4, color: cols[rnd(cols.length)], g: 240 });
  }
}
function triggerDeath() { deathShown = true; deathT = 0; spawnDeathBurst(); }
function reset() {
  if (role === 'join') { message('Только хост может начать заново'); return; }
  if (role === 'solo') startWorld(1);
  else { hostWorld(); for (const c of conns) if (c.slot) seatPlayer(c.slot); }
  updatePauseBtn();
  message('Собирай ресурсы, к ночи разведи костёр — ночью выходят мобы!');
  if (role === 'host' && connected) { netSend({ t: 'map', tiles, res }); broadcastState(); }
  render();
}
function updatePauseBtn() { document.getElementById('pause').textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }
function message(t) { msgText = t; msgTimer = 3; }
function setTile(x, y, t) { if (!inb(x, y)) return; tiles[y][x] = t; if (role === 'host' && connected) netSend({ t: 'tile', x, y, tt: t }); }

// --- сбор / бой / ломание перед собой ---
const PCOL = { [TREE]: ['#8a5a2b', '#6b4a24', '#a9793f'], [ROCK]: ['#8d99ae', '#b0b9c9', '#6c7789'], [BUSH]: ['#ef233c', '#2fbf71', '#ff6b6b'], mob: ['#b388ff', '#7b2ff7', '#ef476f'], slime: ['#7ee787', '#39d353', '#2ea043'], crop: ['#2fbf71', '#ef233c'] };
function spawnHit(cx, cy, cols, fromTx, fromTy) {
  const base = Math.atan2((cy / T - fromTy) || 0.01, (cx / T - fromTx) || 0.01);
  for (let i = 0; i < 9; i++) { const ang = base + (Math.random() - 0.5) * 2.4, sp = 45 + Math.random() * 95; particles.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 35, life: 0.4 + Math.random() * 0.3, max: 0.7, size: 2 + Math.random() * 3, color: cols[rnd(cols.length)], g: 270 }); }
}
function actionFront(by) {
  by = by || players[0];
  const tx = by.tx + by.dir.x, ty = by.ty + by.dir.y;
  by.chop = 0.18;
  // моб на этой клетке?
  const m = mobs.find(mo => mo.tx === tx && mo.ty === ty);
  if (m) { const slime = m.type === 'slime'; m.hp -= 2; spawnHit((tx + 0.5) * T, (ty + 0.5) * T, slime ? PCOL.slime : PCOL.mob, by.tx, by.ty); if (m.hp <= 0) { mobs = mobs.filter(x => x !== m); if (slime) { inv.slime += 1 + rnd(2); message('🟢 Слайм повержен (+слизь)'); } else { inv.meat++; message('👾 Моб повержен (+🍖)'); } } return true; }
  if (!inb(tx, ty)) return false;
  const t = tiles[ty][tx];
  if (t === TREE || t === ROCK || t === BUSH) {
    if (t === TREE) inv.wood++; else if (t === ROCK) { inv.stone++; if (Math.random() < 0.3) inv.ore++; } else inv.berries++;
    spawnHit((tx + 0.5) * T, (ty + 0.5) * T, PCOL[t], by.tx, by.ty); hitFx[ckey(tx, ty)] = 0.18;
    res[ty][tx]--; hunger = Math.max(0, hunger - 0.4);
    if (res[ty][tx] <= 0) setTile(tx, ty, GRASS);
    return true;
  }
  if (t === WALL) { res[ty][tx] -= 2; hitFx[ckey(tx, ty)] = 0.18; spawnHit((tx + 0.5) * T, (ty + 0.5) * T, PCOL[ROCK], by.tx, by.ty); if (res[ty][tx] <= 0) setTile(tx, ty, GRASS); return true; }
  if (t === TABLE) { setTile(tx, ty, GRASS); inv.wood += 2; message('🛠️ Верстак разобран'); return true; }
  if (t === FARM) { const c = crops[ckey(tx, ty)]; if (c && c.stage >= CROP_MAX) { inv.berries += 3; delete crops[ckey(tx, ty)]; spawnHit((tx + 0.5) * T, (ty + 0.5) * T, PCOL.crop, by.tx, by.ty); message('🌾 Урожай собран (+3🍓)'); return true; } }
  return false;
}
// совместимость: harvest как раньше (для тестов) — просто действие/сбор
function harvest(tx, ty, by) { by = by || players[0]; if (!inb(tx, ty)) return false; const t = tiles[ty][tx]; if (t !== TREE && t !== ROCK && t !== BUSH) return false; if (t === TREE) inv.wood++; else if (t === ROCK) { inv.stone++; if (Math.random() < 0.3) inv.ore++; } else inv.berries++; spawnHit((tx + 0.5) * T, (ty + 0.5) * T, PCOL[t], by.tx, by.ty); by.chop = 0.18; hitFx[ckey(tx, ty)] = 0.18; lastHarvest = { x: tx, y: ty }; res[ty][tx]--; hunger = Math.max(0, hunger - 0.4); if (res[ty][tx] <= 0) setTile(tx, ty, GRASS); return true; }

function updateParticles(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const k in hitFx) { hitFx[k] -= dt; if (hitFx[k] <= 0) delete hitFx[k]; }
}
function eatFood(kind) {
  if (kind === 'meat') { if (inv.meat > 0 && hunger < 100) { inv.meat--; hunger = Math.min(100, hunger + 40); message('🍖 Мясо съедено'); return true; } message(inv.meat <= 0 ? 'Нет мяса' : 'Голод полон'); return false; }
  if (inv.berries > 0 && hunger < 100) { inv.berries--; hunger = Math.min(100, hunger + 30); message('🍓 Ягода съедена'); return true; }
  message(inv.berries <= 0 ? 'Нет ягод' : 'Голод полон'); return false;
}
function eat() { return eatFood('berry'); }
function craftFire(p) { p = p || players[0]; const f = fires.find(f => f.tx === p.tx && f.ty === p.ty); if (f) { if (inv.wood >= 1) { inv.wood--; f.fuel += 45; message('🔥 Подкинул дров'); return 'refuel'; } message('Нет дров'); return 'nowood'; } if (inv.wood >= 2 && inv.stone >= 1) { inv.wood -= 2; inv.stone -= 1; fires.push({ tx: p.tx, ty: p.ty, fuel: FIRE_FUEL }); message('🔥 Костёр разведён!'); return 'built'; } message('Нужно 2🪵 и 1🪨'); return 'nores'; }
function craftTorch(p) { p = p || players[0]; if (inv.wood >= 1) { inv.wood--; p.torch = TORCH_TIME; message('🕯️ Факел зажжён'); return true; } message('Нужна 1🪵'); return false; }

function canAfford(cost) { for (const k in cost) if ((inv[k] || 0) < cost[k]) return false; return true; }
function pay(cost) { for (const k in cost) inv[k] -= cost[k]; }
function nearTable(p) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = p.tx + dx, y = p.ty + dy; if (inb(x, y) && tiles[y][x] === TABLE) return true; } return false; }

function applyItem(p, it) {
  p = p || players[0];
  if (!it) return;
  if (it.kind === 'food') { eatFood(it.food); return; }
  if (it.kind === 'torch') { if (canAfford(it.cost)) { pay(it.cost); p.torch = TORCH_TIME; message('🕯️ Факел зажжён'); } else message('Нужна 1🪵'); return; }
  const tx = p.tx + p.dir.x, ty = p.ty + p.dir.y;
  if (it.kind === 'plant') {
    if (inb(tx, ty) && tiles[ty][tx] === FARM && !crops[ckey(tx, ty)]) { if (canAfford(it.cost)) { pay(it.cost); crops[ckey(tx, ty)] = { stage: 0, timer: 0 }; message('🌰 Посажено'); } else message('Нужна 1🍓'); }
    else message('Нужна пустая грядка перед собой');
    return;
  }
  if (it.kind === 'place') {
    if (it.needTable && !nearTable(p)) { message('Нужен верстак рядом'); return; }
    if (it.tile === -1) { // костёр
      if (inb(tx, ty) && tiles[ty][tx] === GRASS) { const f = fires.find(f => f.tx === tx && f.ty === ty); if (f) { if (inv.wood >= 1) { inv.wood--; f.fuel += 45; message('🔥 Дрова добавлены'); } else message('Нет дров'); } else if (canAfford(it.cost)) { pay(it.cost); fires.push({ tx, ty, fuel: FIRE_FUEL }); message('🔥 Костёр поставлен'); } else message('Нужно 2🪵 и 1🪨'); }
      else message('Ставь на траву перед собой');
      return;
    }
    if (inb(tx, ty) && tiles[ty][tx] === GRASS) { if (canAfford(it.cost)) { pay(it.cost); setTile(tx, ty, it.tile); if (it.tile === WALL) res[ty][tx] = WALL_HP; message(it.name + ' поставлено'); } else message('Не хватает ресурсов'); }
    else message('Ставь на траву перед собой');
  }
}
function useSlot(p, slot) { const id = hot[slot]; if (id) applyItem(p, ITEMS[id]); }
function useById(p, id) { if (ITEMS[id]) applyItem(p, ITEMS[id]); }
// действия локального игрока (в join уходят хосту)
function doUse() { const id = hot[selSlot]; if (role === 'join') { if (id) netSend({ t: 'act', a: 'use', id }); } else useSlot(players[0], selSlot); }
function doEat() { if (role === 'join') netSend({ t: 'act', a: 'eat' }); else eat(); }
function doFace() { const p = players[me] || players[0]; const d = nearMobDir(p); if (!d) { message('Рядом нет врага (в 3 клетках)'); return; } p.dir = d; if (role === 'join') netSend({ t: 'act', a: 'face', dx: d.x, dy: d.y }); }

// --- день/ночь ---
function tnorm() { return (clock % CYCLE) / CYCLE; }
function isNight() { const t = tnorm(); return t > 0.70 && t < 0.95; }   // ночь заняла меньшую долю суток
function darkness() { const t = tnorm(); if (t < 0.64) return 0; if (t < 0.72) return (t - 0.64) / 0.08 * 0.94; if (t < 0.92) return 0.94; if (t < 1.0) return (1.0 - t) / 0.08 * 0.94; return 0; }
function nearWarmth(p) { p = p || players[0]; if (p.torch > 0) return true; return fires.some(f => Math.abs(f.tx - p.tx) <= FIRE_R && Math.abs(f.ty - p.ty) <= FIRE_R); }
function dayNum() { return Math.floor(clock / CYCLE) + 1; }

// --- движение / ИИ ---
function heldDir(h, order) { if (order) { for (let i = order.length - 1; i >= 0; i--) { const d = order[i]; if (h[d]) return DIRS[d]; } } for (const d of ['up', 'down', 'left', 'right']) if (h[d]) return DIRS[d]; return null; }
function moveEntity(e, dt, speed) { if (e.moving) { e.mt += dt / (1 / (speed || 7)); if (e.mt >= 1) { e.mt = 1; e.moving = false; } e.px = e.ox + (e.fx - e.ox) * e.mt; e.py = e.oy + (e.fy - e.oy) * e.mt; } }
function startMove(e, nx, ny) { e.moving = true; e.ox = e.px; e.oy = e.py; e.tx = nx; e.ty = ny; e.fx = (nx + 0.5) * T; e.fy = (ny + 0.5) * T; e.mt = 0; }

function stepEntity(p, h, order, dt) {
  if (!p.moving) { const d = heldDir(h, order); if (d) { p.dir = d; const nx = p.tx + d.x, ny = p.ty + d.y; if (freeForPlayer(nx, ny)) startMove(p, nx, ny); } } // p.dir всегда обновляется — поворот на месте, даже если путь занят
  moveEntity(p, dt, 7);
  p.gcd -= dt;
  if (h.gather && p.gcd <= 0) { const ok = actionFront(p); p.gcd = ok ? 0.28 : 0.12; }
}

function nearestPlayer(mx, my) { let best = null, bd = 1e9; for (const p of activePlayers()) { const d = Math.abs(p.tx - mx) + Math.abs(p.ty - my); if (d < bd) { bd = d; best = p; } } return best; }
function mobAt(x, y, except) { for (const m of mobs) { if (m === except) continue; if (m.tx === x && m.ty === y) return m; } return null; }
function playerAt(x, y) { for (const p of activePlayers()) if (p.tx === x && p.ty === y) return p; return null; }
function freeForPlayer(x, y) { return passable(x, y) && !mobAt(x, y); }         // мобы «твёрдые» — сквозь них не пройти
function freeForMob(x, y, self) { return passable(x, y) && !mobAt(x, y, self) && !playerAt(x, y); } // мобы не залезают друг на друга и на игрока
function hurt(dmg) { health = Math.max(0, health - dmg); hurtT = 0.35; }
// повернуться к ближайшему мобу в радиусе 3 клеток (без движения)
function nearMobDir(p) { let best = null, bd = 1e9; for (const m of (mobs || [])) { const d = Math.max(Math.abs(m.tx - p.tx), Math.abs(m.ty - p.ty)); if (d >= 1 && d <= 3 && d < bd) { bd = d; best = m; } } if (!best) return null; const dx = best.tx - p.tx, dy = best.ty - p.ty; return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }; }
// «в притык»: только соседняя клетка по прямой (без диагоналей) И реальная близость в пикселях
function adjacent(m, p) {
  if (Math.abs(p.tx - m.tx) + Math.abs(p.ty - m.ty) > 1) return false;
  const dx = p.px - m.px, dy = p.py - m.py;
  return dx * dx + dy * dy <= (T * BITE_RANGE) * (T * BITE_RANGE);
}
function tryBite(m, dt, dmg) {
  const p = nearestPlayer(m.tx, m.ty);
  if (!p || !adjacent(m, p)) { m.touch = 0; return; }   // отошёл — замах сбрасывается
  m.touch = (m.touch || 0) + dt;
  if (m.touch >= BITE_WINDUP && m.cd <= 0) { hurt(dmg); m.cd = 1; m.touch = 0; }
}
function stepMob(m, dt) {
  if (m.type === 'slime') { stepSlime(m, dt); return; }
  if (!m.moving) {
    const tgt = nearestPlayer(m.tx, m.ty);
    if (tgt && (Math.abs(tgt.tx - m.tx) + Math.abs(tgt.ty - m.ty)) > 1) { // вплотную — стоим и бьём, не отступаем
      const dx = Math.sign(tgt.tx - m.tx), dy = Math.sign(tgt.ty - m.ty);
      const tries = Math.abs(tgt.tx - m.tx) > Math.abs(tgt.ty - m.ty) ? [[dx, 0], [0, dy], [0, -dy], [-dx, 0]] : [[0, dy], [dx, 0], [-dx, 0], [0, -dy]];
      for (const [ax, ay] of tries) { if ((ax || ay) && freeForMob(m.tx + ax, m.ty + ay, m)) { startMove(m, m.tx + ax, m.ty + ay); break; } }
    }
  }
  moveEntity(m, dt, MOB_SPEED);
  m.cd -= dt;
  tryBite(m, dt, MOB_DMG);
  if (!isNight()) m.hp -= dt * 3; // зомби днём сгорают
}
// слайм: прыгает по одной клетке, отдыхает между прыжками, днём НЕ горит
function stepSlime(m, dt) {
  m.cd -= dt;
  if (!m.moving) {
    m.hopCd -= dt;
    if (m.hopCd <= 0) {
      const tgt = nearestPlayer(m.tx, m.ty);
      let dir = null;
      if (tgt && (Math.abs(tgt.tx - m.tx) + Math.abs(tgt.ty - m.ty)) <= 8) {
        const dx = Math.sign(tgt.tx - m.tx), dy = Math.sign(tgt.ty - m.ty);
        const tries = Math.abs(tgt.tx - m.tx) > Math.abs(tgt.ty - m.ty) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
        for (const [ax, ay] of tries) { if ((ax || ay) && freeForMob(m.tx + ax, m.ty + ay, m)) { dir = [ax, ay]; break; } }
      } else {
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ax, ay]) => freeForMob(m.tx + ax, m.ty + ay, m));
        if (opts.length) dir = opts[rnd(opts.length)];
      }
      if (dir) startMove(m, m.tx + dir[0], m.ty + dir[1]);
      m.hopCd = SLIME_REST;
    }
  }
  moveEntity(m, dt, SLIME_SPEED);
  tryBite(m, dt, SLIME_DMG);
}
function spawnMob() {
  const act = activePlayers(); if (!act.length) return;
  const p = act[rnd(act.length)];
  for (let a = 0; a < 20; a++) { const ang = Math.random() * 7, dist = 7 + rnd(5); const mx = p.tx + Math.round(Math.cos(ang) * dist), my = p.ty + Math.round(Math.sin(ang) * dist); if (passable(mx, my)) { mobs.push(makeMob(mx, my)); return; } }
}
function spawnSlime() {
  const act = activePlayers(); if (!act.length) return;
  const p = act[rnd(act.length)];
  for (let a = 0; a < 20; a++) { const ang = Math.random() * 7, dist = 6 + rnd(6); const mx = p.tx + Math.round(Math.cos(ang) * dist), my = p.ty + Math.round(Math.sin(ang) * dist); if (passable(mx, my)) { mobs.push(makeMob(mx, my, 'slime')); return; } }
}

// --- обновление ---
function update(dt) {
  anim += dt;
  if (!paused) updateParticles(dt);
  if (!paused && hurtT > 0) hurtT = Math.max(0, hurtT - dt);
  if (!paused && players) for (const p of players) if (p.chop > 0) p.chop = Math.max(0, p.chop - dt);
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0 && !over && !paused) msgText = ''; }
  if (over) { if (!deathShown) triggerDeath(); if (!paused && deathT < 1) deathT += dt * 1.3; }
  if (over || paused) return;

  if (role === 'join') {
    // шлём ввод при ИЗМЕНЕНИИ и раз в полсекунды на всякий случай: при четверых
    // 60 пакетов в секунду с каждого — это 180 пакетов хосту на ровном месте
    const h = { up: held.up, down: held.down, left: held.left, right: held.right, gather: held.gather };
    const sig = h.up + '' + h.down + h.left + h.right + h.gather;
    inAcc += dt;
    if (sig !== lastIn || inAcc >= 0.5) { lastIn = sig; inAcc = 0; netSend({ t: 'in', h }); }
    if (players) for (const p of players) if (p.npx != null) { p.px += (p.npx - p.px) * Math.min(1, dt * 12); p.py += (p.npy - p.py) * Math.min(1, dt * 12); }
    if (mobs) for (const m of mobs) if (m.npx != null) { m.px += (m.npx - m.px) * Math.min(1, dt * 12); m.py += (m.npy - m.py) * Math.min(1, dt * 12); }
    return;
  }

  stepEntity(players[0], held, dirOrder, dt);
  if (role === 'host') {
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      if (p && !p.gone) stepEntity(p, remoteHeld[i] || blankHeld(), null, dt);
    }
  }

  // мобы
  const zc = mobs.filter(m => m.type !== 'slime').length, sc = mobs.length - zc;
  if (isNight()) { mobSpawnAcc += dt; if (mobSpawnAcc > 3 && zc < MOB_CAP) { mobSpawnAcc = 0; spawnMob(); } }
  slimeSpawnAcc += dt; if (slimeSpawnAcc > 5 && sc < SLIME_CAP) { slimeSpawnAcc = 0; spawnSlime(); } // слаймы и днём
  for (const m of mobs) stepMob(m, dt);
  mobs = mobs.filter(m => m.hp > 0);

  // грядки растут
  for (const k in crops) { const c = crops[k]; if (c.stage < CROP_MAX) { c.timer += dt; if (c.timer >= CROP_STAGE_TIME) { c.timer = 0; c.stage++; } } }

  clock += dt;
  hunger = Math.max(0, hunger - HUNGER_RATE * dt);
  const warm = !isNight() || activePlayers().every(p => nearWarmth(p));
  warmth = warm ? Math.min(100, warmth + 18 * dt) : Math.max(0, warmth - 9 * dt);
  let dmg = 0; if (hunger <= 0) dmg += 3 * dt; if (warmth <= 0) dmg += 4 * dt;
  if (dmg > 0) health = Math.max(0, health - dmg); else if (hunger > 60 && warmth > 60) health = Math.min(100, health + 1.5 * dt);
  for (const f of fires) f.fuel -= dt; fires = fires.filter(f => f.fuel > 0);
  for (const p of players) if (p.torch > 0) p.torch = Math.max(0, p.torch - dt);
  if (dayNum() > best) { best = dayNum(); localStorage.setItem('survivalBest', String(best)); }
  if (health <= 0) endGame();

  if (role === 'host' && connected) { netAcc += dt; if (netAcc >= 1 / 15) { netAcc = 0; broadcastState(); } }
}
function endGame() {
  over = true;
  deathCause = warmth <= 0 ? '🥶 Замёрзли в темноте' : (hunger <= 0 ? '🍖 Умерли от голода' : '👾 Убиты мобами');
  deathDay = dayNum();
  msgText = ''; msgTimer = 0;
  triggerDeath();
}

// --- сеть ---
function netStatus(t) { document.getElementById('netStatus').textContent = t; }
function showCode(code) { const inp = document.getElementById('roomCodeInput'); inp.value = code; inp.hidden = false; document.getElementById('copyBtn').hidden = false; document.getElementById('hostBtn').disabled = true; document.getElementById('joinCode').hidden = true; document.getElementById('joinBtn').hidden = true; }
async function copyCode() { const inp = document.getElementById('roomCodeInput'), code = inp.value; if (!code) return; try { await navigator.clipboard.writeText(code); netStatus('✅ Код скопирован: ' + code + ' — отправь другу'); } catch (e) { inp.hidden = false; inp.focus(); inp.select(); try { document.execCommand('copy'); netStatus('✅ Код скопирован: ' + code); } catch (_) { netStatus('Выдели код вручную: ' + code); } } }
// хост шлёт всем гостям сразу, гость — только хосту
function netSend(o) {
  try {
    if (role === 'host') { for (const c of conns) { try { if (c.open) c.send(o); } catch (e) {} } }
    else if (conn && connected) conn.send(o);
  } catch (e) {}
}
function netSendTo(c, o) { try { if (c && c.open) c.send(o); } catch (e) {} }
// Полная уборка перед новой попыткой: раньше «Войти» после неудачи создавало
// ЕЩЁ один Peer, старый висел живым, и повторные попытки уже не проходили
function netReset() {
  try { if (conn) conn.close(); } catch (e) {}
  for (const c of conns) { try { c.close(); } catch (e) {} }
  try { if (peer) peer.destroy(); } catch (e) {}
  conn = null; peer = null; conns = []; connected = false; remoteHeld = [];
}
function setupConn() { conn.on('data', onData); conn.on('close', () => { connected = false; netStatus('Хост отключился'); }); }

// --- слоты игроков (только у хоста) ---
function freeSlot() { for (let i = 1; i < MAXP; i++) if (!players || !players[i] || players[i].gone) return i; return 0; }
function playersOnline() { return 1 + conns.length; }
function hostStatus(code) {
  netStatus(playersOnline() > 1
    ? '✅ Игроков: ' + playersOnline() + '/' + MAXP + ' · код ' + code
    : 'Готово! Ждём друзей. Код: ' + code);
}
// свободная клетка рядом с хостом — там появится подключившийся
function spawnNear(p) {
  for (let r = 1; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = p.tx + dx, y = p.ty + dy;
    if (freeForPlayer(x, y) && !playerAt(x, y)) return { x, y };
  }
  return { tx: p.tx, ty: p.ty, x: p.tx, y: p.ty };
}
// мир всегда на MAXP слотов; те, за кем никого нет, помечены ушедшими
function hostWorld() {
  startWorld(MAXP);
  const busy = new Set(conns.map(c => c.slot));
  for (let i = 1; i < MAXP; i++) players[i].gone = !busy.has(i);
  sessionStarted = true;
}
function seatPlayer(slot) {
  const p = players[slot];
  const s = spawnNear(players[0]);
  p.gone = false; p.moving = false; p.mt = 1; p.torch = 0;
  p.tx = s.x; p.ty = s.y; p.px = (s.x + 0.5) * T; p.py = (s.y + 0.5) * T;
  p.npx = null; p.npy = null;
  remoteHeld[slot] = blankHeld();
}
function randCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[rnd(A.length)]; return s; }
/* Свой брокер сигналинга вместо общего 0.peerjs.com: тот перегружен, режет
   по лимитам и теряет зарегистрированные комнаты при перезапуске.
   TURN прописан руками: дефолтные адреса самой PeerJS (eu-0/us-0.turn.peerjs.com)
   больше не существуют — домены не резолвятся, так что «встроенного»
   ретранслятора у библиотеки давно нет, а без него пары за symmetric NAT
   не соединяются в принципе. */
const PEER_OPTS = {
  host: 'peer.fast16.net', port: 443, path: '/', secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  }
};
function peerErrMsg(type) { return ({ 'peer-unavailable': 'Комната не найдена — проверь код', 'unavailable-id': 'Код занят, пробую другой…', 'network': 'Нет связи с сервером — попробуй ещё раз', 'server-error': 'Сервер недоступен — позже', 'browser-incompatible': 'Браузер без WebRTC', 'webrtc': 'Сбой WebRTC (строгий NAT?)' })[type] || ('Ошибка: ' + type); }
let hostTries = 0;
function hostRoom() {
  if (typeof Peer === 'undefined') { netStatus('PeerJS не загрузился — интернет/https'); return; }
  netReset(); const code = randCode(); sessionStarted = false; peer = new Peer('dslite-' + code, PEER_OPTS); role = 'host'; me = 0; showCode(code); netStatus('Регистрирую комнату…');
  peer.on('open', () => netStatus('Готово! Ждём друга. Код: ' + code));
  peer.on('error', e => { if (e.type === 'unavailable-id' && hostTries < 5) { hostTries++; try { peer.destroy(); } catch (_) {} hostRoom(); return; } netStatus(peerErrMsg(e.type)); });
  peer.on('connection', c => {
    c.on('data', d => onData(d, c));
    c.on('open', () => {
      // первый гость начинает сессию, остальные ПОДСАЖИВАЮТСЯ в живой мир:
      // раньше каждое новое соединение пересоздавало мир и роняло предыдущих
      if (!sessionStarted || !players || players.length < MAXP) hostWorld();
      const slot = freeSlot();
      if (!slot) { netSendTo(c, { t: 'full' }); setTimeout(() => { try { c.close(); } catch (e) {} }, 400); message('Комната полная — четвёртого не пустили'); return; }
      c.slot = slot; conns.push(c); connected = true;
      seatPlayer(slot);
      netSendTo(c, { t: 'welcome', slot });
      netSendTo(c, { t: 'map', tiles, res });
      broadcastState();
      hostStatus(code); message('Игрок ' + (slot + 1) + ' в игре! Всего: ' + playersOnline());
      render();
    });
    const drop = () => {
      const i = conns.indexOf(c); if (i >= 0) conns.splice(i, 1);
      if (c.slot && players && players[c.slot]) { players[c.slot].gone = true; remoteHeld[c.slot] = blankHeld(); }
      connected = conns.length > 0;
      broadcastState(); hostStatus(code);
      if (c.slot) message('Игрок ' + (c.slot + 1) + ' отключился');
    };
    c.on('close', drop);
    c.on('error', drop);
  });
}
function joinRoom() {
  const code = (document.getElementById('joinCode').value || '').trim().toUpperCase();
  if (!code) { netStatus('Введи код комнаты'); return; }
  if (typeof Peer === 'undefined') { netStatus('PeerJS не загрузился — интернет/https'); return; }
  netReset(); peer = new Peer(undefined, PEER_OPTS); role = 'join'; me = 1; netStatus('Подключение к ' + code + '…');
  peer.on('error', e => netStatus(peerErrMsg(e.type)));
  peer.on('open', () => { conn = peer.connect('dslite-' + code, { reliable: true }); setupConn(); conn.on('open', () => { connected = true; netStatus('✅ Подключено к ' + code); message('Ожидание карты…'); }); setTimeout(() => { if (!connected) netStatus('Не удалось подключиться к ' + code + ' — код/хост/NAT'); }, 15000); });
}
function broadcastState() {
  netSend({ t: 'state', clock, health, hunger, warmth, over, dc: over ? deathCause : '', inv, fires,
    p: players.map(p => ({ tx: p.tx, ty: p.ty, px: p.px, py: p.py, dir: p.dir, chop: p.chop, torch: p.torch, moving: p.moving, g: !!p.gone })),
    m: mobs.map(m => ({ tx: m.tx, ty: m.ty, px: m.px, py: m.py, hp: m.hp, ty2: m.type })),
    cr: Object.keys(crops).map(k => ({ k, s: crops[k].stage })) });
}
// from — соединение, из которого пришёл пакет (только у хоста): по нему
// понимаем, ЧЕЙ это ввод, иначе четверо игроков управляли бы одним телом
function onData(msg, from) {
  if (msg.t === 'welcome') { me = msg.slot; netStatus('✅ Ты игрок ' + (me + 1) + ' из ' + MAXP); return; }
  if (msg.t === 'full') { netStatus('Комната полная — уже ' + MAXP + ' игрока'); message('Комната полная'); return; }
  if (msg.t === 'map') { tiles = msg.tiles; res = msg.res; if (!players || players.length < MAXP) { const cx = MAPW >> 1, cy = MAPH >> 1; players = []; for (let i = 0; i < MAXP; i++) players.push(makePlayer(cx + i, cy)); } mobs = mobs || []; crops = crops || {}; inv = inv || { wood: 0, stone: 0, berries: 0, ore: 0, meat: 0, slime: 0 }; fires = fires || []; particles = particles || []; hitFx = hitFx || {}; over = false; }
  else if (msg.t === 'state') {
    if (typeof health === 'number' && msg.health < health) hurtT = 0.35; // вспышка урона на стороне джойнера
    clock = msg.clock; health = msg.health; hunger = msg.hunger; warmth = msg.warmth; over = msg.over; inv = msg.inv; fires = msg.fires;
    if (msg.over) { deathCause = msg.dc || 'Колония погибла'; deathDay = Math.floor(msg.clock / CYCLE) + 1; }
    if (!players) players = [];
    for (let i = 0; i < msg.p.length; i++) { let p = players[i] || (players[i] = makePlayer(msg.p[i].tx, msg.p[i].ty)); const s = msg.p[i]; p.tx = s.tx; p.ty = s.ty; p.dir = s.dir; p.chop = s.chop; p.torch = s.torch; p.moving = s.moving; p.gone = !!s.g; p.npx = s.px; p.npy = s.py; if (p.px == null) { p.px = s.px; p.py = s.py; } }
    players.length = msg.p.length;
    mobs = (msg.m || []).map(s => { const m = makeMob(s.tx, s.ty, s.ty2); m.hp = s.hp; m.npx = s.px; m.npy = s.py; m.px = s.px; m.py = s.py; return m; });
    crops = {}; for (const c of (msg.cr || [])) crops[c.k] = { stage: c.s, timer: 0 };
  }
  else if (msg.t === 'tile') { if (inb(msg.x, msg.y)) tiles[msg.y][msg.x] = msg.tt; }
  else if (msg.t === 'in') { const s = from && from.slot; if (s) remoteHeld[s] = msg.h; }
  else if (msg.t === 'act') {
    const s = from && from.slot; const p = s && players && players[s];
    if (!p || p.gone) return;
    if (msg.a === 'eat') eat();
    else if (msg.a === 'use') useById(p, msg.id);
    else if (msg.a === 'face') p.dir = { x: msg.dx, y: msg.dy };
  }
}

// --- отрисовка ---
// битмап канваса подгоняется под реальный размер на экране (с учётом DPI),
// а рисуем всегда в логических координатах CW x CH — картинка не мылится
function syncRes() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(w / CW, 0, 0, h / CH, 0, 0);
}
function render() {
  if (!tiles || !players) return;
  syncRes();
  const cam = players[me] || players[0];
  const camX = Math.max(0, Math.min(MAPW * T - CW, cam.px - CW / 2)), camY = Math.max(0, Math.min(MAPH * T - CH, cam.py - CH / 2));
  const c0 = Math.floor(camX / T), r0 = Math.floor(camY / T);

  for (let y = r0; y <= r0 + CH / T + 1; y++) for (let x = c0; x <= c0 + CW / T + 1; x++) {
    if (!inb(x, y)) { ctx.fillStyle = '#141726'; ctx.fillRect(x * T - camX, y * T - camY, T, T); continue; }
    const sx = x * T - camX, sy = y * T - camY, t = tiles[y][x];
    ctx.fillStyle = ((x + y) & 1) ? '#3e7d3a' : '#3a7636'; ctx.fillRect(sx, sy, T, T);
    if (t === WATER) { ctx.fillStyle = '#2b6ca3'; ctx.fillRect(sx, sy, T, T); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(sx + 4, sy + 6, 8, 2); }
    else if (t === WALL) { ctx.fillStyle = '#6c7789'; ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4); ctx.strokeStyle = '#4a5468'; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, T - 4, T - 4); ctx.beginPath(); ctx.moveTo(sx + 2, sy + T / 2); ctx.lineTo(sx + T - 2, sy + T / 2); ctx.moveTo(sx + T / 2, sy + 2); ctx.lineTo(sx + T / 2, sy + T / 2); ctx.stroke(); }
    else if (t === TABLE) { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(sx + 3, sy + 3, T - 6, T - 6); ctx.fillStyle = '#6b4a24'; ctx.fillRect(sx + 3, sy + 3, T - 6, 4); ctx.strokeStyle = '#4a3418'; ctx.lineWidth = 1; ctx.strokeRect(sx + 6, sy + 8, T - 12, T - 14); }
    else if (t === FARM) {
      ctx.fillStyle = '#5a4326'; ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4); ctx.fillStyle = '#4a3620'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + 3, sy + 6 + i * 7, T - 6, 2);
      const c = crops[ckey(x, y)];
      if (c) { const gg = Math.min(1, (c.stage + c.timer / CROP_STAGE_TIME) / CROP_MAX); ctx.fillStyle = '#2fbf71'; ctx.beginPath(); ctx.arc(sx + T / 2, sy + T / 2 + 2, 3 + gg * 8, 0, 7); ctx.fill(); if (c.stage >= CROP_MAX) { ctx.fillStyle = '#ef233c'; for (const [dx, dy] of [[-4, -2], [5, 0], [0, 5]]) { ctx.beginPath(); ctx.arc(sx + T / 2 + dx, sy + T / 2 + dy, 2.2, 0, 7); ctx.fill(); } } }
    }
    else if (t === TREE || t === ROCK || t === BUSH) {
      const hf = hitFx[ckey(x, y)]; ctx.save(); if (hf) ctx.translate(Math.sin(hf * 60) * 2, 1);
      if (t === TREE) { ctx.fillStyle = '#6b4a24'; ctx.fillRect(sx + T / 2 - 3, sy + T - 12, 6, 12); ctx.fillStyle = '#1f8a3b'; ctx.beginPath(); ctx.arc(sx + T / 2, sy + T / 2 - 2, T * 0.42, 0, 7); ctx.fill(); ctx.fillStyle = '#2fbf71'; ctx.beginPath(); ctx.arc(sx + T / 2 - 3, sy + T / 2 - 5, T * 0.22, 0, 7); ctx.fill(); }
      else if (t === ROCK) { ctx.fillStyle = '#8d99ae'; ctx.beginPath(); ctx.arc(sx + T / 2, sy + T / 2 + 2, T * 0.36, 0, 7); ctx.fill(); ctx.fillStyle = '#b0b9c9'; ctx.beginPath(); ctx.arc(sx + T / 2 - 4, sy + T / 2 - 2, T * 0.16, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(sx + T / 2, sy + T / 2 + 2, T * 0.34, 0, 7); ctx.fill(); ctx.fillStyle = '#ef233c'; for (const [dx, dy] of [[-4, -2], [5, 0], [0, 5]]) { ctx.beginPath(); ctx.arc(sx + T / 2 + dx, sy + T / 2 + dy, 2.4, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
  }

  for (const f of fires) { const sx = (f.tx + 0.5) * T - camX, sy = (f.ty + 0.5) * T - camY; ctx.fillStyle = '#5a4636'; ctx.fillRect(sx - 8, sy + 6, 16, 4); const fl = 8 + Math.sin(anim * 12 + f.tx) * 2; ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(sx - 6, sy + 6); ctx.lineTo(sx + 6, sy + 6); ctx.lineTo(sx, sy + 6 - fl); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(sx - 3, sy + 6); ctx.lineTo(sx + 3, sy + 6); ctx.lineTo(sx, sy + 6 - fl * 0.6); ctx.closePath(); ctx.fill(); }

  // мобы
  for (const m of mobs) {
    const mx = m.px - camX, my = m.py - camY;
    if (m.type === 'slime') {
      const hop = m.moving ? Math.sin(m.mt * Math.PI) : 0;      // 0..1 дуга прыжка
      const lift = hop * 7, sq = hop * 2;                        // подъём + сплющивание при взлёте
      ctx.fillStyle = 'rgba(13,14,26,' + (0.5 - hop * 0.35) + ')'; ctx.beginPath(); ctx.ellipse(mx, my + 9, 7 - hop * 2, 3 - hop, 0, 0, 7); ctx.fill();
      const cy2 = my - lift;
      ctx.fillStyle = '#39d353'; ctx.beginPath(); ctx.ellipse(mx, cy2 + sq, 8 - sq, 7 + sq, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(126,231,135,.5)'; ctx.beginPath(); ctx.ellipse(mx - 2, cy2 - 3, 2.5, 1.6, 0, 0, 7); ctx.fill(); // блик
      ctx.fillStyle = '#0d3b17'; ctx.beginPath(); ctx.arc(mx - 3, cy2, 1.4, 0, 7); ctx.arc(mx + 3, cy2, 1.4, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#0d0e1a'; ctx.beginPath(); ctx.ellipse(mx, my + 9, 7, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#7b2ff7'; ctx.beginPath(); ctx.arc(mx, my, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#ef476f'; ctx.fillRect(mx - 4, my - 3, 2.5, 3); ctx.fillRect(mx + 1.5, my - 3, 2.5, 3);
    }
  }

  // игроки (после смерти не рисуем — их «разбросало» частицами)
  if (!over) for (let i = 0; i < players.length; i++) { const p = players[i]; if (!p || p.gone) continue; let lx = 0, ly = 0, reach = 0; if (p.chop > 0) { const l = Math.sin((1 - p.chop / 0.18) * Math.PI); lx = p.dir.x * l * 5; ly = p.dir.y * l * 5; reach = 8 + l * 9; } const px = p.px - camX + lx, py = p.py - camY + ly; ctx.fillStyle = '#0d0e1a'; ctx.beginPath(); ctx.ellipse(p.px - camX, p.py - camY + 10, 8, 3, 0, 0, 7); ctx.fill(); if (reach > 0) { ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + p.dir.x * reach, py + p.dir.y * reach); ctx.stroke(); } ctx.fillStyle = (i === me) ? '#ffd166' : '#4cc9f0'; ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#0d0e1a'; ctx.beginPath(); ctx.arc(px + p.dir.x * 3, py + p.dir.y * 3 - 1, 2.4, 0, 7); ctx.fill(); if (p.torch > 0) { ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(px + p.dir.x * 12, py + p.dir.y * 12, 3, 0, 7); ctx.fill(); } }

  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - camX - p.size / 2, p.y - camY - p.size / 2, p.size, p.size); } ctx.globalAlpha = 1;

  const dk = darkness();
  if (dk > 0.01) { nctx.clearRect(0, 0, CW, CH); nctx.fillStyle = 'rgba(6,10,26,' + dk + ')'; nctx.fillRect(0, 0, CW, CH); nctx.globalCompositeOperation = 'destination-out'; for (const p of players) punch(p.px - camX, p.py - camY, (p.torch > 0 ? 3.4 : 1.5) * T); for (const f of fires) punch((f.tx + 0.5) * T - camX, (f.ty + 0.5) * T - camY, (2.6 + 0.2 * Math.sin(anim * 10 + f.tx)) * T); nctx.globalCompositeOperation = 'source-over'; ctx.drawImage(night, 0, 0); }

  if (hurtT > 0 && !over) { const a = Math.min(0.5, hurtT * 1.4); const vg2 = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.18, CW / 2, CH / 2, CH * 0.78); vg2.addColorStop(0, 'rgba(200,20,35,0)'); vg2.addColorStop(1, 'rgba(200,20,35,' + a + ')'); ctx.fillStyle = vg2; ctx.fillRect(0, 0, CW, CH); }

  if (paused && !over) { ctx.fillStyle = 'rgba(13,14,26,.6)'; ctx.fillRect(0, 0, CW, CH); ctx.fillStyle = '#edf2f4'; ctx.textAlign = 'center'; ctx.font = 'bold 28px Segoe UI, sans-serif'; ctx.fillText('⏸ ПАУЗА', CW / 2, CH / 2 - 4); ctx.font = '14px Segoe UI, sans-serif'; ctx.fillText('P / Esc — продолжить', CW / 2, CH / 2 + 20); }

  if (over) {
    const a = Math.min(1, deathT);
    ctx.fillStyle = 'rgba(10,2,2,' + (0.74 * a) + ')'; ctx.fillRect(0, 0, CW, CH);
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.15, CW / 2, CH / 2, CH * 0.8);
    vg.addColorStop(0, 'rgba(60,0,0,0)'); vg.addColorStop(1, 'rgba(45,0,0,' + (0.6 * a) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(CW / 2, CH / 2 - 12); ctx.scale(1 + (1 - a) * 0.35, 1 + (1 - a) * 0.35); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#b3141c'; ctx.font = 'bold 46px Georgia, "Times New Roman", serif';
    ctx.fillText('ВЫ ПОГИБЛИ', 0, 0);
    ctx.restore();
    ctx.globalAlpha = a; ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(240,220,220,.92)'; ctx.font = '16px Georgia, serif';
    ctx.fillText(deathCause + ' · прожито дней: ' + deathDay, CW / 2, CH / 2 + 26);
    ctx.fillStyle = 'rgba(240,220,220,.7)'; ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText(role === 'join' ? 'Ждём хоста…' : 'Enter / тап — заново', CW / 2, CH / 2 + 50);
    ctx.globalAlpha = 1;
  }

  drawHUD(dk);
}

// ─── HUD прямо в игровой камере (как в майнкрафте) ───
const HUD = { slot: 40, gap: 4, bottom: 8 };   // размеры хотбара внутри канваса
function hotbarRect(i) {
  const w = HUD.slot, total = 9 * w + 8 * HUD.gap;
  return { x: Math.round((CW - total) / 2 + i * (w + HUD.gap)), y: CH - w - HUD.bottom, w, h: w };
}
function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, frac))), h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
}
function drawHUD(dk) {
  const p = players[me] || players[0];
  ctx.save();
  ctx.textBaseline = 'middle';

  // верхняя плашка: показатели слева, день/время справа
  ctx.fillStyle = 'rgba(10,12,24,.45)'; ctx.fillRect(0, 0, CW, 34);
  const bw = 78, bh = 8;
  ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'left';
  const vit = [['❤️', health, '#ef476f'], ['🍖', hunger, '#ffd166'], ['🔥', warmth, '#4cc9f0']];
  vit.forEach((v, i) => {
    const x = 8 + i * (bw + 26), y = 13;
    ctx.fillText(v[0], x, y + 4);
    bar(x + 17, y, bw, bh, v[1] / 100, v[2]);
  });
  ctx.textAlign = 'right';
  ctx.fillStyle = '#edf2f4'; ctx.font = 'bold 12px Segoe UI, sans-serif';
  ctx.fillText('📅 ' + dayNum() + '  ' + (isNight() ? '🌙' : (dk > 0 ? '🌆' : '☀️')) + '  🏆 ' + best, CW - 8, 17);

  // ресурсы — строка под верхней плашкой
  ctx.textAlign = 'left'; ctx.font = 'bold 12px Segoe UI, sans-serif';
  const resStr = '🪵' + inv.wood + '  🪨' + inv.stone + '  💎' + inv.ore + '  🍖' + inv.meat + '  🍓' + inv.berries + '  🟢' + (inv.slime || 0) + (p.torch > 0 ? '  🕯️' + Math.ceil(p.torch) + 'с' : '');
  const rw = ctx.measureText(resStr).width + 14;
  ctx.fillStyle = 'rgba(10,12,24,.45)'; ctx.fillRect(4, 38, rw, 22);
  ctx.fillStyle = '#edf2f4'; ctx.fillText(resStr, 11, 49);

  // сообщение над хотбаром
  if (msgText && msgTimer > 0) {
    ctx.textAlign = 'center'; ctx.font = 'bold 13px Segoe UI, sans-serif';
    const mw = ctx.measureText(msgText).width + 18, my = hotbarRect(0).y - 26;
    ctx.fillStyle = 'rgba(10,12,24,.6)'; ctx.fillRect((CW - mw) / 2, my - 10, mw, 21);
    ctx.fillStyle = '#ffd166'; ctx.fillText(msgText, CW / 2, my);
  }

  if (invOpen) drawBackpack();

  // хотбар
  for (let i = 0; i < 9; i++) {
    const r = hotbarRect(i), id = hot[i], it = id ? ITEMS[id] : null;
    ctx.fillStyle = 'rgba(10,12,24,.62)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    const sel = i === selSlot, assign = invOpen && !!selItem;
    ctx.strokeStyle = sel ? '#06d6a0' : (assign ? '#ffd166' : 'rgba(255,255,255,.16)');
    ctx.lineWidth = sel || assign ? 2 : 1;
    ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
    ctx.textAlign = 'left'; ctx.font = '9px Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText(String(i + 1), r.x + 3, r.y + 7);
    // на выбранной ячейке подсказываем, чем применить: Q или повторный клик
    if (sel && it) { ctx.textAlign = 'right'; ctx.fillStyle = '#06d6a0'; ctx.font = 'bold 9px Segoe UI, sans-serif'; ctx.fillText('Q', r.x + r.w - 3, r.y + 7); }
    if (it) {
      ctx.globalAlpha = itemUsable(id) ? 1 : .4;
      ctx.textAlign = 'center'; ctx.font = '19px Segoe UI Emoji, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(it.ico, r.x + r.w / 2, r.y + r.h / 2 - 2);
      ctx.font = 'bold 9px Segoe UI, sans-serif'; ctx.fillStyle = '#ffd166';
      const sub = it.kind === 'food' ? String(it.food === 'meat' ? inv.meat : inv.berries) : costStr(it.cost);
      ctx.fillText(sub, r.x + r.w / 2, r.y + r.h - 7);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
function punch(x, y, r) { const g = nctx.createRadialGradient(x, y, r * 0.25, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); nctx.fillStyle = g; nctx.beginPath(); nctx.arc(x, y, r, 0, 7); nctx.fill(); }

// --- хотбар (по умолчанию пуст; предметы кладутся из рюкзака) ---
function costStr(cost) { return cost ? Object.keys(cost).map(k => cost[k] + ({ wood: '🪵', stone: '🪨', berries: '🍓' })[k]).join('') : ''; }
function itemUsable(id) { const it = ITEMS[id]; if (!it) return false; if (it.kind === 'food') return (it.food === 'meat' ? inv.meat : inv.berries) > 0; return canAfford(it.cost); }
function onHotClick(i) {
  if (invOpen) { hot[i] = selItem || null; selItem = null; return; }
  // первый клик выбирает ячейку, повторный — ИСПОЛЬЗУЕТ предмет.
  // без этого мышью предмет было не применить: кнопка «Использовать» в полный экран скрыта
  if (i === selSlot && hot[i]) doUse();
  else selSlot = i;
}
// клик по канвасу: попал в ячейку хотбара — выбрать/положить предмет
function hotSlotAt(cx, cy) {
  for (let i = 0; i < 9; i++) { const r = hotbarRect(i); if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return i; }
  return -1;
}

// --- рюкзак / инвентарь (отдельный мини-блок как в майнкрафте) ---
// рюкзак рисуется ПОВЕРХ игры внутри канваса (как хотбар), панель — не DOM
const BAG = { w: 448, h: 208, cw: 100, ch: 60, gap: 9, cols: 4 };
function bagRect() { return { x: Math.round((CW - BAG.w) / 2), y: 62, w: BAG.w, h: BAG.h }; }
function bagCardRect(i) {
  const p = bagRect(), tw = BAG.cols * BAG.cw + (BAG.cols - 1) * BAG.gap;
  const x0 = p.x + Math.round((p.w - tw) / 2), y0 = p.y + 58;
  return { x: x0 + (i % BAG.cols) * (BAG.cw + BAG.gap), y: y0 + Math.floor(i / BAG.cols) * (BAG.ch + BAG.gap), w: BAG.cw, h: BAG.ch };
}
function bagItemAt(cx, cy) {
  for (let i = 0; i < ASSIGNABLE.length; i++) { const r = bagCardRect(i); if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return ASSIGNABLE[i]; }
  return null;
}
function inBag(cx, cy) { const p = bagRect(); return cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h; }
function drawBackpack() {
  const p = bagRect();
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,18,.58)'; ctx.fillRect(0, 0, CW, CH);          // затемняем мир
  ctx.fillStyle = 'rgba(26,30,52,.97)'; ctx.fillRect(p.x, p.y, p.w, p.h);  // панель
  ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#edf2f4'; ctx.font = 'bold 13px Segoe UI, sans-serif';
  ctx.fillText('🎒 РЮКЗАК', p.x + 12, p.y + 16);
  ctx.font = '11px Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(237,242,244,.72)';
  ctx.fillText(selItem ? ('Выбрано «' + ITEMS[selItem].name + '» — кликни ячейку хотбара') : 'Предмет → затем ячейка хотбара (I — закрыть)', p.x + 90, p.y + 16);
  ctx.font = 'bold 13px Segoe UI, sans-serif'; ctx.fillStyle = '#ffd166';
  ctx.fillText('🪵' + inv.wood + '  🪨' + inv.stone + '  💎' + inv.ore + '  🍖' + inv.meat + '  🍓' + inv.berries + '  🟢' + (inv.slime || 0), p.x + 12, p.y + 40);

  ASSIGNABLE.forEach((id, i) => {
    const r = bagCardRect(i), it = ITEMS[id], can = itemUsable(id);
    ctx.globalAlpha = can ? 1 : .42;
    ctx.fillStyle = 'rgba(58,61,92,.95)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selItem === id ? '#ffd166' : 'rgba(255,255,255,.12)';
    ctx.lineWidth = selItem === id ? 2 : 1;
    ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
    ctx.globalAlpha = can ? 1 : .42;
    ctx.textAlign = 'center';
    ctx.font = '18px Segoe UI Emoji, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(it.ico, r.x + r.w / 2, r.y + 17);
    ctx.font = '10px Segoe UI, sans-serif'; ctx.fillStyle = '#edf2f4';
    ctx.fillText(it.name, r.x + r.w / 2, r.y + 34);
    ctx.font = 'bold 10px Segoe UI, sans-serif'; ctx.fillStyle = '#ffd166';
    ctx.fillText(it.kind === 'food' ? ('есть: ' + (it.food === 'meat' ? inv.meat : inv.berries)) : costStr(it.cost), r.x + r.w / 2, r.y + 49);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}
// В полноэкранном режиме браузер сам перехватывает Esc, чтобы выйти, и страница
// его не получает. Пока открыт рюкзак — просим отдавать Esc нам (Keyboard Lock):
// тогда первый Esc закрывает рюкзак, а следующий уже выходит из полного экрана.
function inFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
let escUnlockTimer = null;
function escLock(on, defer) {
  try {
    const kb = navigator.keyboard;
    if (!kb || !kb.lock) return;                       // Firefox/Safari — просто нет такой возможности
    if (escUnlockTimer) { clearTimeout(escUnlockTimer); escUnlockTimer = null; }
    if (on && inFullscreen()) { const p = kb.lock(['Escape']); if (p && p.catch) p.catch(() => {}); return; }
    const release = () => { try { kb.unlock(); } catch (_) {} };
    if (!defer) { release(); return; }
    // ВАЖНО: если снять захват прямо в обработчике Esc, браузер обработает
    // ЭТО ЖЕ нажатие как выход из полного экрана. Ждём отпускания клавиши.
    const onUp = (ev) => { if (ev.code === 'Escape') { document.removeEventListener('keyup', onUp, true); release(); } };
    document.addEventListener('keyup', onUp, true);
    escUnlockTimer = setTimeout(() => { document.removeEventListener('keyup', onUp, true); release(); }, 800);
  } catch (_) {}
}
function toggleInv(v, byEsc) {
  invOpen = (v === undefined) ? !invOpen : v;
  const btn = document.getElementById('bagBtn'); if (btn) btn.classList.toggle('on', invOpen);
  if (!invOpen) selItem = null;
  escLock(invOpen, !!byEsc);
}
// выход из полного экрана: снимаем захват и закрываем рюкзак — иначе в браузерах
// без Keyboard Lock он остался бы висеть открытым после нажатия Esc
function onFsChange() {
  if (!inFullscreen()) { escLock(false); if (invOpen) toggleInv(false); }
  else if (invOpen) escLock(true);
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

function frame(now) { if (lastFrame === null) lastFrame = now; let dt = (now - lastFrame) / 1000; lastFrame = now; if (dt > 0.05) dt = 0.05; update(dt); render(); requestAnimationFrame(frame); }

// --- ввод ---
const KEYDIR = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
document.addEventListener('keydown', (e) => {
  // Esc работает ВСЕГДА, даже когда курсор стоит в поле ввода кода комнаты:
  // оттуда он просто снимает фокус, иначе закрывает рюкзак / ставит паузу
  if (e.code === 'Escape' && !e.repeat) {
    const inInput = e.target && e.target.tagName === 'INPUT';
    if (inInput) e.target.blur();                       // из поля ввода — сначала снимаем фокус
    if (invOpen) toggleInv(false, true);                // закрываем рюкзак, захват Esc снимем на keyup
    else if (!inInput && !over) { paused = !paused; updatePauseBtn(); }
    e.preventDefault(); return;
  }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (over) { if (e.code === 'Enter') reset(); return; }
  if (e.code === 'KeyP') { if (!e.repeat) { paused = !paused; updatePauseBtn(); } e.preventDefault(); return; }
  if (e.code === 'KeyI') { if (!e.repeat) toggleInv(); e.preventDefault(); return; }
  if (paused) return;
  const dir = KEYDIR[e.code];
  if (dir) { if (!held[dir]) dirOrder.push(dir); held[dir] = true; e.preventDefault(); return; }
  if (e.code === 'Space' || e.code === 'KeyE') { held.gather = true; e.preventDefault(); return; }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') { if (!e.repeat) doFace(); e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyQ') doUse();
  else if (e.code === 'KeyG') doEat();   // F отдана полному экрану
  // цифра выбирает ячейку; нажатие той же цифры ещё раз — использует предмет
  else if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5)); if (n >= 1 && n <= 9) { const i = n - 1; if (i === selSlot && hot[i]) doUse(); else selSlot = i; } }
});
document.addEventListener('keyup', (e) => { const dir = KEYDIR[e.code]; if (dir) { held[dir] = false; dirOrder = dirOrder.filter(d => d !== dir); } if (e.code === 'Space' || e.code === 'KeyE') held.gather = false; });

document.querySelectorAll('.pad button[data-dir]').forEach(b => { const dir = b.getAttribute('data-dir'); const on = e => { e.preventDefault(); if (!held[dir]) dirOrder.push(dir); held[dir] = true; }; const off = e => { e.preventDefault(); held[dir] = false; dirOrder = dirOrder.filter(d => d !== dir); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); });
const gb = document.getElementById('gatherBtn');
gb.addEventListener('pointerdown', e => { e.preventDefault(); held.gather = true; });
gb.addEventListener('pointerup', e => { e.preventDefault(); held.gather = false; });
gb.addEventListener('pointerleave', () => { held.gather = false; });
canvas.addEventListener('pointerdown', (e) => {
  if (over) { if (role !== 'join') reset(); return; }
  const r = canvas.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (CW / r.width), cy = (e.clientY - r.top) * (CH / r.height);
  const s = hotSlotAt(cx, cy);
  if (s >= 0) { onHotClick(s); e.preventDefault(); return; }   // ячейка хотбара — всегда доступна
  if (invOpen) {
    e.preventDefault();
    const id = bagItemAt(cx, cy);
    if (id) { selItem = (selItem === id) ? null : id; return; }
    if (!inBag(cx, cy)) toggleInv(false);                      // клик мимо панели — закрыть рюкзак
  }
});
document.getElementById('useBtn').addEventListener('click', doUse);
document.getElementById('eatBtn').addEventListener('click', doEat);
document.getElementById('faceBtn').addEventListener('click', doFace);
document.getElementById('restart').addEventListener('click', reset);
document.getElementById('pause').addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('hostBtn').addEventListener('click', hostRoom);
document.getElementById('joinBtn').addEventListener('click', joinRoom);
document.getElementById('copyBtn').addEventListener('click', copyCode);
const rci = document.getElementById('roomCodeInput'); rci.addEventListener('click', () => { rci.select(); try { rci.setSelectionRange(0, 99); } catch (_) {} });

if (typeof location !== 'undefined' && location.protocol === 'file:') netStatus('⚠️ Онлайн работает только по ссылке http(s), не через file://');

document.getElementById('bagBtn').addEventListener('click', () => toggleInv());
reset();
toggleInv(false);
lastFrame = null;
requestAnimationFrame(frame);
