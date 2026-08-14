/* =======================================================================
   ВЕДЬМАЧИЙ КОНТРАКТ — action-RPG про снаряжение.

   Смысл не в том, чтобы быстро кликать, а в том, ЧЕМ ты вышел на тварь:
   тот ли меч, тот ли доспех, хватило ли болтов и не потащил ли лишнего.
   Между контрактами — костёр: инвентарь, верстак, торговля.
   ======================================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CW = canvas.width, CH = canvas.height;

// границы поля боя внутри канваса: сверху шкалы, снизу пояс
const WX0 = 8, WY0 = 58, WX1 = CW - 8, WY1 = CH - 84;
const WW = WX1 - WX0, WH = WY1 - WY0;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = n => Math.random() * n;
const ri = n => Math.floor(Math.random() * n);
const pick = a => a[ri(a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* =====================  СПРАВОЧНИКИ  ===================== */

// Ступени качества — общие и для мечей, и для доспехов
const TIERS = [
  { n: 'обычный',      m: 1.00, c: '#9aa3ad' },
  { n: 'улучшенный',   m: 1.30, c: '#7fb0d8' },
  { n: 'отличный',     m: 1.65, c: '#7fd6a0' },
  { n: 'мастерский',   m: 2.05, c: '#c9a0ff' },
  { n: 'гроссмейстер', m: 2.50, c: '#f2b134' },
];

// Зачарования. Одно на предмет, вешается на верстаке.
const ENCH = {
  thorns: { n: 'Шипы',      ico: '🌵', desc: 'враг получает 25% своего урона назад' },
  vamp:   { n: 'Кровосос',  ico: '🩸', desc: '12% нанесённого урона — тебе в здоровье' },
  ward:   { n: 'Оберег',    ico: '🔮', desc: 'энергия восстанавливается в полтора раза быстрее' },
  flame:  { n: 'Пламя',     ico: '🔥', desc: 'удары поджигают' },
  frost:  { n: 'Стужа',     ico: '❄',  desc: 'удары замедляют' },
  greed:  { n: 'Мздоимец',  ico: '💰', desc: '+30% золота с добычи' },
};
const ENCH_KEYS = Object.keys(ENCH);

// Мечи. Серебро — против нечисти, сталь — против людей и зверья.
const SWORD = {
  steel:  { n: 'Стальной меч',    ico: '🗡', dmg: 17, w: 3.4, fam: 'mortal',  c: '#cfd6de' },
  silver: { n: 'Серебряный меч',  ico: '⚔',  dmg: 16, w: 3.0, fam: 'monster', c: '#a8c6e8' },
};
const HIT_RIGHT = 2.0;    // тем мечом
const HIT_WRONG = 0.45;   // не тем мечом

// Доспехи: тип решает не только броню, но и повадку
const ARMOR = {
  light:  { n: 'Лёгкий доспех',  ico: '🥋', def: 5,  w: 6,  spd: 1.18, mpr: 1.55, c: '#9ad9a0',
            bon: 'быстрее ходишь, энергия копится вдвое охотнее' },
  medium: { n: 'Средний доспех',  ico: '🦺', def: 10, w: 13, spd: 1.06, mpr: 1.25, c: '#d8c07a',
            bon: 'ровно посередине: и броня есть, и ноги ходят' },
  heavy:  { n: 'Тяжёлый доспех',  ico: '🛡', def: 17, w: 23, spd: 0.86, mpr: 1.00, c: '#b8b8c4',
            bon: 'держит удар и не даёт себя отбросить, но тяжёлый' },
};

// Зелья. Каждое травит: токсичность — вторая цена любого глотка.
const POTIONS = {
  swallow: { n: 'Ласточка',     ico: '🧪', c: '#7fd6a0', tox: 18, w: 0.4, price: 40, desc: 'заживляет 45 здоровья за 8 секунд' },
  thunder: { n: 'Гром',         ico: '⚗',  c: '#ff7a5a', tox: 22, w: 0.4, price: 55, desc: '+45% урона на 20 секунд' },
  honey:   { n: 'Белый мёд',    ico: '🍯', c: '#ffd166', tox: -70, w: 0.3, price: 35, desc: 'вычищает токсичность' },
  shit:    { n: 'Зелье гавна',  ico: '💩', c: '#8a6a3a', tox: 30, w: 0.6, price: 90, desc: '12 секунд ты БИЗНЕСМЭН: вместо меча договоры, золота втрое, брони вдвое меньше' },
};

// Материалы и припасы
const STUFF = {
  bolt:    { n: 'Болты',     ico: '➶', w: 0.05, price: 2,  desc: 'снаряды для арбалета' },
  ore:     { n: 'Руда',      ico: '⛏', w: 1.0,  price: 14, desc: 'на улучшение мечей' },
  hide:    { n: 'Шкура',     ico: '🧵', w: 0.8,  price: 12, desc: 'на улучшение доспехов' },
  essence: { n: 'Эссенция',  ico: '✨', w: 0.2,  price: 30, desc: 'на зачарование' },
};

// Руны (знаки). Тратят энергию.
const RUNES = [
  { k: 'igni',  n: 'Игни',  ico: '🔥', mp: 20, cd: 1.1, desc: 'конус огня, поджигает' },
  { k: 'aard',  n: 'Аард',  ico: '💫', mp: 18, cd: 0.9, desc: 'толчок, сбивает с ног' },
  { k: 'quen',  n: 'Квен',  ico: '🛡', mp: 26, cd: 3.5, desc: 'щит поглощает урон' },
  { k: 'yrden', n: 'Ирден', ico: '🧿', mp: 22, cd: 4.5, desc: 'ловушка, замедляет' },
];

// Бестиарий. fam решает, каким мечом бить.
const FOES = {
  drowner: { n: 'Утопец',    ico: '🧟', fam: 'monster', hp: 46,  sp: 42, dmg: 9,  r: 10, atk: 1.0, reach: 22 },
  nekker:  { n: 'Накер',     ico: '👺', fam: 'monster', hp: 30,  sp: 64, dmg: 7,  r: 8,  atk: 0.8, reach: 19 },
  wolfen:  { n: 'Волколак',  ico: '🐺', fam: 'monster', hp: 78,  sp: 76, dmg: 15, r: 11, atk: 0.9, reach: 23 },
  leshy:   { n: 'Лешак',     ico: '👹', fam: 'monster', hp: 190, sp: 36, dmg: 22, r: 15, atk: 1.5, reach: 30, boss: true },
  bandit:  { n: 'Бандит',    ico: '🗡', fam: 'mortal',  hp: 42,  sp: 58, dmg: 10, r: 9,  atk: 0.9, reach: 21 },
  archer:  { n: 'Лучник',    ico: '🏹', fam: 'mortal',  hp: 28,  sp: 52, dmg: 9,  r: 9,  atk: 1.7, reach: 210, ranged: true },
  merc:    { n: 'Наёмник',   ico: '🛡', fam: 'mortal',  hp: 88,  sp: 46, dmg: 16, r: 11, atk: 1.1, reach: 23, armor: 7 },
  boar:    { n: 'Кабан',     ico: '🐗', fam: 'mortal',  hp: 58,  sp: 84, dmg: 14, r: 10, atk: 1.0, reach: 21 },
};

/* Контракты. Первые заданы вручную, дальше плодятся сами — но чередование
   «нечисть / люди» сохраняется, иначе один меч так и пролежит в ножнах. */
const CONTRACTS = [
  { t: 'Утопцы у брода',      pool: ['drowner'],                   n: 5,  gold: 70 },
  { t: 'Разбойники на тракте',pool: ['bandit', 'bandit', 'archer'],n: 6,  gold: 90 },
  { t: 'Накеры в кургане',    pool: ['nekker', 'nekker', 'drowner'],n: 8, gold: 120 },
  { t: 'Кабанья потрава',     pool: ['boar', 'boar', 'bandit'],    n: 8,  gold: 140 },
  { t: 'Волколак в чаще',     pool: ['wolfen', 'nekker'],          n: 7,  gold: 190 },
  { t: 'Наёмники барона',     pool: ['merc', 'archer', 'bandit'],  n: 9,  gold: 220 },
  { t: 'Гнездо нечисти',      pool: ['drowner', 'nekker', 'wolfen'],n: 11,gold: 280 },
  { t: 'ЛЕШАК',               pool: ['leshy', 'nekker', 'nekker'], n: 8,  gold: 400 },
];

/* =====================  СОСТОЯНИЕ  ===================== */

let P, foes, drops, shots, parts, obst, inv, gold, contract, ci, phase, over, cause;
let killsLeft, msg, msgT, panel, uiHit = [], anim = 0, lastFrame = null, paused = false;
let keys = {}, mouse = { x: CW / 2, y: 300, down: false }, best = 0;
let floaties = [];
let bagScroll = 0, benchScroll = 0;      // прокрутка списков в сумке и на верстаке

try { best = +localStorage.getItem('witcher_best') || 0; } catch (e) { best = 0; }

let nextId = 1;
function mkSword(metal, tier, ench) { return { k: 'sword', metal, tier: tier | 0, ench: ench || null, id: nextId++ }; }
function mkArmor(type, tier, ench) { return { k: 'armor', type, tier: tier | 0, ench: ench || null, id: nextId++ }; }
function mkStack(id, n) { return { k: 'stack', id, n, uid: nextId++ }; }

/* =====================  ПРЕДМЕТЫ: ВЕС, ЦЕНА, ИМЯ  ===================== */

function itemWeight(it) {
  if (it.k === 'sword') return SWORD[it.metal].w;
  if (it.k === 'armor') return ARMOR[it.type].w;
  const s = POTIONS[it.id] || STUFF[it.id];
  return (s ? s.w : 0) * it.n;
}
function itemName(it) {
  if (it.k === 'sword') return SWORD[it.metal].n;
  if (it.k === 'armor') return ARMOR[it.type].n;
  return (POTIONS[it.id] || STUFF[it.id]).n;
}
function itemIco(it) {
  if (it.k === 'sword') return SWORD[it.metal].ico;
  if (it.k === 'armor') return ARMOR[it.type].ico;
  return (POTIONS[it.id] || STUFF[it.id]).ico;
}
function itemPrice(it) {
  if (it.k === 'sword') return Math.round(SWORD[it.metal].dmg * 4 * TIERS[it.tier].m * (it.ench ? 1.6 : 1));
  if (it.k === 'armor') return Math.round(ARMOR[it.type].def * 7 * TIERS[it.tier].m * (it.ench ? 1.6 : 1));
  return (POTIONS[it.id] || STUFF[it.id]).price * it.n;
}
function carried() {
  let w = 0;
  for (const it of inv) w += itemWeight(it);
  for (const s of [P.steel, P.silver, P.armor]) if (s) w += itemWeight(s);
  return w;
}
function capacity() { return 70; }
// перегруз: до предела — ничего, дальше вязнешь, а увернуться уже нельзя
function loadState() {
  const c = carried(), cap = capacity();
  if (c <= cap) return { mul: 1, dodge: true, lvl: 0 };
  if (c <= cap * 1.3) return { mul: 0.78, dodge: false, lvl: 1 };
  return { mul: 0.5, dodge: false, lvl: 2 };
}

/* =====================  ХАРАКТЕРИСТИКИ  ===================== */

function activeSword() { return P.hand === 'silver' ? P.silver : P.steel; }
function swordDamage(sw, fam) {
  if (!sw) return 4;                                   // голыми руками
  const base = SWORD[sw.metal].dmg * TIERS[sw.tier].m;
  const match = SWORD[sw.metal].fam === fam ? HIT_RIGHT : HIT_WRONG;
  let d = base * match;
  if (P.mut > 0) d *= 2.2;
  if (P.buffThunder > 0) d *= 1.45;
  return d;
}
function armorDef() {
  if (!P.armor) return 0;
  let d = ARMOR[P.armor.type].def * TIERS[P.armor.tier].m;
  if (P.biz > 0) d *= 0.5;                             // бизнесмэну броня не по чину
  return d;
}
function damageTaken(raw) {
  const d = armorDef();
  let out = raw * (1 - d / (d + 42));                  // броня режет долю, а не «минус N»
  if (P.mut > 0) out *= 1.4;                           // в мутации сам стеклянный
  return Math.max(1, out);
}
function moveSpeed() {
  let s = 112;
  if (P.armor) s *= ARMOR[P.armor.type].spd;
  s *= loadState().mul;
  if (P.mut > 0) s *= 1.12;
  if (P.slow > 0) s *= 0.55;
  return s;
}
function mpRegen() {
  let r = 7;
  if (P.armor) r *= ARMOR[P.armor.type].mpr;
  if (hasEnch('ward')) r *= 1.5;
  return r;
}
function hasEnch(key) {
  for (const s of [P.steel, P.silver, P.armor]) if (s && s.ench === key) return true;
  return false;
}
function maxHP() { return 100 + (P.armor ? ARMOR[P.armor.type].def * 2 : 0); }
function maxMP() { return 100; }

/* =====================  ИНВЕНТАРЬ  ===================== */

function addStack(id, n) {
  const ex = inv.find(i => i.k === 'stack' && i.id === id);
  if (ex) { ex.n += n; return ex; }
  const it = mkStack(id, n); inv.push(it); return it;
}
function countStack(id) { const e = inv.find(i => i.k === 'stack' && i.id === id); return e ? e.n : 0; }
function useStack(id, n) {
  const e = inv.find(i => i.k === 'stack' && i.id === id);
  if (!e || e.n < n) return false;
  e.n -= n; if (e.n <= 0) inv.splice(inv.indexOf(e), 1);
  return true;
}
function addItem(it) { inv.push(it); }
function dropItem(it) {
  const i = inv.indexOf(it); if (i < 0) return;
  inv.splice(i, 1);
  drops.push({ x: P.x + rnd(24) - 12, y: P.y + rnd(24) - 12, it, t: 0 });
  message('Выбросил: ' + itemName(it));
}

/* Надеть. Меч встаёт в свой слот по металлу, снятое падает в сумку. */
function equip(it) {
  if (it.k === 'sword') {
    const slot = it.metal;
    const old = slot === 'steel' ? P.steel : P.silver;
    inv.splice(inv.indexOf(it), 1);
    if (slot === 'steel') P.steel = it; else P.silver = it;
    if (old) inv.push(old);
    message('Взял в руку: ' + fullName(it));
  } else if (it.k === 'armor') {
    const old = P.armor;
    inv.splice(inv.indexOf(it), 1);
    P.armor = it;
    if (old) inv.push(old);
    P.hp = Math.min(P.hp, maxHP());
    message('Надел: ' + fullName(it));
  }
}
function fullName(it) {
  if (it.k === 'stack') return itemName(it) + ' ×' + it.n;
  let s = TIERS[it.tier].n + ' ' + itemName(it).toLowerCase();
  if (it.ench) s += ' (' + ENCH[it.ench].n + ')';
  return s;
}

/* =====================  ЗЕЛЬЯ И ТОКСИЧНОСТЬ  ===================== */

function drink(id) {
  if (!useStack(id, 1)) { message('Нет такого зелья'); return; }
  const p = POTIONS[id];
  P.tox = clamp(P.tox + p.tox, 0, 100);
  if (id === 'swallow') P.regen = 8;
  if (id === 'thunder') P.buffThunder = 20;
  if (id === 'shit') { P.biz = 12; message('💼 Деловое предложение! Мечи в сторону — работаем.'); }
  else message('Выпил: ' + p.n + (p.tox > 0 ? ' (токсичность +' + p.tox + ')' : ''));
}

/* =====================  БОЙ  ===================== */

/* Куда смотрит ведьмак. Считаем ТОЛЬКО когда курсор над полем: иначе,
   потянувшись мышью к поясу, он разворачивался вниз — и руна, пущенная
   кнопкой, уходила в землю вместо врага. Наводка запоминается в P.face,
   и удары с рунами берут её, а не сиюминутное положение курсора. */
function mouseInWorld() { return mouse.x > WX0 && mouse.x < WX1 && mouse.y > WY0 && mouse.y < WY1; }
function faceAim() { return P.face; }

function swing() {
  if (P.atkCd > 0 || P.dodge > 0) return;
  // бизнесмэн не машет железом — он заключает договоры
  if (P.biz > 0) { throwContract(); return; }
  P.atkCd = 0.42;
  P.swing = { t: 0, a: faceAim(), hit: new Set() };
}
function throwContract() {
  P.atkCd = 0.34;
  const a = faceAim();
  shots.push({ x: P.x, y: P.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: 26, mine: true, kind: 'paper', life: 1.6 });
}
function shootBolt() {
  if (P.boltCd > 0 || P.dodge > 0) return;
  if (!useStack('bolt', 1)) { message('Болты кончились'); P.boltCd = 0.5; return; }
  P.boltCd = 0.75;
  const a = faceAim();
  shots.push({ x: P.x, y: P.y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, dmg: 15 * (P.buffThunder > 0 ? 1.45 : 1) * (P.mut > 0 ? 2.2 : 1), mine: true, kind: 'bolt', life: 1.4 });
}

function hurtFoe(f, dmg, src) {
  const armor = FOES[f.t].armor || 0;
  const real = Math.max(1, dmg - armor);
  f.hp -= real;
  f.hitT = 0.12;
  floaties.push({ x: f.x, y: f.y - 14, txt: Math.round(real), t: 0, c: src === 'wrong' ? '#8a8f96' : '#ffd166' });
  if (src === 'wrong') floaties.push({ x: f.x, y: f.y - 26, txt: 'не тот меч', t: 0, c: '#8a8f96' });
  if (hasEnch('vamp')) P.hp = Math.min(maxHP(), P.hp + real * 0.12);
  if (P.mut > 0) P.hp = Math.min(maxHP(), P.hp + real * 0.25);
  if (hasEnch('flame')) f.burn = Math.max(f.burn, 3);
  if (hasEnch('frost')) f.slow = Math.max(f.slow, 1.6);
  blood(f.x, f.y, 5);
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  f.dead = true;
  blood(f.x, f.y, 16);
  P.mutGauge = Math.min(100, P.mutGauge + 14);
  killsLeft--;
  lootFrom(f);
}
function hurtPlayer(raw, from) {
  if (P.dodge > 0 || P.inv > 0) return;
  let d = damageTaken(raw);
  if (P.quen > 0) {                                    // щит съедает урон, пока не лопнет
    const eat = Math.min(P.quen, d);
    P.quen -= eat; d -= eat;
    parts.push({ x: P.x, y: P.y, vx: 0, vy: 0, t: 0, life: 0.3, c: '#7fd6ff', r: 16, ring: true });
    if (P.quen <= 0) message('🛡 Квен разбит');
  }
  if (d <= 0) return;
  P.hp -= d; P.inv = 0.35; P.shake = 0.25;
  if (from && hasEnch('thorns')) hurtFoe(from, raw * 0.25, 'thorns');
  blood(P.x, P.y, 6);
  if (P.hp <= 0) endGame('Ведьмак пал. ' + (contract ? 'Контракт: ' + contract.t : ''));
}

/* =====================  РУНЫ  ===================== */

function castRune(i) {
  const R = RUNES[i]; if (!R) return;
  if (P.runeCd[i] > 0) return;
  if (P.mp < R.mp) { message('Мало энергии для «' + R.n + '»'); return; }
  P.mp -= R.mp; P.runeCd[i] = R.cd;
  const a = faceAim();
  if (R.k === 'igni') {
    parts.push({ cone: true, x: P.x, y: P.y, a, t: 0, life: 0.35, c: '#ff8a3a', len: 120, w: 0.7 });
    for (const f of foes) if (inCone(f, a, 120, 0.7)) { hurtFoe(f, 24, 'rune'); f.burn = 4; }
  } else if (R.k === 'aard') {
    parts.push({ cone: true, x: P.x, y: P.y, a, t: 0, life: 0.3, c: '#9fd8ff', len: 100, w: 0.8 });
    for (const f of foes) if (inCone(f, a, 100, 0.8)) {
      hurtFoe(f, 7, 'rune');
      const d = Math.atan2(f.y - P.y, f.x - P.x);
      f.kx = Math.cos(d) * 260; f.ky = Math.sin(d) * 260; f.stun = Math.max(f.stun, 1.3);
    }
  } else if (R.k === 'quen') {
    P.quen = 60 + armorDef() * 1.2; P.quenT = 9;
    message('🛡 Квен держит ' + Math.round(P.quen));
  } else if (R.k === 'yrden') {
    P.yrden = { x: mouse.x, y: mouse.y, t: 7, r: 58 };
    message('🧿 Ирден поставлен');
  }
}
function inCone(f, a, len, half) {
  const d = dist(f, P); if (d > len + f.r) return false;
  let da = Math.atan2(f.y - P.y, f.x - P.x) - a;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) <= half;
}

/* =====================  МУТАЦИЯ  ===================== */

function toggleMutation() {
  if (P.mut > 0) return;
  if (P.mutGauge < 100) { message('🩸 Ещё не накипело: ' + Math.round(P.mutGauge) + '/100'); return; }
  P.mut = 10; P.mutGauge = 0;
  message('🩸 КРОВАВАЯ ЕБАТНЯ! Урон вдвое, кровь чужая — твоя.');
}

/* =====================  ДОБЫЧА  ===================== */

function lootFrom(f) {
  const k = ci + 1;
  const mul = (hasEnch('greed') ? 1.3 : 1) * (P.biz > 0 ? 3 : 1);
  drop(f.x, f.y, { k: 'gold', n: Math.round((6 + ri(9) + k * 2) * mul) });
  const roll = Math.random();
  if (roll < 0.34) drop(f.x, f.y, mkStack(pick(['ore', 'hide', 'hide', 'essence']), 1 + ri(2)));
  else if (roll < 0.46) drop(f.x, f.y, mkStack('bolt', 4 + ri(6)));
  else if (roll < 0.56) drop(f.x, f.y, mkStack(pick(['swallow', 'thunder', 'honey']), 1));
  else if (roll < 0.62 || FOES[f.t].boss) drop(f.x, f.y, randomGear());
}
function randomGear() {
  const tier = Math.min(TIERS.length - 1, ri(Math.min(4, 2 + Math.floor(ci / 2))));
  const ench = Math.random() < 0.3 ? pick(ENCH_KEYS) : null;
  return Math.random() < 0.5 ? mkSword(pick(['steel', 'silver']), tier, ench)
                             : mkArmor(pick(['light', 'medium', 'heavy']), tier, ench);
}
function drop(x, y, it) {
  drops.push({ x: clamp(x + rnd(20) - 10, WX0 + 8, WX1 - 8), y: clamp(y + rnd(20) - 10, WY0 + 8, WY1 - 8), it, t: 0 });
}
function pickUp(d) {
  const it = d.it;
  if (it.k === 'gold') { gold += it.n; floaties.push({ x: d.x, y: d.y, txt: '+' + it.n + '💰', t: 0, c: '#f2b134' }); return true; }
  // тяжёлое не поднимаем молча: иначе перегруз наступает незаметно
  if (carried() + itemWeight(it) > capacity() * 1.5) { message('Слишком тяжело — не поднять'); return false; }
  if (it.k === 'stack') addStack(it.id, it.n); else addItem(it);
  floaties.push({ x: d.x, y: d.y, txt: '+' + (it.k === 'stack' ? itemName(it) + ' ×' + it.n : itemName(it)), t: 0, c: '#7fd6a0' });
  return true;
}

/* =====================  ВРАГИ  ===================== */

function spawnFoe(type, x, y) {
  const S = FOES[type];
  foes.push({
    t: type, x, y, hp: S.hp * (1 + ci * 0.12), max: S.hp * (1 + ci * 0.12), r: S.r,
    cd: rnd(1), stun: 0, burn: 0, slow: 0, kx: 0, ky: 0, hitT: 0, dead: false, bob: rnd(6.3),
  });
}
function stepFoe(f, dt) {
  const S = FOES[f.t];
  if (f.hitT > 0) f.hitT -= dt;
  if (f.burn > 0) { f.burn -= dt; f.hp -= 6 * dt; if (f.hp <= 0) { killFoe(f); return; } }
  if (f.slow > 0) f.slow -= dt;
  if (P.yrden && dist(f, P.yrden) < P.yrden.r) f.slow = Math.max(f.slow, 0.2);
  // отброс от Аарда гасим трением
  if (Math.abs(f.kx) + Math.abs(f.ky) > 1) {
    f.x += f.kx * dt; f.y += f.ky * dt;
    f.kx *= 0.86; f.ky *= 0.86;
    f.x = clamp(f.x, WX0 + f.r, WX1 - f.r); f.y = clamp(f.y, WY0 + f.r, WY1 - f.r);
  }
  if (f.stun > 0) { f.stun -= dt; return; }

  const d = dist(f, P);
  const sp = S.sp * (f.slow > 0 ? 0.45 : 1);
  if (S.ranged) {
    // лучник держит дистанцию: подходит на выстрел и пятится, если жмут
    const want = 150;
    const a = Math.atan2(P.y - f.y, P.x - f.x);
    if (d > want + 20) { f.x += Math.cos(a) * sp * dt; f.y += Math.sin(a) * sp * dt; }
    else if (d < want - 40) { f.x -= Math.cos(a) * sp * dt; f.y -= Math.sin(a) * sp * dt; }
    f.cd -= dt;
    if (f.cd <= 0 && d < S.reach) {
      f.cd = S.atk;
      shots.push({ x: f.x, y: f.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: S.dmg, mine: false, kind: 'arrow', life: 2 });
    }
  } else {
    if (d > S.reach) {
      const a = Math.atan2(P.y - f.y, P.x - f.x);
      f.x += Math.cos(a) * sp * dt; f.y += Math.sin(a) * sp * dt;
    } else {
      f.cd -= dt;
      if (f.cd <= 0) { f.cd = S.atk; hurtPlayer(S.dmg * (1 + ci * 0.08), f); f.lunge = 0.18; }
    }
  }
  if (f.lunge > 0) f.lunge -= dt;
  // не слипаемся в кучу
  for (const o of foes) {
    if (o === f || o.dead) continue;
    const dd = dist(f, o);
    if (dd > 0 && dd < f.r + o.r) {
      const a = Math.atan2(f.y - o.y, f.x - o.x), push = (f.r + o.r - dd) * 0.5;
      f.x += Math.cos(a) * push; f.y += Math.sin(a) * push;
    }
  }
  f.x = clamp(f.x, WX0 + f.r, WX1 - f.r); f.y = clamp(f.y, WY0 + f.r, WY1 - f.r);
}

/* =====================  КОНТРАКТЫ  ===================== */

function contractFor(k) {
  if (k < CONTRACTS.length) return CONTRACTS[k];
  // дальше плодим сами, чередуя нечисть и людей
  const mons = ['drowner', 'nekker', 'wolfen', 'leshy'], mort = ['bandit', 'archer', 'merc', 'boar'];
  const pool = k % 2 ? mort : mons;
  return { t: (k % 2 ? 'Ватага головорезов ' : 'Нечисть в округе ') + (k + 1), pool, n: 9 + Math.floor(k * 1.4), gold: 300 + k * 60 };
}
function startContract() {
  contract = contractFor(ci);
  phase = 'FIGHT';
  killsLeft = contract.n;
  spawnQueue = contract.n;
  spawnT = 0;
  message('📜 Контракт: ' + contract.t + ' — целей ' + contract.n);
}
let spawnQueue = 0, spawnT = 0;
function spawnTick(dt) {
  if (spawnQueue <= 0) return;
  spawnT -= dt;
  if (spawnT > 0) return;
  spawnT = 0.85;
  // появляются по краям, но не в лицо игроку
  let x, y, tries = 0;
  do {
    if (Math.random() < 0.5) { x = Math.random() < 0.5 ? WX0 + 14 : WX1 - 14; y = WY0 + rnd(WH); }
    else { x = WX0 + rnd(WW); y = Math.random() < 0.5 ? WY0 + 14 : WY1 - 14; }
  } while (Math.hypot(x - P.x, y - P.y) < 130 && ++tries < 30);
  spawnFoe(pick(contract.pool), x, y);
  spawnQueue--;
}
function finishContract() {
  const bonus = contract.gold;
  gold += bonus;
  phase = 'CAMP';
  ci++;
  if (ci > best) { best = ci; try { localStorage.setItem('witcher_best', String(best)); } catch (e) {} }
  drop(CW / 2, WY1 - 60, mkStack('ore', 1 + ri(3)));
  drop(CW / 2, WY1 - 60, mkStack('hide', 1 + ri(3)));
  message('✅ Контракт закрыт! Награда ' + bonus + ' крон. У костра: E — следующий, U — верстак.');
}

/* =====================  ВЕРСТАК  ===================== */

function upCost(it) {
  const t = it.tier;
  return { gold: Math.round(70 * Math.pow(1.75, t)), mat: 2 + t, matId: it.k === 'sword' ? 'ore' : 'hide' };
}
function upgrade(it) {
  if (it.tier >= TIERS.length - 1) { message('Это уже гроссмейстерская работа — выше некуда'); return; }
  const c = upCost(it);
  if (gold < c.gold) { message('Нужно ' + c.gold + ' крон'); return; }
  if (countStack(c.matId) < c.mat) { message('Нужно ' + c.mat + ' × ' + STUFF[c.matId].n.toLowerCase()); return; }
  gold -= c.gold; useStack(c.matId, c.mat);
  it.tier++;
  message('⚒ Теперь это ' + fullName(it));
}
function enchant(it) {
  const price = 120, need = 2;
  if (gold < price) { message('Зачарование стоит ' + price + ' крон'); return; }
  if (countStack('essence') < need) { message('Нужно ' + need + ' × эссенция'); return; }
  gold -= price; useStack('essence', need);
  let e; do { e = pick(ENCH_KEYS); } while (e === it.ench && ENCH_KEYS.length > 1);
  it.ench = e;
  message('✨ ' + ENCH[e].n + ': ' + ENCH[e].desc);
}
function sell(it) {
  // надетое не продаём: раньше indexOf давал -1, и splice(-1,1) сносил
  // ПОСЛЕДНИЙ предмет сумки — чужой и ни в чём не виноватый
  const i = inv.indexOf(it);
  if (i < 0) { message('Сначала сними: надетое не продаётся'); return; }
  const p = Math.max(1, Math.round(itemPrice(it) * 0.6));
  inv.splice(i, 1);
  gold += p;
  message('💰 Продано за ' + p);
}
function buy(id, n, price) {
  if (gold < price) { message('Не хватает крон: нужно ' + price); return; }
  gold -= price; addStack(id, n);
  message('Куплено: ' + (POTIONS[id] || STUFF[id]).n + ' ×' + n);
}

/* =====================  ЦИКЛ  ===================== */

function message(t) { msg = t; msgT = 4; }

function reset() {
  P = {
    x: CW / 2, y: WY1 - 70, hp: 100, mp: 100, tox: 0, hand: 'steel',
    steel: mkSword('steel', 0, null), silver: mkSword('silver', 0, null), armor: mkArmor('light', 0, null),
    atkCd: 0, boltCd: 0, dodge: 0, dodgeCd: 0, dx: 0, dy: 0, inv: 0, swing: null,
    runeCd: [0, 0, 0, 0], quen: 0, quenT: 0, yrden: null, mut: 0, mutGauge: 0,
    regen: 0, buffThunder: 0, biz: 0, slow: 0, shake: 0, face: -Math.PI / 2,
    potSel: 'swallow',        // после «Заново» выбор зелья не должен слетать в никуда
  };
  P.hp = maxHP();
  inv = [mkStack('bolt', 20), mkStack('swallow', 2), mkStack('honey', 1)];
  gold = 120; ci = 0; foes = []; drops = []; shots = []; parts = []; floaties = [];
  contract = null; phase = 'CAMP'; over = false; cause = ''; panel = null; paused = false;
  killsLeft = 0; spawnQueue = 0;
  obst = [];
  for (let i = 0; i < 12; i++) {
    const o = { x: WX0 + 30 + rnd(WW - 60), y: WY0 + 30 + rnd(WH - 60), r: 12 + rnd(9), tree: Math.random() < 0.6 };
    if (Math.hypot(o.x - CW / 2, o.y - (WY1 - 70)) < 90) continue;   // не заваливаем костёр
    obst.push(o);
  }
  message('Костёр. E — взять контракт, U — верстак, I — сумка.');
  updateButtons();
}
function endGame(why) {
  if (over) return;
  over = true; cause = why; panel = null;
}

function update(dt) {
  anim += dt;
  if (msgT > 0) msgT -= dt;
  for (const f of floaties) f.t += dt;
  floaties = floaties.filter(f => f.t < 1.1);
  for (const p of parts) { p.t += dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; }
  parts = parts.filter(p => p.t < (p.life || 0.6));
  if (over || paused || panel) return;

  // --- таймеры игрока ---
  P.atkCd -= dt; P.boltCd -= dt; P.inv -= dt; P.dodgeCd -= dt; P.shake -= dt;
  for (let i = 0; i < 4; i++) if (P.runeCd[i] > 0) P.runeCd[i] -= dt;
  if (P.quenT > 0) { P.quenT -= dt; if (P.quenT <= 0) P.quen = 0; }
  if (P.yrden) { P.yrden.t -= dt; if (P.yrden.t <= 0) P.yrden = null; }
  if (P.mut > 0) { P.mut -= dt; P.tox = clamp(P.tox + dt * 1.5, 0, 100); if (P.mut <= 0) message('Отпустило.'); }
  if (P.buffThunder > 0) P.buffThunder -= dt;
  if (P.biz > 0) { P.biz -= dt; if (P.biz <= 0) message('Сделка закрыта. Обратно в ведьмаки.'); }
  if (P.slow > 0) P.slow -= dt;
  if (P.regen > 0) { P.regen -= dt; P.hp = Math.min(maxHP(), P.hp + 5.6 * dt); }
  P.mp = Math.min(maxMP(), P.mp + mpRegen() * dt);
  P.tox = Math.max(0, P.tox - 1.2 * dt);
  if (P.tox > 70) {                                    // передоз травит сам по себе
    P.hp -= (P.tox - 70) * 0.055 * dt * 3;
    if (P.hp <= 0) { endGame('Отравился зельями. Токсичность не прощает.'); return; }
  }

  // --- движение ---
  let mx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  let my = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
  if (P.dodge > 0) {
    P.dodge -= dt;
    P.x += P.dx * dt; P.y += P.dy * dt;
    P.dx *= 0.88; P.dy *= 0.88;
  } else if (mx || my) {
    const l = Math.hypot(mx, my), s = moveSpeed();
    P.x += mx / l * s * dt; P.y += my / l * s * dt;
  }
  P.x = clamp(P.x, WX0 + 9, WX1 - 9); P.y = clamp(P.y, WY0 + 9, WY1 - 9);
  // препятствия
  for (const o of obst) {
    const d = Math.hypot(P.x - o.x, P.y - o.y);
    if (d < o.r + 9 && d > 0) {
      const a = Math.atan2(P.y - o.y, P.x - o.x);
      P.x = o.x + Math.cos(a) * (o.r + 9); P.y = o.y + Math.sin(a) * (o.r + 9);
    }
  }
  if (mouseInWorld()) P.face = Math.atan2(mouse.y - P.y, mouse.x - P.x);

  // --- взмах меча ---
  if (P.swing) {
    P.swing.t += dt;
    if (P.swing.t < 0.14) {
      for (const f of foes) {
        if (f.dead || P.swing.hit.has(f)) continue;
        if (dist(f, P) > 40 + f.r) continue;
        let da = Math.atan2(f.y - P.y, f.x - P.x) - P.swing.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > 1.0) continue;
        P.swing.hit.add(f);
        const sw = activeSword();
        const right = sw && SWORD[sw.metal].fam === FOES[f.t].fam;
        hurtFoe(f, swordDamage(sw, FOES[f.t].fam), right ? 'sword' : 'wrong');
      }
    }
    if (P.swing.t > 0.3) P.swing = null;
  }

  if (mouse.down) swing();

  // --- снаряды ---
  for (const s of shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.x < WX0 || s.x > WX1 || s.y < WY0 || s.y > WY1) s.life = 0;
    if (s.mine) {
      for (const f of foes) {
        if (f.dead || dist(s, f) > f.r + 4) continue;
        const fam = FOES[f.t].fam;
        // арбалет и договоры родству не подчиняются — бьют ровно
        hurtFoe(f, s.dmg, 'shot');
        s.life = 0; break;
      }
    } else if (Math.hypot(s.x - P.x, s.y - P.y) < 11) { hurtPlayer(s.dmg, null); s.life = 0; }
  }
  shots = shots.filter(s => s.life > 0);

  // --- враги ---
  for (const f of foes) if (!f.dead) stepFoe(f, dt);
  foes = foes.filter(f => !f.dead);

  // --- подбор добычи ---
  for (const d of drops) {
    d.t += dt;
    if (Math.hypot(d.x - P.x, d.y - P.y) < 18) { if (pickUp(d)) d.gone = true; }
  }
  drops = drops.filter(d => !d.gone);

  // --- контракт ---
  if (phase === 'FIGHT') {
    spawnTick(dt);
    if (killsLeft <= 0 && !foes.length && spawnQueue <= 0) finishContract();
  }
}

/* =====================  ОТРИСОВКА  ===================== */

function syncRes() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(w / CW, 0, 0, h / CH, 0, 0);
}
function txt(s, x, y, size, col, al) {
  ctx.font = size + 'px Segoe UI'; ctx.fillStyle = col; ctx.textAlign = al || 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function bar(x, y, w, h, k, col, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(k, 0, 1), h - 2);
}
function blood(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd(6.3), s = 30 + rnd(90);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + rnd(0.4), c: '#a4222a', r: 1.5 + rnd(2) });
  }
}

function drawWorld() {
  // земля
  ctx.fillStyle = '#141a12'; ctx.fillRect(WX0, WY0, WW, WH);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 70; i++) {
    const x = WX0 + ((i * 97) % WW), y = WY0 + ((i * 131) % WH);
    ctx.fillStyle = i % 3 ? '#1a2318' : '#18211a';
    ctx.fillRect(x, y, 9, 5);
  }
  ctx.globalAlpha = 1;

  // ловушка Ирдена
  if (P.yrden) {
    ctx.strokeStyle = 'rgba(180,120,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(P.yrden.x, P.yrden.y, P.yrden.r, 0, 6.3); ctx.stroke();
    ctx.fillStyle = 'rgba(140,90,220,.14)'; ctx.fill();
  }

  // костёр и верстак — только в лагере
  if (phase === 'CAMP') {
    const fx = CW / 2, fy = WY1 - 70;
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔥', fx, fy + Math.sin(anim * 6) * 1.5);
    ctx.fillText('⚒', fx - 70, fy);
    txt('E — контракт', fx, fy + 26, 10, '#c9a227', 'center');
    txt('U — верстак', fx - 70, fy + 24, 10, '#98a2ae', 'center');
  }

  // деревья и камни
  for (const o of obst) {
    ctx.font = (o.r * 1.9 | 0) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.tree ? '🌲' : '🪨', o.x, o.y);
  }

  // добыча
  for (const d of drops) {
    const bobY = Math.sin(anim * 4 + d.x) * 2;
    if (d.it.k === 'gold') { ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💰', d.x, d.y + bobY); }
    else {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(d.x - 9, d.y - 9 + bobY, 18, 18);
      ctx.strokeStyle = d.it.k === 'stack' ? 'rgba(255,255,255,.25)' : TIERS[d.it.tier].c;
      ctx.lineWidth = 1.5; ctx.strokeRect(d.x - 9, d.y - 9 + bobY, 18, 18);
      ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(itemIco(d.it), d.x, d.y + bobY);
    }
  }

  // враги
  for (const f of foes) {
    const S = FOES[f.t];
    const lx = f.lunge > 0 ? Math.cos(Math.atan2(P.y - f.y, P.x - f.x)) * 5 : 0;
    const ly = f.lunge > 0 ? Math.sin(Math.atan2(P.y - f.y, P.x - f.x)) * 5 : 0;
    // метка родства: по ней выбирают меч
    ctx.fillStyle = S.fam === 'monster' ? 'rgba(168,198,232,.9)' : 'rgba(230,160,90,.9)';
    ctx.beginPath(); ctx.arc(f.x, f.y - f.r - 12, 3, 0, 6.3); ctx.fill();
    ctx.font = (S.boss ? 30 : 20) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = f.hitT > 0 ? 0.5 : 1;
    ctx.fillText(S.ico, f.x + lx, f.y + ly + Math.sin(anim * 5 + f.bob) * 1.5);
    ctx.globalAlpha = 1;
    if (f.burn > 0) { ctx.font = '11px serif'; ctx.fillText('🔥', f.x + 9, f.y - 9); }
    if (f.slow > 0) { ctx.font = '10px serif'; ctx.fillText('❄', f.x - 10, f.y - 9); }
    bar(f.x - 13, f.y - f.r - 8, 26, 3, f.hp / f.max, S.fam === 'monster' ? '#a8c6e8' : '#e8a05a');
  }

  // снаряды
  for (const s of shots) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
    if (s.kind === 'paper') { ctx.fillStyle = '#f0ead6'; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = '#8a8f96'; ctx.fillRect(-3, -2, 6, 1); ctx.fillRect(-3, 1, 6, 1); }
    else { ctx.fillStyle = s.mine ? '#e8d9a8' : '#c98a5a'; ctx.fillRect(-6, -1.2, 12, 2.4); }
    ctx.restore();
  }

  // игрок
  const px = P.x, py = P.y;
  if (P.quen > 0) {
    ctx.strokeStyle = 'rgba(120,210,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 16 + Math.sin(anim * 8) * 1.2, 0, 6.3); ctx.stroke();
  }
  if (P.dodge > 0) ctx.globalAlpha = 0.55;
  if (P.biz > 0) {
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💼', px, py);
  } else {
    ctx.fillStyle = P.mut > 0 ? '#c0303a' : '#2b2f38';
    ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.3); ctx.fill();
    ctx.strokeStyle = P.mut > 0 ? '#ff6a5a' : '#8a8f96'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8d9a8';                                  // белая грива
    ctx.beginPath(); ctx.arc(px, py - 2, 5, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // меч в руке
  const sw = activeSword();
  if (sw && P.biz <= 0) {
    const a = P.swing ? P.swing.a - 1.1 + (P.swing.t / 0.3) * 2.2 : P.face;
    ctx.strokeStyle = SWORD[sw.metal].c; ctx.lineWidth = P.swing ? 3.5 : 2.5;
    ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8);
    ctx.lineTo(px + Math.cos(a) * (P.swing ? 34 : 24), py + Math.sin(a) * (P.swing ? 34 : 24));
    ctx.stroke();
    if (P.swing && P.swing.t < 0.16) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 34, P.swing.a - 1, P.swing.a + 1); ctx.stroke();
    }
  }

  // частицы
  for (const p of parts) {
    const k = 1 - p.t / (p.life || 0.6);
    ctx.globalAlpha = clamp(k, 0, 1);
    if (p.cone) {
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, p.len * (0.5 + 0.5 * (1 - k)), p.a - p.w, p.a + p.w);
      ctx.closePath(); ctx.globalAlpha *= 0.4; ctx.fill();
    } else if (p.ring) {
      ctx.strokeStyle = p.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - k)), 0, 6.3); ctx.stroke();
    } else {
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 2, 0, 6.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // всплывающие числа
  for (const f of floaties) {
    ctx.globalAlpha = clamp(1 - f.t / 1.1, 0, 1);
    txt(f.txt, f.x, f.y - f.t * 22, 11, f.c, 'center');
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = 'rgba(201,162,39,.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(WX0 - 0.5, WY0 - 0.5, WW + 1, WH + 1);
}

function drawHUD() {
  ctx.fillStyle = 'rgba(10,9,8,.92)'; ctx.fillRect(0, 0, CW, WY0 - 4);
  // здоровье и энергия
  bar(10, 10, 150, 11, P.hp / maxHP(), P.mut > 0 ? '#ff5a4a' : '#b5423f');
  txt('❤ ' + Math.max(0, Math.round(P.hp)) + '/' + Math.round(maxHP()), 14, 16, 10, '#ffd9d0');
  bar(10, 25, 150, 8, P.mp / maxMP(), '#4a86c8');
  txt('✨ ' + Math.round(P.mp), 14, 29, 9, '#cfe3ff');
  // токсичность
  bar(10, 38, 150, 6, P.tox / 100, P.tox > 70 ? '#8ac04a' : '#5a7a3a');
  txt('☠ токсичность ' + Math.round(P.tox), 14, 41, 8, P.tox > 70 ? '#c8ff8a' : '#98a2ae');

  // мутация
  const mx = 174;
  bar(mx, 10, 92, 9, P.mut > 0 ? P.mut / 10 : P.mutGauge / 100, P.mut > 0 ? '#ff3a3a' : '#8a2a30');
  txt(P.mut > 0 ? '🩸 ЕБАТНЯ ' + P.mut.toFixed(1) + 'с' : '🩸 ' + Math.round(P.mutGauge) + '/100 (R)', mx + 2, 15, 8, '#ffb0a8');

  // меч в руке
  const sw = activeSword();
  ctx.fillStyle = 'rgba(40,36,30,.9)'; ctx.fillRect(mx, 23, 92, 21);
  ctx.strokeStyle = sw ? TIERS[sw.tier].c : '#555'; ctx.lineWidth = 1; ctx.strokeRect(mx + .5, 23.5, 91, 20);
  txt(sw ? SWORD[sw.metal].ico + ' ' + (sw.metal === 'silver' ? 'СЕРЕБРО' : 'СТАЛЬ') : 'без меча', mx + 5, 30, 10, sw ? SWORD[sw.metal].c : '#888');
  txt(sw ? TIERS[sw.tier].n + (sw.ench ? ' ' + ENCH[sw.ench].ico : '') : 'Q — сменить', mx + 5, 40, 8, '#98a2ae');

  // золото, вес, болты
  const rx = CW - 10;
  txt('💰 ' + gold, rx, 15, 12, '#f2b134', 'right');
  const L = loadState();
  txt('⚖ ' + carried().toFixed(1) + ' / ' + capacity() + ' кг', rx, 29, 10,
    L.lvl === 0 ? '#98a2ae' : L.lvl === 1 ? '#ffb43a' : '#ff5a4a', 'right');
  txt('➶ болты: ' + countStack('bolt'), rx, 41, 9, '#98a2ae', 'right');

  // контракт
  if (phase === 'FIGHT' && contract) {
    txt(contract.t + ' — осталось ' + Math.max(0, killsLeft), CW / 2, 50, 11, '#e8d9a8', 'center');
  } else {
    txt('Лагерь · контракт ' + (ci + 1) + ' · рекорд: ' + best, CW / 2, 50, 10, '#98a2ae', 'center');
  }

  // --- нижний пояс: руны, арбалет, зелья ---
  const by = CH - 84;
  ctx.fillStyle = 'rgba(10,9,8,.94)'; ctx.fillRect(0, by, CW, CH - by);
  const hov = (x, y, w, h) => mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  let hint = '';

  // РУНЫ. Раньше это были просто картинки: нарисованы кнопкой, а нажатие
  // не обрабатывалось вовсе — человек тыкал, и «магия не показывалась».
  RUNES.forEach((R, i) => {
    const w = 56, h = 30, y = by + 4, x = 10 + i * 60;
    const ready = P.runeCd[i] <= 0 && P.mp >= R.mp;
    uiHit.push({ x, y, w, h, fn: () => castRune(i) });
    if (hov(x, y, w, h)) hint = R.ico + ' ' + R.n + ' — ' + R.desc + ' · ' + R.mp + ' энергии · клавиша ' + (i + 1);
    ctx.fillStyle = ready ? 'rgba(60,80,110,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ready ? '#6aa6e8' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(R.ico + ' ' + R.n, x + 4, y + 10, 10, ready ? '#cfe3ff' : '#6c7683');
    txt((i + 1) + ' · ' + R.mp + '✨', x + 4, y + 22, 9, '#98a2ae');
    if (P.runeCd[i] > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h * clamp(P.runeCd[i] / R.cd, 0, 1)); }
  });

  // АРБАЛЕТ: отдельная кнопка, чтобы про него вообще узнали
  {
    const x = 252, y = by + 4, w = 80, h = 30;
    const bolts = countStack('bolt');
    uiHit.push({ x, y, w, h, fn: () => shootBolt() });
    if (hov(x, y, w, h)) hint = '🏹 Арбалет — ПКМ по полю или эта кнопка. Бьёт ровно, родство не важно. Болты кончаются и весят.';
    ctx.fillStyle = bolts ? 'rgba(80,70,40,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = bolts ? '#c9a227' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt('🏹 Арбалет', x + 4, y + 10, 10, bolts ? '#f2d59a' : '#6c7683');
    txt('ПКМ · болтов ' + bolts, x + 4, y + 22, 9, bolts ? '#98a2ae' : '#ff7a6a');
  }
  /* ЗЕЛЬЯ. Одним рядом: во второй ряд пояс не помещается. Клик — выбрать,
     двойной клик или E — выпить. Что зелье делает, написано в строке
     подсказки внизу: по одним названиям это не угадать. */
  const pots = Object.keys(POTIONS);
  const pw = Math.floor((CW - 20 - (pots.length - 1) * 4) / pots.length);
  const py2 = by + 40;
  pots.forEach((id, i) => {
    const have = countStack(id), sel = P.potSel === id, px2 = 10 + i * (pw + 4);
    const Pt = POTIONS[id];
    uiHit.push({ x: px2, y: py2, w: pw, h: 20, fn: () => {
      if (P.potSel === id && have) drink(id); else P.potSel = id;   // повторный клик — выпить
    } });
    if (hov(px2, py2, pw, 20)) hint = Pt.ico + ' ' + Pt.n + ' — ' + Pt.desc + ' · токсичность ' + (Pt.tox > 0 ? '+' : '') + Pt.tox;
    ctx.fillStyle = sel ? 'rgba(201,162,39,.22)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(px2, py2, pw, 20);
    ctx.strokeStyle = sel ? '#c9a227' : 'rgba(255,255,255,.08)'; ctx.strokeRect(px2 + .5, py2 + .5, pw - 1, 19);
    txt(Pt.ico + ' ' + Pt.n, px2 + 4, py2 + 10, 9, have ? '#e6ebf2' : '#5a616b');
    txt('×' + have, px2 + pw - 5, py2 + 10, 9, have ? '#7fd6a0' : '#5a616b', 'right');
  });

  /* Строка подсказки: под курсором — про что навёл, иначе про выбранное
     зелье. Без неё «Ласточка» и «Зелье гавна» — просто слова. */
  if (!hint) {
    const Pt = POTIONS[P.potSel];
    hint = Pt ? ('Выбрано: ' + Pt.ico + ' ' + Pt.n + ' — ' + Pt.desc + ' · E выпить · токсичность ' + (Pt.tox > 0 ? '+' : '') + Pt.tox)
              : 'Наведи на кнопку — расскажу, что она делает';
  }
  txt(hint, 10, by + 70, 9, '#c9a227');

  // Сообщение — ВНУТРИ поля, над поясом: снаружи оно ложилось прямо
  // на кнопки рун и срезало им верхушки.
  if (msgT > 0) {
    ctx.globalAlpha = clamp(msgT, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.fillRect(WX0, WY1 - 19, WW, 17);
    txt(msg, CW / 2, WY1 - 11, 10, '#f2d59a', 'center');
    ctx.globalAlpha = 1;
  }
}

/* --- панели: сумка и верстак --- */
function panelBox(title) {
  // Панель перекрывает пояс, поэтому кнопки под ней надо забыть: иначе
  // клик по «пустому» месту втихую переключал зелье сквозь окно.
  uiHit = [];
  ctx.fillStyle = 'rgba(8,7,6,.93)'; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = 'rgba(29,26,22,.98)'; ctx.fillRect(14, 24, CW - 28, CH - 60);
  ctx.strokeStyle = 'rgba(201,162,39,.35)'; ctx.lineWidth = 1; ctx.strokeRect(14.5, 24.5, CW - 29, CH - 61);
  txt(title, CW / 2, 40, 14, '#e8d9a8', 'center');
  txt('вес ' + carried().toFixed(1) + '/' + capacity() + ' кг   ·   💰 ' + gold, CW / 2, 56, 10, '#98a2ae', 'center');
  const bw = 92;
  uiHit.push({ x: CW - 24 - bw, y: 30, w: bw, h: 18, fn: () => { panel = null; } });
  ctx.fillStyle = 'rgba(60,50,40,.9)'; ctx.fillRect(CW - 24 - bw, 30, bw, 18);
  txt('✕ закрыть', CW - 24 - bw / 2, 39, 10, '#e6ebf2', 'center');
}
/* Погашенная кнопка теперь не молчит: по нажатию говорит, ЧЕГО не хватает.
   Раньше клик просто не давал ничего, и выглядело это как поломка. */
function btn(x, y, w, h, label, fn, col, dim, why) {
  uiHit.push({ x, y, w, h, fn: dim ? () => { if (why) message(why); } : fn });
  ctx.fillStyle = dim ? 'rgba(40,36,30,.7)' : (col || 'rgba(60,52,40,.95)');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dim ? 'rgba(255,255,255,.06)' : 'rgba(201,162,39,.4)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  txt(label, x + w / 2, y + h / 2, 9, dim ? '#6c7683' : '#e6ebf2', 'center');
}

function drawEquipRow(y) {
  const slots = [['Сталь', P.steel], ['Серебро', P.silver], ['Доспех', P.armor]];
  let x = 24;
  for (const [nm, it] of slots) {
    const w = 150;
    ctx.fillStyle = 'rgba(20,18,15,.9)'; ctx.fillRect(x, y, w, 34);
    ctx.strokeStyle = it ? TIERS[it.tier].c : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, 33);
    txt(nm, x + 5, y + 9, 8, '#98a2ae');
    if (it) {
      txt(itemIco(it) + ' ' + TIERS[it.tier].n, x + 5, y + 20, 10, TIERS[it.tier].c);
      let sub = it.k === 'sword'
        ? 'урон ' + Math.round(SWORD[it.metal].dmg * TIERS[it.tier].m) + ' · ' + itemWeight(it) + ' кг'
        : 'броня ' + Math.round(ARMOR[it.type].def * TIERS[it.tier].m) + ' · ' + itemWeight(it) + ' кг';
      if (it.ench) sub += ' · ' + ENCH[it.ench].ico;
      txt(sub, x + 5, y + 29, 8, '#98a2ae');
    } else txt('пусто', x + 5, y + 20, 10, '#5a616b');
    x += w + 6;
    if (x + 150 > CW - 20) { x = 24; y += 40; }
  }
  return y + 42;
}

/* Прокрутка списка.
   Раньше сумка показывала первые тринадцать строк и дописывала «…и ещё N» —
   до этих N было уже не добраться: ни надеть, ни выпить, ни выбросить.
   Считаем, сколько строк реально влезает, и катаем окно по списку. */
function listView(total, top, bottom, rowH, scroll) {
  const vis = Math.max(1, Math.floor((bottom - top) / rowH));
  const max = Math.max(0, total - vis);
  return { total, vis, max, from: clamp(scroll, 0, max) };
}
function scrollBtns(y, v, get, set) {
  if (v.max <= 0) return;
  txt('показаны ' + (v.from + 1) + '–' + Math.min(v.total, v.from + v.vis) + ' из ' + v.total + ' · колесо мыши или ↑ ↓',
      CW / 2 - 10, y, 9, '#98a2ae', 'center');
  btn(CW - 78, y - 8, 25, 17, '▲', () => set(get() - 1), null, v.from <= 0);
  btn(CW - 50, y - 8, 25, 17, '▼', () => set(get() + 1), null, v.from >= v.max);
}

function drawBag() {
  panelBox('🎒 СУМКА');
  let y = drawEquipRow(70);
  if (P.armor) txt(ARMOR[P.armor.type].bon, 24, y - 6, 9, '#7fd6a0');
  y += 6;
  const top = y + 14, bottom = CH - 56;
  const v = listView(inv.length, top, bottom, 24, bagScroll);
  bagScroll = v.from;
  txt('В сумке: ' + inv.length, 24, y, 10, '#e8d9a8');
  scrollBtns(y, v, () => bagScroll, n => { bagScroll = clamp(n, 0, v.max); });
  y = top;
  if (!inv.length) txt('пусто', 24, y + 6, 10, '#5a616b');
  for (const it of inv.slice(v.from, v.from + v.vis)) {
    const rowY = y;
    ctx.fillStyle = 'rgba(20,18,15,.75)'; ctx.fillRect(24, rowY, CW - 48, 22);
    txt(itemIco(it) + '  ' + fullName(it), 30, rowY + 11, 10, it.k === 'stack' ? '#e6ebf2' : TIERS[it.tier].c);
    txt(itemWeight(it).toFixed(1) + ' кг', CW - 150, rowY + 11, 9, '#98a2ae', 'right');
    if (it.k === 'stack' && POTIONS[it.id]) btn(CW - 142, rowY + 3, 52, 16, 'выпить', () => drink(it.id));
    else if (it.k !== 'stack') btn(CW - 142, rowY + 3, 52, 16, 'надеть', () => equip(it));
    btn(CW - 86, rowY + 3, 58, 16, 'выбросить', () => dropItem(it), 'rgba(70,40,40,.9)');
    y += 24;
  }
  // полоска сбоку: сразу видно, что список длиннее окна
  if (v.max > 0) {
    const trackH = v.vis * 24;
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(CW - 22, top, 4, trackH);
    const thumb = Math.max(14, trackH * v.vis / inv.length);
    ctx.fillStyle = 'rgba(201,162,39,.6)';
    ctx.fillRect(CW - 22, top + (trackH - thumb) * (v.from / v.max), 4, thumb);
  }
  panelFooter('I или ✕ — закрыть · надетое в сумке не лежит, но вес считается');
}

/* Нижняя строка панели. Сообщения игра рисует в поясе под полем, а он
   закрыт открытой панелью — поэтому отказы вроде «не хватает руды»
   игрок просто не видел. Здесь они и показываются. */
function panelFooter(hint) {
  if (msgT > 0) {
    ctx.fillStyle = 'rgba(60,48,20,.75)'; ctx.fillRect(24, CH - 54, CW - 48, 19);
    txt(msg, CW / 2, CH - 44, 9, '#f2d59a', 'center');
  } else {
    txt(hint, CW / 2, CH - 44, 9, '#6c7683', 'center');
  }
}

function drawBench() {
  panelBox('⚒ ВЕРСТАК И ТОРГ');
  let y = drawEquipRow(70);
  txt('Улучшение: обычный → улучшенный → отличный → мастерский → гроссмейстер', 24, y - 4, 9, '#98a2ae');
  y += 8;

  const gear = [P.steel, P.silver, P.armor].concat(inv.filter(i => i.k !== 'stack')).filter(Boolean);
  // список железа тоже катается: раньше показывались первые шесть, и седьмой
  // меч нельзя было ни улучшить, ни продать — он просто не отображался
  const v = listView(gear.length, y, CH - 160, 28, benchScroll);
  benchScroll = v.from;
  scrollBtns(y - 12, v, () => benchScroll, n => { benchScroll = clamp(n, 0, v.max); });
  for (const it of gear.slice(v.from, v.from + v.vis)) {
    ctx.fillStyle = 'rgba(20,18,15,.75)'; ctx.fillRect(24, y, CW - 48, 26);
    txt(itemIco(it) + ' ' + fullName(it), 30, y + 8, 9, TIERS[it.tier].c);
    const c = upCost(it);
    const maxed = it.tier >= TIERS.length - 1;
    const мало = { gold: gold < c.gold, mat: countStack(c.matId) < c.mat };
    // Пишем не только цену, но и СКОЛЬКО ЕСТЬ: иначе непонятно, почему
    // кнопка мертва — денег вроде полно, а не хватает руды.
    if (maxed) txt('выше некуда', 30, y + 19, 8, '#6c7683');
    else {
      txt('⚒ ' + c.gold + '💰', 30, y + 19, 8, мало.gold ? '#ff7a6a' : '#98a2ae');
      txt('+ ' + c.mat + STUFF[c.matId].ico, 76, y + 19, 8, мало.mat ? '#ff7a6a' : '#98a2ae');
      txt('(есть ' + Math.floor(gold) + '💰, ' + countStack(c.matId) + STUFF[c.matId].ico + ')', 122, y + 19, 8, '#6c7683');
    }
    const нетДенегИлиРуды = maxed || мало.gold || мало.mat;
    const почемуУлучшение = maxed ? 'Это уже гроссмейстерская работа — выше некуда'
      : ('Не хватает: ' + (мало.gold ? (c.gold - Math.floor(gold)) + ' крон ' : '') +
         (мало.mat ? (c.mat - countStack(c.matId)) + ' × ' + STUFF[c.matId].n.toLowerCase() : '') +
         ' · руду и шкуры можно купить тут же');
    btn(CW - 274, y + 5, 56, 17, maxed ? '—' : 'улучшить', () => upgrade(it), null, нетДенегИлиРуды, почемуУлучшение);
    const нетЭссенции = gold < 120 || countStack('essence') < 2;
    btn(CW - 214, y + 5, 62, 17, 'зачаровать', () => enchant(it), null, нетЭссенции,
        'Зачарование: 120 крон + 2 эссенции. Есть ' + Math.floor(gold) + ' крон и ' + countStack('essence') + ' эссенции');
    const own = inv.indexOf(it) >= 0;
    // «Надеть» прямо с верстака: раньше за этим приходилось уходить в сумку
    btn(CW - 148, y + 5, 56, 17, own ? 'надеть' : 'надето', () => equip(it), null, !own, 'Это и так на тебе');
    btn(CW - 88, y + 5, 56, 17, 'продать', () => sell(it), own ? 'rgba(70,60,30,.9)' : null, !own,
        'Сначала сними: надетое не продаётся');
    y += 28;
  }

  y += 4;
  txt('Купить:', 24, y + 6, 10, '#e8d9a8');
  /* Руда и шкуры продаются здесь же. Без этого золото копилось мёртвым
     грузом: улучшение упирается в материалы, а материалы падали только
     с трупов — и полторы тысячи крон нечем было потратить. */
  const shop = [
    ['⛏ Руда ×3', 'ore', 3, 66], ['🧵 Шкуры ×3', 'hide', 3, 54],
    ['✨ Эссенция', 'essence', 1, 34], ['➶ болты ×10', 'bolt', 10, 20],
    ['🧪 Ласточка', 'swallow', 1, 40], ['⚗ Гром', 'thunder', 1, 55],
    ['🍯 Белый мёд', 'honey', 1, 35], ['💩 Зелье гавна', 'shit', 1, 90],
  ];
  let sx = 24, sy = y + 16;
  for (const [label, id, n, price] of shop) {
    btn(sx, sy, 116, 20, label + ' — ' + price + '💰', () => buy(id, n, price), null, gold < price,
        'Нужно ' + price + ' крон, у тебя ' + Math.floor(gold));
    sx += 119;
    if (sx + 116 > CW - 20) { sx = 24; sy += 23; }
  }
  panelFooter('U или ✕ — закрыть · зачарование даёт случайное свойство (120💰 + 2✨)');
}

function render() {
  syncRes();
  uiHit = [];
  ctx.fillStyle = '#0b0a08'; ctx.fillRect(0, 0, CW, CH);
  if (!P) return;

  ctx.save();
  if (P.shake > 0) ctx.translate(rnd(4) - 2, rnd(4) - 2);
  drawWorld();
  ctx.restore();

  // краснота в мутации
  if (P.mut > 0) {
    ctx.fillStyle = 'rgba(150,20,20,' + (0.10 + Math.sin(anim * 8) * 0.03).toFixed(3) + ')';
    ctx.fillRect(WX0, WY0, WW, WH);
  }
  if (P.biz > 0) {
    ctx.fillStyle = 'rgba(220,180,60,.06)'; ctx.fillRect(WX0, WY0, WW, WH);
    txt('💼 РЕЖИМ БИЗНЕСМЭНА: ' + P.biz.toFixed(1) + ' с · золото ×3 · ЛКМ — договор', CW / 2, WY0 + 12, 10, '#f2d59a', 'center');
  }

  drawHUD();

  if (panel === 'bag') drawBag();
  else if (panel === 'bench') drawBench();

  if (paused && !over && !panel) {
    ctx.fillStyle = 'rgba(8,7,6,.72)'; ctx.fillRect(0, 0, CW, CH);
    txt('⏸ ПАУЗА', CW / 2, CH / 2, 26, '#e8d9a8', 'center');
    txt('P / Esc — продолжить', CW / 2, CH / 2 + 26, 12, '#98a2ae', 'center');
  }
  if (over) {
    ctx.fillStyle = 'rgba(20,6,6,.9)'; ctx.fillRect(0, 0, CW, CH);
    txt('☠ ВЕДЬМАК ПАЛ', CW / 2, CH / 2 - 60, 28, '#ff6a4a', 'center');
    txt(cause, CW / 2, CH / 2 - 28, 12, '#e6ebf2', 'center');
    txt('Закрыто контрактов: ' + ci + '   ·   крон: ' + gold, CW / 2, CH / 2, 12, '#c2cad2', 'center');
    txt('Рекорд: ' + best + ' контрактов', CW / 2, CH / 2 + 22, 12, '#c2cad2', 'center');
    txt('Enter / тап — новый ведьмак', CW / 2, CH / 2 + 56, 13, '#f2b134', 'center');
  }
}

function frame(now) {
  if (lastFrame === null) lastFrame = now;
  let dt = (now - lastFrame) / 1000; lastFrame = now;
  if (dt > 0.05) dt = 0.05;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* =====================  ВВОД  ===================== */

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (CW / r.width), y: (e.clientY - r.top) * (CH / r.height) };
}
canvas.addEventListener('pointermove', e => { const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; });
canvas.addEventListener('pointerdown', e => {
  const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y;
  if (mouseInWorld() && P) P.face = Math.atan2(mouse.y - P.y, mouse.x - P.x);   // бьём сразу туда, куда ткнули
  if (over) { reset(); return; }
  for (let i = uiHit.length - 1; i >= 0; i--) {
    const b = uiHit[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { b.fn(); return; }
  }
  if (panel) return;
  if (e.button === 2) { shootBolt(); return; }
  mouse.down = true; swing();
});
// колесо катает список в открытой панели; страницу при этом не дёргаем
canvas.addEventListener('wheel', e => {
  if (!panel) return;
  e.preventDefault();
  const d = e.deltaY > 0 ? 1 : -1;
  if (panel === 'bag') bagScroll += d; else if (panel === 'bench') benchScroll += d;
}, { passive: false });
canvas.addEventListener('pointerup', () => { mouse.down = false; });
canvas.addEventListener('pointerleave', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function interact() {
  if (panel) return;
  if (phase === 'CAMP') {
    const fx = CW / 2, fy = WY1 - 70;
    if (Math.hypot(P.x - fx, P.y - fy) < 46) { startContract(); return; }
    if (Math.hypot(P.x - (fx - 70), P.y - fy) < 40) { panel = 'bench'; return; }
  }
  if (P.potSel) drink(P.potSel);
  else message('Выбери зелье в поясе внизу');
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (over) { if (e.code === 'Enter') reset(); return; }
  // в полном экране Esc выходит из него, а не ставит паузу
  if (e.code === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement)) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (panel) panel = null; else { paused = !paused; updateButtons(); }
    e.preventDefault(); return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyI') { panel = panel === 'bag' ? null : 'bag'; bagScroll = 0; return; }
  if (e.code === 'KeyU') {
    if (phase !== 'CAMP') { message('Верстак остался в лагере'); return; }
    panel = panel === 'bench' ? null : 'bench'; benchScroll = 0; return;
  }
  // в открытой панели стрелки катают список, а не героя
  if (panel) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const d = e.code === 'ArrowDown' ? 1 : -1;
      if (panel === 'bag') bagScroll += d; else benchScroll += d;
      e.preventDefault();
    }
    return;
  }
  if (paused) return;
  if (e.code === 'KeyQ') { P.hand = P.hand === 'steel' ? 'silver' : 'steel'; message(P.hand === 'silver' ? '⚔ Серебро — против нечисти' : '🗡 Сталь — против людей и зверья'); return; }
  if (e.code === 'KeyR') { toggleMutation(); return; }
  if (e.code === 'KeyE') { interact(); return; }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 4) castRune(n - 1);
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (P.dodgeCd > 0 || P.dodge > 0) return;
    if (!loadState().dodge) { message('⚖ Перегруз — какой уж тут уворот'); return; }
    let mx = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0), my = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    if (!mx && !my) { mx = Math.cos(P.face); my = Math.sin(P.face); }
    const l = Math.hypot(mx, my) || 1;
    P.dodge = 0.2; P.dodgeCd = 0.75; P.dx = mx / l * 460; P.dy = my / l * 460;
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

function onBtn(id, fn) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { b.blur(); fn(); }); }
onBtn('swapBtn', () => { P.hand = P.hand === 'steel' ? 'silver' : 'steel'; });
onBtn('bagBtn', () => { panel = panel === 'bag' ? null : 'bag'; bagScroll = 0; });
onBtn('mutBtn', () => toggleMutation());
onBtn('pause', () => { if (!over) { paused = !paused; updateButtons(); } });
onBtn('restart', () => reset());
function updateButtons() { const b = document.getElementById('pause'); if (b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

window.__fsFail = function (why) { message('⛶ Полный экран не открылся: ' + why); };

reset();
P.potSel = 'swallow';
requestAnimationFrame(frame);

// ручки для проверки: тесты гоняют бой без мышки и без ожидания
if (typeof globalThis !== 'undefined') globalThis.__W = {
  reset, update, render, startContract, finishContract, spawnFoe, castRune, drink, upgrade, enchant, sell, buy,
  equip, addStack, countStack, dropItem, swordDamage, damageTaken, hurtFoe, hurtPlayer, toggleMutation,
  carried, capacity, loadState, itemWeight, itemPrice, fullName, mkSword, mkArmor, mkStack, lootFrom,
  getP: () => P, getFoes: () => foes, setFoes: v => { foes = v; }, getInv: () => inv, setInv: v => { inv = v; },
  getGold: () => gold, setGold: v => { gold = v; }, getDrops: () => drops, getShots: () => shots,
  getPhase: () => phase, setPhase: v => { phase = v; }, getOver: () => over, getCi: () => ci, setCi: v => { ci = v; },
  getKillsLeft: () => killsLeft, setPanel: v => { panel = v; }, setMouse: (x, y) => { mouse.x = x; mouse.y = y; },
  swing, shootBolt, SWORD, ARMOR, TIERS, FOES, POTIONS, STUFF, RUNES, ENCH, WX0, WY0, WX1, WY1,
  getScroll: () => ({ bag: bagScroll, bench: benchScroll }),
  setScroll: (b, n) => { if (b === 'bag') bagScroll = n; else benchScroll = n; },
  getHits: () => uiHit,
};
