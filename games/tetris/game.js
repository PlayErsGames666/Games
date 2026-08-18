const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const COLS = 10, ROWS = 20, SIDE = 5, CELL = 26;
const BOARD_W = COLS * CELL;

// фигуры (матрицы) и цвета
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};
const KEYS_ORDER = ['I','O','T','S','Z','J','L'];
const COLORS = { I:'#4cc9f0', O:'#ffd166', T:'#b388ff', S:'#06d6a0', Z:'#ef476f', J:'#3a86ff', L:'#ff9f1c' };
const LINE_SCORE = [0, 100, 300, 500, 800];

const el = {
  score: document.getElementById('score'), lines: document.getElementById('lines'),
  level: document.getElementById('level'), best: document.getElementById('best'),
  pause: document.getElementById('pause'),
};

let board, piece, nextQueue, bag, hold, canHold;
let score, lines, level, best;
let gravAcc, dasDir, dasTimer;
let over, paused;
let lastFrame;
const keys = {};

best = parseInt(localStorage.getItem('tetrisBest') || '0', 10);
el.best.textContent = best;

// --- утилиты матриц ---
function rotateCW(m) {
  const n = m.length, r = [];
  for (let i = 0; i < n; i++) { r[i] = []; for (let j = 0; j < n; j++) r[i][j] = m[n - 1 - j][i]; }
  return r;
}
function rotateCCW(m) {
  const n = m.length, r = [];
  for (let i = 0; i < n; i++) { r[i] = []; for (let j = 0; j < n; j++) r[i][j] = m[j][n - 1 - i]; }
  return r;
}
function cloneShape(k) { return SHAPES[k].map(row => row.slice()); }

// --- мешок из 7 фигур (честная случайность) ---
function refillBag() {
  bag = KEYS_ORDER.slice();
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
}
function nextKey() {
  if (!bag || bag.length === 0) refillBag();
  return bag.pop();
}

function newPiece(key) {
  const m = cloneShape(key);
  return { key, m, x: Math.floor((COLS - m[0].length) / 2), y: key === 'I' ? -1 : 0 };
}

function reset() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = null; refillBag();
  nextQueue = [nextKey(), nextKey(), nextKey()];
  hold = null; canHold = true;
  score = 0; lines = 0; level = 1;
  gravAcc = 0; dasDir = 0; dasTimer = 0;
  over = false; paused = false;
  spawn();
  updateHUD();
  updatePauseBtn();
}

function spawn() {
  const key = nextQueue.shift();
  nextQueue.push(nextKey());
  piece = newPiece(key);
  canHold = true;
  if (collides(piece.m, piece.x, piece.y)) { over = true; saveBest(); } // некуда ставить — конец
}

function collides(m, px, py) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const x = px + c, y = py + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function move(dx) {
  if (!collides(piece.m, piece.x + dx, piece.y)) { piece.x += dx; return true; }
  return false;
}

function rotate(dir) {
  const rm = dir > 0 ? rotateCW(piece.m) : rotateCCW(piece.m);
  // простые «отскоки от стен»: пробуем сдвиги
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(rm, piece.x + dx, piece.y)) { piece.m = rm; piece.x += dx; return; }
  }
}

function stepDown(soft) {
  if (!collides(piece.m, piece.x, piece.y + 1)) {
    piece.y += 1;
    if (soft) { score += 1; updateHUD(); }
    return true;
  }
  lock();
  return false;
}

function hardDrop() {
  let d = 0;
  while (!collides(piece.m, piece.x, piece.y + 1)) { piece.y += 1; d++; }
  score += d * 2; updateHUD();
  lock();
}

function lock() {
  for (let r = 0; r < piece.m.length; r++) {
    for (let c = 0; c < piece.m[r].length; c++) {
      if (piece.m[r][c]) {
        const y = piece.y + r, x = piece.x + c;
        if (y < 0) { over = true; saveBest(); return; } // застряло сверху
        board[y][x] = piece.key;
      }
    }
  }
  clearLines();
  spawn();
}

function clearLines() {
  let total = 0, chain = 0, guard = 0;
  while (guard++ < 40) {
    // удаляем полностью заполненные строки
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        r++; // проверить ту же строку снова (сдвинулось вниз)
      }
    }
    if (cleared === 0) break;
    chain++;
    total += cleared;
    score += LINE_SCORE[cleared] * level * chain; // бонус за каскад
    applyGravity(); // висящие блоки оседают вниз — могут собраться новые линии
  }
  if (total) {
    lines += total;
    level = 1 + Math.floor(lines / 10);
    updateHUD();
  }
}

// гравитация: в каждом столбце блоки падают вниз, дырки под ними исчезают
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) stack.push(board[r][c]);
    for (let r = 0; r < ROWS; r++) board[r][c] = null;
    let idx = ROWS - 1;
    for (let i = stack.length - 1; i >= 0; i--) board[idx--][c] = stack[i];
  }
}

function holdPiece() {
  if (!canHold) return;
  const cur = piece.key;
  if (hold === null) { hold = cur; spawn(); }
  else { const h = hold; hold = cur; piece = newPiece(h); if (collides(piece.m, piece.x, piece.y)) { over = true; saveBest(); } }
  canHold = false;
}

function ghostY() {
  let gy = piece.y;
  while (!collides(piece.m, piece.x, gy + 1)) gy++;
  return gy;
}

function gravInterval() { return Math.max(0.05, 0.8 - (level - 1) * 0.062); }

function saveBest() { if (score > best) { best = score; localStorage.setItem('tetrisBest', String(best)); el.best.textContent = best; } }

function updateHUD() {
  el.score.textContent = score;
  el.lines.textContent = lines;
  el.level.textContent = level;
}
function updatePauseBtn() { el.pause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

// --- обновление ---
function update(dt) {
  if (over || paused) return;

  // горизонтальное авто-повторение (DAS)
  let dir = 0;
  if (keys['ArrowLeft'] || keys['a'] || keys['A'] || keys['ф'] || keys['Ф']) dir -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D'] || keys['в'] || keys['В']) dir += 1;
  if (dir !== 0) {
    if (dir !== dasDir) { move(dir); dasDir = dir; dasTimer = 0.16; }
    else { dasTimer -= dt; if (dasTimer <= 0) { move(dir); dasTimer = 0.05; } }
  } else dasDir = 0;

  // гравитация (мягкий сброс при удержании «вниз»)
  const soft = keys['ArrowDown'] || keys['s'] || keys['S'] || keys['ы'] || keys['Ы'];
  const interval = soft ? 0.03 : gravInterval();
  gravAcc += dt;
  let guard = 0;
  while (gravAcc >= interval && !over && !paused) {
    gravAcc -= interval;
    stepDown(soft);
    if (++guard > 40) break;
  }
}

// --- отрисовка ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // сетка поля
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke(); }
  for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BOARD_W, r * CELL); ctx.stroke(); }

  // зафиксированные блоки
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c]) drawCell(c, r, COLORS[board[r][c]]);

  if (!over) {
    // призрак (куда упадёт)
    const gy = ghostY();
    for (let r = 0; r < piece.m.length; r++)
      for (let c = 0; c < piece.m[r].length; c++)
        if (piece.m[r][c]) drawCell(piece.x + c, gy + r, COLORS[piece.key], true);
    // текущая фигура
    for (let r = 0; r < piece.m.length; r++)
      for (let c = 0; c < piece.m[r].length; c++)
        if (piece.m[r][c]) drawCell(piece.x + c, piece.y + r, COLORS[piece.key]);
  }

  drawSidePanel();

  if (paused && !over) overlay('⏸ ПАУЗА', 'P / Esc — продолжить');
  if (over) overlay('💀 Игра окончена', 'Счёт ' + score + ' · Enter / тап — заново');
}

function drawCell(cx, cy, color, ghost) {
  if (cy < 0) return;
  const x = cx * CELL, y = cy * CELL;
  if (ghost) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4); ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(x + 1, y + CELL - 5, CELL - 2, 4);
}

function drawMiniPiece(key, ox, oy, box) {
  const m = SHAPES[key];
  const size = 16;
  // центрируем фигуру в области box×box
  let minC = 9, maxC = 0, minR = 9, maxR = 0;
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c]) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
  const w = (maxC - minC + 1) * size, h = (maxR - minR + 1) * size;
  const sx = ox + (box - w) / 2, sy = oy + (box - h) / 2;
  ctx.fillStyle = COLORS[key];
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c]) {
    const x = sx + (c - minC) * size, y = sy + (r - minR) * size;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  }
}

function drawSidePanel() {
  const px = BOARD_W + 10;
  const pw = SIDE * CELL - 20;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = 'bold 13px Segoe UI'; ctx.textAlign = 'left';

  ctx.fillText('СЛЕДУЮЩИЕ', px, 22);
  let y = 34;
  for (let i = 0; i < nextQueue.length; i++) {
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px, y, pw, 56);
    drawMiniPiece(nextQueue[i], px, y, Math.min(pw, 56));
    y += 62;
  }

  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText('ОТЛОЖЕНО (C)', px, y + 18);
  y += 28;
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px, y, pw, 56);
  if (hold) drawMiniPiece(hold, px, y, Math.min(pw, 56));
}

function overlay(title, subtitle) {
  ctx.fillStyle = 'rgba(18,19,31,.82)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#edf2f4'; ctx.textAlign = 'center';
  ctx.font = 'bold 30px Segoe UI, sans-serif'; ctx.fillText(title, BOARD_W / 2, canvas.height / 2 - 6);
  ctx.font = '15px Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(237,242,244,.75)';
  ctx.fillText(subtitle, BOARD_W / 2, canvas.height / 2 + 24);
}

// --- цикл ---
function frame(now) {
  if (lastFrame === null) lastFrame = now;
  let dt = (now - lastFrame) / 1000; lastFrame = now;
  if (dt > 0.1) dt = 0.1;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// --- клавиатура ---
document.addEventListener('keydown', (e) => {
  if (over) { if (e.key === 'Enter') reset(); return; }
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': case 'ф': case 'Ф':
    case 'ArrowRight': case 'd': case 'D': case 'в': case 'В':
    case 'ArrowDown': case 's': case 'S': case 'ы': case 'Ы':
      keys[e.key] = true; e.preventDefault(); break;
    case 'ArrowUp': case 'x': case 'X': case 'ч': case 'Ч':
      if (!paused) rotate(1); e.preventDefault(); break;
    case 'z': case 'Z': case 'я': case 'Я':
      if (!paused) rotate(-1); e.preventDefault(); break;
    case ' ':
      if (!paused) hardDrop(); e.preventDefault(); break;
    case 'c': case 'C': case 'с': case 'С':
      if (!paused) holdPiece(); e.preventDefault(); break;
    case 'p': case 'P': case 'з': case 'З': case 'Escape':
      paused = !paused; updatePauseBtn(); e.preventDefault(); break;
  }
});
/* Shift меняет e.key на лету («a» → «A»), и keyup приходит уже другой буквой —
   отпускаем оба написания, иначе клавиша залипает и герой едет сам. */
document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
  if (e.key.length === 1) { keys[e.key.toLowerCase()] = false; keys[e.key.toUpperCase()] = false; }
});
// ушли с вкладки с зажатой клавишей — браузер keyup уже не пришлёт
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// --- тач: веди пальцем = двигать, тап = поворот, свайп вниз = сброс ---
let tStartX = 0, tStartY = 0, tLastX = 0, tMoved = false, tStartT = 0;
function cellPx() { const r = canvas.getBoundingClientRect(); return r.width / (COLS + SIDE); }
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (over) { reset(); return; }
  const t = e.touches[0];
  tStartX = tLastX = t.clientX; tStartY = t.clientY; tMoved = false; tStartT = performance.now();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (over || paused) return;
  const t = e.touches[0];
  const cw = cellPx();
  while (t.clientX - tLastX >= cw) { move(1); tLastX += cw; tMoved = true; }
  while (t.clientX - tLastX <= -cw) { move(-1); tLastX -= cw; tMoved = true; }
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (over || paused) return;
  const dy = (e.changedTouches[0].clientY - tStartY);
  const dt = performance.now() - tStartT;
  if (!tMoved && Math.abs(dy) < 20 && dt < 250) { rotate(1); return; }   // тап = поворот
  if (dy > 60) { hardDrop(); }                                          // свайп вниз = сброс
}, { passive: false });

el.pause.addEventListener('click', () => { if (!over) { paused = !paused; updatePauseBtn(); } });
document.getElementById('restart').addEventListener('click', reset);

reset();
lastFrame = null;
requestAnimationFrame(frame);
