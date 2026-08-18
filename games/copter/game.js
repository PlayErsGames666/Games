const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const PX = 96, R = 11;
const GRAV = 1500, THRUST = 2900;      // ускорения (вниз / вверх при удержании)
const VMAX = 460;
const START_GAP = 200, MIN_GAP = 116;

const el = {
  score: document.getElementById('score'), best: document.getElementById('best'),
  coins: document.getElementById('coins'), pause: document.getElementById('pause'),
  shopBtn: document.getElementById('shopBtn'), shop: document.getElementById('shop'),
  shopCoins: document.getElementById('shopCoins'), skins: document.getElementById('skins'),
  trails: document.getElementById('trails'), shopClose: document.getElementById('shopClose'),
};

let player, scroll, speed, score, best;
let pillars, nextPillar;
let thrusting, started, over, paused;
let flame, lastFrame;
let seed;   // случайные параметры пещеры (новые на каждый запуск)
let trail;  // частицы следа/пламени
let shopOpen = false, lastReward = 0;

best = parseInt(localStorage.getItem('copterBest') || '0', 10);
el.best.textContent = best;

// --- корпус (SKINS) и след/пламя (TRAILS) — независимо, можно миксовать ---
const SKINS = [
  { id: 'classic', name: 'Классика', price: 0,   body: '#e9ecf5', window: '#4cc9f0', wing: '#ef476f' },
  { id: 'neon',    name: 'Неон',     price: 30,  body: '#06d6a0', window: '#0d0e1a', wing: '#ffd166' },
  { id: 'red',     name: 'Алый',     price: 40,  body: '#ef476f', window: '#ffd166', wing: '#7a1020' },
  { id: 'ice',     name: 'Лёд',      price: 40,  body: '#4cc9f0', window: '#edf2f4', wing: '#2b6ca3' },
  { id: 'violet',  name: 'Аметист',  price: 60,  body: '#b388ff', window: '#edf2f4', wing: '#5a2fb0' },
  { id: 'gold',    name: 'Золото',   price: 100, body: '#ffd166', window: '#8a5a2b', wing: '#b8860b' },
];
const TRAILS = [
  { id: 'classic', name: 'Классика', price: 0,   flameA: '#ffd166', flameB: '#ef476f' },
  { id: 'neon',    name: 'Неон',     price: 25,  flameA: '#5ffbf1', flameB: '#06d6a0' },
  { id: 'fire',    name: 'Огонь',    price: 30,  flameA: '#ffd166', flameB: '#ef233c' },
  { id: 'ice',     name: 'Лёд',      price: 30,  flameA: '#bfeaff', flameB: '#4cc9f0' },
  { id: 'violet',  name: 'Аметист',  price: 45,  flameA: '#e0c3ff', flameB: '#7b2ff7' },
  { id: 'gold',    name: 'Золото',   price: 70,  flameA: '#fff3b0', flameB: '#ff9f1c' },
  { id: 'rainbow', name: 'Радуга',   price: 120, rainbow: true },
];
let coins = parseInt(localStorage.getItem('copterCoins') || '0', 10);
function loadSet(k, def) { try { const s = new Set(JSON.parse(localStorage.getItem(k) || '[]')); s.add(def); return s; } catch (e) { return new Set([def]); } }
let ownedSkins = loadSet('copterOwnedSkins', 'classic');
let ownedTrails = loadSet('copterOwnedTrails', 'classic');
let skinId = localStorage.getItem('copterSkin') || 'classic';
let trailId = localStorage.getItem('copterTrail') || 'classic';
if (!SKINS.some(s => s.id === skinId)) skinId = 'classic';
if (!TRAILS.some(s => s.id === trailId)) trailId = 'classic';
function currentSkin() { return SKINS.find(s => s.id === skinId) || SKINS[0]; }
function currentTrail() { return TRAILS.find(s => s.id === trailId) || TRAILS[0]; }
function flameColors(tr, phase) {
  if (tr.rainbow) { const h = (phase * 120) % 360; return ['hsl(' + h + ',95%,66%)', 'hsl(' + ((h + 45) % 360) + ',90%,54%)']; }
  return [tr.flameA, tr.flameB];
}
function saveShop() {
  localStorage.setItem('copterCoins', String(coins));
  localStorage.setItem('copterOwnedSkins', JSON.stringify([...ownedSkins]));
  localStorage.setItem('copterOwnedTrails', JSON.stringify([...ownedTrails]));
  localStorage.setItem('copterSkin', skinId);
  localStorage.setItem('copterTrail', trailId);
}
function updateCoinsHUD() { el.coins.textContent = coins; }

// пещера как функция мировой позиции (слоёные синусоиды + сужение)
function gapAt(worldX) {
  return Math.max(MIN_GAP, START_GAP - worldX * 0.008);
}
function makeSeed() {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  return {
    a1: rnd(50, 82), f1: rnd(0.0045, 0.008), p1: rnd(0, TAU),
    a2: rnd(16, 32),  f2: rnd(0.010, 0.020), p2: rnd(0, TAU),
    a3: rnd(22, 44),  f3: rnd(0.0018, 0.0045), p3: rnd(0, TAU),
  };
}
function caveAt(worldX) {
  const s = seed;
  const wig = Math.sin(worldX * s.f1 + s.p1) * s.a1
            + Math.sin(worldX * s.f2 + s.p2) * s.a2
            + Math.sin(worldX * s.f3 + s.p3) * s.a3;
  const ease = Math.min(1, worldX / 300); // у старта пещера по центру, дальше — с изгибами
  const gap = gapAt(worldX);
  let center = H / 2 + wig * ease;
  center = Math.max(gap / 2 + 16, Math.min(H - gap / 2 - 16, center));
  return { top: center - gap / 2, bot: center + gap / 2, gap };
}

function reset() {
  seed = makeSeed();          // новая пещера на каждый запуск
  player = { y: H / 2, vy: 0 };
  scroll = 0; speed = 150; score = 0;
  pillars = []; nextPillar = 260;
  thrusting = false; started = false; over = false; paused = false;
  flame = 0; trail = []; lastReward = 0;
  updateHUD(); updateCoinsHUD(); updatePauseBtn();
}

function updateHUD() { el.score.textContent = score; }
function updatePauseBtn() { el.pause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

function press() {
  if (shopOpen) return;
  if (over) { reset(); return; }
  if (!started) started = true;
  thrusting = true;
}
function release() { thrusting = false; }

function spawnPillar(worldX) {
  const c = caveAt(worldX);
  const side = Math.random() < 0.5 ? 'top' : 'bottom';
  const len = 20 + Math.random() * (c.gap * 0.45);
  const w = 20 + Math.random() * 14;
  pillars.push({ worldX, side, len, w, baseY: side === 'top' ? c.top : c.bot });
}

// --- обновление ---
function update(dt) {
  flame += dt;
  if (over || paused || shopOpen) return;
  if (!started) return; // ждём первого нажатия

  scroll += speed * dt;
  speed = Math.min(360, 150 + score * 0.45);
  score = Math.floor(scroll / 10); updateHUD();

  // физика ракеты
  player.vy += (thrusting ? (GRAV - THRUST) : GRAV) * dt;
  player.vy = Math.max(-VMAX, Math.min(VMAX, player.vy));
  player.y += player.vy * dt;

  // след/пламя сзади (цвет — из выбранного скина)
  emitTrail();
  for (const p of trail) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  trail = trail.filter(p => p.life > 0);

  // спавн шипов
  nextPillar -= speed * dt;
  if (nextPillar <= 0) { spawnPillar(scroll + W + 30); nextPillar = 200 + Math.random() * 240; }
  pillars = pillars.filter(p => p.worldX - scroll > -60);

  // столкновение со стенами
  const c = caveAt(scroll + PX);
  if (player.y - R < c.top || player.y + R > c.bot) return die();

  // столкновение с шипами
  for (const p of pillars) {
    const sx = p.worldX - scroll;
    if (Math.abs(sx - PX) > p.w / 2 + R) continue;
    const ry = p.side === 'top' ? p.baseY : p.baseY - p.len;
    if (circleRect(PX, player.y, R - 1, sx - p.w / 2, ry, p.w, p.len)) return die();
  }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function emitTrail() {
  const tr = currentTrail();
  const n = thrusting ? 3 : 1; // при тяге след гуще
  for (let i = 0; i < n; i++) {
    const fc = flameColors(tr, flame + Math.random() * 2); // радуга: разные оттенки на частицах
    trail.push({
      x: PX - 12, y: player.y + (Math.random() - 0.5) * 6,
      vx: -(speed * 0.5 + 40 + Math.random() * 50), vy: (Math.random() - 0.5) * 40,
      life: 0.35 + Math.random() * 0.25, max: 0.6, r: 2.5 + Math.random() * 2,
      color: Math.random() < 0.5 ? fc[0] : fc[1],
    });
  }
  if (trail.length > 220) trail.splice(0, trail.length - 220);
}

function die() {
  over = true;
  lastReward = Math.max(1, Math.ceil(score / 5));
  coins += lastReward; saveShop(); updateCoinsHUD();
  if (score > best) { best = score; localStorage.setItem('copterBest', String(best)); el.best.textContent = best; }
}

// --- отрисовка ---
function draw() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141726'); g.addColorStop(1, '#20243b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // стены пещеры (сэмплируем по X)
  const STEP = 6;
  ctx.fillStyle = '#3b3550';
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let x = 0; x <= W; x += STEP) ctx.lineTo(x, caveAt(scroll + x).top);
  ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += STEP) ctx.lineTo(x, caveAt(scroll + x).bot);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  // кромки стен
  ctx.strokeStyle = '#5a5480'; ctx.lineWidth = 3;
  ctx.beginPath(); for (let x = 0; x <= W; x += STEP) { const y = caveAt(scroll + x).top; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  ctx.beginPath(); for (let x = 0; x <= W; x += STEP) { const y = caveAt(scroll + x).bot; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();

  // шипы — «вшиты» в стену: тот же камень, база уходит ВНУТРЬ стены, обведены только рёбра
  const INSET = 7;
  ctx.lineJoin = 'round';
  for (const p of pillars) {
    const sx = p.worldX - scroll;
    if (sx < -40 || sx > W + 40) continue;
    const dir = p.side === 'top' ? 1 : -1;   // куда торчит: вниз(+) / вверх(-)
    const by = p.baseY - dir * INSET;        // база чуть внутри стены — шва не видно
    const tipY = p.baseY + dir * p.len;
    // тело шипа (чуть светлее стены — как выступ камня)
    ctx.fillStyle = '#4a4568';
    ctx.beginPath();
    ctx.moveTo(sx - p.w / 2, by); ctx.lineTo(sx, tipY); ctx.lineTo(sx + p.w / 2, by);
    ctx.closePath(); ctx.fill();
    // теневая грань для объёма
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    ctx.beginPath();
    ctx.moveTo(sx, by); ctx.lineTo(sx, tipY); ctx.lineTo(sx + p.w / 2, by);
    ctx.closePath(); ctx.fill();
    // рёбра (боковые), базовую линию не рисуем — она внутри стены
    ctx.strokeStyle = '#6a6392'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx - p.w / 2, by); ctx.lineTo(sx, tipY); ctx.lineTo(sx + p.w / 2, by);
    ctx.stroke();
  }

  // след/пламя (частицы за ракетой)
  for (const p of trail) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ракета
  if (!over) drawRocket();

  if (!started && !over) {
    ctx.fillStyle = 'rgba(237,242,244,.85)'; ctx.textAlign = 'center'; ctx.font = '16px Segoe UI';
    ctx.fillText('Держи тягу — старт', W / 2, 40);
  }
  if (paused && !over) overlay('⏸ ПАУЗА', 'P / Esc — продолжить');
  if (over) overlay('💥 Разбился', 'Счёт ' + score + ' · +' + lastReward + '💰 · Enter / тап — заново');
}

function paintRocket(g, sk, tr, withFlame, phase) {
  if (withFlame) {
    const f = 10 + Math.sin(phase * 40) * 4;
    const fc = flameColors(tr, phase);
    g.fillStyle = fc[0];
    g.beginPath(); g.moveTo(-12, -5); g.lineTo(-12, 5); g.lineTo(-12 - f, 0); g.closePath(); g.fill();
    g.fillStyle = fc[1];
    g.beginPath(); g.moveTo(-12, -3); g.lineTo(-12, 3); g.lineTo(-12 - f * 0.6, 0); g.closePath(); g.fill();
  }
  g.fillStyle = sk.body;
  g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -8); g.lineTo(-12, 0); g.lineTo(-8, 8); g.closePath(); g.fill();
  g.fillStyle = sk.window;
  g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = sk.wing;
  g.beginPath(); g.moveTo(-8, 6); g.lineTo(-2, 6); g.lineTo(-8, 12); g.closePath(); g.fill();
}

function drawRocket() {
  const tilt = Math.max(-0.5, Math.min(0.6, player.vy / 500));
  ctx.save(); ctx.translate(PX, player.y); ctx.rotate(tilt);
  paintRocket(ctx, currentSkin(), currentTrail(), thrusting && started, flame);
  ctx.restore();
}

function overlay(title, subtitle) {
  ctx.fillStyle = 'rgba(13,14,26,.8)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#edf2f4'; ctx.textAlign = 'center';
  ctx.font = 'bold 28px Segoe UI, sans-serif'; ctx.fillText(title, W / 2, H / 2 - 6);
  ctx.font = '15px Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(237,242,244,.8)';
  ctx.fillText(subtitle, W / 2, H / 2 + 20);
}

// --- цикл ---
function frame(now) {
  if (lastFrame === null) lastFrame = now;
  let dt = (now - lastFrame) / 1000; lastFrame = now;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// --- управление ---
// W в русской раскладке — Ц. Пауза ниже кириллицу уже понимала, тяга — нет.
const kThrust = [' ', 'ArrowUp', 'w', 'W', 'ц', 'Ц'];
document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.key === 'Enter' && over) { reset(); e.preventDefault(); return; }
  if (kThrust.includes(e.key)) { press(); e.preventDefault(); }
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З' || e.key === 'Escape') {
    if (!over) { paused = !paused; updatePauseBtn(); } e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => {
  if (kThrust.includes(e.key)) release();
});
// ушли с вкладки с зажатой тягой — keyup уже не придёт, ракета уйдёт в потолок
window.addEventListener('blur', release);
canvas.addEventListener('mousedown', press);
canvas.addEventListener('mouseup', release);
canvas.addEventListener('mouseleave', release);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, { passive: false });

// --- магазин: корпус и след независимо ---
function renderShop() {
  el.shopCoins.textContent = coins;
  renderRow(el.skins, SKINS, 'skin');
  renderRow(el.trails, TRAILS, 'trail');
}
function renderRow(container, items, kind) {
  container.innerHTML = '';
  const ownedSet = kind === 'skin' ? ownedSkins : ownedTrails;
  const selId = kind === 'skin' ? skinId : trailId;
  for (const it of items) {
    const isOwned = ownedSet.has(it.id);
    const isSel = selId === it.id;
    const cant = !isOwned && coins < it.price;
    const card = document.createElement('div');
    card.className = 'skin' + (isOwned ? ' owned' : '') + (isSel ? ' sel' : '') + (cant ? ' cant' : '');
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 44;
    card.appendChild(cv);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name; card.appendChild(nm);
    const act = document.createElement('div'); act.className = 'act';
    act.innerHTML = isSel ? '✓ Выбрано' : isOwned ? 'Выбрать' : '<span class="price">💰' + it.price + '</span>';
    card.appendChild(act);
    // превью — комбинация: карточка корпуса берёт текущий след, карточка следа — текущий корпус
    const sk = kind === 'skin' ? it : currentSkin();
    const tr = kind === 'trail' ? it : currentTrail();
    const mg = cv.getContext('2d');
    mg.save(); mg.translate(cv.width * 0.58, cv.height / 2); mg.scale(1.5, 1.5); paintRocket(mg, sk, tr, true, 0.35); mg.restore();
    card.addEventListener('click', () => pick(kind, it));
    container.appendChild(card);
  }
}
function pick(kind, it) {
  const ownedSet = kind === 'skin' ? ownedSkins : ownedTrails;
  if (!ownedSet.has(it.id)) {
    if (coins < it.price) return; // не хватает монет
    coins -= it.price; ownedSet.add(it.id);
  }
  if (kind === 'skin') skinId = it.id; else trailId = it.id;
  saveShop(); updateCoinsHUD(); renderShop();
}
function openShop() { shopOpen = true; thrusting = false; el.shop.hidden = false; renderShop(); }
function closeShop() { shopOpen = false; el.shop.hidden = true; }
el.shopBtn.addEventListener('click', () => shopOpen ? closeShop() : openShop());
el.shopClose.addEventListener('click', closeShop);

el.pause.addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('restart').addEventListener('click', reset);

updateCoinsHUD();
reset();
lastFrame = null;
requestAnimationFrame(frame);
