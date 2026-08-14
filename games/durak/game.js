const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
const RED = { '♥': 1, '♦': 1 };
function rlabel(v) { return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[v] || String(v); }

const el = {
  msg: document.getElementById('msg'), compHand: document.getElementById('compHand'),
  playerHand: document.getElementById('playerHand'), table: document.getElementById('table'),
  deckCount: document.getElementById('deckCount'), trumpLbl: document.getElementById('trumpLbl'),
  discardCount: document.getElementById('discardCount'),
  bitoBtn: document.getElementById('bitoBtn'), takeBtn: document.getElementById('takeBtn'), passBtn: document.getElementById('passBtn'),
};

// P=0 игрок, C=1 компьютер. Онлайн: 0 — хост, 1 — гость
let deck, trump, trumpCard, hands, table, discard, attacker, defender, phase, transferCount, boutMax, over, result, S, thinking, bouts;
let overWinner = null;    // кто вышел без карт: 0, 1 или null (ничья)

/* Онлайн. Хост — место 0, гость — место 1. Считает только хост: у него
   настоящая колода, он же решает, законен ли ход. Гость шлёт «хочу сыграть
   эту карту» и получает готовый стол.
   Чужие карты гостю НЕ отправляются — только их количество: иначе соперник
   виден через консоль браузера, а это уже не игра. */
let mySeat = 0;
function isNet() { return net && net.isOnline(); }
function oppSeat() { return 1 - mySeat; }
function oppName() { return isNet() ? 'Соперник' : 'Компьютер'; }

function newDeck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push({ r, s }); return d; }
function shuffle(d) { for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function beats(att, def, tr) { return (def.s === att.s && def.r > att.r) || (def.s === tr && att.s !== tr); }
function cardRank(c, tr) { return (c.s === tr ? 100 : 0) + c.r; } // для сортировки/выбора: козыри старше

// выбранные режимы (применяются на «Новую игру»)
let modePod = true, modeTransfer = 'none';
function readSettings() { return { podkidnoy: modePod, transfer: modeTransfer }; }
function updateModeButtons() {
  document.getElementById('optPod').classList.toggle('on', modePod);
  document.getElementById('trNone').classList.toggle('on', modeTransfer === 'none');
  document.getElementById('trS').classList.toggle('on', modeTransfer === 'single');
  document.getElementById('trD').classList.toggle('on', modeTransfer === 'double');
}

function dealGame() {
  deck = shuffle(newDeck());
  hands = [[], []];
  discard = []; table = [];
  for (let i = 0; i < 6; i++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
  trumpCard = deck[0];               // нижняя карта — козырь, берётся последней
  trump = trumpCard.s;
  // первый ход — у кого младший козырь
  let best = null, who = 0;
  for (let p = 0; p < 2; p++) for (const c of hands[p]) if (c.s === trump && (best === null || c.r < best)) { best = c.r; who = p; }
  attacker = who; defender = 1 - who;
  phase = 'ATTACK'; transferCount = 0; boutMax = 0; over = false; result = ''; bouts = 0;
}
function startGame() {
  // онлайн раздаёт только хост: колода должна быть одна на двоих
  if (isNet() && !net.isHost()) { net.send({ t: 'new' }); el.msg.textContent = 'Просим хоста раздать заново'; return; }
  S = readSettings(); dealGame(); render(); broadcast(); scheduleAI();
}

function totalCards() {
  let t = hands[0].length + hands[1].length + deck.length + discard.length;
  for (const e of table) t += 1 + (e.d ? 1 : 0);
  return t;
}

// --- состояние стола ---
function uncovered() { return table.map((e, i) => ({ e, i })).filter(x => x.e.d === null); }
function allUncovered() { return table.length > 0 && table.every(e => e.d === null); }
function tableRanks() { const s = new Set(); for (const e of table) { s.add(e.a.r); if (e.d) s.add(e.d.r); } return s; }
function transferRank() { if (!allUncovered()) return null; const r = table[0].a.r; return table.every(e => e.a.r === r) ? r : null; }
function transferLimit() { return S.transfer === 'double' ? 2 : S.transfer === 'single' ? 1 : 0; }

// --- действия ---
function canAttackCard(idx, card) {
  if (phase !== 'ATTACK' || attacker !== idx) return false;
  if (table.length === 0) return true;                 // первая карта — любая
  if (!S.podkidnoy) return false;                       // подкидывать нельзя
  if (table.length >= boutMax) return false;
  if (!table.every(e => e.d)) return false;             // подкидывать можно, когда всё отбито
  return tableRanks().has(card.r);
}
function doAttack(idx, card) {
  if (table.length === 0) boutMax = Math.min(6, hands[defender].length);
  removeCard(hands[idx], card);
  table.push({ a: card, d: null });
  phase = 'DEFEND';
}

function canTransfer(idx, card) {
  if (phase !== 'DEFEND' || defender !== idx) return false;
  if (transferLimit() === 0 || transferCount >= transferLimit()) return false;
  const tr = transferRank();
  if (tr === null || card.r !== tr) return false;
  // у нового защитника (текущего атакующего) должно хватить карт
  return hands[attacker].length >= table.length + 1;
}
function doTransfer(idx, card) {
  removeCard(hands[idx], card);
  table.push({ a: card, d: null });
  [attacker, defender] = [defender, attacker];
  transferCount++;
  /* Предел кона — это СКОЛЬКО КАРТ В РУКЕ у защитника, а не «карты на столе
     плюс рука». На каждую атаку, включая уже лежащие, он тратит по карте:
     считая стол отдельно, мы разрешали подкинуть больше, чем он в принципе
     способен отбить. Он честно бил всё до последней карты, а потом получал
     ещё одну атаку — и был вынужден взять весь стол вместо победы. */
  boutMax = Math.min(6, hands[defender].length);
  phase = 'DEFEND';
}

function coverTarget(card) { // индекс непокрытой атаки, которую бьёт card
  for (const { e, i } of uncovered()) if (beats(e.a, card, trump)) return i;
  return -1;
}
function doDefend(idx, card, ti) {
  removeCard(hands[idx], card);
  table[ti].d = card;
  if (uncovered().length === 0) phase = 'ATTACK';       // всё отбито — ход к атакующему
}

function doBito() { // атакующий закончил, всё отбито
  for (const e of table) { discard.push(e.a); if (e.d) discard.push(e.d); }
  table = [];
  drawUp([attacker, defender]);
  [attacker, defender] = [defender, attacker];
  phase = 'ATTACK'; transferCount = 0; boutMax = 0; bouts++;
  checkOver();
}
function doTake() {
  for (const e of table) { hands[defender].push(e.a); if (e.d) hands[defender].push(e.d); }
  table = [];
  drawUp([attacker, defender]);        // роли не меняются: взявший защищается снова
  phase = 'ATTACK'; transferCount = 0; boutMax = 0; bouts++;
  checkOver();
}

function drawUp(order) { for (const p of order) while (hands[p].length < 6 && deck.length) hands[p].push(deck.pop()); }
function removeCard(hand, card) { const i = hand.findIndex(c => c.r === card.r && c.s === card.s); if (i >= 0) hand.splice(i, 1); }

function checkOver() {
  if (bouts > 150) { over = true; overWinner = null; return; }   // страховка от вырожденного цикла
  if (deck.length === 0) {
    const a = hands[0].length === 0, b = hands[1].length === 0;
    if (a && b) { over = true; overWinner = null; }
    else if (a) { over = true; overWinner = 0; }
    else if (b) { over = true; overWinner = 1; }
  }
}
/* Итог каждый читает про себя: у соперника он зеркальный. Раньше строка
   была прибита к месту 0 — гость видел бы «ты выиграл», проиграв. */
function resultText() {
  if (!over) return '';
  if (overWinner === null) return '🤝 Ничья';
  return overWinner === mySeat ? ('🎉 Ты выиграл! ' + oppName() + ' — дурак') : '😕 Ты проиграл — ты дурак';
}

// --- ИИ (жадный) ---
function lowestBy(cards, keyFn) { let best = null; for (const c of cards) if (best === null || keyFn(c) < keyFn(best)) best = c; return best; }
function aiActFor(idx) {
  if (over) return;
  if (phase === 'ATTACK' && attacker === idx) {
    if (table.length === 0) {
      if (hands[idx].length === 0) { checkOver(); return; } // карт нет и стол пуст — партия окончена
      doAttack(idx, lowestBy(hands[idx], c => cardRank(c, trump))); return;
    }
    // стол не пуст и всё отбито: подкинуть или «Бито» (в т.ч. когда карт уже не осталось)
    const ranks = tableRanks();
    const cand = hands[idx].filter(c => ranks.has(c.r) && c.s !== trump);
    if (S.podkidnoy && cand.length && table.length < boutMax && table.every(e => e.d)) doAttack(idx, lowestBy(cand, c => c.r));
    else doBito();
  } else if (phase === 'DEFEND' && defender === idx) {
    // перевод?
    if (transferLimit() > 0 && transferCount < transferLimit() && allUncovered()) {
      const tr = transferRank();
      const trc = hands[idx].filter(c => c.r === tr && c.s !== trump);
      if (tr !== null && trc.length && hands[attacker].length >= table.length + 1 && hands[idx].length > 3) { doTransfer(idx, trc[0]); return; }
    }
    // если хоть одну непокрытую нечем бить — берём; иначе бьём первую минимальной картой
    const unc = uncovered();
    for (const u of unc) {
      if (!hands[idx].some(c => beats(u.e.a, c, trump))) { doTake(); return; }
    }
    const first = unc[0];
    const beatCards = hands[idx].filter(c => beats(first.e.a, c, trump));
    doDefend(idx, lowestBy(beatCards, c => cardRank(c, trump)), first.i);
  }
}

// --- ход игрока ---
// Гость сам ничего не меняет: он просит хоста. Правила проверяются на
// стороне хоста, поэтому подделать ход из консоли не выйдет.
function playerCard(card) {
  if (over || thinking) return;
  if (isNet() && !net.isHost()) { net.send({ t: 'card', c: card }); return; }
  seatCard(mySeat, card, true);
}
// карта должна РЕАЛЬНО лежать в руке: иначе гость присылает любую и играет
// её из воздуха — removeCard просто не находит её и молча ничего не удаляет
function hasCard(seat, card) {
  return !!card && hands[seat].some(c => c && c.r === card.r && c.s === card.s);
}
function seatCard(seat, card, loud) {
  if (over || !hasCard(seat, card)) return false;
  if (phase === 'ATTACK' && attacker === seat) {
    if (canAttackCard(seat, card)) { doAttack(seat, card); after(); return true; }
    if (loud) flash('Так походить нельзя');
    return false;
  }
  if (phase === 'DEFEND' && defender === seat) {
    if (canTransfer(seat, card)) { doTransfer(seat, card); after(); return true; }
    const ti = coverTarget(card);
    if (ti >= 0) { doDefend(seat, card, ti); after(); return true; }
    if (loud) flash('Эта карта не бьёт');
  }
  return false;
}
function seatBito(seat) { if (phase === 'ATTACK' && attacker === seat && table.length && table.every(e => e.d)) { doBito(); after(); } }
function seatTake(seat) { if (phase === 'DEFEND' && defender === seat) { doTake(); after(); } }
// после любого изменения: перерисовать, разослать, дать походить компьютеру
function after() { render(); broadcast(); if (!isNet()) scheduleAI(); }

function playerBito() {
  if (isNet() && !net.isHost()) { net.send({ t: 'bito' }); return; }
  seatBito(mySeat);
}
function playerTake() {
  if (isNet() && !net.isHost()) { net.send({ t: 'take' }); return; }
  seatTake(mySeat);
}
function playerPass() { playerBito(); }

// компьютер ходит, пока его очередь
function scheduleAI() {
  render();
  if (isNet() || over) return;      // онлайн второе место занимает живой человек
  const actor = phase === 'ATTACK' ? attacker : defender;
  if (actor === 1) {
    thinking = true;
    setTimeout(() => { aiActFor(1); thinking = false; scheduleAI(); }, 650);
  } else {
    thinking = false; render();
  }
}
function flash(t) { el.msg.textContent = t; setTimeout(render, 900); }

// --- отрисовка ---
function cardEl(c, opts) {
  opts = opts || {};
  const d = document.createElement('div');
  if (opts.back) { d.className = 'card back' + (opts.mini ? ' mini' : ''); return d; }
  d.className = 'card' + (RED[c.s] ? ' red' : '') + (opts.mini ? ' mini' : '') + (opts.dim ? ' dim' : '');
  const r = document.createElement('div'); r.className = 'r'; r.textContent = rlabel(c.r) + c.s;
  const s = document.createElement('div'); s.className = 's'; s.textContent = c.s;
  d.appendChild(r); d.appendChild(s);
  if (opts.onclick) d.addEventListener('click', opts.onclick);
  return d;
}
function sortHand(h) { return h.slice().sort((a, b) => cardRank(a, trump) - cardRank(b, trump)); }

function render() {
  if (!hands) return;
  el.deckCount.textContent = deck.length;
  el.trumpLbl.textContent = trumpCard ? (rlabel(trumpCard.r) + trumpCard.s) : '—';
  el.discardCount.textContent = discard.length;

  el.compHand.innerHTML = '';
  for (let i = 0; i < hands[oppSeat()].length; i++) el.compHand.appendChild(cardEl(null, { back: true, mini: true }));

  el.table.innerHTML = '';
  for (const e of table) {
    const p = document.createElement('div'); p.className = 'pair';
    p.appendChild(cardEl(e.a, {}));
    if (e.d) { const dc = cardEl(e.d, {}); dc.classList.add('d'); p.appendChild(dc); }
    el.table.appendChild(p);
  }

  const S0 = mySeat;
  const myTurn = !over && !thinking && ((phase === 'ATTACK' && attacker === S0) || (phase === 'DEFEND' && defender === S0));
  el.playerHand.classList.toggle('active', myTurn);
  el.playerHand.innerHTML = '';
  for (const c of sortHand(hands[S0])) {
    let ok = false;
    if (phase === 'ATTACK' && attacker === S0) ok = canAttackCard(S0, c);
    else if (phase === 'DEFEND' && defender === S0) ok = canTransfer(S0, c) || coverTarget(c) >= 0;
    el.playerHand.appendChild(cardEl(c, { dim: myTurn && !ok, onclick: () => playerCard(c) }));
  }

  // кнопки
  const atkDone = phase === 'ATTACK' && attacker === S0 && table.length && table.every(e => e.d);
  el.bitoBtn.hidden = !atkDone;
  el.passBtn.hidden = true;
  el.takeBtn.hidden = !(phase === 'DEFEND' && defender === S0);

  // сообщение
  const who = isNet() ? '🙂 ' + oppName() : '🤖 ' + oppName();
  if (over) el.msg.textContent = resultText();
  else if (isNet() && net.isHost() && !net.online) el.msg.textContent = 'Ждём второго игрока — код в панели выше';
  else if (thinking) el.msg.textContent = '🤖 Компьютер думает…';
  else if (phase === 'ATTACK' && attacker === S0) el.msg.textContent = table.length ? 'Подкинь карту или «Бито»' : 'Твой ход — атакуй';
  else if (phase === 'DEFEND' && defender === S0) el.msg.textContent = 'Отбивайся или «Взять»';
  else el.msg.textContent = (phase === 'ATTACK') ? (who + ' атакует') : (who + ' отбивается');
}

el.bitoBtn.addEventListener('click', playerBito);
el.takeBtn.addEventListener('click', playerTake);
document.getElementById('newGame').addEventListener('click', startGame);

document.getElementById('optPod').addEventListener('click', () => { modePod = !modePod; updateModeButtons(); });
document.getElementById('trNone').addEventListener('click', () => { modeTransfer = 'none'; updateModeButtons(); });
document.getElementById('trS').addEventListener('click', () => { modeTransfer = 'single'; updateModeButtons(); });
document.getElementById('trD').addEventListener('click', () => { modeTransfer = 'double'; updateModeButtons(); });
updateModeButtons();

/* =====================  ОНЛАЙН  ===================== */
function broadcast() {
  if (!isNet() || !net.isHost() || !hands) return;
  net.send({
    t: 'st',
    h: hands[1],                    // рука гостя — целиком, она его собственная
    oc: hands[0].length,            // а моих карт гость знает только ЧИСЛО
    tb: table, dk: deck.length, dc: discard.length, tc: trumpCard, tr: trump,
    at: attacker, df: defender, ph: phase, tcnt: transferCount, bm: boutMax,
    ov: over, ow: overWinner, st: S
  });
}

const net = NET.create({
  prefix: 'durak', max: 2,
  onOpen: () => { mySeat = 0; el.msg.textContent = 'Комната создана — дай другу код'; },
  onJoin: () => { startGame(); },                       // пришёл соперник — сразу свежая раздача
  onLeave: () => { el.msg.textContent = 'Соперник вышел'; },
  onWelcome: () => { mySeat = 1; el.msg.textContent = 'Ждём раздачу от хоста…'; },
  onClose: () => { el.msg.textContent = 'Хост вышел — партия окончена'; },
  onData: (m) => {
    if (net.isHost()) {
      if (m.t === 'card') seatCard(1, m.c, false);       // правила проверит seatCard
      else if (m.t === 'bito') seatBito(1);
      else if (m.t === 'take') seatTake(1);
      else if (m.t === 'new') startGame();
      return;
    }
    if (m.t !== 'st') return;
    hands = [new Array(m.oc).fill(null), m.h];           // чужая рука — просто «столько-то рубашек»
    table = m.tb; deck = new Array(m.dk).fill(null); discard = new Array(m.dc).fill(null);
    trumpCard = m.tc; trump = m.tr;
    attacker = m.at; defender = m.df; phase = m.ph; transferCount = m.tcnt; boutMax = m.bm;
    over = m.ov; overWinner = m.ow; S = m.st; thinking = false;
    render();
  }
});
NET.lobby(document.getElementById('netbar'), net);

el.msg.textContent = 'Настрой режим и жми «Новая игра»';
