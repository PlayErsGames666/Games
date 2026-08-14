const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const CELLS = 25;                 // клеток по стороне
const SIZE = canvas.width / CELLS; // размер одной клетки в пикселях

let snake;       // массив сегментов [{x,y}], [0] — голова
let prevSnake;   // позиции сегментов до последнего шага (для плавной интерполяции)
let dir;         // текущее направление {x,y}
let nextDir;     // направление следующего шага (буфер, чтобы не развернуться в себя)
let food;        // {x,y}
let score, best;
let speed;       // интервал шага в мс
let walls;       // режим со стенами
let running, gameOver, paused;
let acc;         // накопитель времени до следующего шага
let lastFrame;   // время предыдущего кадра
let loopStarted; // запущен ли requestAnimationFrame-цикл

best = parseInt(localStorage.getItem('snakeBest') || '0', 10);

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const difficultyEl = document.getElementById('difficulty');
const wallsEl = document.getElementById('walls');

function reset() {
  speed = parseInt(difficultyEl.value, 10);
  walls = wallsEl.checked;
  score = 0;
  gameOver = false;
  paused = false;
  running = true;
  // стартовая змейка из 3 сегментов в центре, смотрит вправо
  const c = Math.floor(CELLS / 2);
  snake = [ {x: c, y: c}, {x: c - 1, y: c}, {x: c - 2, y: c} ];
  prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  placeFood();
  updateHUD();

  acc = 0;
  lastFrame = null;
  if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
}

// главный цикл: рисуем каждый кадр (~60 FPS), логику двигаем по таймеру шага
function frame(now) {
  if (lastFrame === null) lastFrame = now;
  let dt = now - lastFrame;
  lastFrame = now;
  if (dt > 250) dt = 250; // защита от рывка после сворачивания вкладки

  let t = 1; // прогресс интерполяции 0..1
  if (running && !paused && !gameOver) {
    acc += dt;
    // догоняем логику, если кадров было мало
    while (acc >= speed && !gameOver) { acc -= speed; step(); }
    t = gameOver ? 1 : Math.min(acc / speed, 1);
  }
  draw(t);
  requestAnimationFrame(frame);
}

function placeFood() {
  // случайная пустая клетка
  let p;
  do {
    p = { x: Math.floor(Math.random() * CELLS), y: Math.floor(Math.random() * CELLS) };
  } while (snake.some(s => s.x === p.x && s.y === p.y));
  food = p;
}

function step() {
  // снимок позиций до шага — от него интерполируем движение к новым
  prevSnake = snake.map(s => ({ x: s.x, y: s.y }));

  dir = nextDir; // применяем буферизованный поворот

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (walls) {
    // врезание в стену — конец
    if (head.x < 0 || head.x >= CELLS || head.y < 0 || head.y >= CELLS) {
      return end();
    }
  } else {
    // проход сквозь края
    head.x = (head.x + CELLS) % CELLS;
    head.y = (head.y + CELLS) % CELLS;
  }

  // врезание в себя (кроме хвоста, который вот-вот сдвинется)
  if (snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) {
    return end();
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score++;
    updateHUD();
    placeFood();
    // не убираем хвост — змейка растёт
  } else {
    snake.pop();
  }
}

function end() {
  gameOver = true;
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem('snakeBest', String(best));
    updateHUD();
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
}

// интерполированная позиция сегмента i между prevSnake[i] и snake[i]
function segPos(i, t) {
  const b = snake[i];
  const a = prevSnake[i] || b; // у нового (выросшего) хвоста предыдущей позиции нет — стоит на месте
  let dx = b.x - a.x, dy = b.y - a.y;
  if (!walls) {
    // кратчайший путь с учётом прохода сквозь края
    if (dx > 1) dx -= CELLS; else if (dx < -1) dx += CELLS;
    if (dy > 1) dy -= CELLS; else if (dy < -1) dy += CELLS;
  }
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// рисует клетку с бесшовным «переносом» через края поля
function drawCell(px, py, inset, radius) {
  for (const ox of [0, -CELLS, CELLS]) {
    for (const oy of [0, -CELLS, CELLS]) {
      const x = px + ox, y = py + oy;
      if (x > CELLS || x < -1 || y > CELLS || y < -1) continue;
      roundRect(x * SIZE + inset, y * SIZE + inset, SIZE - inset * 2, SIZE - inset * 2, radius);
    }
  }
}

function draw(t) {
  if (t === undefined) t = 1;

  // фон + сетка
  ctx.fillStyle = '#1d1e30';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i < CELLS; i++) {
    ctx.beginPath(); ctx.moveTo(i * SIZE, 0); ctx.lineTo(i * SIZE, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * SIZE); ctx.lineTo(canvas.width, i * SIZE); ctx.stroke();
  }

  // еда (с лёгким свечением)
  ctx.shadowColor = '#ef233c';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ef233c';
  roundRect(food.x * SIZE + 3, food.y * SIZE + 3, SIZE - 6, SIZE - 6, 6);
  ctx.shadowBlur = 0;

  // змейка (с хвоста к голове), позиции интерполируем
  for (let i = snake.length - 1; i >= 0; i--) {
    const p = segPos(i, t);
    if (i === 0) {
      ctx.fillStyle = '#08f5b4';   // голова ярче
    } else {
      const k = 1 - i / snake.length * 0.5; // тело плавно темнеет к хвосту
      ctx.fillStyle = `rgba(6,214,160,${k})`;
    }
    drawCell(p.x, p.y, 1, 5);
  }

  // глазки на голове (в интерполированной позиции)
  drawEyes(segPos(0, t));

  // оверлеи
  if (paused && !gameOver) overlay('⏸ ПАУЗА', 'Пробел — продолжить');
  if (gameOver) overlay('💀 Игра окончена', 'Счёт: ' + score + ' · нажми «Заново»');
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawEyes(head) {
  const cx = head.x * SIZE, cy = head.y * SIZE;
  ctx.fillStyle = '#1d1e30';
  const e = SIZE * 0.16;
  // расположение глаз зависит от направления движения
  let e1, e2;
  if (dir.x === 1)      { e1 = [cx + SIZE*0.65, cy + SIZE*0.28]; e2 = [cx + SIZE*0.65, cy + SIZE*0.72]; }
  else if (dir.x === -1){ e1 = [cx + SIZE*0.35, cy + SIZE*0.28]; e2 = [cx + SIZE*0.35, cy + SIZE*0.72]; }
  else if (dir.y === 1) { e1 = [cx + SIZE*0.28, cy + SIZE*0.65]; e2 = [cx + SIZE*0.72, cy + SIZE*0.65]; }
  else                  { e1 = [cx + SIZE*0.28, cy + SIZE*0.35]; e2 = [cx + SIZE*0.72, cy + SIZE*0.35]; }
  ctx.beginPath(); ctx.arc(e1[0], e1[1], e, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(e2[0], e2[1], e, 0, Math.PI*2); ctx.fill();
}

function overlay(title, subtitle) {
  ctx.fillStyle = 'rgba(29,30,48,.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#edf2f4';
  ctx.textAlign = 'center';
  ctx.font = 'bold 38px Segoe UI, sans-serif';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 6);
  ctx.font = '18px Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(237,242,244,.7)';
  ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 28);
}

// --- управление ---
function setDir(x, y) {
  // запрет разворота на 180°
  if (x === -dir.x && y === -dir.y) return;
  nextDir = { x, y };
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': case 'ц': case 'Ц': setDir(0, -1); e.preventDefault(); break;
    case 'ArrowDown': case 's': case 'S': case 'ы': case 'Ы': setDir(0, 1); e.preventDefault(); break;
    case 'ArrowLeft': case 'a': case 'A': case 'ф': case 'Ф': setDir(-1, 0); e.preventDefault(); break;
    case 'ArrowRight': case 'd': case 'D': case 'в': case 'В': setDir(1, 0); e.preventDefault(); break;
    case ' ':
      e.preventDefault();
      if (!gameOver) { paused = !paused; draw(); }
      break;
  }
});

// свайпы для тача
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touchStart) return;
  e.preventDefault();
  const dx = e.touches[0].clientX - touchStart.x;
  const dy = e.touches[0].clientY - touchStart.y;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
  else setDir(0, dy > 0 ? 1 : -1);
  touchStart = null;
}, { passive: false });

document.getElementById('restart').addEventListener('click', reset);
difficultyEl.addEventListener('change', reset);
wallsEl.addEventListener('change', reset);

reset();
