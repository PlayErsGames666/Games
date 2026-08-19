const KEYS = ['food', 'money', 'security', 'energy'];
const META = { food: { i: '🍞', n: 'Еда' }, money: { i: '💰', n: 'Деньги' }, security: { i: '🛡️', n: 'Защита' }, energy: { i: '⚡', n: 'Энергия' } };
const DEATH = {
  food: { lo: '🍽️ ГОЛОД. Запасы кончились — колония вымерла.', hi: '🐀 ГНИЛЬ. Переполненные склады, крысы и эпидемии выкосили колонию.' },
  money: { lo: '💸 БАНКРОТСТВО. Платить нечем — колонию распустили.', hi: '🤑 РАСКОЛ. Народ восстал против жиреющей верхушки.' },
  security: { lo: '🔓 ХАОС. Мародёры захватили станцию.', hi: '⛓️ ТИРАНИЯ. Против вашей диктатуры вспыхнул мятеж.' },
  energy: { lo: '🔌 ТЬМА. Реакторы встали — станция замёрзла.', hi: '☢️ ПЕРЕГРУЗКА. Реактор пошёл вразнос — станция взорвалась.' },
};

const DECK = [
  { icon: '👷', who: 'Главный инженер', text: 'Реактор перегревается. Сбросить мощность?', l: { t: 'Пусть жарит', e: { energy: 8, security: -8 } }, r: { t: 'Сбросить', e: { energy: -8, money: -4 } } },
  { icon: '👩‍🌾', who: 'Агроном', text: 'Гидропоника барахлит. Закупить семена у торговцев?', l: { t: 'Обойдёмся', e: { food: -10 } }, r: { t: 'Закупить', e: { food: 14, money: -12 } } },
  { icon: '🛡️', who: 'Начальник охраны', text: 'Поймали вора на складе. Казнить в назидание?', l: { t: 'Простить', e: { security: -6, food: 2 } }, r: { t: 'Казнить', e: { security: 10, food: -2 } } },
  { icon: '🧑‍🚀', who: 'Колонисты', text: 'Люди вымотаны. Устроить праздник?', l: { t: 'Работать!', e: { security: -8, money: 6 } }, r: { t: 'Праздник', e: { food: -8, money: -6, security: 10 } } },
  { icon: '🤖', who: 'ИИ станции', text: 'Астероид с рудой рядом. Отправить шаттл?', l: { t: 'Рискованно', e: {} }, r: { t: 'Добыть', e: { money: 16, energy: -10, security: -4 } } },
  { icon: '🩺', who: 'Врач', text: 'Вспышка болезни. Ввести карантин?', l: { t: 'Как обычно', e: { food: 4, security: -10 } }, r: { t: 'Карантин', e: { money: -8, security: 8, food: -4 } } },
  { icon: '👽', who: 'Пришелец-торговец', text: 'Продам энергоядро. Дорого.', l: { t: 'Отказать', e: {} }, r: { t: 'Купить', e: { energy: 18, money: -16 } } },
  { icon: '🧑‍🔧', who: 'Механик', text: 'Скафандры изношены. Купить новые?', l: { t: 'Латать', e: { security: -8 } }, r: { t: 'Купить', e: { security: 8, money: -10 } } },
  { icon: '📡', who: 'Связист', text: 'Ловим пиратский сигнал. Ответить?', l: { t: 'Игнор', e: { security: -4 } }, r: { t: 'Ответить', e: { money: 10, security: -8 } } },
  { icon: '🍺', who: 'Бармен', text: 'Синтезировать алкоголь для колонистов?', l: { t: 'Сухой закон', e: { security: -6 } }, r: { t: 'Наливай', e: { food: -6, security: 8, money: 4 } } },
  { icon: '⚙️', who: 'ИИ станции', text: 'Оптимизировать сеть, отключив часть кают?', l: { t: 'Не трогать', e: {} }, r: { t: 'Отключить', e: { energy: 12, security: -6 } } },
  { icon: '🌾', who: 'Агроном', text: 'Новый штамм водорослей: еды больше, но воняет.', l: { t: 'Классика', e: {} }, r: { t: 'Внедрить', e: { food: 14, security: -6 } } },
  { icon: '💰', who: 'Инвестор', text: 'Вложитесь в мою шахту — вернётся вдвое… наверное.', l: { t: 'Пас', e: {} }, r: { t: 'Вложиться', e: { money: -14, energy: 4 } } },
  { icon: '🚨', who: 'Охрана', text: 'Бунт на нижней палубе!', l: { t: 'Подавить', e: { security: 10, food: -8, energy: -4 } }, r: { t: 'Уступить', e: { money: -10, security: -4, food: 6 } } },
  { icon: '🛰️', who: 'Диспетчер', text: 'Стыкуется корабль беженцев. Впустить?', l: { t: 'Закрыть шлюз', e: { security: 4, food: 2 } }, r: { t: 'Впустить', e: { food: -12, money: -6, security: -2 } } },
  { icon: '🔋', who: 'Инженер', text: 'Продать излишки энергии соседям?', l: { t: 'Оставить', e: {} }, r: { t: 'Продать', e: { energy: -12, money: 14 } } },
  { icon: '🧬', who: 'Учёный', text: 'Опасный опыт с реактором обещает прорыв.', l: { t: 'Запретить', e: {} }, r: { t: 'Разрешить', e: { energy: 16, security: -10, money: -4 } } },
  { icon: '🧑‍🚀', who: 'Колонисты', text: 'Требуем повышения пайка!', l: { t: 'Отказать', e: { security: -8, food: 6 } }, r: { t: 'Повысить', e: { food: -10, security: 8 } } },
  { icon: '👮', who: 'Охрана', text: 'Установить камеры повсюду?', l: { t: 'Приватность', e: { security: -6 } }, r: { t: 'Слежка', e: { security: 12, energy: -4, money: -4 } } },
  { icon: '🪙', who: 'Контрабандист', text: 'Дешёвый товар, но незаконный.', l: { t: 'Честно', e: { money: -4 } }, r: { t: 'Взять партию', e: { money: 16, security: -10 } } },
  { icon: '🌡️', who: 'ИИ станции', text: 'Сбой климата. Пустить энергию на обогрев?', l: { t: 'Потерпят', e: { security: -8, food: -4 } }, r: { t: 'Обогрев', e: { energy: -10, security: 6 } } },
  { icon: '🛠️', who: 'Механик', text: 'Разобрать старый шаттл на запчасти?', l: { t: 'Сохранить', e: {} }, r: { t: 'Разобрать', e: { money: 10, security: -4, energy: 4 } } },
  { icon: '🐄', who: 'Фермер', text: 'Завести живность на ферме?', l: { t: 'Только водоросли', e: {} }, r: { t: 'Завести скот', e: { food: 12, energy: -6, money: -6 } } },
  { icon: '📉', who: 'Казначей', text: 'Казна тает. Ввести налог на колонистов?', l: { t: 'Не давить', e: {} }, r: { t: 'Налог', e: { money: 14, security: -10 } } },
  { icon: '🤖', who: 'ИИ станции', text: 'Передайте мне оборону станции. Доверитесь?', l: { t: 'Ни за что', e: { security: -4 } }, r: { t: 'Доверить', e: { security: 14, energy: -8, money: -2 } } },
  { icon: '🧯', who: 'Спасатель', text: 'Учения по эвакуации? Отвлекут от работы.', l: { t: 'Некогда', e: { security: -6 } }, r: { t: 'Провести', e: { security: 8, money: -4, energy: -2 } } },
  { icon: '🍄', who: 'Биолог', text: 'Грибная ферма на отходах — еда даром, но риск спор.', l: { t: 'Опасно', e: {} }, r: { t: 'Запустить', e: { food: 12, security: -6 } } },
  { icon: '💤', who: 'Врач', text: 'Колонисты недосыпают. Сократить смены?', l: { t: 'Больше работы', e: { money: 8, security: -6 } }, r: { t: 'Сократить', e: { money: -6, security: 8, food: -2 } } },
  { icon: '🛢️', who: 'Инженер', text: 'Топливо на исходе. Экспедиция за льдом на комету?', l: { t: 'Ждать', e: { energy: -8 } }, r: { t: 'Экспедиция', e: { energy: 16, money: -8, security: -4 } } },
  { icon: '🎰', who: 'Колонист', text: 'Открыть подпольное казино для развлечения?', l: { t: 'Запретить', e: { security: 4 } }, r: { t: 'Разрешить', e: { money: 10, security: -8, food: -2 } } },
];

const el = {
  day: document.getElementById('day'), best: document.getElementById('best'), stats: document.getElementById('stats'),
  card: document.getElementById('card'), over: document.getElementById('over'), choices: document.getElementById('choices'),
  left: document.getElementById('left'), right: document.getElementById('right'),
};

let stats, day, best, current, over, recent, fills = {}, arrows = {};

best = parseInt(localStorage.getItem('colonyBest') || '0', 10);

function buildStats() {
  el.stats.innerHTML = '';
  for (const k of KEYS) {
    const w = document.createElement('div'); w.className = 'stat';
    const ar = document.createElement('div'); ar.className = 'arrow'; ar.innerHTML = '&nbsp;'; arrows[k] = ar;
    const ic = document.createElement('div'); ic.className = 'ico'; ic.textContent = META[k].i;
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('div'); fill.className = 'fill'; fills[k] = fill;
    bar.appendChild(fill); w.appendChild(ar); w.appendChild(ic); w.appendChild(bar); el.stats.appendChild(w);
  }
}

function reset() {
  stats = { food: 50, money: 50, security: 50, energy: 50 };
  day = 1; over = false; recent = [];
  el.over.hidden = true; el.choices.style.display = 'flex'; el.card.style.display = 'flex';
  el.best.textContent = best;
  pickNext(); render();
}

function pickNext() {
  const pool = DECK.filter(c => !recent.includes(c));
  current = (pool.length ? pool : DECK)[Math.floor(Math.random() * (pool.length ? pool.length : DECK.length))];
  recent.push(current); if (recent.length > 6) recent.shift();
}

function applyChoice(side) {
  if (over) return;
  const e = current[side === 'left' ? 'l' : 'r'].e || {};
  let deadKey = null, deadHi = false;
  for (const k of KEYS) {
    const v = stats[k] + (e[k] || 0);
    if (v <= 0 && !deadKey) { deadKey = k; deadHi = false; }
    if (v >= 100 && !deadKey) { deadKey = k; deadHi = true; }
    stats[k] = Math.max(0, Math.min(100, v));
  }
  if (deadKey) { endGame(deadKey, deadHi); return; }
  day++;
  if (day - 1 > best) { best = day - 1; localStorage.setItem('colonyBest', String(best)); }
  pickNext(); render();
}

function endGame(key, hi) {
  over = true;
  const survived = day - 1;
  if (survived > best) { best = survived; localStorage.setItem('colonyBest', String(best)); }
  el.best.textContent = best;
  el.card.style.display = 'none'; el.choices.style.display = 'none';
  el.over.hidden = false;
  el.over.innerHTML = '<div class="cause">' + DEATH[key][hi ? 'hi' : 'lo'] + '</div>' +
    '<div class="days">Колония продержалась ' + survived + ' дн. · рекорд ' + best + '</div>' +
    '<button id="againBtn" class="restart">Начать заново</button>';
  document.getElementById('againBtn').addEventListener('click', reset);
}

function fillColor(v) { const danger = Math.abs(v - 50) / 50; const h = 120 - danger * 120; return 'hsl(' + h + ',70%,50%)'; }

function render() {
  el.day.textContent = day;
  for (const k of KEYS) { fills[k].style.width = stats[k] + '%'; fills[k].style.background = fillColor(stats[k]); arrows[k].innerHTML = '&nbsp;'; }
  if (over || !current) return;
  el.card.innerHTML = '<div class="icon">' + current.icon + '</div><div class="who">' + current.who + '</div><div class="text">' + current.text + '</div>';
  el.left.textContent = '◀ ' + current.l.t;
  el.right.textContent = current.r.t + ' ▶';
}

function preview(side, on) {
  if (over || !current) return;
  const e = current[side === 'left' ? 'l' : 'r'].e || {};
  for (const k of KEYS) {
    if (!on || !e[k]) { arrows[k].innerHTML = '&nbsp;'; continue; }
    arrows[k].textContent = e[k] > 0 ? '▲' : '▼';
    arrows[k].style.color = e[k] > 0 ? '#2dbe69' : '#d8645a';
  }
}

el.left.addEventListener('click', () => applyChoice('left'));
el.right.addEventListener('click', () => applyChoice('right'));
el.left.addEventListener('mouseenter', () => preview('left', true));
el.left.addEventListener('mouseleave', () => preview('left', false));
el.right.addEventListener('mouseenter', () => preview('right', true));
el.right.addEventListener('mouseleave', () => preview('right', false));
document.getElementById('restart').addEventListener('click', reset);
document.addEventListener('keydown', (e) => {
  if (over) { if (e.key === 'Enter') reset(); return; }
  if (e.key === 'ArrowLeft') applyChoice('left');
  else if (e.key === 'ArrowRight') applyChoice('right');
});

buildStats();
reset();
