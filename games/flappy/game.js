const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// --- параметры игры ---
const GRAVITY = 1400;      // ускорение падения (px/сек²)
const FLAP = -420;         // скорость взмаха (px/сек)
const PIPE_W = 64;         // ширина трубы
const GAP = 160;           // просвет между трубами
const PIPE_SPACING = 220;  // расстояние между парами труб по горизонтали
const SPEED = 150;         // скорость движения мира (px/сек)
const GROUND = 90;         // высота земли снизу
const BIRD_R = 16;         // радиус птицы

const STATE = { READY: 0, PLAY: 1, OVER: 2 };

let bird;        // {y, vy, rot}
let pipes;       // [{x, gapY, passed}]
let score, best;
let state;
let paused;
let lastFrame;

best = parseInt(localStorage.getItem('flappyBest') || '0', 10);

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
bestEl.textContent = best;

function resetGame() {
  bird = { y: H * 0.42, vy: 0, rot: 0 };
  pipes = [];
  score = 0;
  scoreEl.textContent = 0;
  state = STATE.READY;
  paused = false;
  updatePauseBtn();
}

function togglePause() {
  // пауза имеет смысл только во время игры
  if (state !== STATE.PLAY) return;
  paused = !paused;
  updatePauseBtn();
}

function updatePauseBtn() {
  pauseBtn.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
}

function flap() {
  if (paused) return; // во время паузы взмах игнорируем
  if (state === STATE.READY) {
    state = STATE.PLAY;
    bird.vy = FLAP;
  } else if (state === STATE.PLAY) {
    bird.vy = FLAP;
  } else if (state === STATE.OVER) {
    resetGame();
  }
}

function spawnPipe() {
  const margin = 60;
  const gapY = margin + Math.random() * (H - GROUND - GAP - margin * 2);
  const last = pipes[pipes.length - 1];
  const x = last ? last.x + PIPE_SPACING : W + 40;
  pipes.push({ x, gapY, passed: false });
}

function update(dt) {
  if (paused) return; // на паузе мир застыл
  if (state === STATE.PLAY) {
    // физика птицы
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    // наклон птицы по скорости
    bird.rot = Math.max(-0.5, Math.min(1.2, bird.vy / 600));

    // движение труб
    for (const p of pipes) p.x -= SPEED * dt;

    // рождение новых труб (по позиции последней)
    if (pipes.length === 0 || pipes[pipes.length - 1].x <= W - PIPE_SPACING) {
      spawnPipe();
    }
    // удаление ушедших за экран
    if (pipes.length && pipes[0].x + PIPE_W < -10) pipes.shift();

    // счёт: труба пройдена
    for (const p of pipes) {
      if (!p.passed && p.x + PIPE_W < W * 0.3 - BIRD_R) {
        p.passed = true;
        score++;
        scoreEl.textContent = score;
      }
    }

    checkCollision();
  } else if (state === STATE.READY) {
    // лёгкое «парение» до старта
    bird.y = H * 0.42 + Math.sin(performance.now() / 300) * 8;
  } else if (state === STATE.OVER) {
    // птица падает на землю
    if (bird.y < H - GROUND - BIRD_R) {
      bird.vy += GRAVITY * dt;
      bird.y += bird.vy * dt;
      bird.rot = Math.min(1.5, bird.rot + dt * 3);
    } else {
      bird.y = H - GROUND - BIRD_R;
    }
  }
}

function checkCollision() {
  const bx = W * 0.3;
  // земля и потолок
  if (bird.y + BIRD_R >= H - GROUND || bird.y - BIRD_R <= 0) {
    return gameOver();
  }
  // трубы
  for (const p of pipes) {
    if (bx + BIRD_R > p.x && bx - BIRD_R < p.x + PIPE_W) {
      if (bird.y - BIRD_R < p.gapY || bird.y + BIRD_R > p.gapY + GAP) {
        return gameOver();
      }
    }
  }
}

function gameOver() {
  if (state !== STATE.PLAY) return;
  state = STATE.OVER;
  if (score > best) {
    best = score;
    localStorage.setItem('flappyBest', String(best));
    bestEl.textContent = best;
  }
}

// --- отрисовка ---
function draw() {
  // небо (градиент)
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d3b53');
  sky.addColorStop(1, '#3a6ea5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // трубы
  for (const p of pipes) drawPipe(p);

  // земля
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = '#8f6f1f';
  ctx.fillRect(0, H - GROUND, W, 8);
  // травка-полосы
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, H - GROUND + 8, 12, GROUND - 8);

  // птица
  drawBird();

  // счёт крупно во время игры
  if (state === STATE.PLAY || state === STATE.READY) {
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = 'bold 46px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(score, W / 2, 70);
  }

  if (state === STATE.READY) {
    banner('Готов?', 'Клик / Пробел — взлёт');
  }
  if (state === STATE.OVER) {
    banner('💀 Готово', 'Счёт: ' + score + ' · клик — заново');
  }
  if (paused && state === STATE.PLAY) {
    banner('⏸ ПАУЗА', 'P / Esc или кнопка — продолжить');
  }
}

function drawPipe(p) {
  const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  grad.addColorStop(0, '#3ba55d');
  grad.addColorStop(0.5, '#57cc7a');
  grad.addColorStop(1, '#2e8049');
  ctx.fillStyle = grad;
  // верхняя труба
  ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
  // нижняя труба
  ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - GROUND - (p.gapY + GAP));
  // «шляпки» труб
  ctx.fillStyle = '#2e8049';
  ctx.fillRect(p.x - 4, p.gapY - 18, PIPE_W + 8, 18);
  ctx.fillRect(p.x - 4, p.gapY + GAP, PIPE_W + 8, 18);
}

function drawBird() {
  const bx = W * 0.3;
  ctx.save();
  ctx.translate(bx, bird.y);
  ctx.rotate(bird.rot);

  // тело
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  // крыло
  ctx.fillStyle = '#f4a300';
  ctx.beginPath();
  ctx.ellipse(-3, 3, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // клюв
  ctx.fillStyle = '#ef233c';
  ctx.beginPath();
  ctx.moveTo(BIRD_R - 2, -2);
  ctx.lineTo(BIRD_R + 9, 2);
  ctx.lineTo(BIRD_R - 2, 6);
  ctx.closePath();
  ctx.fill();
  // глаз
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(6, -6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1e30';
  ctx.beginPath();
  ctx.arc(8, -6, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function banner(title, subtitle) {
  ctx.fillStyle = 'rgba(29,30,48,.62)';
  ctx.fillRect(0, H / 2 - 70, W, 140);
  ctx.fillStyle = '#edf2f4';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Segoe UI, sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 8);
  ctx.font = '18px Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(237,242,244,.8)';
  ctx.fillText(subtitle, W / 2, H / 2 + 28);
}

// --- главный цикл (60 FPS) ---
function frame(now) {
  if (lastFrame === null) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.05) dt = 0.05; // защита от рывка после сворачивания вкладки
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// --- управление ---
canvas.addEventListener('mousedown', flap);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp') {
    e.preventDefault();
    flap();
  } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape' ||
             e.key === 'з' || e.key === 'З') { // з — та же клавиша в рус. раскладке
    e.preventDefault();
    togglePause();
  }
});

pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', resetGame);

resetGame();
lastFrame = null;
requestAnimationFrame(frame);
