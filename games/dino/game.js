const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const GROUND = H - 24;

const GRAVITY = 2600, JUMP_V = -830;
const DINO_X = 46, DINO_W = 40, DINO_H = 44, DUCK_W = 58, DUCK_H = 26;

const el = {
  score: document.getElementById('score'), best: document.getElementById('best'),
  pause: document.getElementById('pause'),
};

let dino, obstacles, clouds;
let dist, speed, score, best, milestoneFlash;
let nextSpawn, spawnGapBase;
let over, paused, dark, legTimer, wingTimer;
let lastFrame;
const keys = {};

best = parseInt(localStorage.getItem('dinoBest') || '0', 10);
el.best.textContent = best;

function reset() {
  dino = { y: GROUND - DINO_H, vy: 0, onGround: true, ducking: false };
  obstacles = [];
  clouds = [{ x: 200, y: 40 }, { x: 420, y: 70 }, { x: 560, y: 30 }];
  dist = 0; speed = 320; score = 0; milestoneFlash = 0;
  over = false; paused = false; dark = false;
  legTimer = 0; wingTimer = 0;
  nextSpawn = 60;
  updateHUD(); updatePauseBtn();
}

function updateHUD() { el.score.textContent = score; }
function updatePauseBtn() { el.pause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

function jump() {
  if (over || paused) return;
  if (dino.onGround) { dino.vy = JUMP_V; dino.onGround = false; }
}
function setDuck(on) {
  if (over || paused) return;
  dino.ducking = on;
  if (on && !dino.onGround && dino.vy < 0) dino.vy = 120; // держишь вниз в воздухе — быстрее падаешь
}

function spawnObstacle() {
  const canBird = score > 250;
  const roll = Math.random();
  let o;
  if (canBird && roll < 0.32) {
    // птеродактиль: высокий (пригнуться) или низкий (перепрыгнуть)
    const high = Math.random() < 0.6;
    o = { type: 'bird', x: W + 10, w: 42, h: 30, y: high ? GROUND - 64 : GROUND - 24, high };
  } else {
    // кактусы: 1-3 в группе
    const n = 1 + Math.floor(Math.random() * 3);
    const big = Math.random() < 0.4;
    const cw = big ? 22 : 15, ch = big ? 46 : 32;
    o = { type: 'cactus', x: W + 10, w: cw * n + (n - 1) * 3, h: ch, y: GROUND - ch, n, cw, ch, big };
  }
  obstacles.push(o);
}

// --- обновление ---
function update(dt) {
  if (over || paused) return;

  dist += speed * dt;
  speed = 320 + Math.min(380, dist / 42);
  const ns = Math.floor(dist / 10);
  if (ns !== score) {
    if (Math.floor(ns / 100) > Math.floor(score / 100)) milestoneFlash = 0.6; // каждые 100 — вспышка
    score = ns; updateHUD();
  }
  if (milestoneFlash > 0) milestoneFlash -= dt;

  // день/ночь по расстоянию
  dark = Math.floor(dist / 4000) % 2 === 1;

  // физика динозавра
  dino.vy += GRAVITY * dt;
  dino.y += dino.vy * dt;
  const groundTop = GROUND - (dino.ducking ? DUCK_H : DINO_H);
  // приземляемся только когда падаем — иначе кадр с dt=0 гасил бы прыжок
  dino.onGround = false;
  if (dino.vy >= 0 && dino.y >= groundTop) { dino.y = groundTop; dino.vy = 0; dino.onGround = true; }

  legTimer += dt; wingTimer += dt;

  // облака (параллакс)
  for (const c of clouds) { c.x -= speed * 0.3 * dt; if (c.x < -40) { c.x = W + 20; c.y = 20 + Math.random() * 70; } }

  // спавн препятствий
  nextSpawn -= speed * dt;
  if (nextSpawn <= 0) {
    spawnObstacle();
    const gap = 260 + Math.random() * 220 - Math.min(120, speed - 320); // ближе на высокой скорости, но не слишком
    nextSpawn = Math.max(150, gap);
  }

  // движение и столкновения
  for (const o of obstacles) o.x -= speed * dt;
  obstacles = obstacles.filter(o => o.x + o.w > -10);

  const d = dinoBox();
  for (const o of obstacles) {
    if (aabb(d, { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 6 })) { die(); break; }
  }
}

function dinoBox() {
  const w = dino.ducking ? DUCK_W : DINO_W, h = dino.ducking ? DUCK_H : DINO_H;
  return { x: DINO_X + 4, y: dino.y + 3, w: w - 8, h: h - 5 };
}
function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function die() {
  over = true;
  if (score > best) { best = score; localStorage.setItem('dinoBest', String(best)); el.best.textContent = best; }
}

// --- отрисовка ---
function draw() {
  const bg = dark ? '#0d0e1a' : '#dcdad2';
  const fg = dark ? '#edf2f4' : '#2b2d42';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (milestoneFlash > 0 && Math.floor(milestoneFlash * 10) % 2 === 0) { ctx.fillStyle = dark ? '#1b1d33' : '#ffffff'; ctx.fillRect(0, 0, W, H); }

  // облака
  ctx.fillStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(120,130,160,.5)';
  for (const c of clouds) { ctx.beginPath(); ctx.ellipse(c.x, c.y, 20, 8, 0, 0, Math.PI * 2); ctx.fill(); }

  // земля
  ctx.strokeStyle = fg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
  // камушки на земле (скролл)
  ctx.fillStyle = fg;
  const off = Math.floor(dist) % 40;
  for (let x = -off; x < W; x += 40) { ctx.fillRect(x, GROUND + 6, 6, 2); ctx.fillRect(x + 18, GROUND + 10, 3, 2); }

  // препятствия
  for (const o of obstacles) o.type === 'bird' ? drawBird(o, fg) : drawCactus(o, fg);

  // динозавр
  drawDino(fg);

  if (paused && !over) overlay('⏸ ПАУЗА', 'P / Esc — продолжить', fg, bg);
  if (over) overlay('💀 Игра окончена', 'Счёт ' + score + ' · Enter / тап — заново', fg, bg);
}

function drawDino(fg) {
  ctx.fillStyle = fg;
  const x = DINO_X, gy = dino.y;
  if (dino.ducking) {
    // пригнувшийся: длинное низкое тело + голова
    ctx.fillRect(x, gy + 4, 40, DUCK_H - 4);
    ctx.fillRect(x + 34, gy, 24, 16);        // голова вытянута вперёд
    ctx.fillStyle = dino.onGround ? fg : fg;
    ctx.fillRect(x + 50, gy + 4, 3, 3);      // глаз (тёмный фон просвечивает у night)
    // ноги-«бег»
    const step = Math.floor(legTimer * 12) % 2;
    ctx.fillRect(x + 8 + step * 10, gy + DUCK_H, 5, 4);
    ctx.fillRect(x + 26 - step * 10, gy + DUCK_H, 5, 4);
  } else {
    // тело
    ctx.fillRect(x + 4, gy + 12, 22, 24);   // корпус
    ctx.fillRect(x + 18, gy, 22, 20);       // голова
    ctx.fillRect(x, gy + 20, 10, 10);       // хвост-основание
    ctx.fillRect(x - 4, gy + 24, 8, 6);     // хвост
    // глаз
    ctx.fillStyle = dark ? '#0d0e1a' : '#dcdad2';
    ctx.fillRect(x + 32, gy + 5, 4, 4);
    ctx.fillStyle = fg;
    if (dino.onGround) {
      const step = Math.floor(legTimer * 14) % 2;
      ctx.fillRect(x + 8, gy + 36, 6, 8 - step * 3);
      ctx.fillRect(x + 18, gy + 36, 6, 5 + step * 3);
    } else {
      ctx.fillRect(x + 8, gy + 36, 6, 6); ctx.fillRect(x + 18, gy + 36, 6, 6);
    }
  }
}

function drawCactus(o, fg) {
  ctx.fillStyle = dark ? '#2dbe69' : '#1f7a4d';
  for (let i = 0; i < o.n; i++) {
    const bx = o.x + i * (o.cw + 3);
    ctx.fillRect(bx, o.y, o.cw, o.ch);
    // «руки»
    ctx.fillRect(bx - 4, o.y + o.ch * 0.35, 4, o.cw * 0.5);
    ctx.fillRect(bx + o.cw, o.y + o.ch * 0.5, 4, o.cw * 0.5);
  }
}

function drawBird(o, fg) {
  ctx.fillStyle = dark ? '#ba94e6' : '#955ad8';
  const up = Math.floor(wingTimer * 8) % 2 === 0;
  ctx.fillRect(o.x + 10, o.y + 10, 24, 8);      // тело
  ctx.fillRect(o.x + 30, o.y + 8, 12, 6);       // голова/клюв
  if (up) { ctx.fillRect(o.x + 8, o.y, 18, 8); } // крыло вверх
  else { ctx.fillRect(o.x + 8, o.y + 16, 18, 8); } // крыло вниз
}

function overlay(title, subtitle, fg, bg) {
  ctx.fillStyle = dark ? 'rgba(13,14,26,.8)' : 'rgba(233,236,245,.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg; ctx.textAlign = 'center';
  ctx.font = 'bold 26px Segoe UI, sans-serif'; ctx.fillText(title, W / 2, H / 2 - 6);
  ctx.font = '15px Segoe UI, sans-serif';
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
document.addEventListener('keydown', (e) => {
  if (over) { if (e.key === 'Enter') reset(); return; }
  switch (e.key) {
    case ' ': case 'ArrowUp': case 'w': case 'W': case 'ц': case 'Ц':
      jump(); e.preventDefault(); break;
    case 'ArrowDown': case 's': case 'S': case 'ы': case 'Ы':
      setDuck(true); e.preventDefault(); break;
    case 'p': case 'P': case 'з': case 'З': case 'Escape':
      paused = !paused; updatePauseBtn(); e.preventDefault(); break;
  }
});
document.addEventListener('keyup', (e) => {
  if (['ArrowDown','s','S','ы','Ы'].includes(e.key)) setDuck(false);
});

// тач: сверху — прыжок, снизу — пригнуться
function touchZone(clientY) { const r = canvas.getBoundingClientRect(); return (clientY - r.top) / r.height; }
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (over) { reset(); return; }
  if (touchZone(e.touches[0].clientY) > 0.6) setDuck(true); else jump();
}, { passive: false });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); setDuck(false); }, { passive: false });
canvas.addEventListener('mousedown', () => { if (over) reset(); else jump(); });

el.pause.addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('restart').addEventListener('click', reset);

reset();
lastFrame = null;
requestAnimationFrame(frame);
