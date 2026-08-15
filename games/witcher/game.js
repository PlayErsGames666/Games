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

// Материалы и припасы. Масла лежат тут же: по смыслу это расходник к мечу,
// а не зелье — токсичности от них нет, пить их незачем.
const STUFF = {
  bolt:    { n: 'Болты',     ico: '➶', w: 0.05, price: 2,  desc: 'снаряды для арбалета' },
  ore:     { n: 'Руда',      ico: '⛏', w: 1.0,  price: 14, desc: 'на улучшение мечей' },
  hide:    { n: 'Шкура',     ico: '🧵', w: 0.8,  price: 12, desc: 'на улучшение доспехов' },
  essence: { n: 'Эссенция',  ico: '✨', w: 0.2,  price: 30, desc: 'на зачарование' },
  oilsil:  { n: 'Масло от нечисти', ico: '🧴', w: 0.3, price: 45, oil: 'silver', hits: 25,
             desc: 'мажется на серебряный меч: +40% урона на 25 ударов' },
  oilste:  { n: 'Масло от людей',   ico: '🛢', w: 0.3, price: 45, oil: 'steel',  hits: 25,
             desc: 'мажется на стальной меч: +40% урона на 25 ударов' },
};
const OIL_MUL = 1.4;
function oilFor(metal) { return metal === 'silver' ? 'oilsil' : 'oilste'; }

/* Рюкзаки. Предел веса был намертво прибит к семидесяти килограммам, и
   единственным ответом на «не поднять» было «выброси». Теперь предел
   носят на спине: сам мешок тоже весит, так что самый большой не всегда
   самый выгодный. */
const BAGS = {
  none:   { n: 'Заплечный мешок',  ico: '🎒', cap: 0,  w: 0,   price: 0,   desc: 'то, с чем вышел из дому' },
  hide:   { n: 'Кожаный ранец',    ico: '🧳', cap: 25, w: 2.0, price: 130, desc: '+25 кг, сам весит 2' },
  hunter: { n: 'Охотничий короб',  ico: '🛄', cap: 45, w: 4.0, price: 280, desc: '+45 кг, сам весит 4' },
  master: { n: 'Ведьмачий вьюк',   ico: '🧰', cap: 70, w: 6.5, price: 520, desc: '+70 кг, сам весит 6.5' },
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

/* =====================  МЕСТА И МИР  =====================
   Мир один и сплошной: шесть краёв на общей карте, между ними ХОДЯТ ногами.
   Никаких переносов «взял контракт — очнулся в болоте»: взял работу у доски,
   вышел из лагеря и потопал. Экран — это окно в мир, оно едет за ведьмаком.

   Место решает, как ты там ходишь, далеко ли видишь и кто в нём хозяин:
   в болоте утопец быстрее тебя, на тракте лучник простреливает всё поле,
   в чаще не видно дальше вытянутой руки. */
const LOCS = {
  field:  { n: 'Перелесок', ico: '🌾', ground: '#161c14', sp1: '#1d2519', sp2: '#1a2217',
            veg: '🌳', rock: '🪨', obst: 7, rmin: 11, rmax: 18, spd: 1,
            note: 'ничего особенного — просто дорога между местами' },
  camp:   { n: 'Лагерь', ico: '🏕', ground: '#141a12', sp1: '#1a2318', sp2: '#18211a',
            veg: '🌲', rock: '🪨', obst: 12, rmin: 12, rmax: 21, spd: 1,
            note: 'костёр, верстак и ни одной твари' },
  swamp:  { n: 'Болото', ico: '🌫', ground: '#111a19', sp1: '#16211f', sp2: '#131d1c',
            veg: '🌿', rock: '🪨', obst: 9, rmin: 10, rmax: 18, spd: 0.82,
            fog: true, home: 'drowner', pools: true,
            note: 'вязко — ходишь медленнее, а утопцы тут дома' },
  woods:  { n: 'Чаща',   ico: '🌲', ground: '#0f150f', sp1: '#141c14', sp2: '#121a13',
            veg: '🌲', rock: '🪨', obst: 22, rmin: 12, rmax: 22, spd: 1,
            dark: 1, home: 'wolfen',
            note: 'темно и тесно от стволов — тварь видно, только когда она рядом' },
  road:   { n: 'Тракт',  ico: '🛣', ground: '#191712', sp1: '#221d16', sp2: '#1e1a14',
            veg: '🌳', rock: '🪨', obst: 5, rmin: 12, rmax: 20, spd: 1.06,
            open: true,
            note: 'открыто — бежится легко, но и стрела летит через всё поле' },
  barrow: { n: 'Курган', ico: '⛰', ground: '#15131a', sp1: '#1c1823', sp2: '#191620',
            veg: '🗿', rock: '🪨', obst: 20, rmin: 10, rmax: 16, spd: 1,
            home: 'nekker',
            note: 'камни всюду — не разбежишься и не увернёшься толком' },
};

/* Карта мира: три края в ряд, два ряда. Лагерь посередине снизу, от него
   до любого места — минута ходьбы, а не загрузка. */
const CELL_W = 520, CELL_H = 490;
const MAP = [
  ['swamp', 'woods', 'barrow'],
  ['field', 'camp',  'road'],
];
const MAP_W = MAP[0].length, MAP_H = MAP.length;
const WORLD_W = CELL_W * MAP_W, WORLD_H = CELL_H * MAP_H;
function cellAt(x, y) {
  const cx = clamp(Math.floor(x / CELL_W), 0, MAP_W - 1);
  const cy = clamp(Math.floor(y / CELL_H), 0, MAP_H - 1);
  return { cx, cy, id: MAP[cy][cx] };
}
function locAt(x, y) { return cellAt(x, y).id; }
function cellOf(id) {
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) if (MAP[r][c] === id) return { cx: c, cy: r };
  return { cx: 1, cy: 1 };
}
function cellRect(id) {
  const c = cellOf(id);
  return { x0: c.cx * CELL_W, y0: c.cy * CELL_H, x1: (c.cx + 1) * CELL_W, y1: (c.cy + 1) * CELL_H,
           mx: (c.cx + 0.5) * CELL_W, my: (c.cy + 0.5) * CELL_H };
}
// костёр, верстак и доска работ стоят в лагере на своих местах
const CAMP = cellRect('camp');
const FIRE = { x: CAMP.mx, y: CAMP.my + 40 };
const BENCH = { x: CAMP.mx - 96, y: CAMP.my + 40 };
const BOARD = { x: CAMP.mx + 96, y: CAMP.my + 40 };

/* =====================  ДОСКА КОНТРАКТОВ  =====================
   Работы, из которых складывается выбор у костра. d — тяжесть: она же
   множитель и на число целей, и на плату. Тяжёлые работы появляются на
   доске не сразу: на первом контракте лешак — это не выбор, а казнь. */
const JOBS = [
  { t: 'Утопцы у брода',       pool: ['drowner'],                    loc: 'swamp',  d: 0.7 },
  { t: 'Топляки в трясине',    pool: ['drowner', 'drowner', 'nekker'],loc: 'swamp', d: 1.05 },
  { t: 'Гнездо нечисти',       pool: ['drowner', 'nekker', 'wolfen'],loc: 'swamp',  d: 1.35 },
  { t: 'Накеры в кургане',     pool: ['nekker', 'nekker', 'drowner'],loc: 'barrow', d: 0.9 },
  { t: 'Курганная нежить',     pool: ['nekker', 'nekker', 'wolfen'], loc: 'barrow', d: 1.3 },
  { t: 'Волколак в чаще',      pool: ['wolfen', 'nekker'],           loc: 'woods',  d: 1.15 },
  { t: 'Волчья стая',          pool: ['wolfen', 'wolfen', 'nekker'], loc: 'woods',  d: 1.45 },
  { t: 'ЛЕШАК',               pool: ['leshy', 'nekker', 'nekker'],   loc: 'woods',  d: 1.9 },
  { t: 'Разбойники на тракте', pool: ['bandit', 'bandit', 'archer'], loc: 'road',   d: 0.8 },
  { t: 'Кабаны на выпасе',     pool: ['boar', 'boar'],               loc: 'road',   d: 0.85 },
  { t: 'Кабанья потрава',      pool: ['boar', 'boar', 'bandit'],     loc: 'woods',  d: 1.0 },
  { t: 'Засада на большаке',   pool: ['archer', 'archer', 'bandit'], loc: 'road',   d: 1.2 },
  { t: 'Наёмники барона',      pool: ['merc', 'archer', 'bandit'],   loc: 'road',   d: 1.25 },
  { t: 'Дезертиры в чаще',     pool: ['merc', 'bandit', 'bandit'],   loc: 'woods',  d: 1.3 },
];
function jobFam(j) {                                   // кем работа населена — от этого меч
  let m = 0;
  for (const t of j.pool) if (FOES[t].fam === 'monster') m++;
  return m === j.pool.length ? 'monster' : m ? 'mixed' : 'mortal';
}
function makeContract(j, k) {
  /* Тяжесть работы поднимает плату целиком, а вот ЧИСЛО целей — только до
     полутора раз: иначе «ЛЕШАК» к десятому контракту превращается в стадо
     из трёх десятков, и это уже не трудная работа, а бессмысленная. */
  const n = clamp(Math.round((5 + k * 1.05) * Math.min(j.d, 1.35)), 3, 24);
  return { t: j.t, pool: j.pool.slice(), loc: j.loc, d: j.d, fam: jobFam(j),
           n, gold: Math.round((70 + k * 42) * j.d * (1 + n * 0.03)) };
}
/* Три работы на выбор. Одна обязательно про нечисть, одна про людей —
   иначе можно уехать по десятку контрактов с одним мечом, а второй так и
   пролежит в ножнах. Третья любая. */
function rollBoard(k) {
  const ok = JOBS.filter(j => j.d <= 0.92 + k * 0.18);
  const mons = ok.filter(j => jobFam(j) === 'monster');
  const mort = ok.filter(j => jobFam(j) !== 'monster');
  const out = [];
  if (mons.length) out.push(pick(mons));
  if (mort.length) out.push(pick(mort));
  for (let i = 0; i < 30 && out.length < 3; i++) { const j = pick(ok); if (out.indexOf(j) < 0) out.push(j); }
  return out.map(j => makeContract(j, k)).sort((a, b) => a.gold - b.gold);
}

/* =====================  СОСТОЯНИЕ  ===================== */

let P, foes, drops, shots, parts, obst, inv, gold, contract, ci, phase, over, cause;
let curLoc = 'camp';                     // где ведьмак стоит ПРЯМО СЕЙЧАС — считается по координатам
let offers = [];                         // три работы на доске у костра
/* Экран — окно в мир, а не сам мир. Камера едет за ведьмаком и упирается
   в края карты, чтобы за границей не зияла чернота. */
const cam = { x: 0, y: 0 };
function syncCam() {
  cam.x = clamp(P.x - WW / 2, 0, Math.max(0, WORLD_W - WW));
  cam.y = clamp(P.y - WH / 2, 0, Math.max(0, WORLD_H - WH));
}
const sx = wx => wx - cam.x + WX0;       // мир → экран
const sy = wy => wy - cam.y + WY0;
function mw() { return { x: mouse.x - WX0 + cam.x, y: mouse.y - WY0 + cam.y }; }   // экран → мир
const L = () => LOCS[curLoc] || LOCS.camp;
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
  let w = bagWeight();                                 // сам мешок тоже на спине
  for (const it of inv) w += itemWeight(it);
  for (const s of [P.steel, P.silver, P.armor]) if (s) w += itemWeight(s);
  return w;
}
function capacity() { return 70 + (P.bag ? BAGS[P.bag].cap : 0); }
function bagWeight() { return P.bag ? BAGS[P.bag].w : 0; }
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
  if (sw.oil > 0) d *= OIL_MUL;                        // смазанный клинок
  if (P.mut > 0) d *= 2.2;
  if (P.buffThunder > 0) d *= 1.45;
  return d;
}
/* Масло. Ведьмачья подготовка: полезли на нечисть — смажь серебро.
   Мажется на тот меч, что сейчас в руке, и тратится только на ударах
   мечом (не на арбалете и не на рунах). */
function applyOil(sw) {
  if (!sw || sw.k !== 'sword') { message('Мазать нечего — в руке нет меча'); return; }
  const id = oilFor(sw.metal), S = STUFF[id];
  if (!useStack(id, 1)) { message('Нет масла «' + S.n.toLowerCase() + '» — купи у костра (U)'); return; }
  sw.oil = S.hits;
  message('🧴 ' + SWORD[sw.metal].n + ' смазан: +40% урона на ' + S.hits + ' ударов');
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
  s *= L().spd;                                        // болото вяжет, тракт торопит
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
  drop(P.x, P.y, it);
  message('Выбросил: ' + itemName(it));
}

/* Надеть. Меч встаёт в свой слот по металлу, снятое падает в сумку.
   Индекс проверяем ДО splice: у indexOf нет предмета — это -1, а splice(-1,1)
   выкидывает последнюю вещь сумки, ни в чём не виноватую. Ровно на этом
   когда-то погорела продажа. */
function equip(it) {
  const at = inv.indexOf(it);
  if (at < 0) { message(it === P.steel || it === P.silver || it === P.armor ? 'Это и так на тебе' : 'Этого нет в сумке'); return; }
  if (it.k === 'sword') {
    const slot = it.metal;
    const old = slot === 'steel' ? P.steel : P.silver;
    inv.splice(at, 1);
    if (slot === 'steel') P.steel = it; else P.silver = it;
    if (old) inv.push(old);
    message('Взял в руку: ' + fullName(it) + (old ? ' · прежний ушёл в сумку' : ''));
  } else if (it.k === 'armor') {
    const old = P.armor;
    inv.splice(at, 1);
    P.armor = it;
    if (old) inv.push(old);
    P.hp = Math.min(P.hp, maxHP());
    message('Надел: ' + fullName(it) + (old ? ' · прежний ушёл в сумку' : ''));
  }
  saveRun();
}
/* НАСКОЛЬКО вещь из сумки лучше надетой.
   Без этой строчки два одинаковых меча в списке неразличимы: жмёшь
   «надеть», они меняются местами, надпись «взял в руку» мелькает — а
   на экране ровно то же самое. Выглядит как сломанная кнопка, хотя
   обмен честно произошёл. */
function slotOf(it) { return it.k === 'armor' ? P.armor : (it.metal === 'steel' ? P.steel : P.silver); }
function gearValue(it) {
  return it.k === 'sword' ? SWORD[it.metal].dmg * TIERS[it.tier].m : ARMOR[it.type].def * TIERS[it.tier].m;
}
function sameGear(a, b) {
  if (!a || !b || a.k !== b.k || a.tier !== b.tier || (a.ench || null) !== (b.ench || null)) return false;
  return a.k === 'sword' ? (a.metal === b.metal && (a.oil | 0) === (b.oil | 0)) : a.type === b.type;
}
function compareNote(it) {                             // it лежит в сумке
  const cur = slotOf(it);
  if (!cur) return { t: 'слот пуст', c: '#7fd6a0' };
  if (sameGear(it, cur)) return { t: 'точно такой же', c: '#8a8f96', same: true };
  const d = Math.round(gearValue(it) - gearValue(cur));
  const what = it.k === 'sword' ? ' урона' : ' брони';
  if (d > 0) return { t: '+' + d + what, c: '#7fd6a0' };
  if (d < 0) return { t: '−' + (-d) + what, c: '#ff7a6a' };
  return { t: 'цифры те же', c: '#c9a227' };           // разница только в чарах или масле
}
/* Подрезаем длинное имя, чтобы оно не налезло на пометку справа. */
function clipText(s, px, size) {
  ctx.font = size + 'px Segoe UI';
  if (ctx.measureText(s).width <= px) return s;
  while (s.length > 4 && ctx.measureText(s + '…').width > px) s = s.slice(0, -1);
  return s + '…';
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
  if (f.dead) return;                                  // добивать труп — значит дважды снять его с контракта
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
    /* Ловушка ложилась ровно под курсор — где бы тот ни был. Курсор на поясе
       (а он там и есть, если Ирден жмут кнопкой) — и 22 единицы энергии
       уходили за нижний край поля, в никуда. Теперь: не дальше 150 шагов,
       всегда внутри поля, а без курсора над полем — прямо перед собой. */
    const MAXR = 150;
    let tx, ty;
    if (mouseInWorld()) {
      const m = mw();
      const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, MAXR / d);
      tx = P.x + dx * k; ty = P.y + dy * k;
    } else { tx = P.x + Math.cos(a) * 70; ty = P.y + Math.sin(a) * 70; }
    P.yrden = { x: clamp(tx, 10, WORLD_W - 10), y: clamp(ty, 10, WORLD_H - 10), t: 7, r: 58 };
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
/* Место для добычи. Куст и камень игрок обходит по дуге r+9, а радиус
   подбора всего 18 — значит вещь, упавшая в середину дерева, недостижима
   навсегда. Раньше в дерево улетало больше трети выпавшего с тех, кто
   умер под кроной. Выталкиваем наружу. */
function freeSpot(x, y) {
  for (let k = 0; k < 12; k++) {
    let moved = false;
    for (const o of obst) {
      const d = Math.hypot(x - o.x, y - o.y), need = o.r + 12;
      if (d < need) {
        const a = d > 0.01 ? Math.atan2(y - o.y, x - o.x) : rnd(6.3);
        x = o.x + Math.cos(a) * need; y = o.y + Math.sin(a) * need; moved = true;
      }
    }
    x = clamp(x, 8, WORLD_W - 8); y = clamp(y, 8, WORLD_H - 8);
    if (!moved) break;
  }
  return { x, y };
}
function drop(x, y, it) {
  const s = freeSpot(x + rnd(20) - 10, y + rnd(20) - 10);
  drops.push({ x: s.x, y: s.y, it, t: 0 });
}
let heavyT = 0;                                        // чтобы отказ не забивал строку сообщений каждый кадр
function pickUp(d) {
  const it = d.it;
  if (it.k === 'gold') { gold += it.n; floaties.push({ x: d.x, y: d.y, txt: '+' + it.n + '💰', t: 0, c: '#f2b134' }); return true; }
  // тяжёлое не поднимаем молча: иначе перегруз наступает незаметно
  if (carried() + itemWeight(it) > capacity() * 1.5) {
    if (heavyT <= 0) { message('Слишком тяжело — не поднять. Выбрось лишнее (I) или продай у костра'); heavyT = 3; }
    return false;
  }
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
    f.x = clamp(f.x, f.r, WORLD_W - f.r); f.y = clamp(f.y, f.r, WORLD_H - f.r);
  }
  if (f.stun > 0) { f.stun -= dt; return; }

  const d = dist(f, P);
  // хозяин места двигается на своей земле резвее: утопец в болоте,
  // волколак в чаще, накер в кургане
  const sp = S.sp * (f.slow > 0 ? 0.45 : 1) * (L().home === f.t ? 1.3 : 1);
  if (S.ranged) {
    // лучник держит дистанцию: подходит на выстрел и пятится, если жмут
    const want = L().open ? 190 : 150;                 // на тракте держится дальше
    const reach = S.reach * (L().open ? 1.3 : 1);
    const a = Math.atan2(P.y - f.y, P.x - f.x);
    if (d > want + 20) { f.x += Math.cos(a) * sp * dt; f.y += Math.sin(a) * sp * dt; }
    else if (d < want - 40) { f.x -= Math.cos(a) * sp * dt; f.y -= Math.sin(a) * sp * dt; }
    f.cd -= dt;
    if (f.cd <= 0 && d < reach) {
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
  /* Деревья и камни держат и нечисть тоже. Раньше игрок обегал сосну,
     а утопец шёл сквозь неё напрямик — укрытий в игре просто не было. */
  for (const o of obst) {
    if (Math.abs(o.x - f.x) > 60 || Math.abs(o.y - f.y) > 60) continue;
    const need = o.r + f.r * 0.7, d = Math.hypot(f.x - o.x, f.y - o.y);
    if (d < need && d > 0.01) {
      const a = Math.atan2(f.y - o.y, f.x - o.x);
      f.x = o.x + Math.cos(a) * need; f.y = o.y + Math.sin(a) * need;
    }
  }
  f.x = clamp(f.x, f.r, WORLD_W - f.r); f.y = clamp(f.y, f.r, WORLD_H - f.r);
}

/* =====================  КОНТРАКТЫ  ===================== */

/* Гуща и камни для ВСЕГО мира разом, у каждого края своя густота.
   Пятачок вокруг костра оставляем чистым — иначе верстак зарастёт. */
function buildWorld() {
  const out = [];
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const id = MAP[r][c], S = LOCS[id], x0 = c * CELL_W, y0 = r * CELL_H;
    for (let i = 0; i < S.obst; i++) {
      const o = { x: x0 + 26 + rnd(CELL_W - 52), y: y0 + 26 + rnd(CELL_H - 52),
                  r: S.rmin + rnd(S.rmax - S.rmin), tree: Math.random() < (id === 'barrow' ? 0.25 : 0.6) };
      if (Math.hypot(o.x - FIRE.x, o.y - FIRE.y) < 150) continue;
      out.push(o);
    }
  }
  return out;
}
/* Взял работу — никто тебя никуда не переносит. Ты стоишь там, где стоял,
   а до места идёшь сам. Отсюда и стрелка на краю экрана, и метка на карте. */
function startContract(c) {
  contract = c || offers[0] || makeContract(JOBS[0], ci);
  phase = 'FIGHT';
  panel = null;
  killsLeft = contract.n;
  spawnQueue = contract.n;
  spawnT = 0;
  const S = LOCS[contract.loc] || LOCS.woods;
  message('📜 ' + contract.t + ': иди в ' + S.ico + ' ' + S.n.toLowerCase() + ' — целей ' + contract.n + '. ' + S.note);
}
let spawnQueue = 0, spawnT = 0;
function spawnTick(dt) {
  if (spawnQueue <= 0 || !contract) return;
  // твари водятся у себя дома: пока не пришёл — и драться не с кем
  if (locAt(P.x, P.y) !== contract.loc) return;
  spawnT -= dt;
  if (spawnT > 0) return;
  spawnT = 0.85;
  const R = cellRect(contract.loc);
  let x, y, tries = 0;
  do {                                                 // где-то в этом краю, но не в лицо
    x = R.x0 + 20 + rnd(CELL_W - 40); y = R.y0 + 20 + rnd(CELL_H - 40);
  } while (Math.hypot(x - P.x, y - P.y) < 215 && ++tries < 40);
  spawnFoe(pick(contract.pool), x, y);
  spawnQueue--;
}
function finishContract() {
  if (!contract) { phase = 'CAMP'; return; }           // без контракта закрывать нечего
  const bonus = contract.gold;
  gold += bonus;
  phase = 'CAMP';
  ci++;
  offers = rollBoard(ci);                              // на доске новые работы
  rollHotGood();                                       // и у скупщика новый спрос
  if (ci > best) { best = ci; try { localStorage.setItem('witcher_best', String(best)); } catch (e) {} }
  /* Награду кладём В СУМКУ. Раньше руда и шкуры падали на землю у костра —
     а костёр теперь на другом конце карты, и трофеи оставались лежать
     чёрт знает где. */
  const ore = 1 + ri(3), hide = 1 + ri(3);
  addStack('ore', ore); addStack('hide', hide);
  message('✅ Контракт закрыт! ' + bonus + ' крон, ⛏' + ore + ' и 🧵' + hide + ' — сразу в сумку. За новой работой — к доске в лагере.');
  saveRun();
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
  saveRun();
}
function enchant(it) {
  const price = 120, need = 2;
  if (gold < price) { message('Зачарование стоит ' + price + ' крон'); return; }
  if (countStack('essence') < need) { message('Нужно ' + need + ' × эссенция'); return; }
  gold -= price; useStack('essence', need);
  let e; do { e = pick(ENCH_KEYS); } while (e === it.ench && ENCH_KEYS.length > 1);
  it.ench = e;
  message('✨ ' + ENCH[e].n + ': ' + ENCH[e].desc);
  saveRun();
}
/* =====================  ЛАВКА  =====================
   Скупщик берёт всё за 60% цены — кроме одного товара, на который у него
   сегодня спрос: за него платит полную. Товар меняется от контракта к
   контракту, так что руду и шкуры иногда выгоднее попридержать.

   Купить у него всегда дороже, чем продать ему же (даже по полной), —
   иначе на разнице делались бы деньги из воздуха. */
const TRADE_RATE = 0.6;
let hotGood = 'hide';
const TRADEABLE = ['ore', 'hide', 'essence', 'bolt', 'oilsil', 'oilste', 'swallow', 'thunder', 'honey', 'shit'];
function rollHotGood() { hotGood = pick(TRADEABLE); }
function goodInfo(id) { return POTIONS[id] || STUFF[id]; }
function sellRate(id) { return id === hotGood ? 1 : TRADE_RATE; }
function stackPrice(id, n) { return Math.max(1, Math.round(goodInfo(id).price * n * sellRate(id))); }
function sellStack(id, n) {
  const have = countStack(id);
  n = Math.min(n | 0, have);
  if (n <= 0) { message('Нечего продавать'); return; }
  const p = stackPrice(id, n);
  useStack(id, n); gold += p;
  message('💰 ' + goodInfo(id).n + ' ×' + n + ' → ' + p + ' крон' + (id === hotGood ? ' (сегодня в цене!)' : ''));
  saveRun();
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
  saveRun();
}
function buyBag(id) {
  const B = BAGS[id];
  if (!B) return;
  if (P.bag === id) { message('Такой уже за спиной'); return; }
  if (gold < B.price) { message('Нужно ' + B.price + ' крон, у тебя ' + Math.floor(gold)); return; }
  gold -= B.price;
  const old = P.bag ? BAGS[P.bag].n.toLowerCase() : null;
  P.bag = id;
  message('🎒 ' + B.n + ': предел веса теперь ' + capacity() + ' кг' + (old ? ' (' + old + ' ушёл в уплату)' : ''));
  saveRun();
}
function buy(id, n, price) {
  if (gold < price) { message('Не хватает крон: нужно ' + price); return; }
  gold -= price; addStack(id, n);
  message('Куплено: ' + (POTIONS[id] || STUFF[id]).n + ' ×' + n);
  saveRun();
}

/* =====================  СОХРАНЕНИЕ ПОХОДА  =====================
   Контракты идут долго, а закладка закрывается быстро. Пишем поход в
   localStorage, но ТОЛЬКО в лагере: бой не сохраняется, значит и досохраниться
   до победы посреди драки нельзя. Смерть стирает запись. */
const SAVE_KEY = 'witcher_run';
let saveT = 0;
function saveRun() {
  if (over || phase !== 'CAMP' || !P) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, ci, gold, hp: P.hp, tox: P.tox, mutGauge: P.mutGauge, hand: P.hand, potSel: P.potSel,
      steel: P.steel, silver: P.silver, armor: P.armor, inv, offers, hot: hotGood,
      x: P.x, y: P.y, bag: P.bag,
    }));
  } catch (e) {}
}
function clearRun() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* Из localStorage приходит что угодно — хоть правленое руками. Поэтому вещи
   не берём как есть, а собираем заново из проверенных полей: чужой ключ
   металла или ступень 99 уронили бы отрисовку намертво. */
function reviveItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.k === 'stack') {
    if (!(POTIONS[it.id] || STUFF[it.id])) return null;
    const n = Math.floor(+it.n); if (!(n > 0)) return null;
    return mkStack(it.id, Math.min(n, 9999));
  }
  const tier = clamp(Math.floor(+it.tier) || 0, 0, TIERS.length - 1);
  const ench = it.ench && ENCH[it.ench] ? it.ench : null;
  if (it.k === 'sword' && SWORD[it.metal]) {
    const g = mkSword(it.metal, tier, ench);
    g.oil = clamp(Math.floor(+it.oil) || 0, 0, 99);
    return g;
  }
  if (it.k === 'armor' && ARMOR[it.type]) return mkArmor(it.type, tier, ench);
  return null;
}
function loadRun() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || s.v !== 1 || !Array.isArray(s.inv)) return false;
  const sw = (raw, metal) => { const g = reviveItem(raw); return g && g.k === 'sword' && g.metal === metal ? g : null; };
  ci = clamp(Math.floor(+s.ci) || 0, 0, 9999);
  gold = clamp(Math.floor(+s.gold) || 0, 0, 9e6);
  P.steel = sw(s.steel, 'steel');
  P.silver = sw(s.silver, 'silver');
  const ar = reviveItem(s.armor); P.armor = ar && ar.k === 'armor' ? ar : null;
  inv = s.inv.slice(0, 300).map(reviveItem).filter(Boolean);
  P.hand = s.hand === 'silver' ? 'silver' : 'steel';
  P.potSel = POTIONS[s.potSel] ? s.potSel : 'swallow';
  P.tox = clamp(+s.tox || 0, 0, 100);
  P.mutGauge = clamp(+s.mutGauge || 0, 0, 100);
  P.hp = clamp(+s.hp || maxHP(), 1, maxHP());
  // доска: работы из записи, но только целые и понятные. Битые — пересдаём
  offers = (Array.isArray(s.offers) ? s.offers : []).filter(okOffer).slice(0, 3).map(o => ({
    t: String(o.t).slice(0, 60), pool: o.pool.slice(0, 6), loc: o.loc, fam: o.fam || 'mixed',
    n: clamp(Math.floor(+o.n), 1, 199), gold: clamp(Math.floor(+o.gold), 0, 9e5), d: +o.d || 1,
  }));
  if (!offers.length) offers = rollBoard(ci);
  hotGood = TRADEABLE.indexOf(s.hot) >= 0 ? s.hot : hotGood;
  if (isFinite(+s.x) && isFinite(+s.y)) {           // где стоял, там и встанешь
    P.x = clamp(+s.x, 9, WORLD_W - 9); P.y = clamp(+s.y, 9, WORLD_H - 9);
  }
  P.bag = BAGS[s.bag] && s.bag !== 'none' ? s.bag : null;
  curLoc = locAt(P.x, P.y); syncCam();
  return true;
}
function okOffer(o) {
  return !!o && typeof o.t === 'string' && Array.isArray(o.pool) && o.pool.length > 0 &&
    o.pool.every(t => !!FOES[t]) && !!LOCS[o.loc] && +o.n > 0 && +o.n < 200 && +o.gold >= 0;
}

/* =====================  ЦИКЛ  ===================== */

function message(t) { msg = t; msgT = 4; }

function reset() {
  P = {
    x: FIRE.x, y: FIRE.y + 60, hp: 100, mp: 100, tox: 0, hand: 'steel',
    steel: mkSword('steel', 0, null), silver: mkSword('silver', 0, null), armor: mkArmor('light', 0, null),
    atkCd: 0, boltCd: 0, dodge: 0, dodgeCd: 0, dx: 0, dy: 0, inv: 0, swing: null,
    runeCd: [0, 0, 0, 0], quen: 0, quenT: 0, yrden: null, mut: 0, mutGauge: 0,
    regen: 0, buffThunder: 0, biz: 0, slow: 0, shake: 0, face: -Math.PI / 2,
    potSel: 'swallow',        // после «Заново» выбор зелья не должен слетать в никуда
    bag: null,                // рюкзак покупается у торговца и поднимает предел веса
  };
  P.hp = maxHP();
  inv = [mkStack('bolt', 20), mkStack('swallow', 2), mkStack('honey', 1)];
  gold = 120; ci = 0; foes = []; drops = []; shots = []; parts = []; floaties = [];
  contract = null; phase = 'CAMP'; over = false; cause = ''; panel = null; paused = false;
  killsLeft = 0; spawnQueue = 0;
  // мир строится один раз на весь поход и больше не перетасовывается
  obst = buildWorld();
  curLoc = 'camp'; syncCam();
  offers = rollBoard(0); rollHotGood(); benchTab = 'work';
  message('Лагерь. 📜 доска работ — E, ⚒ верстак — U. До мест идти ногами.');
  updateButtons();
}
function endGame(why) {
  if (over) return;
  over = true; cause = why; panel = null;
  clearRun();                                          // смерть — конец похода, продолжать нечего
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
  P.x = clamp(P.x, 9, WORLD_W - 9); P.y = clamp(P.y, 9, WORLD_H - 9);
  // препятствия (перебираем только те, что рядом: их на весь мир под сотню)
  for (const o of obst) {
    if (Math.abs(o.x - P.x) > 60 || Math.abs(o.y - P.y) > 60) continue;
    const d = Math.hypot(P.x - o.x, P.y - o.y);
    if (d < o.r + 9 && d > 0) {
      const a = Math.atan2(P.y - o.y, P.x - o.x);
      P.x = o.x + Math.cos(a) * (o.r + 9); P.y = o.y + Math.sin(a) * (o.r + 9);
    }
  }
  curLoc = locAt(P.x, P.y);                            // где стоим — то и правила
  syncCam();
  if (mouseInWorld()) { const m = mw(); P.face = Math.atan2(m.y - P.y, m.x - P.x); }

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
        if (sw && sw.oil > 0 && --sw.oil <= 0) message('🧴 Масло сошло с клинка');
      }
    }
    if (P.swing.t > 0.3) P.swing = null;
  }

  if (mouse.down) swing();

  // --- снаряды ---
  for (const s of shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.x < 0 || s.x > WORLD_W || s.y < 0 || s.y > WORLD_H) s.life = 0;
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
  if (heavyT > 0) heavyT -= dt;
  for (const d of drops) {
    d.t += dt;
    const dd = Math.hypot(d.x - P.x, d.y - P.y);
    // кроны сами прыгают в карман: иначе после боя приходится вручную
    // объезжать поле по монетке, а забытое золото копится мусором
    if (d.it.k === 'gold' && dd < 95 && dd > 1) {
      const k = Math.min(1, (300 - dd) / 300) * 260 * dt;
      d.x += (P.x - d.x) / dd * k; d.y += (P.y - d.y) / dd * k;
    }
    if (dd < 18) { if (pickUp(d)) d.gone = true; }
  }
  drops = drops.filter(d => !d.gone);

  // --- контракт ---
  if (phase === 'FIGHT') {
    spawnTick(dt);
    if (killsLeft <= 0 && !foes.length && spawnQueue <= 0) finishContract();
  } else if (!over) {
    saveT -= dt;
    if (saveT <= 0) { saveT = 2; saveRun(); }           // в лагере поход пишется сам
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
  /* Всё, что ниже, рисуется в МИРОВЫХ координатах: сдвигаем холст на
     камеру и подрезаем окном. Поэтому дальше можно писать o.x, f.y — как
     будто мира ровно столько, сколько его есть. */
  const S = L();
  ctx.save();
  ctx.beginPath(); ctx.rect(WX0, WY0, WW, WH); ctx.clip();
  ctx.translate(WX0 - cam.x, WY0 - cam.y);

  // земля: рисуем только те края, что попали в окно
  const c0 = Math.max(0, Math.floor(cam.x / CELL_W)), c1 = Math.min(MAP_W - 1, Math.floor((cam.x + WW) / CELL_W));
  const r0 = Math.max(0, Math.floor(cam.y / CELL_H)), r1 = Math.min(MAP_H - 1, Math.floor((cam.y + WH) / CELL_H));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const id = MAP[r][c], G = LOCS[id], x0 = c * CELL_W, y0 = r * CELL_H;
    ctx.fillStyle = G.ground; ctx.fillRect(x0, y0, CELL_W, CELL_H);
    if (G.open) {                                      // накатанная колея
      ctx.fillStyle = '#241f17'; ctx.fillRect(x0, y0 + CELL_H * 0.42, CELL_W, CELL_H * 0.16);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(x0, y0 + CELL_H * 0.46, CELL_W, 2); ctx.fillRect(x0, y0 + CELL_H * 0.53, CELL_W, 2);
    }
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? G.sp1 : G.sp2;
      ctx.fillRect(x0 + ((i * 97) % CELL_W), y0 + ((i * 131) % CELL_H), 9, 5);
    }
    ctx.globalAlpha = 1;
    if (G.pools) {                                     // лужи стоячей воды
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = 'rgba(70,110,120,.16)';
        ctx.beginPath();
        ctx.ellipse(x0 + 40 + ((i * 173 + 40) % (CELL_W - 80)), y0 + 30 + ((i * 211 + 30) % (CELL_H - 60)),
                    34 + (i % 3) * 9, 15 + (i % 2) * 6, 0, 0, 6.3);
        ctx.fill();
      }
    }
    // межа между краями — видно, что мир не однородная каша
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, CELL_W - 2, CELL_H - 2);
  }

  // ловушка Ирдена
  if (P.yrden) {
    ctx.strokeStyle = 'rgba(180,120,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(P.yrden.x, P.yrden.y, P.yrden.r, 0, 6.3); ctx.stroke();
    ctx.fillStyle = 'rgba(140,90,220,.14)'; ctx.fill();
  }

  // лагерь: костёр, верстак и доска работ стоят на своих местах в мире
  ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🔥', FIRE.x, FIRE.y + Math.sin(anim * 6) * 1.5);
  ctx.fillText('⚒', BENCH.x, BENCH.y);
  ctx.fillText('📜', BOARD.x, BOARD.y);
  txt('костёр', FIRE.x, FIRE.y + 24, 9, '#98a2ae', 'center');
  txt('U — верстак', BENCH.x, BENCH.y + 24, 10, '#98a2ae', 'center');
  txt('E — доска работ', BOARD.x, BOARD.y + 24, 10, '#c9a227', 'center');

  // гуща и камни: у каждого края свои
  for (const o of obst) {
    if (o.x < cam.x - 40 || o.x > cam.x + WW + 40 || o.y < cam.y - 40 || o.y > cam.y + WH + 40) continue;
    const G = LOCS[locAt(o.x, o.y)];
    ctx.font = (o.r * 1.9 | 0) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.tree ? G.veg : G.rock, o.x, o.y);
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

  /* Темнота чащи и туман болота — по тому краю, где СТОИШЬ ТЫ. Это не
     украшение, а правило места: в чаще тварь видно, только когда она рядом. */
  if (S.dark) {
    const g = ctx.createRadialGradient(P.x, P.y, 105, P.x, P.y, 290);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.84)');
    ctx.fillStyle = g; ctx.fillRect(cam.x, cam.y, WW, WH);
  }
  if (S.fog) {
    ctx.fillStyle = 'rgba(150,170,175,.07)'; ctx.fillRect(cam.x, cam.y, WW, WH);
    for (let i = 0; i < 3; i++) {                      // ползущие полосы марева
      const y = cam.y + ((anim * (5 + i * 3) + i * 170) % (WH + 120)) - 60;
      ctx.fillStyle = 'rgba(175,195,200,.05)'; ctx.fillRect(cam.x, y, WW, 44);
    }
  }
  ctx.restore();                                       // конец мировых координат

  drawCompass();
  ctx.strokeStyle = 'rgba(201,162,39,.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(WX0 - 0.5, WY0 - 0.5, WW + 1, WH + 1);
}

/* Карта мира и стрелка к цели — прямо в окне, в правом верхнем углу.
   В открытом мире без них теряешься: где лагерь, куда идти по контракту. */
function drawCompass() {
  const w = 96, h = 64, x = WX1 - w - 8, y = WY0 + 8;
  const cw = w / MAP_W, ch = h / MAP_H;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(8,7,6,.75)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const id = MAP[r][c];
    ctx.fillStyle = LOCS[id].ground;
    ctx.fillRect(x + c * cw, y + r * ch, cw - 1, ch - 1);
    if (contract && phase === 'FIGHT' && id === contract.loc) {   // куда идти
      ctx.strokeStyle = '#ff7a5a'; ctx.lineWidth = 2;
      ctx.strokeRect(x + c * cw + 1, y + r * ch + 1, cw - 3, ch - 3);
    }
    ctx.font = '9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LOCS[id].ico, x + c * cw + cw / 2, y + r * ch + ch / 2);
  }
  // где ты
  ctx.fillStyle = '#f2d59a';
  ctx.beginPath(); ctx.arc(x + (P.x / WORLD_W) * w, y + (P.y / WORLD_H) * h, 2.5, 0, 6.3); ctx.fill();
  ctx.globalAlpha = 1;

  // стрелка к цели, если она за краем экрана
  let goal = null;
  if (phase === 'FIGHT' && contract && locAt(P.x, P.y) !== contract.loc) goal = cellRect(contract.loc);
  else if (phase === 'CAMP' && locAt(P.x, P.y) !== 'camp') goal = { mx: BOARD.x, my: BOARD.y };
  if (!goal) return;
  const a = Math.atan2(goal.my - P.y, goal.mx - P.x);
  const cx = WX0 + WW / 2, cy = WY0 + WH / 2, rr = Math.min(WW, WH) * 0.42;
  const ax = cx + Math.cos(a) * rr, ay = cy + Math.sin(a) * rr;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = 'rgba(242,177,52,.85)';
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  const dist2 = Math.round(Math.hypot(goal.mx - P.x, goal.my - P.y));
  txt(phase === 'FIGHT' ? (LOCS[contract.loc].ico + ' ' + LOCS[contract.loc].n + ' · ' + dist2 + ' шагов')
                        : ('🏕 лагерь · ' + dist2 + ' шагов'),
      ax, ay + 14, 9, '#f2d59a', 'center');
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

  // меч в руке. По коробке можно щёлкнуть — это тот же Q: в полном экране
  // кнопка «Сменить меч» под игрой не показывается, а меч меняют постоянно.
  const sw = activeSword();
  uiHit.push({ x: mx, y: 23, w: 92, h: 21, fn: swapHand });
  ctx.fillStyle = 'rgba(40,36,30,.9)'; ctx.fillRect(mx, 23, 92, 21);
  ctx.strokeStyle = sw ? TIERS[sw.tier].c : '#555'; ctx.lineWidth = 1; ctx.strokeRect(mx + .5, 23.5, 91, 20);
  txt(sw ? SWORD[sw.metal].ico + ' ' + (sw.metal === 'silver' ? 'СЕРЕБРО' : 'СТАЛЬ') : 'без меча', mx + 5, 30, 10, sw ? SWORD[sw.metal].c : '#888');
  txt('Q ⇄', mx + 87, 30, 8, '#98a2ae', 'right');
  txt(sw ? TIERS[sw.tier].n + (sw.ench ? ' ' + ENCH[sw.ench].ico : '') + (sw.oil > 0 ? ' 🧴' + sw.oil : '') : 'Q — сменить', mx + 5, 40, 8, sw && sw.oil > 0 ? '#7fd6a0' : '#98a2ae');

  // золото, вес, болты
  const rx = CW - 10;
  txt('💰 ' + gold, rx, 15, 12, '#f2b134', 'right');
  const ld = loadState();                              // не L: L() — это место, и оно тут же рядом
  txt('⚖ ' + carried().toFixed(1) + ' / ' + capacity() + ' кг', rx, 29, 10,
    ld.lvl === 0 ? '#98a2ae' : ld.lvl === 1 ? '#ffb43a' : '#ff5a4a', 'right');
  txt('➶ болты: ' + countStack('bolt'), rx, 41, 9, '#98a2ae', 'right');

  // где ты и что делаешь. Место читается по ногам, а не по фазе игры
  const here = L().ico + ' ' + L().n;
  if (phase === 'FIGHT' && contract) {
    const there = locAt(P.x, P.y) === contract.loc;
    txt(here + ' · ' + contract.t + (there ? ' — осталось ' + Math.max(0, killsLeft)
                                           : ' — иди в ' + (LOCS[contract.loc] || LOCS.woods).n.toLowerCase()),
        CW / 2, 50, 11, there ? '#e8d9a8' : '#f2b134', 'center');
  } else {
    txt(here + ' · контракт ' + (ci + 1) + ' · рекорд: ' + best, CW / 2, 50, 10, '#98a2ae', 'center');
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

  // МАСЛО на клинок, что сейчас в руке
  {
    const x = 338, y = by + 4, w = 104, h = 30;
    const sw2 = activeSword();
    const oilId = sw2 ? oilFor(sw2.metal) : 'oilste';
    const have = countStack(oilId), left = sw2 && sw2.oil > 0 ? sw2.oil : 0;
    const can = !!sw2 && have > 0;
    uiHit.push({ x, y, w, h, fn: () => applyOil(activeSword()) });
    if (hov(x, y, w, h)) hint = '🧴 ' + STUFF[oilId].n + ' — ' + STUFF[oilId].desc + ' · клавиша O · в сумке ' + have;
    ctx.fillStyle = left ? 'rgba(50,90,60,.55)' : can ? 'rgba(60,70,45,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = left ? '#7fd6a0' : can ? '#9ab04a' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(STUFF[oilId].ico + ' Масло (O)', x + 4, y + 10, 10, can || left ? '#e0f0c0' : '#6c7683');
    txt(left ? 'на клинке: ' + left + ' ударов' : 'в сумке ' + have + ' · +40% урона',
        x + 4, y + 22, 9, left ? '#7fd6a0' : have ? '#98a2ae' : '#6c7683');
  }

  // МУТАЦИЯ: в полном экране кнопок под игрой не видно, а R знают не все
  {
    const x = 448, y = by + 4, w = 62, h = 30;
    const ready = P.mut > 0 || P.mutGauge >= 100;
    uiHit.push({ x, y, w, h, fn: () => toggleMutation() });
    if (hov(x, y, w, h)) hint = '🩸 Кровавая ебатня — копится с убийств. Урон вдвое и чужая кровь лечит, но и по тебе бьёт больнее · клавиша R';
    ctx.fillStyle = P.mut > 0 ? 'rgba(140,30,30,.6)' : ready ? 'rgba(110,40,40,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ready ? '#ff6a5a' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt('🩸 R', x + 4, y + 10, 10, ready ? '#ffb0a8' : '#6c7683');
    txt(P.mut > 0 ? P.mut.toFixed(1) + 'с' : Math.round(P.mutGauge) + '/100', x + 4, y + 22, 9, ready ? '#ffb0a8' : '#98a2ae');
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
      if (it.oil > 0) sub += ' · 🧴' + it.oil;
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
  const B = P.bag ? BAGS[P.bag] : BAGS.none;
  txt(B.ico + ' ' + B.n + ' — предел ' + capacity() + ' кг' + (P.bag ? ' (сам весит ' + B.w + ')' : ' · рюкзаки продаются в лавке'),
      CW - 24, y - 6, 9, P.bag ? '#f2d59a' : '#6c7683', 'right');
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
    // для железа пишем, чем оно лучше надетого: иначе «надеть» вслепую
    const note = it.k !== 'stack' ? compareNote(it) : null;
    ctx.font = '9px Segoe UI';
    const room = CW - 236 - (note ? ctx.measureText(note.t).width : 0);
    txt(clipText(itemIco(it) + '  ' + fullName(it), room, 10), 30, rowY + 11, 10, it.k === 'stack' ? '#e6ebf2' : TIERS[it.tier].c);
    if (note) txt(note.t, CW - 200, rowY + 11, 9, note.c, 'right');
    txt(itemWeight(it).toFixed(1) + ' кг', CW - 150, rowY + 11, 9, '#98a2ae', 'right');
    if (it.k === 'stack' && POTIONS[it.id]) btn(CW - 142, rowY + 3, 52, 16, 'выпить', () => drink(it.id));
    // масло мажется на СВОЙ меч, какой бы ни был сейчас в руке
    else if (it.k === 'stack' && STUFF[it.id] && STUFF[it.id].oil)
      btn(CW - 142, rowY + 3, 52, 16, 'смазать', () => applyOil(STUFF[it.id].oil === 'silver' ? P.silver : P.steel));
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

/* Доска работ. Раньше контракт был один и его просто выдавали: идёшь
   куда сказано и деремся с кем дали. Теперь три штуки на выбор, и в
   каждой написано главное — КУДА, КТО и СКОЛЬКО ПЛАТЯТ, — чтобы решение
   принималось до того, как ты вышел из лагеря без того меча. */
function drawBoard() {
  panelBox('📜 ДОСКА РАБОТ');
  txt('Три работы. Возьмёшь одну — остальные пропадут, на доске появятся новые.',
      CW / 2, 70, 9, '#98a2ae', 'center');
  let y = 84;
  for (const o of offers) {
    const S = LOCS[o.loc] || LOCS.woods;
    const fam = o.fam === 'monster' ? '⚔ серебро' : o.fam === 'mortal' ? '🗡 сталь' : '⚔🗡 оба меча';
    const famC = o.fam === 'monster' ? '#a8c6e8' : o.fam === 'mortal' ? '#e8a05a' : '#e8d9a8';
    ctx.fillStyle = 'rgba(20,18,15,.85)'; ctx.fillRect(24, y, CW - 48, 74);
    ctx.strokeStyle = 'rgba(201,162,39,.28)'; ctx.lineWidth = 1; ctx.strokeRect(24.5, y + .5, CW - 49, 73);
    txt(o.t, 34, y + 14, 12, '#e8d9a8');
    txt('💰 ' + o.gold, CW - 34, y + 14, 12, '#f2b134', 'right');
    txt(S.ico + ' ' + S.n + ' · ' + S.note, 34, y + 30, 9, '#c9a227');
    // кто там водится — иконками, чтобы не читать, а видеть
    const who = [];
    for (const t of o.pool) if (who.indexOf(t) < 0) who.push(t);
    txt(who.map(t => FOES[t].ico + ' ' + FOES[t].n).join('   ') + '   ·   целей ' + o.n,
        34, y + 45, 9, '#c2cad2');
    txt(fam, 34, y + 60, 10, famC);
    btn(CW - 116, y + 50, 82, 19, '📜 взять', () => startContract(o), 'rgba(80,66,30,.95)');
    y += 80;
  }
  panelFooter('E или ✕ — закрыть · плата тем больше, чем злее работа');
}

/* Верстак и лавка разъехались по вкладкам. Раньше они делили одну панель:
   список железа упирался в полку с товаром, а продавать припасы было
   негде вовсе — руда и лишние зелья просто копили вес. */
let benchTab = 'work';
function drawBench() {
  panelBox('⚒ ВЕРСТАК И ЛАВКА');
  const tabs = [['work', '⚒ Работа с железом'], ['shop', '💰 Лавка']];
  let tx = 24;
  for (const [id, label] of tabs) {
    const on = benchTab === id;
    btn(tx, 62, 150, 20, label, () => { benchTab = id; benchScroll = 0; },
        on ? 'rgba(96,78,36,.95)' : 'rgba(34,31,26,.9)');
    tx += 156;
  }
  if (benchTab === 'shop') { drawShop(); return; }

  let y = 92;
  txt('Улучшение: обычный → улучшенный → отличный → мастерский → гроссмейстер', 24, y - 4, 9, '#98a2ae');
  y += 12;

  const gear = [P.steel, P.silver, P.armor].concat(inv.filter(i => i.k !== 'stack')).filter(Boolean);
  // список железа тоже катается: раньше показывались первые шесть, и седьмой
  // меч нельзя было ни улучшить, ни продать — он просто не отображался
  const v = listView(gear.length, y, CH - 70, 28, benchScroll);
  benchScroll = v.from;
  scrollBtns(y - 12, v, () => benchScroll, n => { benchScroll = clamp(n, 0, v.max); });
  for (const it of gear.slice(v.from, v.from + v.vis)) {
    const inBag = inv.indexOf(it) >= 0;
    ctx.fillStyle = inBag ? 'rgba(20,18,15,.75)' : 'rgba(34,30,22,.85)';
    ctx.fillRect(24, y, CW - 48, 26);
    // надетое отбиваем золотой полосой: глаз находит его раньше, чем читает
    if (!inBag) { ctx.fillStyle = 'rgba(201,162,39,.7)'; ctx.fillRect(24, y, 3, 26); }
    const note = inBag ? compareNote(it) : { t: 'на тебе', c: '#c9a227' };
    const noteX = CW - 282;
    ctx.font = '9px Segoe UI';
    const room = noteX - 36 - ctx.measureText(note.t).width;
    txt(clipText(itemIco(it) + ' ' + fullName(it), room, 9), 30, y + 8, 9, TIERS[it.tier].c);
    txt(note.t, noteX, y + 8, 9, note.c, 'right');
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
    /* «Надеть» прямо с верстака: раньше за этим приходилось уходить в сумку.
       Точную копию надетого менять не даём: обмен пройдёт честно, но на
       экране ничего не изменится — и это читается как поломка. */
    const nothingToSwap = inBag && note.same;
    btn(CW - 148, y + 5, 56, 17, inBag ? (note.same ? 'то же' : 'надеть') : 'надето', () => equip(it), null,
        !inBag || nothingToSwap,
        nothingToSwap ? 'Точно такой же, как надетый: и ступень, и чары, и масло. Менять нечего'
                      : 'Это и так на тебе');
    btn(CW - 88, y + 5, 56, 17, 'продать', () => sell(it), inBag ? 'rgba(70,60,30,.9)' : null, !inBag,
        'Сначала сними: надетое не продаётся');
    y += 28;
  }

  panelFooter('U или ✕ — закрыть · зачарование даёт случайное свойство (120💰 + 2✨)');
}

/* Лавка: купить и — впервые — ПРОДАТЬ припасы.
   Раньше продать можно было только меч или доспех, а руда, шкуры, лишние
   зелья и болты копились мёртвым весом: выбросить жалко, деть некуда. */
const SHOP = [
  ['⛏ Руда ×3', 'ore', 3, 66], ['🧵 Шкуры ×3', 'hide', 3, 54],
  ['✨ Эссенция', 'essence', 1, 34], ['➶ болты ×10', 'bolt', 10, 20],
  ['🧪 Ласточка', 'swallow', 1, 40], ['⚗ Гром', 'thunder', 1, 55],
  ['🍯 Белый мёд', 'honey', 1, 35], ['💩 Зелье гавна', 'shit', 1, 90],
  ['🧴 Масло: нечисть', 'oilsil', 1, 45], ['🛢 Масло: люди', 'oilste', 1, 45],
];
function drawShop() {
  const H = goodInfo(hotGood);
  txt('Скупщик берёт вещи за 60% цены.', 24, 96, 10, '#98a2ae');
  txt('Сегодня в цене: ' + H.ico + ' ' + H.n + ' — платит ПОЛНУЮ (' + H.price + '💰 за штуку)',
      24, 110, 10, '#f2b134');

  txt('Купить:', 24, 130, 10, '#e8d9a8');
  let sx = 24, sy = 140;
  for (const [label, id, n, price] of SHOP) {
    btn(sx, sy, 116, 20, label + ' — ' + price + '💰', () => buy(id, n, price), null, gold < price,
        'Нужно ' + price + ' крон, у тебя ' + Math.floor(gold));
    sx += 119;
    if (sx + 116 > CW - 20) { sx = 24; sy += 23; }
  }

  // рюкзаки: предел веса носят на спине, а не выдают свыше
  let by2 = sy + 30;
  txt('Рюкзаки (предел веса сейчас ' + capacity() + ' кг):', 24, by2, 10, '#e8d9a8');
  by2 += 10;
  let bx = 24;
  for (const id of ['hide', 'hunter', 'master']) {
    const B = BAGS[id], mine = P.bag === id;
    btn(bx, by2, 152, 20, B.ico + ' ' + B.n + (mine ? ' — на тебе' : ' — ' + B.price + '💰'),
        () => buyBag(id), mine ? 'rgba(60,80,50,.9)' : null, mine || gold < B.price,
        mine ? 'Этот уже за спиной' : 'Нужно ' + B.price + ' крон, у тебя ' + Math.floor(gold));
    txt(B.desc, bx + 4, by2 + 30, 8, '#6c7683');
    bx += 156;
  }

  let y = by2 + 46;
  const stacks = inv.filter(i => i.k === 'stack');
  txt('Продать из сумки:', 24, y, 10, '#e8d9a8');
  txt(stacks.length ? 'всё лишнее — в кроны' : 'припасов нет', CW - 24, y, 9, '#6c7683', 'right');
  y += 12;
  for (const it of stacks) {
    const one = stackPrice(it.id, 1), all = stackPrice(it.id, it.n), hot = it.id === hotGood;
    ctx.fillStyle = hot ? 'rgba(50,42,20,.85)' : 'rgba(20,18,15,.75)';
    ctx.fillRect(24, y, CW - 48, 22);
    if (hot) { ctx.fillStyle = 'rgba(242,177,52,.75)'; ctx.fillRect(24, y, 3, 22); }
    txt(itemIco(it) + '  ' + itemName(it) + ' ×' + it.n, 32, y + 11, 10, hot ? '#f2d59a' : '#e6ebf2');
    txt(one + '💰 за штуку', CW - 190, y + 11, 9, hot ? '#f2b134' : '#98a2ae', 'right');
    txt(itemWeight(it).toFixed(1) + ' кг', CW - 128, y + 11, 9, '#6c7683', 'right');
    btn(CW - 120, y + 3, 44, 16, '×1', () => sellStack(it.id, 1), 'rgba(70,60,30,.9)');
    btn(CW - 72, y + 3, 48, 16, 'всё ' + all + '💰', () => sellStack(it.id, it.n), 'rgba(70,60,30,.9)');
    y += 24;
  }
  panelFooter('U или ✕ — закрыть · товар «в цене» меняется после каждого контракта');
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
  else if (panel === 'board') drawBoard();

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
  if (mouseInWorld() && P) { const m = mw(); P.face = Math.atan2(m.y - P.y, m.x - P.x); }   // бьём сразу туда, куда ткнули
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
  if (panel === 'board') { panel = null; return; }      // E у доски — и закрыть тоже
  if (panel) return;
  // доска и верстак стоят в мире: подошёл — работает, ушёл — нет
  if (Math.hypot(P.x - BOARD.x, P.y - BOARD.y) < 52) {
    if (phase === 'FIGHT') { message('Работа уже взята: ' + contract.t + ' — сперва доделай'); return; }
    if (!offers.length) offers = rollBoard(ci);
    panel = 'board'; return;
  }
  if (Math.hypot(P.x - BENCH.x, P.y - BENCH.y) < 46) { panel = 'bench'; return; }
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
    if (panel === 'bench') { panel = null; return; }
    // верстак стоит в лагере и никуда за тобой не ходит
    if (Math.hypot(P.x - BENCH.x, P.y - BENCH.y) > 46) {
      message('⚒ Верстак в лагере — до него ' + Math.round(Math.hypot(P.x - BENCH.x, P.y - BENCH.y)) + ' шагов');
      return;
    }
    panel = 'bench'; benchScroll = 0; return;
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
  if (e.code === 'KeyQ') { swapHand(); return; }
  if (e.code === 'KeyO') { applyOil(activeSword()); return; }
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

function swapHand() {
  P.hand = P.hand === 'steel' ? 'silver' : 'steel';
  const s = activeSword();
  message((P.hand === 'silver' ? '⚔ Серебро — против нечисти' : '🗡 Сталь — против людей и зверья') +
          (s && s.oil > 0 ? ' · смазан, ' + s.oil + ' ударов' : ''));
}
function onBtn(id, fn) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { b.blur(); fn(); }); }
onBtn('swapBtn', swapHand);
onBtn('bagBtn', () => { panel = panel === 'bag' ? null : 'bag'; bagScroll = 0; });
onBtn('mutBtn', () => toggleMutation());
onBtn('pause', () => { if (!over) { paused = !paused; updateButtons(); } });
onBtn('restart', () => { clearRun(); reset(); message('Новый ведьмак, новый поход.'); });
function updateButtons() { const b = document.getElementById('pause'); if (b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

window.__fsFail = function (why) { message('⛶ Полный экран не открылся: ' + why); };

reset();
if (loadRun()) message('📜 Поход продолжен: впереди контракт ' + (ci + 1) + '. «Заново» — начать сначала.');
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
  swing, shootBolt, applyOil, swapHand, saveRun, loadRun, clearRun, freeSpot,
  LOCS, JOBS, SHOP, MAP, CELL_W, CELL_H, WORLD_W, WORLD_H, FIRE, BENCH, BOARD,
  buildWorld, locAt, cellRect, compareNote, rollBoard, makeContract, jobFam, syncCam,
  BAGS, buyBag, capacity,
  getCam: () => cam,
  sellStack, stackPrice, rollHotGood, getHot: () => hotGood, setHot: v => { hotGood = v; },
  setBenchTab: v => { benchTab = v; }, getBenchTab: () => benchTab,
  getLoc: () => curLoc, getObst: () => obst, getOffers: () => offers, setOffers: v => { offers = v; },
  SWORD, ARMOR, TIERS, FOES, POTIONS, STUFF, RUNES, ENCH, WX0, WY0, WX1, WY1,
  getScroll: () => ({ bag: bagScroll, bench: benchScroll }),
  setScroll: (b, n) => { if (b === 'bag') bagScroll = n; else benchScroll = n; },
  getHits: () => uiHit,
};
