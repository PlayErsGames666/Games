const LEVELS = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

let rows, cols, mines;
let grid;          // массив клеток
let started;       // началась ли игра (мины ставятся после первого клика)
let over;          // игра закончена
let flags;         // количество флажков
let opened;        // количество открытых клеток
let timer, timerId;

const boardEl = document.getElementById('board');
const mineCountEl = document.getElementById('mineCount');
const timerEl = document.getElementById('timer');
const messageEl = document.getElementById('message');

function init() {
  const level = LEVELS[document.getElementById('difficulty').value];
  rows = level.rows; cols = level.cols; mines = level.mines;

  started = false;
  over = false;
  flags = 0;
  opened = 0;
  timer = 0;
  clearInterval(timerId);
  timerEl.textContent = '0';
  messageEl.textContent = '';
  messageEl.className = 'message';
  mineCountEl.textContent = mines;

  grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { mine: false, open: false, flag: false, count: 0, el: null };
    }
  }

  render();
}

// тач-управление: короткий тап = открыть, долгое нажатие = флажок, свайп = прокрутка
let lastTouchAt = 0;   // Android на долгом нажатии шлёт ещё и contextmenu — не даём поставить флажок дважды
function attachTouch(el, r, c) {
  let timer = null, longPressed = false, moved = false, startX = 0, startY = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('touchstart', (e) => {
    if (over) return;
    lastTouchAt = Date.now();
    longPressed = false; moved = false;
    const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
    timer = setTimeout(() => {
      longPressed = true;
      onFlag(r, c);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) { moved = true; cancel(); }
  }, { passive: true });
  el.addEventListener('touchcancel', () => { cancel(); moved = true; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    cancel();
    lastTouchAt = Date.now();
    if (moved) return;        // это была прокрутка поля
    e.preventDefault();       // гасим синтетический click, чтобы не открыть дважды
    if (longPressed) return;  // флажок уже поставлен долгим нажатием
    onOpen(r, c);
  });
}

function render() {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size, 34px))`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const el = document.createElement('div');
      el.className = 'cell';
      el.addEventListener('click', () => onOpen(r, c));
      // ПКМ на десктопе; на тачскрине долгое нажатие уже поставило флажок — второй раз не переключаем
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (Date.now() - lastTouchAt < 1200) return; onFlag(r, c); });
      attachTouch(el, r, c);
      cell.el = el;
      boardEl.appendChild(el);
    }
  }
}

function placeMines(safeR, safeC) {
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    // не ставим мину на первую открытую клетку и её соседей
    if (grid[r][c].mine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    grid[r][c].mine = true;
    placed++;
  }
  // считаем соседей
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].mine) continue;
      grid[r][c].count = neighbors(r, c).filter(([nr, nc]) => grid[nr][nc].mine).length;
    }
  }
}

function neighbors(r, c) {
  const list = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) list.push([nr, nc]);
    }
  }
  return list;
}

function onOpen(r, c) {
  if (over) return;
  const cell = grid[r][c];
  if (cell.open || cell.flag) return;

  if (!started) {
    started = true;
    placeMines(r, c);
    timerId = setInterval(() => { timer++; timerEl.textContent = timer; }, 1000);
  }

  if (cell.mine) {
    revealAll();
    endGame(false);
    return;
  }

  flood(r, c);
  checkWin();
}

function flood(r, c) {
  const cell = grid[r][c];
  if (cell.open || cell.flag) return;
  cell.open = true;
  opened++;
  cell.el.classList.add('open');
  if (cell.count > 0) {
    cell.el.textContent = cell.count;
    cell.el.classList.add('c' + cell.count);
  } else {
    // пустая клетка — открываем всех соседей
    neighbors(r, c).forEach(([nr, nc]) => flood(nr, nc));
  }
}

function onFlag(r, c) {
  if (over) return;   // флажок можно ставить и до первого хода (важно для мобилок)
  const cell = grid[r][c];
  if (cell.open) return;
  cell.flag = !cell.flag;
  cell.el.classList.toggle('flag', cell.flag);
  cell.el.textContent = cell.flag ? '🚩' : '';
  flags += cell.flag ? 1 : -1;
  mineCountEl.textContent = mines - flags;
}

function revealAll() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.mine) {
        cell.el.classList.add('open', 'mine');
        cell.el.textContent = '💣';
      }
    }
  }
}

function checkWin() {
  if (opened === rows * cols - mines) {
    endGame(true);
  }
}

function endGame(won) {
  over = true;
  clearInterval(timerId);
  if (won) {
    messageEl.textContent = '🎉 Победа! Время: ' + timer + ' сек';
    messageEl.className = 'message win';
  } else {
    messageEl.textContent = '💥 Взрыв! Игра окончена';
    messageEl.className = 'message lose';
  }
}

document.getElementById('restart').addEventListener('click', init);
document.getElementById('difficulty').addEventListener('change', init);

init();
