const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const BH = 32, BW_START = 220, BW_MAX = 240;
const BASE_Y = H - 60, CUR_Y = 150;
const PERFECT = 4, GROW = 8;

const el = {
  score: document.getElementById('score'), best: document.getElementById('best'),
  pause: document.getElementById('pause'),
};

let blocks, current, falling;
let score, best, combo, camY, perfectFlash, hue;
let over, paused;
let lastFrame;

best = parseInt(localStorage.getItem('stackBest') || '0', 10);
el.best.textContent = best;

function colorFor(level) { return 'hsl(' + ((200 + level * 9) % 360) + ', 60%, 58%)'; }

function reset() {
  blocks = [{ x: (W - BW_START) / 2, w: BW_START, color: colorFor(0) }];
  falling = [];
  score = 0; combo = 0; camY = 0; perfectFlash = 0;
  over = false; paused = false;
  spawnCurrent();
  updateHUD(); updatePauseBtn();
}

function spawnCurrent() {
  const top = blocks[blocks.length - 1];
  const level = blocks.length;
  current = { x: 6, w: top.w, dir: 1, color: colorFor(level) };
}

function speed() { return Math.min(430, 130 + score * 4); }

function updateHUD() { el.score.textContent = score; }
function updatePauseBtn() { el.pause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

function screenY(level) { return BASE_Y - level * BH + camY; }

function spawnFalling(x, w, color, vx) {
  const level = blocks.length; // текущий (ставящийся) блок
  falling.push({ x, y: screenY(level) - BH, w, color, vx: vx || 0, vy: -40, rot: 0, vr: (vx || 0) * 0.03 });
}

function drop() {
  if (over || paused || !current) return;
  const below = blocks[blocks.length - 1];
  const cur = current;
  const oL = Math.max(cur.x, below.x);
  const oR = Math.min(cur.x + cur.w, below.x + below.w);
  const overlap = oR - oL;

  if (overlap <= 0) { // промах — блок улетает, конец
    spawnFalling(cur.x, cur.w, cur.color, cur.dir * 60);
    over = true; saveBest(); current = null;
    return;
  }

  const perfect = Math.abs(cur.x - below.x) <= PERFECT && Math.abs(cur.w - below.w) < 1;
  let nx, nw;
  if (perfect) {
    combo++;
    nw = Math.min(BW_MAX, below.w + GROW);
    nx = Math.max(6, Math.min(W - 6 - nw, below.x - (nw - below.w) / 2));
    perfectFlash = 0.5;
  } else {
    combo = 0;
    nx = oL; nw = overlap;
    if (cur.x < oL) spawnFalling(cur.x, oL - cur.x, cur.color, -80);      // левый обрезок
    if (cur.x + cur.w > oR) spawnFalling(oR, (cur.x + cur.w) - oR, cur.color, 80); // правый обрезок
  }
  blocks.push({ x: nx, w: nw, color: cur.color });
  score++; updateHUD();
  spawnCurrent();
}

function saveBest() { if (score > best) { best = score; localStorage.setItem('stackBest', String(best)); el.best.textContent = best; } }

// --- обновление ---
function update(dt) {
  if (perfectFlash > 0) perfectFlash -= dt;

  // падающие обрезки
  for (const f of falling) { f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr; }
  falling = falling.filter(f => f.y < H + 120);

  // камера следует за вершиной
  const targetCam = Math.max(0, CUR_Y - (BASE_Y - blocks.length * BH));
  camY += (targetCam - camY) * Math.min(1, dt * 9);

  if (over || paused || !current) return;

  // движение текущего блока
  current.x += current.dir * speed() * dt;
  const lo = 6, hi = W - 6 - current.w;
  if (current.x <= lo) { current.x = lo; current.dir = 1; }
  if (current.x >= hi) { current.x = hi; current.dir = -1; }
}

// --- отрисовка ---
function draw() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16233f'); g.addColorStop(1, '#243a5e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // башня
  for (let i = 0; i < blocks.length; i++) {
    const y = screenY(i);
    if (y > H + BH || y < -BH) continue;
    drawBlock(blocks[i].x, y, blocks[i].w, blocks[i].color);
  }
  // текущий блок
  if (current && !over) drawBlock(current.x, screenY(blocks.length), current.w, current.color);

  // падающие обрезки
  for (const f of falling) {
    ctx.save(); ctx.translate(f.x + f.w / 2, f.y + BH / 2); ctx.rotate(f.rot);
    ctx.fillStyle = f.color; ctx.fillRect(-f.w / 2, -BH / 2, f.w, BH - 2);
    ctx.restore();
  }

  if (perfectFlash > 0) {
    ctx.fillStyle = 'rgba(76,201,240,' + (perfectFlash) + ')';
    ctx.textAlign = 'center'; ctx.font = 'bold 22px Segoe UI, sans-serif';
    ctx.fillText('ПЕРФЕКТ!' + (combo > 1 ? ' ×' + combo : ''), W / 2, screenY(blocks.length) - 14);
  }

  if (paused && !over) overlay('⏸ ПАУЗА', 'P / Esc — продолжить');
  if (over) overlay('🏁 Готово', 'Башня: ' + score + ' · Enter / тап — заново');
}

function drawBlock(x, y, w, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, BH - 2);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y, w, 5);         // блик сверху
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y + BH - 7, w, 5);      // тень снизу
}

function overlay(title, subtitle) {
  ctx.fillStyle = 'rgba(13,14,26,.8)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#edf2f4'; ctx.textAlign = 'center';
  ctx.font = 'bold 30px Segoe UI, sans-serif'; ctx.fillText(title, W / 2, H / 2 - 6);
  ctx.font = '15px Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(237,242,244,.8)';
  ctx.fillText(subtitle, W / 2, H / 2 + 22);
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
function action() { if (over) reset(); else drop(); }
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { action(); e.preventDefault(); }
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З' || e.key === 'Escape') {
    if (!over) { paused = !paused; updatePauseBtn(); } e.preventDefault();
  }
});
canvas.addEventListener('mousedown', action);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); action(); }, { passive: false });

el.pause.addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('restart').addEventListener('click', reset);

reset();
lastFrame = null;
requestAnimationFrame(frame);
