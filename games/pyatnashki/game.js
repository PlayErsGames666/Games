let n;           // размер поля (n x n)
let board;       // массив длины n*n, 0 = пустая клетка
let moves;
let started;
let timer, timerId;
let solved;

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timerEl = document.getElementById('timer');
const messageEl = document.getElementById('message');
const sizeEl = document.getElementById('size');

function init() {
  n = parseInt(sizeEl.value, 10);
  moves = 0;
  started = false;
  solved = false;
  timer = 0;
  clearInterval(timerId);
  timerEl.textContent = '0';
  movesEl.textContent = '0';
  messageEl.textContent = '';
  messageEl.className = 'message';

  // собранное состояние: 1,2,...,n*n-1,0
  board = [];
  for (let i = 1; i < n * n; i++) board.push(i);
  board.push(0);

  shuffle();
  render();
}

function shuffle() {
  // случайные допустимые ходы гарантируют решаемость
  const count = n * n * 40;
  for (let i = 0; i < count; i++) {
    const empty = board.indexOf(0);
    const nb = neighborsOf(empty);
    const pick = nb[Math.floor(Math.random() * nb.length)];
    [board[empty], board[pick]] = [board[pick], board[empty]];
  }
  // подстраховка: вдруг случайно собралось
  if (isSolved()) shuffle();
  moves = 0;
  started = false;
  solved = false;
  clearInterval(timerId);
  timer = 0;
  timerEl.textContent = '0';
  movesEl.textContent = '0';
  messageEl.textContent = '';
  messageEl.className = 'message';
}

function neighborsOf(index) {
  const r = Math.floor(index / n), c = index % n;
  const res = [];
  if (r > 0) res.push(index - n);
  if (r < n - 1) res.push(index + n);
  if (c > 0) res.push(index - 1);
  if (c < n - 1) res.push(index + 1);
  return res;
}

function render() {
  // базовый размер плитки, но не шире экрана (адаптив под мобильные)
  const base = n === 3 ? 100 : n === 4 ? 80 : 66;
  const avail = Math.min(window.innerWidth - 44, 440);        // доступная ширина поля
  const fit = Math.floor((avail - (n - 1) * 8 - 20) / n);     // вычет зазоров и padding
  const tileSize = Math.max(48, Math.min(base, fit));
  boardEl.style.gridTemplateColumns = `repeat(${n}, ${tileSize}px)`;
  boardEl.innerHTML = '';
  for (let i = 0; i < board.length; i++) {
    const el = document.createElement('div');
    const val = board[i];
    el.style.height = tileSize + 'px';
    if (val === 0) {
      el.className = 'tile empty';
    } else {
      el.className = 'tile';
      el.textContent = val;
      // подсветка фишки на своём месте
      if (val === i + 1) el.classList.add('correct');
      el.addEventListener('click', () => tryMove(i));
    }
    boardEl.appendChild(el);
  }
}

function tryMove(index) {
  if (solved) return;
  const empty = board.indexOf(0);
  if (!neighborsOf(index).includes(empty)) return;

  if (!started) {
    started = true;
    timerId = setInterval(() => { timer++; timerEl.textContent = timer; }, 1000);
  }

  [board[empty], board[index]] = [board[index], board[empty]];
  moves++;
  movesEl.textContent = moves;
  render();

  if (isSolved()) {
    solved = true;
    clearInterval(timerId);
    messageEl.textContent = `🎉 Собрано за ${moves} ходов и ${timer} сек!`;
    messageEl.className = 'message win';
  }
}

function isSolved() {
  for (let i = 0; i < n * n - 1; i++) {
    if (board[i] !== i + 1) return false;
  }
  return board[n * n - 1] === 0;
}

// управление стрелками: двигаем фишку в сторону пустой клетки
document.addEventListener('keydown', (e) => {
  const empty = board.indexOf(0);
  const r = Math.floor(empty / n), c = empty % n;
  let target = -1;
  if (e.key === 'ArrowUp'    && r < n - 1) target = empty + n; // фишка снизу едет вверх
  if (e.key === 'ArrowDown'  && r > 0)     target = empty - n;
  if (e.key === 'ArrowLeft'  && c < n - 1) target = empty + 1;
  if (e.key === 'ArrowRight' && c > 0)     target = empty - 1;
  if (target !== -1) { e.preventDefault(); tryMove(target); }
});

document.getElementById('shuffle').addEventListener('click', () => { shuffle(); render(); });
sizeEl.addEventListener('change', init);
// перерисовать при повороте/изменении размера экрана (адаптив плиток)
window.addEventListener('resize', () => { if (board && board.length) render(); });

init();
