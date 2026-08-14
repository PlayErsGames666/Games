const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // строки
  [0,3,6],[1,4,7],[2,5,8], // столбцы
  [0,4,8],[2,4,6],         // диагонали
];

let board;        // массив из 9 значений: '', 'X', 'O'
let current;      // чей ход: 'X' или 'O'
let over;         // закончена ли партия
let winLine;      // выигрышная тройка или null
let cells = [];   // DOM-элементы
let score = { X: 0, O: 0, D: 0 };

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const modeEl = document.getElementById('mode');

function init() {
  board = ['','','','','','','','',''];
  current = 'X';
  over = false;
  winLine = null;
  boardEl.innerHTML = '';
  cells = [];
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.addEventListener('click', () => onMove(i));
    boardEl.appendChild(el);
    cells.push(el);
  }
  redraw();
  if (online() && net.isHost()) broadcast();
}

/* Рисуем ВСЮ доску из состояния, а не дописываем по клетке: гостю приходит
   готовая доска целиком, и дорисовывать ему нечего. */
function redraw() {
  for (let i = 0; i < 9; i++) {
    const el = cells[i], v = board[i];
    el.textContent = v === 'X' ? '❌' : v === 'O' ? '⭕' : '';
    el.className = 'cell' + (v ? ' taken ' + v.toLowerCase() : '');
    if (winLine && winLine.indexOf(i) >= 0) el.classList.add('win');
  }
  statusEl.textContent = statusText();
  updateScore();
}
function sym(s) { return s === 'X' ? '❌' : '⭕'; }
function statusText() {
  if (over) return winLine ? (sym(current) + ' победил!' + mine(current)) : 'Ничья! 🤝';
  if (online()) return 'Ход: ' + sym(current) + (current === mySym ? ' — твой' : ' — соперника');
  return 'Ход: ' + sym(current);
}
function mine(s) { return online() ? (s === mySym ? ' Это ты 🎉' : ' Соперник') : ''; }

function onMove(i) {
  if (over || board[i] !== '') return;
  if (online()) {
    if (!partner) { flash('Ждём второго игрока'); return; }
    if (current !== mySym) { flash('Сейчас не твой ход'); return; }
    if (net.isHost()) { play(i); broadcast(); }
    else net.send({ t: 'mv', i: i });     // гость только просит: решает хост
    return;
  }
  play(i);
  // ход компьютера
  if (!over && modeEl.value === 'ai' && current === 'O') {
    setTimeout(aiMove, 300);
  }
}

function play(i) {
  board[i] = current;
  const line = getWinLine();
  if (line) {
    over = true; winLine = line; score[current]++;
  } else if (board.every(v => v !== '')) {
    over = true; score.D++;
  } else {
    current = current === 'X' ? 'O' : 'X';
  }
  redraw();
}

function getWinLine() {
  for (const line of WIN_LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return line;
  }
  return null;
}

function updateScore() {
  document.getElementById('scoreX').textContent = score.X;
  document.getElementById('scoreO').textContent = score.O;
  document.getElementById('scoreD').textContent = score.D;
}

// --- Простой непобедимый ИИ (минимакс) ---
function aiMove() {
  if (over) return;
  const best = minimax(board, 'O').index;
  play(best);
}

function minimax(b, player) {
  const empty = b.map((v,i) => v === '' ? i : null).filter(v => v !== null);

  if (winner(b) === 'X') return { score: -10 };
  if (winner(b) === 'O') return { score: 10 };
  if (empty.length === 0) return { score: 0 };

  const moves = [];
  for (const i of empty) {
    const move = { index: i };
    b[i] = player;
    move.score = minimax(b, player === 'O' ? 'X' : 'O').score;
    b[i] = '';
    moves.push(move);
  }

  let best;
  if (player === 'O') {
    let bestScore = -Infinity;
    for (const m of moves) if (m.score > bestScore) { bestScore = m.score; best = m; }
  } else {
    let bestScore = Infinity;
    for (const m of moves) if (m.score < bestScore) { bestScore = m.score; best = m; }
  }
  return best;
}

function winner(b) {
  for (const [a,c,d] of WIN_LINES) {
    if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
  }
  return null;
}

document.getElementById('restart').addEventListener('click', () => {
  // онлайн новую партию начинает хост: иначе две доски разъедутся
  if (online() && !net.isHost()) { net.send({ t: 'new' }); flash('Просим хоста начать новую партию'); return; }
  init();
});
modeEl.addEventListener('change', () => { if (!online()) init(); });

/* =====================  ОНЛАЙН  =====================
   Хост — ❌ и ведёт партию. Гость — ⭕, шлёт «хочу сюда» и получает доску.
   Счёт тоже у хоста: так он один на двоих и не разъезжается. */
let mySym = 'X', partner = false;
function online() { return net && net.isOnline(); }
function flash(t) { statusEl.textContent = t; setTimeout(() => { statusEl.textContent = statusText(); }, 1400); }
function broadcast() { net.send({ t: 'st', b: board, c: current, o: over, w: winLine, s: score }); }

const net = NET.create({
  prefix: 'ttt', max: 2,
  onOpen: () => { mySym = 'X'; modeEl.value = 'pvp'; modeEl.disabled = true; init(); },
  onJoin: () => { partner = true; init(); },                 // новая партия под нового соперника
  onLeave: () => { partner = false; redraw(); },
  onWelcome: () => { mySym = 'O'; partner = true; modeEl.value = 'pvp'; modeEl.disabled = true; },
  onClose: () => { partner = false; statusEl.textContent = 'Хост вышел — партия окончена'; },
  onData: (m, slot) => {
    if (net.isHost()) {
      if (m.t === 'mv') {                                    // гость всегда ⭕
        if (over || current !== 'O' || board[m.i]) return;
        play(m.i); broadcast();
      } else if (m.t === 'new') init();
      return;
    }
    if (m.t === 'st') { board = m.b; current = m.c; over = m.o; winLine = m.w; score = m.s; redraw(); }
  }
});
NET.lobby(document.getElementById('netbar'), net);

init();
