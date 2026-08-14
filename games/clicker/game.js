// Определения улучшений.
// base — базовая цена, cps — печенек в секунду за штуку, click — прибавка к клику
const ITEMS = [
  { id: 'cursor',  emoji: '👆', name: 'Курсор',       desc: '+0.1/сек',  base: 15,      cps: 0.1,  click: 0 },
  { id: 'grandma', emoji: '👵', name: 'Бабушка',      desc: '+1/сек',    base: 100,     cps: 1,    click: 0 },
  { id: 'glove',   emoji: '🧤', name: 'Перчатка',     desc: '+1 за клик',base: 250,     cps: 0,    click: 1 },
  { id: 'farm',    emoji: '🌾', name: 'Ферма',        desc: '+8/сек',    base: 1100,    cps: 8,    click: 0 },
  { id: 'factory', emoji: '🏭', name: 'Фабрика',      desc: '+47/сек',   base: 12000,   cps: 47,   click: 0 },
  { id: 'bank',    emoji: '🏦', name: 'Банк',         desc: '+260/сек',  base: 130000,  cps: 260,  click: 0 },
  { id: 'temple',  emoji: '🏛️', name: 'Храм',         desc: '+1400/сек', base: 1400000, cps: 1400, click: 0 },
];

const SAVE_KEY = 'cookieClickerSave';

let state = {
  cookies: 0,
  owned: {},      // id -> количество
};

// восстановить сохранение
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state.cookies = s.cookies || 0;
      state.owned = s.owned || {};
    }
  } catch (e) { /* игнорируем битое сохранение */ }
  ITEMS.forEach(it => { if (state.owned[it.id] == null) state.owned[it.id] = 0; });
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

// цена растёт на 15% за каждую купленную штуку (как в оригинале)
function costOf(item) {
  return Math.ceil(item.base * Math.pow(1.15, state.owned[item.id]));
}

function perClick() {
  let bonus = 1;
  ITEMS.forEach(it => bonus += it.click * state.owned[it.id]);
  return bonus;
}

function perSecond() {
  let cps = 0;
  ITEMS.forEach(it => cps += it.cps * state.owned[it.id]);
  return cps;
}

// красивое форматирование больших чисел
function fmt(num) {
  if (num < 1000) return Number.isInteger(num) ? num : num.toFixed(1);
  const units = ['', ' тыс', ' млн', ' млрд', ' трлн'];
  let u = 0;
  while (num >= 1000 && u < units.length - 1) { num /= 1000; u++; }
  return num.toFixed(2) + units[u];
}

const countEl = document.getElementById('count');
const cpsEl = document.getElementById('cps');
const perClickEl = document.getElementById('perClick');
const shopEl = document.getElementById('shop');
const cookieEl = document.getElementById('cookie');

function buildShop() {
  shopEl.innerHTML = '';
  ITEMS.forEach(it => {
    const btn = document.createElement('button');
    btn.className = 'item';
    btn.id = 'item-' + it.id;
    btn.innerHTML = `
      <span class="emoji">${it.emoji}</span>
      <span class="info">
        <span class="name">${it.name}</span><br>
        <span class="desc">${it.desc}</span>
      </span>
      <span class="right">
        <div class="cost" id="cost-${it.id}"></div>
        <div class="owned" id="owned-${it.id}"></div>
      </span>`;
    btn.addEventListener('click', () => buy(it));
    shopEl.appendChild(btn);
  });
}

function buy(item) {
  const cost = costOf(item);
  if (state.cookies < cost) return;
  state.cookies -= cost;
  state.owned[item.id]++;
  updateUI();
  save();
}

function clickCookie(e) {
  const gain = perClick();
  state.cookies += gain;
  showFloat(e.clientX, e.clientY, '+' + fmt(gain));
  updateUI();
}

function showFloat(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = text;
  el.style.left = (x - 10) + 'px';
  el.style.top = (y - 20) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function updateUI() {
  countEl.textContent = fmt(Math.floor(state.cookies));
  cpsEl.textContent = fmt(perSecond());
  perClickEl.textContent = fmt(perClick());
  ITEMS.forEach(it => {
    const cost = costOf(it);
    document.getElementById('cost-' + it.id).textContent = '🍪 ' + fmt(cost);
    document.getElementById('owned-' + it.id).textContent = state.owned[it.id] || '';
    document.getElementById('item-' + it.id).disabled = state.cookies < cost;
  });
}

// игровой цикл: начисляем печеньки 10 раз в секунду
let last = null;
function loop(timestamp) {
  if (last === null) last = timestamp;
  const dt = (timestamp - last) / 1000;
  last = timestamp;
  state.cookies += perSecond() * dt;
  updateUI();
  requestAnimationFrame(loop);
}

function reset() {
  if (!confirm('Точно сбросить весь прогресс?')) return;
  state = { cookies: 0, owned: {} };
  ITEMS.forEach(it => state.owned[it.id] = 0);
  localStorage.removeItem(SAVE_KEY);
  updateUI();
}

// инициализация
load();
buildShop();
updateUI();
cookieEl.addEventListener('click', clickCookie);
document.getElementById('save').addEventListener('click', () => { save(); alert('Прогресс сохранён!'); });
document.getElementById('reset').addEventListener('click', reset);
// автосохранение каждые 15 секунд
setInterval(save, 15000);
requestAnimationFrame(loop);
