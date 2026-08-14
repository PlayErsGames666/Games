const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const LOG_H = 54, TRUNK_W = 70;
const TRUNK_X = (W - TRUNK_W) / 2;
const GROUND = H - 36;
const VISIBLE = Math.ceil(H / LOG_H) + 2;

const el = {
  score: document.getElementById('score'), best: document.getElementById('best'),
  pause: document.getElementById('pause'),
};

let trunk, jack, score, best, timer, over, paused;
let chopAnim, flying, shake, anim;
let lastFrame;

best = parseInt(localStorage.getItem('timbermanBest') || '0', 10);
el.best.textContent = best;

function genSegment() {
  const r = Math.random();
  return { branch: r < 0.46 ? 'none' : (r < 0.73 ? 'left' : 'right') };
}

function reset() {
  trunk = [];
  for (let i = 0; i < VISIBLE; i++) trunk.push(i < 2 ? { branch: 'none' } : genSegment());
  jack = { side: 'left' };
  score = 0; timer = 0.55;
  over = false; paused = false;
  chopAnim = 0; flying = []; shake = 0; anim = 0;
  updateHUD(); updatePauseBtn();
}

function updateHUD() { el.score.textContent = score; }
function updatePauseBtn() { el.pause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

function depletionRate() { return 0.26 + score * 0.0035; }

function chop(side) {
  if (over || paused) return;
  jack.side = side;
  chopAnim = 1;
  // опасна ветка на блоке, который опустится к дровосеку (trunk[1]): рубишь с её стороны — смерть
  if (trunk[1] && trunk[1].branch === side) { shake = 1; die(); return; }
  // отлетающее бревно (нижний блок улетает в сторону от дровосека)
  const dir = side === 'left' ? 1 : -1;
  flying.push({ x: TRUNK_X + TRUNK_W / 2, y: GROUND - LOG_H, vx: dir * 320, vy: -120, rot: 0, vr: dir * 8 });
  // ствол опускается: убираем нижний блок, сверху добавляем новый
  trunk.shift(); trunk.push(genSegment());
  score++; updateHUD();
  timer = Math.min(1, timer + 0.11);
}

function die() {
  over = true;
  if (score > best) { best = score; localStorage.setItem('timbermanBest', String(best)); el.best.textContent = best; }
}

// --- обновление ---
function update(dt) {
  anim += dt;
  if (chopAnim > 0) chopAnim = Math.max(0, chopAnim - dt * 6);
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  for (const f of flying) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 900 * dt; f.rot += f.vr * dt; }
  flying = flying.filter(f => f.y < H + 80 && f.x > -120 && f.x < W + 120);

  if (over || paused) return;
  timer -= depletionRate() * dt;
  if (timer <= 0) { timer = 0; die(); }
}

// --- отрисовка ---
function draw() {
  // небо
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2a4a'); g.addColorStop(1, '#2b3d6b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);

  // земля
  ctx.fillStyle = '#3a5a2a'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#2e4a22'; ctx.fillRect(0, GROUND, W, 5);

  // отлетающие брёвна (под стволом)
  for (const f of flying) drawFlyingLog(f);

  // ствол снизу вверх
  for (let i = 0; i < trunk.length; i++) {
    const y = GROUND - (i + 1) * LOG_H;
    if (y > H) continue;
    drawLog(TRUNK_X, y, trunk[i].branch, i === 1);
  }

  // дровосек
  drawJack();

  ctx.restore();

  // полоска таймера
  drawTimer();

  // счёт
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center';
  ctx.font = 'bold 40px Segoe UI, sans-serif'; ctx.fillText(score, W / 2, 74);

  if (paused && !over) overlay('⏸ ПАУЗА', 'P / Esc — продолжить');
  if (over) overlay('💀 Срубился!', 'Счёт ' + score + ' · Enter / тап — заново');
}

function drawLog(x, y, branch, isBottom) {
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, TRUNK_W, LOG_H - 2);
  ctx.fillStyle = '#6f4520'; ctx.fillRect(x, y, TRUNK_W, 5);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x + 6, y + 8, 6, LOG_H - 16);
  // кольца-срез
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, TRUNK_W - 4, LOG_H - 6);
  if (branch === 'left') drawBranch(x, y, -1, isBottom);
  else if (branch === 'right') drawBranch(x + TRUNK_W, y, 1, isBottom);
}

function drawBranch(bx, y, dir, danger) {
  const len = 60, th = 16, cy = y + LOG_H / 2;
  // подсветка опасной стороны на нижнем блоке (сюда бить НЕЛЬЗЯ)
  if (danger) {
    const p = 0.3 + 0.28 * (0.5 + 0.5 * Math.sin(anim * 8));
    ctx.fillStyle = 'rgba(239,71,111,' + p + ')';
    const hx = dir < 0 ? bx - len - 20 : bx;
    ctx.fillRect(hx, y - 2, len + 20, LOG_H);
  }
  ctx.fillStyle = '#6f4520';
  ctx.fillRect(dir < 0 ? bx - len : bx, cy - th / 2, len, th);
  // листва на конце
  ctx.fillStyle = '#2fbf71';
  const ex = dir < 0 ? bx - len : bx + len;
  ctx.beginPath(); ctx.arc(ex, cy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#27a862';
  ctx.beginPath(); ctx.arc(ex + dir * 8, cy - 8, 10, 0, Math.PI * 2); ctx.fill();
}

function drawFlyingLog(f) {
  ctx.save(); ctx.translate(f.x, f.y + LOG_H / 2); ctx.rotate(f.rot);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-TRUNK_W / 2, -LOG_H / 2, TRUNK_W, LOG_H - 2);
  ctx.fillStyle = '#6f4520'; ctx.fillRect(-TRUNK_W / 2, -LOG_H / 2, TRUNK_W, 5);
  ctx.restore();
}

function drawJack() {
  const left = jack.side === 'left';
  const cx = left ? TRUNK_X - 30 : TRUNK_X + TRUNK_W + 30;
  const dir = left ? 1 : -1; // куда смотрит (к стволу)
  const feet = GROUND;
  // ноги
  ctx.fillStyle = '#3a3d5c';
  ctx.fillRect(cx - 10, feet - 22, 8, 22); ctx.fillRect(cx + 2, feet - 22, 8, 22);
  // тело (рубашка)
  ctx.fillStyle = '#ef476f'; ctx.fillRect(cx - 12, feet - 52, 24, 32);
  // голова
  ctx.fillStyle = '#ffd6a5'; ctx.beginPath(); ctx.arc(cx, feet - 62, 11, 0, Math.PI * 2); ctx.fill();
  // шапка
  ctx.fillStyle = '#e63946'; ctx.fillRect(cx - 12, feet - 74, 24, 7);
  // руки + топор (замах по chopAnim)
  const swing = -0.9 + chopAnim * 1.6; // угол
  ctx.save();
  ctx.translate(cx + dir * 8, feet - 44);
  ctx.rotate(dir * swing);
  ctx.strokeStyle = '#ffd6a5'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * 20, -6); ctx.stroke();
  // топор
  ctx.translate(dir * 20, -6);
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * 22, -14); ctx.stroke();
  ctx.fillStyle = '#bfc7d5';
  ctx.beginPath(); ctx.moveTo(dir * 22, -22); ctx.lineTo(dir * 34, -18); ctx.lineTo(dir * 26, -4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTimer() {
  const m = 20, y = 88, w = W - m * 2, h = 12;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(m, y, w, h);
  const t = Math.max(0, Math.min(1, timer));
  const col = t > 0.5 ? '#2fbf71' : t > 0.25 ? '#ffd166' : '#ef476f';
  ctx.fillStyle = col; ctx.fillRect(m, y, w * t, h);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(m, y, w, h);
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
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // без автоповтора удержания
  if (over) { if (e.key === 'Enter') reset(); return; }
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': case 'ф': case 'Ф': chop('left'); e.preventDefault(); break;
    case 'ArrowRight': case 'd': case 'D': case 'в': case 'В': chop('right'); e.preventDefault(); break;
    case 'p': case 'P': case 'з': case 'З': case 'Escape': paused = !paused; updatePauseBtn(); e.preventDefault(); break;
  }
});

// тач: левая/правая половина
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (over) { reset(); return; }
  const r = canvas.getBoundingClientRect();
  const rel = (e.touches[0].clientX - r.left) / r.width;
  chop(rel < 0.5 ? 'left' : 'right');
}, { passive: false });
canvas.addEventListener('mousedown', (e) => {
  if (over) { reset(); return; }
  const r = canvas.getBoundingClientRect();
  chop((e.clientX - r.left) / r.width < 0.5 ? 'left' : 'right');
});

el.pause.addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('restart').addEventListener('click', reset);

reset();
lastFrame = null;
requestAnimationFrame(frame);
