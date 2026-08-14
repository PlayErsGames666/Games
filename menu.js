const VW = 520, VH = 680; // виртуальный экран игры внутри превью

/* Виды игр. Порядок разделов на странице = порядок в этом списке.
   Карточки в разделах остаются ровно теми же, что и были: сортировка
   только раскладывает их по полкам, а не меняет вид. */
const CATS = [
  { id: 'arcade',   name: '🕹 Аркады и реакция' },
  { id: 'puzzle',   name: '🧩 Головоломки' },
  { id: 'cards',    name: '🃏 Карточные' },
  { id: 'survival', name: '🏕 Выживание' },
  { id: 'build',    name: '🏗 Строительство и стратегии' },
];

// net: true — есть сетевая игра по коду комнаты
const GAMES = [
  { file: 'games/saper/index.html',      emoji: '💣',  name: 'Сапёр',            guide: 'games/saper/управление.txt',      accent: '#ef233c', cat: 'puzzle' },
  { file: 'games/tictactoe/index.html',  emoji: '⭕',  name: 'Крестики-нолики',  guide: 'games/tictactoe/управление.txt',  accent: '#3a86ff', cat: 'puzzle',   net: true },
  { file: 'games/pyatnashki/index.html', emoji: '🔢',  name: 'Пятнашки',         guide: 'games/pyatnashki/управление.txt', accent: '#06d6a0', cat: 'puzzle' },
  { file: 'games/clicker/index.html',    emoji: '🍪',  name: 'Печенька-кликер',  guide: 'games/clicker/управление.txt',    accent: '#ffd166', cat: 'build' },
  { file: 'games/pong/index.html',       emoji: '🏓',  name: 'Pong',             guide: 'games/pong/управление.txt',       accent: '#06d6a0', cat: 'arcade',   net: true },
  { file: 'games/snake/index.html',      emoji: '🐍',  name: 'Змейка',           guide: 'games/snake/управление.txt',      accent: '#57cc7a', cat: 'arcade' },
  { file: 'games/flappy/index.html',     emoji: '🐤',  name: 'Flappy',           guide: 'games/flappy/управление.txt',     accent: '#ffd166', cat: 'arcade' },
  { file: 'games/invaders/index.html',   emoji: '👾',  name: 'Space Invaders',   guide: 'games/invaders/управление.txt',   accent: '#b388ff', cat: 'arcade' },
  { file: 'games/tetris/index.html',     emoji: '🧱',  name: 'Тетрис',           guide: 'games/tetris/управление.txt',     accent: '#4cc9f0', cat: 'puzzle' },
  { file: 'games/breakout/index.html',   emoji: '🕹️',  name: 'Арканоид',         guide: 'games/breakout/управление.txt',   accent: '#ff9f1c', cat: 'arcade' },
  { file: 'games/pacman/index.html',     emoji: '🟡',  name: 'Лабиринт',         guide: 'games/pacman/управление.txt',     accent: '#ffd166', cat: 'arcade' },
  { file: 'games/dino/index.html',       emoji: '🦕',  name: 'Динозаврик',       guide: 'games/dino/управление.txt',       accent: '#06d6a0', cat: 'arcade' },
  { file: 'games/timberman/index.html',  emoji: '🪓',  name: 'Timberman',        guide: 'games/timberman/управление.txt',  accent: '#2fbf71', cat: 'arcade' },
  { file: 'games/stack/index.html',      emoji: '🏗️',  name: 'Stack (Башня)',    guide: 'games/stack/управление.txt',      accent: '#4cc9f0', cat: 'arcade' },
  { file: 'games/copter/index.html',     emoji: '🚀',  name: 'Ракета в пещере',  guide: 'games/copter/управление.txt',     accent: '#ff9f1c', cat: 'arcade' },
  { file: 'games/blackjack/index.html',  emoji: '🃏',  name: 'Блекджек (21)',     guide: 'games/blackjack/управление.txt',  accent: '#06d6a0', cat: 'cards',    net: true },
  { file: 'games/durak/index.html',      emoji: '🎴',  name: 'Дурак',            guide: 'games/durak/управление.txt',      accent: '#ef476f', cat: 'cards',    net: true },
  { file: 'games/colony/index.html',     emoji: '🛰️',  name: 'Колония (выживание)', guide: 'games/colony/управление.txt',   accent: '#4cc9f0', cat: 'survival' },
  { file: 'games/survival/index.html',   emoji: '🌲',  name: 'Выживание (тайлы)', guide: 'games/survival/управление.txt',   accent: '#2fbf71', cat: 'survival', net: true },
  { file: 'games/raft/index.html',       emoji: '🛟',  name: 'Микро-Raft',       guide: 'games/raft/управление.txt',       accent: '#22b3d6', cat: 'survival', net: true },
  { file: 'games/zombie/index.html',     emoji: '🧟',  name: 'Тихий квартал',    guide: 'games/zombie/управление.txt',     accent: '#8ab547', cat: 'survival', net: true },
  { file: 'games/asteroid/index.html',   emoji: '☄️',  name: 'Дрейфующий астероид', guide: 'games/asteroid/управление.txt', accent: '#ff9f1c', cat: 'survival', net: true },
  { file: 'games/factory/index.html',    emoji: '🏭', name: 'Конвейер',         guide: 'games/factory/управление.txt',    accent: '#f2b134', cat: 'build' },
  { file: 'games/defense/index.html',    emoji: '🛡',  name: 'Рубеж',            guide: 'games/defense/управление.txt',    accent: '#ffb43a', cat: 'build' },
];

// на устройствах без наведения (телефоны/планшеты) включаем тап-режим
if (window.matchMedia('(hover: none)').matches || 'ontouchstart' in window) {
  document.body.classList.add('touch');
}

const sectionsBox = document.getElementById('sections');
const cards = [];
const sections = {};

// раздел на каждый вид игр + свои сетки внутри
for (const c of CATS) {
  const sec = document.createElement('section');
  sec.className = 'section';
  sec.dataset.cat = c.id;
  sec.innerHTML = `<h2>${c.name}</h2><div class="grid"></div>`;
  sectionsBox.appendChild(sec);
  sections[c.id] = sec;
}

GAMES.forEach(g => {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.cat = g.cat;
  card.dataset.net = g.net ? '1' : '0';
  card.style.setProperty('--accent', g.accent);
  card.innerHTML = `
    <iframe class="preview" title="Превью: ${g.name}" scrolling="no" tabindex="-1"></iframe>
    <div class="face">
      <div class="emoji">${g.emoji}</div>
      <div class="name">${g.name}</div>
    </div>
    <div class="caption">
      <span class="cname">${g.name}${g.net ? '<span class="net" title="Есть игра по сети">🌐</span>' : ''}</span>
      <a class="play" href="${g.file}">Играть ▶</a>
    </div>
    <a class="playlink" href="${g.file}" aria-label="Играть в ${g.name}"></a>
    <a class="guide" href="${g.guide}" target="_blank" rel="noopener" title="Управление: ${g.name}">📖</a>
  `;

  const iframe = card.querySelector('.preview');
  const load = () => { if (!iframe.getAttribute('src')) iframe.setAttribute('src', g.file); };
  const unload = () => iframe.removeAttribute('src'); // останавливаем игру-превью, экономим ресурсы

  // десктоп: превью по наведению курсора
  card.addEventListener('mouseenter', load);
  card.addEventListener('mouseleave', unload);

  // тач: первый тап раскрывает превью, ссылки «Играть»/«📖» работают как обычно
  card.addEventListener('click', (e) => {
    if (!document.body.classList.contains('touch')) return;   // на десктопе — обычные ссылки
    if (e.target.closest('a.play, a.guide')) return;          // тап по ссылке = переход в игру/гайд
    e.preventDefault();
    const active = card.classList.contains('active');
    // закрываем остальные карточки и выгружаем их превью
    cards.forEach(c => {
      if (c !== card) { c.classList.remove('active'); c.querySelector('.preview').removeAttribute('src'); }
    });
    if (active) { card.classList.remove('active'); unload(); }
    else { card.classList.add('active'); load(); }
  });

  (sections[g.cat] || sections[CATS[0].id]).querySelector('.grid').appendChild(card);
  cards.push(card);
});

/* Кнопки-фильтры. «Все» показывает всё, вид — только свой раздел,
   🌐 — все сетевые из всех разделов сразу. */
const FILTERS = [{ id: 'all', name: 'Все' }]
  .concat(CATS.map(c => ({ id: c.id, name: c.name })))
  .concat([{ id: 'net', name: '🌐 По сети' }]);

const filtersBox = document.getElementById('filters');
let active = 'all';

function count(id) {
  if (id === 'all') return GAMES.length;
  if (id === 'net') return GAMES.filter(g => g.net).length;
  return GAMES.filter(g => g.cat === id).length;
}
function applyFilter(id) {
  active = id;
  for (const btn of filtersBox.children) btn.classList.toggle('on', btn.dataset.id === id);
  for (const c of CATS) {
    const sec = sections[c.id];
    let shown = 0;
    for (const card of sec.querySelectorAll('.card')) {
      const ok = id === 'all' ? true : id === 'net' ? card.dataset.net === '1' : card.dataset.cat === id;
      card.hidden = !ok;
      // превью скрытой карточки выгружаем: незачем крутить невидимую игру
      if (!ok) card.querySelector('.preview').removeAttribute('src');
      if (ok) shown++;
    }
    sec.hidden = shown === 0;
  }
  fitPreviews();
}
FILTERS.forEach(f => {
  const b = document.createElement('button');
  b.dataset.id = f.id;
  b.innerHTML = f.name + '<span class="n">' + count(f.id) + '</span>';
  b.addEventListener('click', () => { b.blur(); applyFilter(f.id); });
  filtersBox.appendChild(b);
});
applyFilter('all');

// подбираем масштаб превью так, чтобы виртуальный экран игры заполнял карточку (cover)
function fitPreviews() {
  for (const card of cards) {
    const w = card.clientWidth, h = card.clientHeight;
    if (!w || !h) continue;
    const k = Math.max(w / VW, h / VH); // cover: заполняем карточку без пустот
    card.style.setProperty('--k', k.toFixed(4));
  }
}

window.addEventListener('load', fitPreviews);
window.addEventListener('resize', fitPreviews);
fitPreviews();
