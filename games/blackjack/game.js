const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RED = { '♥': 1, '♦': 1 };

const el = {
  balance: document.getElementById('balance'), curbet: document.getElementById('curbet'),
  record: document.getElementById('record'), betVal: document.getElementById('betVal'),
  dealerHand: document.getElementById('dealerHand'), playerHand: document.getElementById('playerHand'),
  dealerScore: document.getElementById('dealerScore'), playerScore: document.getElementById('playerScore'),
  msg: document.getElementById('msg'),
  betControls: document.getElementById('betControls'), playControls: document.getElementById('playControls'),
  overControls: document.getElementById('overControls'), doubleBtn: document.getElementById('doubleBtn'),
  dealBtn: document.getElementById('dealBtn'),
};

let deck, player, dealer, balance, bet, currentBet, record, state, message;

balance = parseInt(localStorage.getItem('blackjackBalance') || '100', 10);
record = parseInt(localStorage.getItem('blackjackRecord') || '100', 10);
bet = 10;
state = 'BET';
message = 'Сделай ставку и раздай карты';

// --- колода / значения ---
function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d;
}
function shuffle(d) {
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function draw() { return deck.pop(); }
function cardVal(r) { if (r === 'A') return 11; if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10; return Number(r); }
function handValue(cards) {
  let t = 0, a = 0;
  for (const c of cards) { t += cardVal(c.r); if (c.r === 'A') a++; }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}
function isBlackjack(cards) { return cards.length === 2 && handValue(cards) === 21; }

function saveBank() {
  localStorage.setItem('blackjackBalance', String(balance));
  localStorage.setItem('blackjackRecord', String(record));
}

// --- ход игры ---
function deal() {
  if (isNet() || state !== 'BET') return;   // онлайн раздаёт хост
  bet = Math.max(5, Math.min(bet, balance));
  if (balance < 5) { message = 'Банк пуст — нажми «Сброс банка»'; render(); return; }
  balance -= bet; currentBet = bet;
  deck = shuffle(newDeck());
  player = [draw(), draw()];
  dealer = [draw(), draw()];
  state = 'PLAYER';
  const pbj = isBlackjack(player), dbj = isBlackjack(dealer);
  if (pbj || dbj) {
    // натуральный блекджек — раунд решается сразу (дилер вскрывается)
    const note = (pbj && dbj) ? '🤝 Ничья — блекджек у обоих'
               : pbj ? '🎉 Блекджек! (3:2)'
               : '😕 У дилера блекджек';
    endRound(pbj && dbj ? 'push' : pbj ? 'blackjack' : 'lose', note);
    return;
  }
  message = 'Твой ход: Взять или Хватит?';
  render();
}

function hit() {
  if (isNet() || state !== 'PLAYER') return;
  player.push(draw());
  if (handValue(player) > 21) { endRound('lose'); return; }
  render();
}

function stand() {
  if (isNet() || state !== 'PLAYER') return;
  dealerPlayAndCompare();
}

function double() {
  if (isNet() || state !== 'PLAYER' || player.length !== 2 || balance < bet) return;
  balance -= bet; currentBet += bet;
  player.push(draw());
  if (handValue(player) > 21) { endRound('lose'); return; }
  dealerPlayAndCompare();
}

function dealerPlayAndCompare() {
  state = 'DEALER';
  while (handValue(dealer) < 17) dealer.push(draw());
  const pv = handValue(player), dv = handValue(dealer);
  let res;
  if (dv > 21) res = 'win';
  else if (dv > pv) res = 'lose';
  else if (dv < pv) res = 'win';
  else res = 'push';
  endRound(res);
}

function endRound(result, note) {
  let gain = 0, title = '';
  if (result === 'blackjack') { gain = Math.floor(currentBet * 2.5); title = '🎉 Блекджек!'; }
  else if (result === 'win') { gain = currentBet * 2; title = '🎉 Ты выиграл!'; }
  else if (result === 'push') { gain = currentBet; title = '🤝 Ничья'; }
  else { gain = 0; title = '😕 Дилер выиграл'; }
  if (note) title = note;
  balance += gain;
  const net = gain - currentBet;
  record = Math.max(record, balance);
  saveBank();
  state = 'OVER';
  message = title + ' · ' + (net >= 0 ? '+' : '') + net + '💰';
  render(true);
}

// --- отрисовка ---
function cardEl(card, faceDown) {
  const d = document.createElement('div');
  if (faceDown) { d.className = 'card back'; return d; }
  d.className = 'card' + (RED[card.s] ? ' red' : '');
  const r = document.createElement('div'); r.className = 'r'; r.textContent = card.r + card.s;
  const s = document.createElement('div'); s.className = 's'; s.textContent = card.s;
  d.appendChild(r); d.appendChild(s);
  return d;
}

function renderHand(container, cards, hideHole) {
  container.innerHTML = '';
  cards.forEach((c, i) => container.appendChild(cardEl(c, hideHole && i === 1)));
}

function render(reveal) {
  if (isNet()) { renderNet(); return; }        // онлайн рисует общий стол
  const hideHole = (state === 'PLAYER') && !reveal;
  if (player && player.length) {
    renderHand(el.playerHand, player, false);
    el.playerScore.textContent = handValue(player);
  } else { el.playerHand.innerHTML = ''; el.playerScore.textContent = '—'; }

  if (dealer && dealer.length) {
    renderHand(el.dealerHand, dealer, hideHole);
    el.dealerScore.textContent = hideHole ? cardVal(dealer[0].r) + ' + ?' : handValue(dealer);
  } else { el.dealerHand.innerHTML = ''; el.dealerScore.textContent = '—'; }

  el.msg.textContent = message;
  el.balance.textContent = balance;
  el.curbet.textContent = (state === 'BET') ? 0 : currentBet;
  el.record.textContent = record;
  el.betVal.textContent = bet;

  el.betControls.hidden = state !== 'BET';
  el.playControls.hidden = state !== 'PLAYER';
  el.overControls.hidden = state !== 'OVER';
  el.doubleBtn.disabled = !(state === 'PLAYER' && player.length === 2 && balance >= bet);
  el.dealBtn.disabled = balance < 5;
}

function setBet(v) { bet = Math.max(5, Math.min(v, Math.max(5, balance))); render(); }

// --- кнопки ---
document.getElementById('betMinus').addEventListener('click', () => setBet(bet - 5));
document.getElementById('betPlus').addEventListener('click', () => setBet(bet + 5));
document.getElementById('betAllin').addEventListener('click', () => setBet(balance));
document.getElementById('dealBtn').addEventListener('click', deal);
document.getElementById('hitBtn').addEventListener('click', hit);
document.getElementById('standBtn').addEventListener('click', stand);
document.getElementById('doubleBtn').addEventListener('click', double);
document.getElementById('againBtn').addEventListener('click', () => { if (isNet()) return; state = 'BET'; message = 'Сделай ставку и раздай карты'; player = []; dealer = []; render(); });
document.getElementById('resetBank').addEventListener('click', () => {
  balance = 100; record = Math.max(record, 100); bet = 10; state = 'BET'; player = []; dealer = [];
  message = 'Банк пополнен. Сделай ставку!'; saveBank(); render();
});

// клавиши-хоткеи
document.addEventListener('keydown', (e) => {
  if (isNet()) {                              // онлайн те же хоткеи, но через сеть
    if (!T) return;
    if (T.ph === 'PLAY' && T.turn === net.me) {
      if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowDown') netAct('hit');
      else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); netAct('stand'); }
      else if (e.key === 'd' || e.key === 'D') netAct('double');
    } else if (T.ph === 'BET' && e.key === 'Enter' && !myReady) netDeal();
    return;
  }
  if (state === 'PLAYER') {
    if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowDown') hit();
    else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); stand(); }
    else if (e.key === 'd' || e.key === 'D') double();
  } else if (state === 'BET' && e.key === 'Enter') deal();
  else if (state === 'OVER' && e.key === 'Enter') { state = 'BET'; message = 'Сделай ставку и раздай карты'; player = []; dealer = []; render(); }
});

player = []; dealer = [];
render();

/* =========================  ОНЛАЙН: ОБЩИЙ СТОЛ  =========================
   За одним столом до четырёх игроков. Хост держит колоду и играет за
   дилера. Каждый ставит и ходит по очереди, потом дилер добирает один раз
   и всех сравнивают.

   Банк у каждого СВОЙ и остаётся локальным: по сети ходят только карты,
   ставки и итог раунда, а свои монеты каждый начисляет себе сам. Так не
   нужен общий кошелёк и «сервер денег» — а жульничать со своей же
   копилкой бессмысленно. */
let T = null;              // стол (у хоста — настоящий, у гостя — присланный)
let myReady = false, lastRid = -1;
// именно var: первый render() случается ДО этой строки, а let/const до
// инициализации кидают ошибку, и тогда не создаётся вообще ничего
var net = null;
function isNet() { return net && net.isOnline(); }
function mySeat() { return T && T.seats ? T.seats.find(s => s.slot === net.me) : null; }
function seatName(slot) { return slot === 0 ? '🧑 Хост' : '🧑 Игрок ' + (slot + 1); }

function newTable() { return { ph: 'BET', turn: -1, rid: 0, dealer: [], hidden: true, seats: [] }; }
function hostSeat(slot) {
  if (!T) T = newTable();
  if (!T.seats.some(s => s.slot === slot)) T.seats.push({ slot: slot, bet: 10, cards: [], done: false, res: null, ready: false });
  T.seats.sort((a, b) => a.slot - b.slot);
}
function hostUnseat(slot) {
  if (!T) return;
  T.seats = T.seats.filter(s => s.slot !== slot);
  if (!T.seats.length) return;
  if (T.ph === 'PLAY') { advanceTurn(); return; }
  // ушёл тот, кого ждали со ставкой — иначе стол висел бы до следующего клика
  if (T.ph === 'BET' && T.seats.every(s => s.ready)) { dealRound(); return; }
  pushTable();
}

function dealRound() {
  deck = shuffle(newDeck());
  T.rid++; T.hidden = true; T.dealer = [draw(), draw()];
  for (const s of T.seats) { s.cards = [draw(), draw()]; s.done = isBlackjack(s.cards); s.res = null; s.ready = false; }
  T.ph = 'PLAY'; T.turn = -1;
  advanceTurn();
}
function advanceTurn() {
  // следующий, кто ещё не закончил; если таких нет — играет дилер
  const next = T.seats.find(s => !s.done && (s.slot > T.turn));
  if (next) { T.turn = next.slot; pushTable(); return; }
  dealerFinish();
}
function dealerFinish() {
  T.ph = 'DEALER'; T.hidden = false;
  while (handValue(T.dealer) < 17) T.dealer.push(draw());
  const dv = handValue(T.dealer), dbj = isBlackjack(T.dealer);
  for (const s of T.seats) {
    const pv = handValue(s.cards), pbj = isBlackjack(s.cards);
    if (pv > 21) s.res = 'lose';
    else if (pbj && dbj) s.res = 'push';
    else if (pbj) s.res = 'blackjack';
    else if (dbj) s.res = 'lose';
    else if (dv > 21 || pv > dv) s.res = 'win';
    else if (pv < dv) s.res = 'lose';
    else s.res = 'push';
  }
  T.ph = 'OVER'; T.turn = -1;
  pushTable();
}
function hostAct(slot, a) {
  if (!T || T.ph !== 'PLAY' || T.turn !== slot) return;
  const s = T.seats.find(x => x.slot === slot); if (!s || s.done) return;
  if (a === 'hit') {
    s.cards.push(draw());
    if (handValue(s.cards) >= 21) s.done = true;
  } else if (a === 'double') {
    if (s.cards.length !== 2) return;
    s.bet *= 2; s.cards.push(draw()); s.done = true;
  } else s.done = true;                       // stand
  if (s.done) advanceTurn(); else pushTable();
}
// дырка дилера гостям не отправляется вообще: иначе её видно в консоли
function pushTable() {
  if (!isNet() || !net.isHost() || !T) return;
  net.send({
    t: 'tbl', ph: T.ph, turn: T.turn, rid: T.rid, hidden: T.hidden,
    dealer: T.hidden ? [T.dealer[0]] : T.dealer,
    seats: T.seats.map(s => ({ slot: s.slot, bet: s.bet, cards: s.cards, done: s.done, res: s.res, ready: s.ready }))
  });
  renderNet();
}

// --- действия игрока онлайн ---
function netDeal() {
  const s = mySeat(); if (!s) return;
  bet = Math.max(5, Math.min(bet, balance));
  if (balance < 5) { message = 'Банк пуст — нажми «Сброс банка»'; renderNet(); return; }
  balance -= bet; currentBet = bet; myReady = true; saveBank();
  if (net.isHost()) { s.bet = bet; s.ready = true; if (T.seats.every(x => x.ready)) dealRound(); else pushTable(); }
  else net.send({ t: 'ready', bet: bet });
  renderNet();
}
function netAct(a) {
  if (!T || T.ph !== 'PLAY' || T.turn !== net.me) return;
  if (a === 'double') { if (balance < currentBet) return; balance -= currentBet; currentBet *= 2; saveBank(); }
  if (net.isHost()) hostAct(0, a); else net.send({ t: 'act', a: a });
}
// итог раунда каждый начисляет себе сам — ровно один раз за раздачу
function applyResult() {
  const s = mySeat(); if (!s || !s.res || T.rid === lastRid) return;
  lastRid = T.rid;
  const gain = s.res === 'blackjack' ? Math.floor(currentBet * 2.5)
    : s.res === 'win' ? currentBet * 2
      : s.res === 'push' ? currentBet : 0;
  balance += gain; record = Math.max(record, balance); saveBank();
  const net0 = gain - currentBet;
  message = ({ blackjack: '🎉 Блекджек!', win: '🎉 Ты выиграл!', push: '🤝 Ничья', lose: '😕 Дилер выиграл' })[s.res]
    + ' · ' + (net0 >= 0 ? '+' : '') + net0 + '💰';
  myReady = false;
}

function renderNet() {
  if (!isNet() || !T) return;
  const s = mySeat();
  if (T.ph === 'OVER') applyResult();

  // до раздачи у дилера пусто — раньше здесь падало на T.dealer[0].r
  const dcards = (T.dealer || []).filter(Boolean);
  renderHand(el.dealerHand, dcards, false);
  el.dealerScore.textContent = !dcards.length ? '—' : (T.hidden ? cardVal(dcards[0].r) + ' + ?' : handValue(dcards));

  if (s && s.cards.length) renderHand(el.playerHand, s.cards, false); else el.playerHand.innerHTML = '';
  document.getElementById('myLabel').innerHTML = seatName(net.me) + ' (ты) <span class="sc" id="playerScore">' +
    (s && s.cards.length ? handValue(s.cards) : '—') + '</span>' + (s ? ' · ставка ' + s.bet : '');
  el.playerScore = document.getElementById('playerScore');   // старый узел мы только что затёрли

  // чужие места
  const box = document.getElementById('seats');
  box.hidden = false; box.innerHTML = '';
  for (const o of T.seats) {
    if (o.slot === net.me) continue;
    const d = document.createElement('div'); d.className = 'hand-area';
    const lab = document.createElement('div'); lab.className = 'label';
    const v = o.cards.length ? handValue(o.cards) : '—';
    lab.innerHTML = seatName(o.slot) + ' <span class="sc">' + v + '</span> · ставка ' + o.bet +
      (T.turn === o.slot ? ' · <b>ходит</b>' : '') +
      (o.res ? ' · ' + ({ blackjack: 'блекджек', win: 'выиграл', push: 'ничья', lose: 'проиграл' })[o.res] : '');
    const h = document.createElement('div'); h.className = 'hand';
    for (const c of o.cards) h.appendChild(cardEl(c, false));
    d.appendChild(lab); d.appendChild(h); box.appendChild(d);
  }

  if (T.ph === 'BET') message = myReady ? 'Ставка принята — ждём остальных' : 'Сделай ставку и жми «Раздать»';
  else if (T.ph === 'PLAY') message = T.turn === net.me ? 'Твой ход: Взять или Хватит?' : ('Ходит ' + seatName(T.turn));
  el.msg.textContent = message;
  el.balance.textContent = balance;
  el.curbet.textContent = T.ph === 'BET' ? 0 : currentBet;
  el.record.textContent = record;
  el.betVal.textContent = bet;

  el.betControls.hidden = !(T.ph === 'BET' && !myReady);
  el.playControls.hidden = !(T.ph === 'PLAY' && T.turn === net.me);
  el.overControls.hidden = T.ph !== 'OVER';
  el.doubleBtn.disabled = !(T.ph === 'PLAY' && T.turn === net.me && s && s.cards.length === 2 && balance >= currentBet);
  el.dealBtn.disabled = balance < 5;
}

net = NET.create({
  prefix: 'bjack', max: 4,
  onOpen: () => { T = newTable(); hostSeat(0); myReady = false; renderNet(); },
  /* Пришедшего в середине раздачи НЕ пускаем в текущий круг: раньше стол
     сбрасывался в «ставки», и те, кто уже поставил, теряли фишки — деньги
     списываются в момент ставки. Он просто ждёт следующей раздачи. */
  onJoin: (slot) => {
    hostSeat(slot);
    const s = T.seats.find(x => x.slot === slot);
    if (s && T.ph !== 'BET') { s.done = true; s.cards = []; s.res = null; }
    pushTable();
  },
  onLeave: (slot) => hostUnseat(slot),
  onWelcome: () => { myReady = false; },
  onClose: () => { el.msg.textContent = 'Хост вышел — стол закрыт'; },
  onData: (m, slot) => {
    if (net.isHost()) {
      if (m.t === 'ready') { const s = T.seats.find(x => x.slot === slot); if (s) { s.bet = m.bet; s.ready = true; } if (T.seats.every(x => x.ready)) dealRound(); else pushTable(); }
      else if (m.t === 'act') hostAct(slot, m.a);
      else if (m.t === 'again') { const s = T.seats.find(x => x.slot === slot); if (s) s.ready = false; if (T.ph === 'OVER') { T.ph = 'BET'; T.dealer = []; for (const x of T.seats) { x.cards = []; x.res = null; } pushTable(); } }
      return;
    }
    if (m.t !== 'tbl') return;
    T = { ph: m.ph, turn: m.turn, rid: m.rid, hidden: m.hidden, dealer: m.dealer, seats: m.seats };
    renderNet();
  }
});
NET.lobby(document.getElementById('netbar'), net);

// онлайн кнопки ведут в сетевые обработчики, офлайн — в прежние
document.getElementById('dealBtn').addEventListener('click', () => { if (isNet()) netDeal(); });
document.getElementById('hitBtn').addEventListener('click', () => { if (isNet()) netAct('hit'); });
document.getElementById('standBtn').addEventListener('click', () => { if (isNet()) netAct('stand'); });
document.getElementById('doubleBtn').addEventListener('click', () => { if (isNet()) netAct('double'); });
document.getElementById('againBtn').addEventListener('click', () => {
  if (!isNet()) return;
  myReady = false;
  if (net.isHost()) { if (T.ph === 'OVER') { T.ph = 'BET'; T.dealer = []; for (const x of T.seats) { x.cards = []; x.res = null; x.ready = false; } pushTable(); } }
  else net.send({ t: 'again' });
  renderNet();
});
