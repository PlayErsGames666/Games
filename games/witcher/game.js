/* =======================================================================
   ВЕДЬМАЧИЙ КОНТРАКТ — action-RPG про снаряжение.

   Смысл не в том, чтобы быстро кликать, а в том, ЧЕМ ты вышел на тварь:
   тот ли меч, тот ли доспех, хватило ли болтов и не потащил ли лишнего.
   Между контрактами — костёр: инвентарь, верстак, торговля.
   ======================================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* Логический размер холста. В окне он 520x640, а в ПОЛНЫЙ ЭКРАН игра
   перестраивается под настоящие пропорции монитора: высота остаётся 640
   (чтобы буквы и пояс не поехали), а ширина растёт. Мир от этого не
   растягивается и не мылится — просто в окно видно больше земли.

   Раньше в полный экран уезжала картинка 520x640 целиком, и на широком
   мониторе игра стояла узким столбиком посреди чёрного поля — «экран
   в экране». */
let CW = canvas.width, CH = canvas.height;
let WX0 = 8, WY0 = 58, WX1 = CW - 8, WY1 = CH - 84;   // поле боя внутри холста
let WW = WX1 - WX0, WH = WY1 - WY0;
function setLogicalSize(w, h) {
  CW = Math.round(w); CH = Math.round(h);
  WX1 = CW - 8; WY1 = CH - 84;
  WW = WX1 - WX0; WH = WY1 - WY0;
  /* Сразу переставляем и САМУ БИТМАПУ. В css у холста ширина 520 и
     height:auto — высота считается из пропорции битмапы. Не тронешь её —
     после выхода из полного экрана останется широкая карта прошлого кадра,
     и холст в окне сплющится до 520x293. */
  canvas.width = CW; canvas.height = CH;
  if (typeof P !== 'undefined' && P) syncCam();
}
/* Эти две ручки зовёт shared/fullscreen.js: игра, которая их объявила,
   получает весь экран целиком вместо аккуратного прямоугольника. */
window.__fsResize = (sw, sh) => {
  const h = 640;
  setLogicalSize(clamp(Math.round(h * sw / Math.max(1, sh)), 480, 1800), h);
};
window.__fsRestore = () => setLogicalSize(520, 640);

/* Звук живёт в shared/sfx.js и синтезируется на месте — файлов нет, игра
   по-прежнему открывается двойным щелчком. Если его почему-то не подключили,
   игра должна работать ровно так же, только молча: отсюда и обёртка. */
const snd = (n, g) => { try { if (window.sfx) window.sfx(n, g); } catch (e) {} };

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

/* Арбалеты. Раньше арбалет был один, вечный и безымянный — просто кнопка
   «выстрелить». Теперь это такая же вещь, как меч: у неё есть тип и ступень,
   она весит, её находят, покупают, улучшают и зачаровывают.

   Тип решает три числа разом — урон, перезарядку и полёт болта, — и тянут
   они в разные стороны: ворот кладёт с одного болта, но пока взведёшь, тебя
   уже грызут; скорострел сыплет очередью, и колчан тает на глазах. */
const XBOW = {
  light:  { n: 'Лёгкий арбалет',    sn: 'Лёгкий', ico: '🏹', dmg: 15, cd: 0.75, spd: 400, life: 1.4, w: 3.0, price: 90,
            bon: 'то, с чем выходят в первый раз: лёгкий и без причуд' },
  hunter: { n: 'Охотничий арбалет', sn: 'Охотн.', ico: '🎯', dmg: 21, cd: 0.95, spd: 520, life: 2.0, w: 4.2, price: 240,
            bon: 'болт летит быстрее и вдвое дальше — лучника снимаешь раньше, чем он тебя' },
  siege:  { n: 'Тяжёлый ворот',     sn: 'Ворот',  ico: '🛠', dmg: 38, cd: 1.6,  spd: 360, life: 1.5, w: 8.0, price: 480, knock: 240,
            bon: 'сбивает тварь с ног и глушит, но взводится долго и тянет спину' },
  repeat: { n: 'Скорострел',        sn: 'Скоростр.', ico: '⚙', dmg: 10, cd: 0.3, spd: 430, life: 1.2, w: 5.5, price: 620,
            bon: 'очередью: урона мало, зато часто — колчан пустеет вчетверо быстрее' },
};
const XBOW_KEYS = Object.keys(XBOW);

/* Болты. Обычный родству не подчиняется — этим арбалет и хорош, когда в руке
   не тот меч. Особые меняют правило и стоят дороже: серебряный рвёт нечисть,
   но по человеку почти впустую; бронебойный не замечает брони наёмника;
   зажигательный поджигает; разрывной достаёт всех, кто стоял рядом. */
const BOLTS = {
  bolt:    { mul: 1 },
  boltsil: { fam: 'monster', hit: 2.1, miss: 0.5 },
  boltarm: { mul: 1.15, pierce: true },
  boltfir: { mul: 0.8, burn: 3.5 },
  boltbom: { mul: 1.2, blast: 46 },
};
const BOLT_IDS = Object.keys(BOLTS);
const BOLT_COLOR = { bolt: '#e8d9a8', boltsil: '#cfe3ff', boltarm: '#9aa3ad', boltfir: '#ff9a4a', boltbom: '#ffd166' };

/* Доспехи. Тип решает не только броню, но и повадку.

   Три первых — обычная справа: то, что снимают с наёмника и продают на
   любом торгу. Дальше идут ВЕДЬМАЧЬИ ШКОЛЫ — доспех, скроенный под свой
   способ драться, и у каждой школы своя цена за свою выгоду.

   Главное: у школьного доспеха СТУПЕНЬ КАЧАЕТ НЕ ТОЛЬКО БРОНЮ. Чем выше
   ступень, тем сильнее сама школа: гроссмейстерский кот вертится вдвое
   охотнее обычного, гроссмейстерский грифон жжёт знаками вдвое дороже
   себя же начального. Улучшать доспех стало ради чего, а не ради
   двух-трёх единиц брони. */
const ARMOR = {
  light:  { n: 'Лёгкий доспех',  ico: '🥋', def: 5,  w: 6,  spd: 1.18, mpr: 1.55, c: '#9ad9a0', price: 90,
            bon: 'быстрее ходишь, энергия копится вдвое охотнее' },
  medium: { n: 'Средний доспех',  ico: '🦺', def: 10, w: 13, spd: 1.06, mpr: 1.25, c: '#d8c07a', price: 170,
            bon: 'ровно посередине: и броня есть, и ноги ходят' },
  heavy:  { n: 'Тяжёлый доспех',  ico: '🛡', def: 17, w: 23, spd: 0.86, mpr: 1.00, c: '#b8b8c4', price: 300,
            bon: 'держит удар, но тяжёлый и медленный' },

  cat:    { n: 'Доспех Школы Кота',     ico: '🐱', def: 7,  w: 5.5, spd: 1.24, mpr: 1.35, c: '#c9a0ff', price: 420,
            school: 'dodge', bon: 'уворот перезаряжается быстрее и уносит дальше' },
  griffin:{ n: 'Доспех Школы Грифона',  ico: '🦅', def: 9,  w: 10,  spd: 1.06, mpr: 1.65, c: '#7fd6ff', price: 520,
            school: 'sign',  bon: 'знаки дешевле и бьют сильнее' },
  bear:   { n: 'Доспех Школы Медведя',  ico: '🐻', def: 20, w: 26,  spd: 0.82, mpr: 0.95, c: '#d8a86a', price: 680,
            school: 'tank',  bon: 'больше здоровья, и удар по тебе гасится сверх брони' },
  wolf:   { n: 'Доспех Школы Волка',    ico: '🐺', def: 13, w: 15,  spd: 1.02, mpr: 1.25, c: '#b8c4d8', price: 600,
            school: 'blade', bon: 'меч в руке бьёт сильнее' },
  viper:  { n: 'Доспех Школы Змеи',     ico: '🐍', def: 11, w: 11,  spd: 1.12, mpr: 1.20, c: '#9ad9a0', price: 560,
            school: 'brew',  bon: 'зелья держатся дольше, а отрава сходит быстрее' },
};
const ARMOR_KEYS = Object.keys(ARMOR);

/* Насколько сильна школа НА ЭТОЙ СТУПЕНИ. Обычный — 1 шаг, гроссмейстер — 5:
   ровно то, ради чего доспех и тащат на верстак. */
function schoolStep(it) { return it ? (it.tier | 0) + 1 : 0; }
function wornSchool() { return P && P.armor ? (ARMOR[P.armor.type].school || null) : null; }
function schoolPow(kind) {                             // 0, если надето не то
  return wornSchool() === kind ? schoolStep(P.armor) : 0;
}
/* Что именно школа даёт на этой ступени — одной строкой, с настоящими числами.
   Без них «уворот быстрее» — просто обещание. */
function schoolNote(it) {
  if (!it || it.k !== 'armor') return '';
  const A = ARMOR[it.type], s = schoolStep(it);
  if (!A.school) return A.bon;
  if (A.school === 'dodge') return 'уворот: откат −' + (s * 10) + '%, бросок +' + (s * 8) + '%';
  if (A.school === 'sign')  return 'знаки: энергии −' + (s * 8) + '%, урон +' + (s * 12) + '%';
  if (A.school === 'tank')  return 'здоровья +' + (s * 8) + ', входящий удар −' + (s * 5) + '%';
  if (A.school === 'blade') return 'урон мечом +' + (s * 6) + '%';
  if (A.school === 'brew')  return 'зелья держатся +' + (s * 15) + '%, отрава сходит +' + (s * 30) + '%';
  return A.bon;
}
/* То же самое, но ОТ и ДО — для лавки, где выбирают доспех, которого ещё нет.
   Целиком две строки «сейчас» и «гроссмейстерским» в строку не влезали и
   обрезались ровно на том месте, ради которого их и читают. */
function schoolRange(id) {
  const A = ARMOR[id];
  if (!A.school) return A.bon;
  if (A.school === 'dodge') return 'уворот: откат −10%…−50%, бросок +8%…+40%';
  if (A.school === 'sign')  return 'знаки: энергии −8%…−40%, урон +12%…+60%';
  if (A.school === 'tank')  return 'здоровья +8…+40, входящий удар −5%…−25%';
  if (A.school === 'blade') return 'урон мечом +6%…+30%';
  if (A.school === 'brew')  return 'зелья держатся +15%…+75%, отрава сходит +30%…+150%';
  return A.bon;
}

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
  bolt:    { n: 'Болты',               ico: '➶', w: 0.05, price: 2,  desc: 'обычные: бьют ровно по всем, родство не важно' },
  boltsil: { n: 'Серебряные болты',    ico: '✧', w: 0.06, price: 8,  desc: 'нечисть рвут вдвое, по человеку — почти впустую' },
  boltarm: { n: 'Бронебойные болты',   ico: '➹', w: 0.09, price: 6,  desc: 'проходят броню насквозь: наёмнику она не поможет' },
  boltfir: { n: 'Зажигательные болты', ico: '🔥', w: 0.07, price: 10, desc: 'урона меньше, зато тварь горит ещё несколько секунд' },
  boltbom: { n: 'Разрывные болты',     ico: '💥', w: 0.18, price: 22, desc: 'рвут всех, кто рядом — на толпу накеров' },
  ore:     { n: 'Руда',      ico: '⛏', w: 1.0,  price: 14, desc: 'на улучшение мечей и на болты' },
  herb:    { n: 'Травы',     ico: '🌿', w: 0.1,  price: 6,  desc: 'сырьё для варки: зелья и масла' },
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

/* =====================  НАВЫКИ  =====================
   Ведьмак рос только снаряжением: нашёл меч получше — стал сильнее. Сам он
   не менялся никогда. Теперь за головы и закрытые работы идёт ОПЫТ, за
   ступень дают очко, а очко кладётся в одну из трёх веток.

   Ветки не про «плюс пять к силе», а про три разных способа драться:
   железом, знаками или зельями. Алхимия вдобавок открывает ВАРКУ В ДОРОГЕ —
   ради неё больше не надо возвращаться к костру. */
const SKILLS = {
  blade:  { n: 'Клинок',        ico: '⚔', br: 'Бой',     max: 5, step: '+6% урона мечом' },
  aim:    { n: 'Твёрдая рука',  ico: '🎯', br: 'Бой',     max: 5, step: '+6% урона арбалетом' },
  tough:  { n: 'Закалка',       ico: '🛡', br: 'Бой',     max: 5, step: '+8 здоровья' },
  power:  { n: 'Сила знаков',   ico: '✨', br: 'Знаки',   max: 5, step: '+8% урона знаков' },
  focus:  { n: 'Сосредоточение', ico: '🔮', br: 'Знаки',  max: 5, step: '+12% к сбору энергии' },
  thrift: { n: 'Расчёт',        ico: '🧿', br: 'Знаки',   max: 4, step: 'знаки дешевле на 6%' },
  brew:   { n: 'Травничество',  ico: '⚗',  br: 'Алхимия', max: 3, step: 'варка в дороге: ступень открывает рецепты' },
  fletch: { n: 'Болторезка',    ico: '➶',  br: 'Алхимия', max: 3, step: 'вязать болты в поле: ступень открывает сорта' },
  purge:  { n: 'Чистая кровь',  ico: '🩸', br: 'Алхимия', max: 4, step: 'отрава сходит на 20% быстрее' },
};
const SKILL_KEYS = Object.keys(SKILLS);
const BRANCHES = ['Бой', 'Знаки', 'Алхимия'];
function sk(k) { return (P && P.sk && P.sk[k]) | 0; }
// сколько опыта до следующей ступени: растёт, но не отвесно
function xpNeed(lvl) { return Math.round(90 * Math.pow(1.28, lvl - 1)); }
function gainXP(n) {
  if (!P) return;
  P.xp += n;
  while (P.xp >= xpNeed(P.lvl)) {
    P.xp -= xpNeed(P.lvl);
    P.lvl++; P.sp++;
    snd('level');
    message('⭐ Ступень ' + P.lvl + '! Очко навыка — нажми K.');
  }
}
function spend(k) {
  const S = SKILLS[k]; if (!S) return;
  if (P.sp <= 0) { message('Нет очков навыка — они дают за ступени'); snd('deny'); return; }
  if (sk(k) >= S.max) { message('Дальше некуда: ' + S.n + ' и так на пределе'); snd('deny'); return; }
  P.sk[k] = sk(k) + 1; P.sp--;
  P.hp = Math.min(P.hp, maxHP());
  snd('forge');
  message(S.ico + ' ' + S.n + ' ' + P.sk[k] + '/' + S.max + ' — ' + S.step);
  saveRun();
}

/* =====================  ВАРКА В ДОРОГЕ  =====================
   Отдельного места для алхимии нет и не будет: котелок при себе. Открыл на
   C где угодно — хоть посреди болота, — и сварил, если хватает трав и
   ступени навыка. Ради этого травы и появились как отдельный припас. */
const RECIPES = [
  { id: 'swallow', out: 1,  need: { herb: 3 },            s: 'brew',   lvl: 1 },
  { id: 'honey',   out: 1,  need: { herb: 2, essence: 1 }, s: 'brew',   lvl: 1 },
  { id: 'thunder', out: 1,  need: { herb: 3, essence: 1 }, s: 'brew',   lvl: 2 },
  { id: 'oilsil',  out: 1,  need: { herb: 2, essence: 1 }, s: 'brew',   lvl: 3 },
  { id: 'oilste',  out: 1,  need: { herb: 2, ore: 1 },     s: 'brew',   lvl: 3 },
  { id: 'shit',    out: 1,  need: { herb: 4, essence: 2 }, s: 'brew',   lvl: 3 },
  { id: 'bolt',    out: 10, need: { ore: 1 },              s: 'fletch', lvl: 1 },
  { id: 'boltarm', out: 6,  need: { ore: 2 },              s: 'fletch', lvl: 2 },
  { id: 'boltfir', out: 5,  need: { ore: 1, herb: 2 },     s: 'fletch', lvl: 2 },
  { id: 'boltsil', out: 6,  need: { ore: 2, essence: 1 },  s: 'fletch', lvl: 3 },
  { id: 'boltbom', out: 4,  need: { ore: 2, essence: 2 },  s: 'fletch', lvl: 3 },
];
function canCraft(r) {
  if (sk(r.s) < r.lvl) return 'нужно ' + SKILLS[r.s].n + ' ' + r.lvl;
  for (const k in r.need) if (countStack(k) < r.need[k]) {
    return 'не хватает: ' + STUFF[k].n.toLowerCase() + ' ' + countStack(k) + '/' + r.need[k];
  }
  return null;
}
function craft(r) {
  const why = canCraft(r);
  if (why) { message(why); snd('deny'); return; }
  for (const k in r.need) useStack(k, r.need[k]);
  addStack(r.id, r.out);
  snd('craft');
  message('⚗ Сварено: ' + goodInfo(r.id).n + ' ×' + r.out);
  saveRun();
}

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
  // бестиарий новой земли: у каждой твари своя повадка, а не просто больше здоровья
  ghoul:   { n: 'Гуль',      ico: '🧌', fam: 'monster', hp: 66,  sp: 60, dmg: 12, r: 10, atk: 0.85, reach: 21 },
  harpy:   { n: 'Гарпия',    ico: '🦇', fam: 'monster', hp: 38,  sp: 96, dmg: 9,  r: 9,  atk: 0.80, reach: 20 },
  kikimor: { n: 'Кикимора',  ico: '🕷', fam: 'monster', hp: 78,  sp: 72, dmg: 14, r: 11, atk: 1.00, reach: 25 },
  wraith:  { n: 'Призрак',   ico: '👻', fam: 'monster', hp: 54,  sp: 66, dmg: 13, r: 10, atk: 1.10, reach: 22 },
  endriag: { n: 'Эндриага',  ico: '🦂', fam: 'monster', hp: 126, sp: 50, dmg: 18, r: 13, atk: 1.20, reach: 26, armor: 5 },
  griffin: { n: 'Грифон',    ico: '🦅', fam: 'monster', hp: 215, sp: 82, dmg: 24, r: 15, atk: 1.10, reach: 28, boss: true },
  bruin:   { n: 'Медведь',   ico: '🐻', fam: 'mortal',  hp: 112, sp: 68, dmg: 20, r: 12, atk: 1.10, reach: 24 },
  hound:   { n: 'Пёс',       ico: '🐕', fam: 'mortal',  hp: 40,  sp: 98, dmg: 10, r: 9,  atk: 0.75, reach: 19 },
  ataman:  { n: 'Атаман',    ico: '🪓', fam: 'mortal',  hp: 124, sp: 56, dmg: 19, r: 12, atk: 1.00, reach: 24, armor: 9 },
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
            fog: true, haze: 'rgba(150,170,175,.07)', home: 'drowner', pools: true,
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
  ruins:  { n: 'Руины', ico: '🏚', ground: '#171513', sp1: '#211d19', sp2: '#1d1a17',
            veg: '🏚', rock: '🧱', obst: 16, rmin: 11, rmax: 19, spd: 1,
            home: 'bandit',
            note: 'битый камень и стены по пояс — есть где спрятаться обоим' },
  shore:  { n: 'Берег', ico: '🏞', ground: '#101a1e', sp1: '#152229', sp2: '#131e24',
            veg: '🌾', rock: '🪨', obst: 6, rmin: 10, rmax: 16, spd: 0.94,
            pools: true, home: 'drowner',
            note: 'мокрый песок и камыш: место открытое, но под ногами хлюпает' },
  // края, появившиеся вместе с новой землёй
  farm:   { n: 'Пашня', ico: '🌾', ground: '#1b1a12', sp1: '#242316', sp2: '#201f14',
            veg: '🌾', rock: '🪵', obst: 4, rmin: 9, rmax: 14, spd: 1.02,
            open: true, home: 'hound',
            note: 'борозды, межи и вешки: тут живут люди — и держат собак' },
  crag:   { n: 'Скалы', ico: '🏔', ground: '#16161c', sp1: '#1f1f26', sp2: '#1b1b22',
            veg: '🗿', rock: '⛰', obst: 26, rmin: 13, rmax: 24, spd: 0.9,
            dark: 0, home: 'harpy',
            note: 'камень на камне — не разбежишься, а сверху кричат' },
  heath:  { n: 'Пустошь', ico: '🏜', ground: '#1a1712', sp1: '#231e16', sp2: '#1f1b14',
            veg: '🌱', rock: '🪨', obst: 3, rmin: 10, rmax: 16, spd: 1.04,
            open: true, home: 'ghoul',
            note: 'голо и видно далеко — но и тебя видно тоже' },
};

/* =====================  КАРТА  =====================
   Мир не из квадратов. Края разложены по земле опорными точками, а что
   к какому краю относится — решает ближайшая точка со СМЕЩЕНИЕМ ПО ШУМУ:
   от этого межа получается кривой и рваной, как в жизни, а не по линейке.

   Генерация ЗАКРЕПЛЁННАЯ: и шум, и деревья считаются от постоянного зерна,
   поэтому мир у всех один и тот же и не перетасовывается между походами.
   Болото всегда там же, где было вчера. */
/* Земля стала ВТРОЕ больше по площади: 3200×2200 → 5600×3850. Всё, что было
   расставлено руками, разъехалось ровно в 1.75 раза, поэтому старые приметные
   места и сюжет остались на своих местах относительно друг друга — просто до
   них теперь идти дольше. В освободившееся место легли новые края, деревни и
   хутора: втрое больше пустоты никому не нужно. */
const WORLD_W = 5600, WORLD_H = 3850;
const WORLD_SEED = 20260815;

// дешёвый воспроизводимый шум: хеш по решётке + сглаживание
function hash2(ix, iy) {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + WORLD_SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Опорные точки краёв. Расставлены руками, как рисуют карту: лагерь в
   середине, тракт через всю землю, за ним холмы с курганами, на западе
   низина с болотом и берегом, на севере чащи. */
/* =====================  КОРОЛЕВСТВА  =====================
   Земля не однородна: у каждого края есть хозяин, и у хозяина свой торг.
   Там, где рудники, железо дёшево, а травы везут издалека и дерут втридорога;
   на топях наоборот. Отсюда и смысл возить: купил у одних — продал другим.

   Наживаться позволено, но в меру: разница ходит в пределах трети цены, а
   больше тридцати килограммов руды на спину всё равно не влезет. Дорога
   через полкарты — тоже цена.

   Товары делятся на четыре рода, и у каждого королевства свой множитель:
     mat  — руда, шкуры        alch — эссенции, зелья, масла
     bolt — болты всех сортов  gear — мечи, доспехи, арбалеты, мешки */
const KINGDOMS = {
  mezh:   { n: 'Междуречье', ico: '🌾', c: '#d8c07a',
            mul: { mat: 1.00, alch: 1.00, bolt: 1.00, gear: 1.00 }, lacks: [],
            note: 'середина земли: цены ровные, зато есть всё' },
  ard:    { n: 'Ард',        ico: '⛏', c: '#b8c4d8',
            mul: { mat: 0.72, alch: 1.34, bolt: 0.86, gear: 0.92 }, lacks: ['shit'],
            note: 'рудники и кузни: железо дёшево, травы везут за тридевять земель' },
  topi:   { n: 'Вольные топи', ico: '🌿', c: '#9ad9a0',
            mul: { mat: 1.30, alch: 0.70, bolt: 1.12, gear: 1.15 }, lacks: ['oilste'],
            note: 'травы под ногами, а железа нет вовсе — всё привозное' },
  kurgan: { n: 'Курганный удел', ico: '🪦', c: '#c9a0ff',
            mul: { mat: 1.05, alch: 1.12, bolt: 0.74, gear: 1.06 }, lacks: ['honey'],
            note: 'живут раскопками: серебро и болты дёшевы, всё живое — дорого' },
};
const KD_KEYS = Object.keys(KINGDOMS);

const SEEDS = [
  // старая земля, разъехавшаяся в 1.75 раза
  { id: 'camp',   x: 2765, y: 2065, kd: 'mezh' },
  { id: 'road',   x: 2730, y: 2730, kd: 'mezh' }, { id: 'road',   x: 4095, y: 2625, kd: 'kurgan' }, { id: 'road',  x: 1435, y: 2625, kd: 'topi' },
  { id: 'field',  x: 2065, y: 1575, kd: 'mezh' }, { id: 'field',  x: 3588, y: 1838, kd: 'mezh' },   { id: 'field', x: 2800, y: 3325, kd: 'mezh' },
  { id: 'woods',  x: 1400, y: 735,  kd: 'ard' },  { id: 'woods',  x: 3675, y: 665,  kd: 'ard' },    { id: 'woods', x: 4638, y: 1575, kd: 'ard' },
  { id: 'swamp',  x: 840,  y: 2013, kd: 'topi' }, { id: 'swamp',  x: 1225, y: 3238, kd: 'topi' },
  { id: 'shore',  x: 385,  y: 2800, kd: 'topi' },
  { id: 'barrow', x: 5075, y: 2538, kd: 'kurgan' }, { id: 'barrow', x: 4550, y: 3413, kd: 'kurgan' },
  { id: 'ruins',  x: 4375, y: 1085, kd: 'ard' },    { id: 'ruins',  x: 2013, y: 3413, kd: 'topi' },
  // новые земли, легшие в освободившееся место
  { id: 'farm',   x: 2400, y: 2350, kd: 'mezh' }, { id: 'farm',   x: 3250, y: 2950, kd: 'mezh' }, { id: 'farm',  x: 1850, y: 1150, kd: 'mezh' },
  { id: 'crag',   x: 5250, y: 1300, kd: 'ard' },  { id: 'crag',   x: 4900, y: 500,  kd: 'ard' },  { id: 'crag',  x: 5300, y: 3550, kd: 'kurgan' },
  { id: 'heath',  x: 700,  y: 900,  kd: 'topi' }, { id: 'heath',  x: 350,  y: 1450, kd: 'topi' }, { id: 'heath', x: 1500, y: 3700, kd: 'topi' },
  { id: 'woods',  x: 900,  y: 3000, kd: 'topi' }, { id: 'woods',  x: 3300, y: 3700, kd: 'mezh' },
  { id: 'swamp',  x: 4200, y: 3750, kd: 'kurgan' }, { id: 'shore', x: 260,  y: 3400, kd: 'topi' },
  { id: 'road',   x: 3400, y: 1300, kd: 'ard' },  { id: 'road',   x: 1900, y: 3050, kd: 'mezh' },
  { id: 'ruins',  x: 5400, y: 2050, kd: 'kurgan' }, { id: 'barrow', x: 3900, y: 2300, kd: 'kurgan' },
  { id: 'field',  x: 4700, y: 2900, kd: 'kurgan' }, { id: 'field', x: 1100, y: 1750, kd: 'topi' },
];
/* Чьё это место. Считается по той же карте клеток, что и край, поэтому и
   межа между королевствами получается такой же кривой, а не по линейке. */
function kdAt(x, y) {
  if (!regionTiles) buildRegions();
  const tx = clamp(Math.floor(x / TILE), 0, TW - 1), ty = clamp(Math.floor(y / TILE), 0, TH - 1);
  return SEEDS[regionTiles[ty * TW + tx]].kd || 'mezh';
}
// к какому роду товара относится добро — от этого зависит множитель королевства
function goodKind(id) {
  if (id === 'ore' || id === 'hide') return 'mat';
  if (BOLTS[id]) return 'bolt';
  /* Травы — сырьё для варки, а не железо. Без этой строчки они попадали в
     «gear» по остаточному принципу, и выходила нелепица: в Вольных топях,
     где трава растёт под ногами, она стоила ×1.15, а зелье из неё же — ×0.70. */
  if (POTIONS[id] || id === 'essence' || id === 'herb' || (STUFF[id] && STUFF[id].oil)) return 'alch';
  return 'gear';
}

/* Тропы: настоящие дороги от места к месту. По ним и ходится быстрее, и
   глазу есть за что зацепиться — мир перестаёт быть однородной кашей. */
const PATHS = [
  // главные тракты (прежние, разъехавшиеся)
  [{ x: 2765, y: 2065 }, { x: 2730, y: 2730 }, { x: 1575, y: 2730 }, { x: 910, y: 2870 }],
  [{ x: 2765, y: 2065 }, { x: 3325, y: 1925 }, { x: 4113, y: 2188 }, { x: 4935, y: 2485 }],
  [{ x: 2765, y: 2065 }, { x: 2538, y: 1540 }, { x: 3325, y: 1085 }, { x: 4270, y: 1120 }],
  [{ x: 2538, y: 1540 }, { x: 1838, y: 1330 }, { x: 1435, y: 840 }],
  [{ x: 2730, y: 2730 }, { x: 2450, y: 3325 }, { x: 2065, y: 3413 }],
  // новые дороги: к деревням, на перевал и вдоль берега
  [{ x: 2765, y: 2065 }, { x: 2400, y: 2350 }, { x: 1900, y: 3050 }, { x: 1500, y: 3620 }],
  [{ x: 4113, y: 2188 }, { x: 3900, y: 2300 }, { x: 3250, y: 2950 }, { x: 2800, y: 3325 }],
  [{ x: 4935, y: 2485 }, { x: 5250, y: 1900 }, { x: 5250, y: 1300 }, { x: 4900, y: 640 }],
  [{ x: 910,  y: 2870 }, { x: 500,  y: 3050 }, { x: 300,  y: 3400 }],
  [{ x: 1435, y: 840 },  { x: 900,  y: 980 },  { x: 500,  y: 1450 }],
  [{ x: 3250, y: 2950 }, { x: 4200, y: 3300 }, { x: 4700, y: 2900 }],
];
const PATH_W = 30;                                   // ширина утоптанного

/* Приметные места. К ним ведут сюжетные задания, они же — ориентиры. */
const SPOTS = {
  camp:   { n: 'Лагерь',            ico: '🔥', x: 2765, y: 2065 },
  cart:   { n: 'Разбитая телега',   ico: '🛒', x: 3325, y: 1925 },
  ford:   { n: 'Брод',              ico: '🌊', x: 1120, y: 2975 },
  chapel: { n: 'Часовня в руинах',  ico: '⛪', x: 4375, y: 1085 },
  gully:  { n: 'Волчья балка',      ico: '🐺', x: 1453, y: 823 },
  mound:  { n: 'Курганный вход',    ico: '🪦', x: 5075, y: 2538 },
  gate:   { n: 'Застава на тракте', ico: '🚧', x: 4113, y: 2625 },
  heart:  { n: 'Сердце чащи',       ico: '🌳', x: 3675, y: 578 },
  // второе действие: след того, чьё имя стоит на найденном клинке
  mill:   { n: 'Старая мельница',   ico: '🏚', x: 3605, y: 2503 },
  grave:  { n: 'Погост у болота',   ico: '⚰', x: 910,  y: 2328 },
  pit:    { n: 'Смоляная яма',      ico: '🕳', x: 2013, y: 910 },
  ferry:  { n: 'Перевоз',           ico: '⛵', x: 368,  y: 2958 },
  stone:  { n: 'Ведьмин камень',    ico: '🗿', x: 4830, y: 3115 },
  // приметные места новой земли
  pass:   { n: 'Перевал',           ico: '🏔', x: 5250, y: 1300 },
  falls:  { n: 'Водопад',           ico: '💦', x: 4638, y: 1575 },
  gallows:{ n: 'Виселица у дороги', ico: '🪢', x: 1900, y: 3050 },
  idol:   { n: 'Старое капище',     ico: '🗿', x: 700,  y: 900 },
  wreck:  { n: 'Разбитая ладья',    ico: '🚣', x: 260,  y: 3400 },
  nest:   { n: 'Гнездовье',         ico: '🪺', x: 5300, y: 3550 },
  hive:   { n: 'Эндриажьи ходы',    ico: '🕳', x: 4200, y: 3750 },
  cross:  { n: 'Развилка трёх дорог', ico: '🪧', x: 3900, y: 2300 },
};

/* =====================  ПОСЕЛЕНИЯ  =====================
   Мир был пуст: земля, деревья и твари по контракту. Теперь по нему стоят
   люди — деревни, хутора, рудник, застава, пристань. У каждого поселения
   свои дворы (они же преграды, сквозь избу не ходят), колодец посередине
   и круг, в который нечисть не суётся: живут же люди.

   Дворы считаются от постоянного зерна, значит деревня всегда одна и та же. */
const TOWNS = [
  { k: 'brody',   n: 'Броды',     ico: '🏘', x: 2400, y: 2350, huts: 7, r: 150, kind: 'село',
    who: ['trader', 'smith', 'peasant'] },
  { k: 'zapole',  n: 'Заполье',   ico: '🏘', x: 3250, y: 2950, huts: 6, r: 140, kind: 'село',
    who: ['trader', 'herb', 'inn'] },
  { k: 'vyselki', n: 'Выселки',   ico: '🛖', x: 1850, y: 1150, huts: 4, r: 110, kind: 'хутор',
    who: ['herb', 'peasant'] },
  { k: 'kamenec', n: 'Каменец',   ico: '🏰', x: 5250, y: 1900, huts: 9, r: 175, kind: 'городок',
    who: ['trader', 'smith', 'bagman', 'guard', 'inn'] },
  { k: 'ozerki',  n: 'Озёрки',    ico: '🛖', x: 900,  y: 3000, huts: 4, r: 110, kind: 'хутор',
    who: ['herb', 'peasant'] },
  { k: 'rudnik',  n: 'Рудник',    ico: '⛏', x: 4900, y: 640,  huts: 5, r: 125, kind: 'рудник',
    who: ['smith', 'trader'] },
  { k: 'zastava', n: 'Застава',   ico: '🗼', x: 4113, y: 2625, huts: 3, r: 100, kind: 'застава',
    who: ['guard', 'smith'] },
  { k: 'pristan', n: 'Пристань',  ico: '⚓', x: 300,  y: 3400, huts: 5, r: 125, kind: 'пристань',
    who: ['trader', 'bagman', 'inn'] },
];
function townAt(x, y) {
  for (const t of TOWNS) if (Math.hypot(x - t.x, y - t.y) < t.r) return t;
  return null;
}

/* =====================  ЛЮДИ  =====================
   В деревне мало домов — в ней должны быть люди. У каждого своё дело: одни
   торгуют (и торгуют по ценам СВОЕГО королевства), другим сказать нечего,
   кроме слуха, — но слух этот полезный: он и рассказывает, где что дешевле.

   Подошёл на сорок шагов, нажал E — вот и весь разговор. */
const NPC_KINDS = {
  trader:  { n: 'Торговец',   ico: '🧔', tabs: ['supply', 'bolt', 'alch'] },
  smith:   { n: 'Кузнец',     ico: '🔨', tabs: ['weapon', 'armor'] },
  herb:    { n: 'Травница',   ico: '👵', tabs: ['alch', 'supply'] },
  inn:     { n: 'Трактирщик', ico: '🍺', tabs: ['alch'] },
  bagman:  { n: 'Шорник',     ico: '🎒', tabs: ['bag', 'supply'] },
  guard:   { n: 'Стражник',   ico: '💂' },
  peasant: { n: 'Селянин',    ico: '👨' },
};
let NPCS = [];
function buildNPCs() {
  NPCS = [];
  for (const t of TOWNS) {
    const kd = kdAt(t.x, t.y);
    (t.who || []).forEach((k, i) => {
      const K = NPC_KINDS[k]; if (!K) return;
      const a = (i / Math.max(1, t.who.length)) * 6.283 + 0.45;
      const d = t.r * 0.3;
      NPCS.push({ k, n: K.n, ico: K.ico, tabs: K.tabs || null, kd, town: t,
                  x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, bob: (i * 1.7) % 6.28 });
    });
  }
}
function npcNear(x, y, r) {
  let best = null, bd = r * r;
  for (const p of NPCS) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
/* Что говорит тот, кому нечем торговать. Не «привет-привет», а подсказка:
   куда идти и где что дешевле — иначе про королевства никто не узнает. */
function npcTalk(p) {
  const K = KINGDOMS[p.kd];
  const ord = Object.entries(K.mul).sort((a, b) => a[1] - b[1]);
  const cheap = ord[0], dear = ord[ord.length - 1];
  const RU = { mat: 'руда и шкуры', alch: 'зелья и травы', bolt: 'болты', gear: 'железо и доспехи' };
  // с большой буквы: «Курганный удел. живут раскопками» читается как обрубок
  const note = K.note.charAt(0).toUpperCase() + K.note.slice(1);
  if (p.k === 'guard') return '💂 «' + p.town.n + ', ' + K.n + '. ' + note + '»';
  if (p.k === 'peasant') {
    /* Там, где все множители единица (Междуречье), «дёшево X, дорого X» —
       бессмыслица: сортировка при равенстве даёт один и тот же товар. */
    if (dear[1] - cheap[1] < 0.05) return '👨 «У нас цены ровные, ни на чём не наживёшься. Вот в других уделах — дело другое.»';
    return '👨 «У нас ' + RU[cheap[0]] + ' задёшево, а ' + RU[dear[0]] + ' втридорога. Езжай торговать в другой удел.»';
  }
  return '«' + K.n + ': ' + K.note + '»';
}
const FIRE = { x: SPOTS.camp.x, y: SPOTS.camp.y + 30 };
const BENCH = { x: SPOTS.camp.x - 96, y: SPOTS.camp.y + 30 };
const BOARD = { x: SPOTS.camp.x + 96, y: SPOTS.camp.y + 30 };
const CAMP_R = 300;                                  // круг лагеря: сюда нечисть не заходит

/* Карта краёв считается один раз в клетки по 24 пикселя — дальше поиск
   места по точке стоит одно обращение в массив, а не перебор опорных. */
const TILE = 24;
const TW = Math.ceil(WORLD_W / TILE), TH = Math.ceil(WORLD_H / TILE);
let regionTiles = null;
function seedAt(x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < SEEDS.length; i++) {
    const s = SEEDS[i];
    // смещение по шуму — оно и делает межу кривой
    const wx = x + (noise2(x * 0.0026 + i * 11.3, y * 0.0026 - i * 5.7) - 0.5) * 460;
    const wy = y + (noise2(x * 0.0026 - i * 7.9, y * 0.0026 + i * 3.1) - 0.5) * 460;
    const dx = wx - s.x, dy = wy - s.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function buildRegions() {
  regionTiles = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    regionTiles[ty * TW + tx] = seedAt(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }
  // лагерь всегда сплошным пятном: у костра не должно быть болота
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (Math.hypot(x - SPOTS.camp.x, y - SPOTS.camp.y) < CAMP_R) regionTiles[ty * TW + tx] = 0;
  }
}
function locAt(x, y) {
  if (!regionTiles) buildRegions();
  const tx = clamp(Math.floor(x / TILE), 0, TW - 1), ty = clamp(Math.floor(y / TILE), 0, TH - 1);
  return SEEDS[regionTiles[ty * TW + tx]].id;
}
function inCamp(x, y) { return Math.hypot(x - SPOTS.camp.x, y - SPOTS.camp.y) < CAMP_R; }
// середина ближайшего к лагерю куска нужного края — туда и ведёт стрелка
function regionSpot(id) {
  let best = null, bd = Infinity;
  for (const s of SEEDS) {
    if (s.id !== id) continue;
    const d = Math.hypot(s.x - SPOTS.camp.x, s.y - SPOTS.camp.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { mx: best.x, my: best.y } : { mx: WORLD_W / 2, my: WORLD_H / 2 };
}
// расстояние до ближайшей тропы: по утоптанному идётся легче
function nearPath(x, y) {                              // честный перебор отрезков
  for (const p of PATHS) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const vx = b.x - a.x, vy = b.y - a.y, wx = x - a.x, wy = y - a.y;
    const L2 = vx * vx + vy * vy;
    let t = L2 ? (wx * vx + wy * vy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a.x + vx * t), dy = y - (a.y + vy * t);
    if (dx * dx + dy * dy < PATH_W * PATH_W) return true;
  }
  return false;
}
/* Тропы тоже разложены по клеткам. Дорог стало вдвое больше, а onPath зовётся
   каждый кадр (и на каждый шаг ведьмака): перебирать полсотни отрезков по
   шестьдесят раз в секунду — впустую. Считаем один раз, дальше одно обращение
   в массив. */
let pathTiles = null;
function buildPaths() {
  pathTiles = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    if (nearPath(tx * TILE + TILE / 2, ty * TILE + TILE / 2)) pathTiles[ty * TW + tx] = 1;
  }
}
function onPath(x, y) {
  if (!pathTiles) buildPaths();
  const tx = clamp(Math.floor(x / TILE), 0, TW - 1), ty = clamp(Math.floor(y / TILE), 0, TH - 1);
  return pathTiles[ty * TW + tx] === 1;
}

/* =====================  СЮЖЕТ  =====================
   Работы с доски — это заработок. Сюжет — это то, ради чего ведьмак здесь
   вообще оказался: цепочка из семи заданий, каждое в своём приметном месте
   и с продолжением. Берётся у той же доски, но идёт особняком и по порядку.

   Устройство простое и оттого крепкое: дойди до места (стрелка ведёт),
   на месте начинается драка, перебил — читаешь, чем всё обернулось. */
const STORY = [
  { t: 'Разбитая телега', spot: 'cart', loc: 'field',
    brief: ['Купец не доехал до заставы. Телегу нашли на полдороге — пустую,',
            'с обрубленными постромками, и ни возницы, ни груза.',
            'Староста платит за головы, а не за поиски. Иди и посмотри сам.'],
    pool: ['bandit', 'bandit', 'archer'], n: 5, gold: 130,
    done: 'На борту клеймо барона. Эти знали, что везут: кто-то им сказал.' },

  { t: 'Топляки у брода', spot: 'ford', loc: 'shore',
    brief: ['Брод перестали переходить: за неделю трое не вышли на тот берег.',
            'Староста божится, что вода тут ни при чём.',
            'Утопцы. Бери серебро и не лезь в воду по колено.'],
    pool: ['drowner', 'drowner', 'nekker'], n: 7, gold: 190,
    done: 'В иле — сумка возницы с той телеги. Кто-то сбросил её в воду.' },

  { t: 'Часовня в руинах', spot: 'chapel', loc: 'ruins',
    brief: ['Сумка привела к старой часовне. Там давно не молятся —',
            'зато кто-то жёг костры и стаскивал добро под стены.',
            'Логово. Ступай и вычисти.'],
    pool: ['bandit', 'archer', 'merc'], n: 9, gold: 260,
    reward: { kind: 'stack', id: 'essence', n: 3 },
    done: 'Под алтарём — расписка на серебряный меч, сданный в залог. Твой почерк, ведьмак?' },

  { t: 'Волчья балка', spot: 'gully', loc: 'woods',
    brief: ['Пока ты копался в руинах, в балке задрали двоих.',
            'Следы волчьи, но шаг длинный — не волк.',
            'Волколак. И, судя по всему, старый и умный.'],
    pool: ['wolfen', 'wolfen', 'nekker'], n: 7, gold: 340,
    unique: { t: 'wolfen', name: 'Седой', hpMul: 2.6 },
    done: 'На шее Седого — обрывок цепи с клеймом заставы. Его держали.' },

  { t: 'Курганный вор', spot: 'mound', loc: 'barrow',
    brief: ['Расписка вела в курганы: серебро сдали хранителю входа.',
            'Хранителя давно съели, а меч так и лежит там, под камнем.',
            'Накеры не отдадут просто так.'],
    pool: ['nekker', 'nekker', 'wolfen'], n: 11, gold: 420,
    reward: { kind: 'sword', metal: 'silver', tier: 3, ench: 'vamp' },
    done: 'Меч нашёлся. Мастерская работа, и на клинке чужое имя — не твоё.' },

  { t: 'Застава барона', spot: 'gate', loc: 'road',
    brief: ['Цепь, клеймо, расписка — всё сходится на заставе.',
            'Барон держал волколака на цепи и грабил своих же купцов.',
            'Наёмники встретят тебя раньше, чем барон выйдет говорить.'],
    pool: ['merc', 'archer', 'bandit'], n: 13, gold: 560,
    done: 'Барон ушёл лесом, бросив людей. В чащу, к самому сердцу.' },

  { t: 'Сердце чащи', spot: 'heart', loc: 'woods',
    brief: ['Барон бежал туда, куда местные не ходят даже за дровами.',
            'В глубине чащи живёт то, чему он, похоже, и платил.',
            'Последняя работа. Возьми всё, что у тебя есть.'],
    pool: ['leshy', 'wolfen', 'nekker'], n: 12, gold: 900,
    unique: { t: 'leshy', name: 'ЛЕШАК', hpMul: 2.2 },
    reward: { kind: 'armor', type: 'medium', tier: 4, ench: 'ward' },
    done: 'Лешак осел трухой, а под ним — то, что осталось от барона. Барон кончился, а имя на клинке — нет.' },

  /* ВТОРОЕ ДЕЙСТВИЕ. Барона закопали, а меч из кургана так и лежит в
     сумке — и на нём чужое имя. Дальше история не про заказчика, а про
     того, кто ходил этой дорогой до тебя. */
  { t: 'Имя на клинке', spot: 'mill', loc: 'road',
    brief: ['На клинке из кургана вытравлено имя. Не твоей школы, но ведьмачье.',
            'На мельнице сидят те, кто скупал у барона краденое серебро,',
            'и они точно знают, чей это был меч. Спроси громко.'],
    pool: ['bandit', 'merc', 'archer'], n: 10, gold: 620,
    done: 'Меч сдал в залог ведьмак. Года три назад, и с тех пор его не видели.' },

  { t: 'Погост у болота', spot: 'grave', loc: 'swamp',
    brief: ['Мельники божатся: того ведьмака схоронили на погосте у болота.',
            'Могила есть, камень есть, имя выбито.',
            'Только земля над ней просела наружу, а не внутрь.'],
    pool: ['drowner', 'drowner', 'nekker'], n: 12, gold: 700,
    unique: { t: 'drowner', name: 'Утопший десятник', hpMul: 3 },
    done: 'Гроб пустой и вскрыт изнутри. Хоронили не того — или не совсем мёртвого.' },

  { t: 'Смоляная яма', spot: 'pit', loc: 'woods',
    brief: ['В чаще нашли старую стоянку: костёр, котелок, обгорелый ремень.',
            'Кто-то варил тут зелья, а потом всё это горело.',
            'Волчьё сбежалось на запах и осталось жить.'],
    pool: ['wolfen', 'wolfen', 'nekker'], n: 13, gold: 780,
    reward: { kind: 'stack', id: 'essence', n: 5 },
    done: 'В золе — ведьмачий медальон, оплавленный. Такие снимают только с мёртвых.' },

  { t: 'Перевоз', spot: 'ferry', loc: 'shore',
    brief: ['Перевозчик помнит человека с двумя мечами: возил его за реку',
            'каждое полнолуние, три года подряд, и всегда обратно — пустым.',
            'Сегодня на перевозе ждут не тебя, но встретят как тебя.'],
    pool: ['merc', 'archer', 'bandit'], n: 14, gold: 880,
    done: 'Наёмникам платили за то, чтобы к перевозу никто не совался. Платил не барон.' },

  { t: 'Ведьмин камень', spot: 'stone', loc: 'barrow',
    brief: ['За рекой, в курганах, стоит камень, и вокруг него выжжен круг.',
            'Круг подновляли — совсем недавно, и кровью.',
            'Накеры сторожат это место злее, чем своё логово.'],
    pool: ['nekker', 'nekker', 'wolfen'], n: 15, gold: 1000,
    unique: { t: 'nekker', name: 'Курганный владыка', hpMul: 4 },
    reward: { kind: 'sword', metal: 'steel', tier: 3, ench: 'thorns' },
    done: 'На камне свежие зарубки счётом в три десятка. Кто-то отмечал ходки, как ведьмак — контракты.' },

  { t: 'Тот, кто носил меч', spot: 'gully', loc: 'woods',
    brief: ['Он не мёртв. Он три года выводит тварей из-за реки и кормит ими округу,',
            'а потом берёт за них деньги — по контракту, всё честно.',
            'Ждёт в балке, с людьми. И он ЧЕЛОВЕК: серебро против него — железка.'],
    pool: ['merc', 'merc', 'archer'], n: 14, gold: 1200,
    unique: { t: 'merc', name: 'Ольгерд, ведьмак', hpMul: 5 },
    done: 'Ольгерд умер молча. Медальон у него был чужой — снятый, как и тот, из золы.' },

  { t: 'Долг', spot: 'heart', loc: 'woods',
    brief: ['То, что Ольгерд водил за реку, никуда не делось и ждёт кормильца.',
            'В сердце чащи снова тихо — так тихо, как бывает перед лешаком.',
            'Последняя работа. За неё уже заплачено чужой кровью.'],
    pool: ['leshy', 'wolfen', 'wolfen', 'nekker'], n: 16, gold: 1600,
    unique: { t: 'leshy', name: 'СТАРЫЙ ЛЕШАК', hpMul: 3.4 },
    reward: { kind: 'sword', metal: 'silver', tier: 4, ench: 'flame' },
    done: 'Чаща выдохнула. Медальоны — в костёр, мечи — за спину, дорога — дальше. Работа кончена.' },
];
let storyIdx = 0;
function storyNow() { return storyIdx < STORY.length ? STORY[storyIdx] : null; }
function takeStory() {
  const q = storyNow();
  if (!q) { message('Сюжет пройден — остались работы с доски'); return; }
  if (taken.length >= MAX_JOBS) { message('Больше трёх работ разом не берут — доделай что-нибудь'); return; }
  if (taken.some(c => c.story)) { message('Сюжетное дело уже взято: ' + taken.find(c => c.story).t); return; }
  startContract({ t: q.t, pool: q.pool.slice(), loc: q.loc, n: q.n, gold: q.gold,
                  fam: jobFam(q), story: true, spot: q.spot, unique: q.unique, reward: q.reward,
                  done: q.done, arrived: false });
}
/* Куда сейчас идти: сюжетное место, край работы или обратно к доске. */
function questGoal() {
  if (phase === 'FIGHT' && contract) {
    if (contract.story && !contract.arrived) {
      const s = SPOTS[contract.spot];
      if (s) return { mx: s.x, my: s.y, n: s.ico + ' ' + s.n };
    }
    if (locAt(P.x, P.y) !== contract.loc) {
      const g = regionSpot(contract.loc), S = LOCS[contract.loc] || LOCS.woods;
      return { mx: g.mx, my: g.my, n: S.ico + ' ' + S.n };
    }
    return null;
  }
  if (Math.hypot(P.x - BOARD.x, P.y - BOARD.y) > 260) return { mx: BOARD.x, my: BOARD.y, n: '🏕 лагерь' };
  return null;
}

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
  /* Руины, берег и перелесок появились вместе с большой картой — без
     своих работ треть земли простаивала бы: доска гоняла бы только по
     болоту, чаще, кургану и тракту. */
  { t: 'Тати под стеной',      pool: ['bandit', 'archer'],           loc: 'ruins',  d: 0.95 },
  { t: 'Кубло в руинах',       pool: ['bandit', 'nekker', 'bandit'], loc: 'ruins',  d: 1.1 },
  { t: 'Утопцы на отмели',     pool: ['drowner', 'drowner'],         loc: 'shore',  d: 0.9 },
  { t: 'Топляки на берегу',    pool: ['drowner', 'nekker', 'wolfen'],loc: 'shore',  d: 1.4 },
  { t: 'Кабаны в перелеске',   pool: ['boar', 'boar', 'boar'],       loc: 'field',  d: 0.75 },
  { t: 'Волки у околицы',      pool: ['wolfen', 'boar'],             loc: 'field',  d: 1.05 },
  /* Работы новой земли. Пашня, скалы и пустошь без своих контрактов были бы
     просто дорогой между старыми краями. */
  { t: 'Псы потравили стадо',  pool: ['hound', 'hound'],             loc: 'farm',   d: 0.7 },
  { t: 'Медведь на выселках',  pool: ['bruin', 'hound'],             loc: 'farm',   d: 1.15 },
  { t: 'Кикиморы в бороздах',  pool: ['kikimor', 'kikimor'],         loc: 'farm',   d: 1.25 },
  { t: 'Гарпии на перевале',   pool: ['harpy', 'harpy', 'harpy'],    loc: 'crag',   d: 1.0 },
  { t: 'Гнездовье гарпий',     pool: ['harpy', 'harpy', 'griffin'],  loc: 'crag',   d: 1.8 },
  { t: 'Атаман в скалах',      pool: ['ataman', 'bandit', 'archer'], loc: 'crag',   d: 1.5 },
  { t: 'Гули на пустоши',      pool: ['ghoul', 'ghoul'],             loc: 'heath',  d: 0.95 },
  { t: 'Падальщики у виселиц', pool: ['ghoul', 'ghoul', 'wraith'],   loc: 'heath',  d: 1.3 },
  { t: 'Призраки на пустоши',  pool: ['wraith', 'wraith', 'ghoul'],  loc: 'heath',  d: 1.4 },
  { t: 'Эндриажьи ходы',       pool: ['endriag', 'endriag'],         loc: 'barrow', d: 1.7 },
  { t: 'Кикиморья кладка',     pool: ['kikimor', 'kikimor', 'drowner'], loc: 'swamp', d: 1.35 },
  { t: 'Призрак на погосте',   pool: ['wraith', 'nekker'],           loc: 'ruins',  d: 1.2 },
  { t: 'ГРИФОН',               pool: ['griffin', 'harpy', 'harpy'],  loc: 'crag',   d: 2.0 },
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
/* ВЗЯТЫЕ РАБОТЫ. Раньше держали одну: взял — остальные с доски пропали, и до
   конца работы ты никуда. Теперь их до трёх разом, у каждой свой счёт целей и
   своя очередь выхода, а `contract` — та, которой ты сейчас занят: либо та,
   на чьей земле стоишь, либо первая из списка. Так весь старый код, который
   пишет «contract.t», продолжает говорить о деле, а не о случайной работе. */
const MAX_JOBS = 3;
let taken = [];
function focusJob() {
  if (!taken.length) return null;
  for (const c of taken) {                             // сюжет ведёт туда, куда идёшь
    if (c.story && SPOTS[c.spot] && Math.hypot(P.x - SPOTS[c.spot].x, P.y - SPOTS[c.spot].y) < 470) return c;
  }
  const here = locAt(P.x, P.y);
  for (const c of taken) if (!c.story && c.loc === here) return c;
  return taken[0];
}
function syncFocus() {
  contract = focusJob();
  killsLeft = contract ? contract.left : 0;            // пояс показывает счёт ТЕКУЩЕЙ работы
}
let curLoc = 'camp';                     // где ведьмак стоит ПРЯМО СЕЙЧАС — считается по координатам
let deaths = 0;                          // сколько раз падал: смерть больше не конец, но счёт ведём
let offers = [];                         // три работы на доске у костра
/* Экран — окно в мир, а не сам мир. Камера едет за ведьмаком и упирается
   в края карты, чтобы за границей не зияла чернота. */
const cam = { x: 0, y: 0 };
function syncCam() {
  cam.x = clamp(P.x - WW / 2, 0, Math.max(0, WORLD_W - WW));
  cam.y = clamp(P.y - WH / 2, 0, Math.max(0, WORLD_H - WH));
}
/* Обратного перевода (мир → экран) нет намеренно: мир рисуется сдвигом
   холста, а не пересчётом каждой точки. Держать рядом неиспользуемые sx/sy
   опасно — в лавке уже есть свои локальные sx/sy для раскладки кнопок, и
   такое затенение однажды уже уронило игру (локальная L против места L()). */
function mw() { return { x: mouse.x - WX0 + cam.x, y: mouse.y - WY0 + cam.y }; }   // экран → мир
const L = () => LOCS[curLoc] || LOCS.camp;
let killsLeft, msg, msgT, panel, uiHit = [], anim = 0, lastFrame = null, paused = false;
let keys = {}, mouse = { x: CW / 2, y: 300, down: false }, best = 0;
let floaties = [];
let bagScroll = 0, benchScroll = 0;      // прокрутка списков в сумке и на верстаке

try { best = +localStorage.getItem('witcher_best') || 0; } catch (e) { best = 0; }

let nextId = 1;
function mkSword(metal, tier, ench) { return { k: 'sword', metal, tier: tier | 0, ench: ench || null, id: nextId++ }; }
function mkXbow(type, tier, ench) { return { k: 'xbow', type, tier: tier | 0, ench: ench || null, id: nextId++ }; }
function mkArmor(type, tier, ench) { return { k: 'armor', type, tier: tier | 0, ench: ench || null, id: nextId++ }; }
function mkStack(id, n) { return { k: 'stack', id, n, uid: nextId++ }; }

/* =====================  ПРЕДМЕТЫ: ВЕС, ЦЕНА, ИМЯ  ===================== */

function itemWeight(it) {
  if (it.k === 'sword') return SWORD[it.metal].w;
  if (it.k === 'armor') return ARMOR[it.type].w;
  if (it.k === 'xbow') return XBOW[it.type].w;
  const s = POTIONS[it.id] || STUFF[it.id];
  return (s ? s.w : 0) * it.n;
}
function itemName(it) {
  if (it.k === 'sword') return SWORD[it.metal].n;
  if (it.k === 'armor') return ARMOR[it.type].n;
  if (it.k === 'xbow') return XBOW[it.type].n;
  return (POTIONS[it.id] || STUFF[it.id]).n;
}
function itemIco(it) {
  if (it.k === 'sword') return SWORD[it.metal].ico;
  if (it.k === 'armor') return ARMOR[it.type].ico;
  if (it.k === 'xbow') return XBOW[it.type].ico;
  return (POTIONS[it.id] || STUFF[it.id]).ico;
}
function itemPrice(it) {
  if (it.k === 'sword') return Math.round(SWORD[it.metal].dmg * 4 * TIERS[it.tier].m * (it.ench ? 1.6 : 1));
  if (it.k === 'armor') return Math.round(ARMOR[it.type].price * TIERS[it.tier].m * (it.ench ? 1.6 : 1));
  if (it.k === 'xbow') return Math.round(XBOW[it.type].price * TIERS[it.tier].m * (it.ench ? 1.6 : 1));
  return (POTIONS[it.id] || STUFF[it.id]).price * it.n;
}
function carried() {
  let w = bagWeight();                                 // сам мешок тоже на спине
  for (const it of inv) w += itemWeight(it);
  for (const s of [P.steel, P.silver, P.armor, P.xbow]) if (s) w += itemWeight(s);
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
  d *= 1 + 0.06 * schoolPow('blade');                  // волчий доспех — про меч
  d *= 1 + 0.06 * sk('blade');                         // и навык «Клинок»
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
  out *= 1 - 0.05 * schoolPow('tank');                 // медведь гасит сверх брони
  if (P.mut > 0) out *= 1.4;                           // в мутации сам стеклянный
  return Math.max(1, out);
}
function moveSpeed() {
  let s = 112;
  if (P.armor) s *= ARMOR[P.armor.type].spd;
  s *= L().spd;                                        // болото вяжет, тракт торопит
  if (onPath(P.x, P.y)) s *= 1.14;                     // по утоптанному быстрее
  s *= loadState().mul;
  if (P.mut > 0) s *= 1.12;
  if (P.slow > 0) s *= 0.55;
  return s;
}
function mpRegen() {
  let r = 7;
  if (P.armor) r *= ARMOR[P.armor.type].mpr;
  r *= 1 + 0.12 * sk('focus');
  if (hasEnch('ward')) r *= 1.5;
  return r;
}
function hasEnch(key) {
  for (const s of [P.steel, P.silver, P.armor, P.xbow]) if (s && s.ench === key) return true;
  return false;
}
function maxHP() { return 100 + (P.armor ? ARMOR[P.armor.type].def * 2 : 0) + 8 * schoolPow('tank') + 8 * sk('tough'); }
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
  if (at < 0) { message(it === P.steel || it === P.silver || it === P.armor || it === P.xbow ? 'Это и так на тебе' : 'Этого нет в сумке'); return; }
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
  } else if (it.k === 'xbow') {
    const old = P.xbow;
    inv.splice(at, 1);
    P.xbow = it;
    if (old) inv.push(old);
    message('За спину: ' + fullName(it) + ' · ' + XBOW[it.type].bon + (old ? ' · прежний ушёл в сумку' : ''));
  }
  saveRun();
}
/* НАСКОЛЬКО вещь из сумки лучше надетой.
   Без этой строчки два одинаковых меча в списке неразличимы: жмёшь
   «надеть», они меняются местами, надпись «взял в руку» мелькает — а
   на экране ровно то же самое. Выглядит как сломанная кнопка, хотя
   обмен честно произошёл. */
function slotOf(it) {
  if (it.k === 'armor') return P.armor;
  if (it.k === 'xbow') return P.xbow;
  return it.metal === 'steel' ? P.steel : P.silver;
}
function gearValue(it) {
  if (it.k === 'sword') return SWORD[it.metal].dmg * TIERS[it.tier].m;
  if (it.k === 'xbow') return XBOW[it.type].dmg * TIERS[it.tier].m;
  return ARMOR[it.type].def * TIERS[it.tier].m;
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
  const what = it.k === 'armor' ? ' брони' : ' урона';
  /* У школьного доспеха броня — не вся правда: кот на десять единиц «хуже»
     тяжёлого, но даёт то, чего у тяжёлого нет вовсе. Дописываем значок школы,
     чтобы «−10 брони» не читалось как «выбрось». */
  const mark = it.k === 'armor' && ARMOR[it.type].school &&
               (!cur.k || cur.k !== 'armor' || ARMOR[cur.type].school !== ARMOR[it.type].school)
             ? ' ' + ARMOR[it.type].ico : '';
  if (d > 0) return { t: '+' + d + what + mark, c: '#7fd6a0' };
  if (d < 0) return { t: '−' + (-d) + what + mark, c: mark ? '#c9a227' : '#ff7a6a' };
  return { t: 'цифры те же' + mark, c: '#c9a227' };    // разница только в чарах, масле или школе
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
  if (!useStack(id, 1)) { message('Нет такого зелья'); snd('deny'); return; }
  snd('drink');
  const p = POTIONS[id];
  P.tox = clamp(P.tox + p.tox, 0, 100);
  const long = 1 + 0.15 * schoolPow('brew');           // змеиный доспех тянет действие
  if (id === 'swallow') P.regen = 8 * long;
  if (id === 'thunder') P.buffThunder = 20 * long;
  if (id === 'shit') { P.biz = 12 * long; message('💼 Деловое предложение! Мечи в сторону — работаем.'); }
  else message('Выпил: ' + p.n + (p.tox > 0 ? ' (токсичность +' + p.tox + ')' : '') +
               (long > 1 ? ' · 🐍 держится дольше' : ''));
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
  snd('swing');
}
function throwContract() {
  P.atkCd = 0.34;
  const a = faceAim();
  shots.push({ x: P.x, y: P.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: 26, mine: true, kind: 'paper', life: 1.6 });
}
/* Выстрел. Урон, перезарядка и полёт болта берутся с ТОГО арбалета, что за
   спиной, а родство, броня и всё прочее решаются уже в полёте — при попадании:
   на момент нажатия неизвестно, в кого этот болт попадёт. */
function xbowDamage() {
  if (!P.xbow) return 0;
  return XBOW[P.xbow.type].dmg * TIERS[P.xbow.tier].m * (1 + 0.06 * sk('aim')) *
         (P.buffThunder > 0 ? 1.45 : 1) * (P.mut > 0 ? 2.2 : 1);
}
/* Какой болт в жёлобе. Проверяем по BOLTS, а не по STUFF: в STUFF лежат ещё
   руда, шкуры и масла — с битой записью в жёлоб попала бы шкура. */
function boltInfo() { return BOLTS[P.boltSel] ? P.boltSel : 'bolt'; }
function shootBolt() {
  if (P.boltCd > 0 || P.dodge > 0) return;
  if (!P.xbow) { message('🏹 Арбалета нет — купи у оружейника (⚒ верстак, U)'); P.boltCd = 0.6; return; }
  const X = XBOW[P.xbow.type];
  let id = P.boltSel = boltInfo();       // заодно вычищаем битый выбор
  /* Кончились выбранные — берём любые, какие есть, и говорим об этом.
     Иначе выходило глупо: сорок серебряных в колчане, а игра отвечает
     «болты кончились», потому что выбраны были обычные. */
  if (countStack(id) <= 0) {
    const alt = BOLT_IDS.find(b => countStack(b) > 0);
    if (!alt) { message('Колчан пуст — болты продаются в лавке'); P.boltCd = 0.5; return; }
    id = P.boltSel = alt;
    message(STUFF[id].ico + ' ' + STUFF[id].n + ': подхватил, что осталось');
  }
  useStack(id, 1);
  P.boltCd = X.cd;
  snd('bolt');
  const a = faceAim();
  shots.push({
    x: P.x, y: P.y, vx: Math.cos(a) * X.spd, vy: Math.sin(a) * X.spd,
    dmg: xbowDamage(), mine: true, kind: 'bolt', bolt: id, knock: X.knock || 0, life: X.life,
  });
}
/* Попадание болта. Родство считаем ЗДЕСЬ: обычный болт бьёт всех ровно
   (этим арбалет и выручает, когда в руке не тот меч), а серебряный уже
   разбирает, нечисть перед ним или человек. */
function boltHit(s, f) {
  const B = BOLTS[s.bolt] || BOLTS.bolt;
  const fam = FOES[f.t].fam;
  let k = B.mul || 1, src = 'shot';
  if (B.fam) {
    const right = B.fam === fam;
    k *= right ? B.hit : B.miss;
    if (!right) src = 'wrongbolt';
  }
  hurtFoe(f, s.dmg * k, src, B.pierce);
  if (B.burn) f.burn = Math.max(f.burn, B.burn);
  if (s.knock) {                                       // ворот сбивает с ног
    const a = Math.atan2(f.y - P.y, f.x - P.x);
    f.kx = Math.cos(a) * s.knock; f.ky = Math.sin(a) * s.knock;
    f.stun = Math.max(f.stun, 0.9);
  }
  if (B.blast) {
    snd('blast');
    parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, t: 0, life: 0.35, c: '#ffb43a', r: B.blast, ring: true });
    for (const o of foes) {
      if (o === f || o.dead || dist(o, s) > B.blast) continue;
      hurtFoe(o, s.dmg * k * 0.6, 'shot', B.pierce);
      if (B.burn) o.burn = Math.max(o.burn, B.burn);
    }
  }
}
/* Переключение болта. Катаемся только по тем, что реально есть в колчане:
   выбрать пустую связку и потом гадать, почему не стреляет, — не игра. */
function cycleBolt(dir) {
  const have = BOLT_IDS.filter(b => countStack(b) > 0);
  if (!have.length) { message('➶ Колчан пуст — болты продаются в лавке'); return; }
  const i = (have.indexOf(P.boltSel) + (dir || 1) + have.length) % have.length;
  P.boltSel = have[i];
  const S = STUFF[P.boltSel];
  message(S.ico + ' ' + S.n + ' ×' + countStack(P.boltSel) + ' — ' + S.desc);
}

function hurtFoe(f, dmg, src, pierce) {
  if (f.dead) return;                                  // добивать труп — значит дважды снять его с контракта
  const armor = pierce ? 0 : (FOES[f.t].armor || 0);   // бронебойный болт брони не замечает
  const real = Math.max(1, dmg - armor);
  f.hp -= real;
  f.hitT = 0.12;
  const weak = src === 'wrong' || src === 'wrongbolt';
  snd(weak ? 'hitwrong' : 'hit');
  floaties.push({ x: f.x, y: f.y - 14, txt: Math.round(real), t: 0, c: weak ? '#8a8f96' : '#ffd166' });
  if (weak) floaties.push({ x: f.x, y: f.y - 26, txt: src === 'wrong' ? 'не тот меч' : 'не тот болт', t: 0, c: '#8a8f96' });
  if (hasEnch('vamp')) P.hp = Math.min(maxHP(), P.hp + real * 0.12);
  if (P.mut > 0) P.hp = Math.min(maxHP(), P.hp + real * 0.25);
  if (hasEnch('flame')) f.burn = Math.max(f.burn, 3);
  if (hasEnch('frost')) f.slow = Math.max(f.slow, 1.6);
  blood(f.x, f.y, 5);
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  f.dead = true;
  snd('kill');
  blood(f.x, f.y, 16);
  P.mutGauge = Math.min(100, P.mutGauge + 14);
  // опыт по тому, насколько тварь была страшна, а не по числу голов
  gainXP(Math.max(2, Math.round(FOES[f.t].hp / 5 + (FOES[f.t].boss ? 40 : 0))));
  // голову засчитываем ТОЙ работе, по которой тварь вышла
  if (f.job && f.job.left > 0) f.job.left--;
  else { const c = taken.find(j => j.left > 0 && j.pool.indexOf(f.t) >= 0); if (c) c.left--; }
  killsLeft = contract ? contract.left : 0;
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
  snd('hurt');
  P.hp -= d; P.inv = 0.35; P.shake = 0.25;
  if (from && hasEnch('thorns')) hurtFoe(from, raw * 0.25, 'thorns');
  blood(P.x, P.y, 6);
  if (P.hp <= 0) endGame('Ведьмак пал. ' + (contract ? 'Контракт: ' + contract.t : ''));
}

/* =====================  РУНЫ  ===================== */

/* Грифоний доспех считается ЗДЕСЬ: и в цене знака, и в его силе. Цену
   берём через ту же функцию, что рисует кнопку в поясе, — иначе на кнопке
   было бы написано одно, а списывалось другое. */
function runeCost(R) { return Math.max(1, Math.round(R.mp * (1 - 0.08 * schoolPow('sign')) * (1 - 0.06 * sk('thrift')))); }
function runePower() { return 1 + 0.12 * schoolPow('sign') + 0.08 * sk('power'); }
function castRune(i) {
  const R = RUNES[i]; if (!R) return;
  if (P.runeCd[i] > 0) return;
  const cost = runeCost(R);
  if (P.mp < cost) { message('Мало энергии для «' + R.n + '»'); return; }
  P.mp -= cost; P.runeCd[i] = R.cd;
  snd(R.k);                                            // у каждого знака свой голос
  const pow = runePower();
  const a = faceAim();
  if (R.k === 'igni') {
    parts.push({ cone: true, x: P.x, y: P.y, a, t: 0, life: 0.35, c: '#ff8a3a', len: 120, w: 0.7 });
    for (const f of foes) if (inCone(f, a, 120, 0.7)) { hurtFoe(f, 24 * pow, 'rune'); f.burn = 4; }
  } else if (R.k === 'aard') {
    parts.push({ cone: true, x: P.x, y: P.y, a, t: 0, life: 0.3, c: '#9fd8ff', len: 100, w: 0.8 });
    for (const f of foes) if (inCone(f, a, 100, 0.8)) {
      hurtFoe(f, 7 * pow, 'rune');
      const d = Math.atan2(f.y - P.y, f.x - P.x);
      f.kx = Math.cos(d) * 260; f.ky = Math.sin(d) * 260; f.stun = Math.max(f.stun, 1.3);
    }
  } else if (R.k === 'quen') {
    P.quen = (60 + armorDef() * 1.2) * pow; P.quenT = 9;
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
  snd('mutate');
  message('🩸 КРОВАВАЯ ЕБАТНЯ! Урон вдвое, кровь чужая — твоя.');
}

/* =====================  ДОБЫЧА  ===================== */

function lootFrom(f) {
  const k = ci + 1;
  const mul = (hasEnch('greed') ? 1.3 : 1) * (P.biz > 0 ? 3 : 1);
  drop(f.x, f.y, { k: 'gold', n: Math.round((6 + ri(9) + k * 2) * mul) });
  const roll = Math.random();
  if (roll < 0.34) drop(f.x, f.y, mkStack(pick(['ore', 'hide', 'herb', 'herb', 'essence']), 1 + ri(2)));
  else if (roll < 0.46) {
    // особые болты попадаются реже обычных и меньшими связками
    const rare = Math.random() < 0.28;
    const b = rare ? pick(['boltsil', 'boltarm', 'boltfir', 'boltbom']) : 'bolt';
    drop(f.x, f.y, mkStack(b, rare ? 2 + ri(3) : 4 + ri(6)));
  }
  else if (roll < 0.56) drop(f.x, f.y, mkStack(pick(['swallow', 'thunder', 'honey']), 1));
  else if (roll < 0.62 || FOES[f.t].boss) drop(f.x, f.y, randomGear());
}
function randomGear() {
  const tier = Math.min(TIERS.length - 1, ri(Math.min(4, 2 + Math.floor(ci / 2))));
  const ench = Math.random() < 0.3 ? pick(ENCH_KEYS) : null;
  const r = Math.random();
  if (r < 0.42) return mkSword(pick(['steel', 'silver']), tier, ench);
  if (r < 0.82) {
    // школьный доспех — редкая находка: обычный попадается втрое чаще
    const type = Math.random() < 0.25 ? pick(['cat', 'griffin', 'bear', 'wolf', 'viper'])
                                      : pick(['light', 'medium', 'heavy']);
    return mkArmor(type, tier, ench);
  }
  // скорострел с трупа не снимают — его только покупают у оружейника
  return mkXbow(pick(['light', 'hunter', 'siege']), tier, ench);
}
/* Место для добычи. Куст и камень игрок обходит по дуге r+9, а радиус
   подбора всего 18 — значит вещь, упавшая в середину дерева, недостижима
   навсегда. Раньше в дерево улетало больше трети выпавшего с тех, кто
   умер под кроной. Выталкиваем наружу. */
function freeSpot(x, y) {
  for (let k = 0; k < 12; k++) {
    let moved = false;
    for (const o of obstNear(x, y)) {
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
  if (it.k === 'gold') { gold += it.n; snd('coin'); floaties.push({ x: d.x, y: d.y, txt: '+' + it.n + '💰', t: 0, c: '#f2b134' }); return true; }
  // тяжёлое не поднимаем молча: иначе перегруз наступает незаметно
  if (carried() + itemWeight(it) > capacity() * 1.5) {
    if (heavyT <= 0) { message('Слишком тяжело — не поднять. Выбрось лишнее (I) или продай у костра'); heavyT = 3; }
    return false;
  }
  if (it.k === 'stack') addStack(it.id, it.n); else addItem(it);
  snd('pick');
  floaties.push({ x: d.x, y: d.y, txt: '+' + (it.k === 'stack' ? itemName(it) + ' ×' + it.n : itemName(it)), t: 0, c: '#7fd6a0' });
  return true;
}

/* =====================  ВРАГИ  ===================== */

function spawnFoe(type, x, y, uniq) {
  const S = FOES[type];
  const mul = (1 + ci * 0.12) * (uniq ? uniq.hpMul : 1);
  foes.push({
    t: type, x, y, hp: S.hp * mul, max: S.hp * mul, r: S.r * (uniq ? 1.25 : 1),
    name: uniq ? uniq.name : null,
    cd: rnd(1), stun: 0, burn: 0, slow: 0, kx: 0, ky: 0, hitT: 0, dead: false, bob: rnd(6.3),
    slide: 0, sdir: 1, checkT: 0.5, lx: x, ly: y,      // для обхода того, во что уткнулся
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
  /* Границу лагеря держим ДО проверки оглушения: иначе тварь, заброшенную
     Аардом через межу, оглушение оставляло стоять в лагере на всю секунду
     с лишним — а обещано, что там не тронут вовсе. */
  keepOutOfCamp(f);
  if (f.stun > 0) { f.stun -= dt; return; }

  const d = dist(f, P);
  // хозяин места двигается на своей земле резвее: утопец в болоте,
  // волколак в чаще, накер в кургане
  const sp = S.sp * (f.slow > 0 ? 0.45 : 1) * (L().home === f.t ? 1.3 : 1);
  if (S.ranged) {
    // лучник держит дистанцию: подходит на выстрел и пятится, если жмут
    const want = L().open ? 190 : 150;                 // на тракте держится дальше
    const reach = S.reach * (L().open ? 1.3 : 1);
    let a = Math.atan2(P.y - f.y, P.x - f.x);
    // лучник тоже умеет упереться в дерево спиной — пусть обходит, как все
    if (f.slide > 0) { f.slide -= dt; a += f.sdir * 1.15; }
    f.checkT -= dt;
    if (f.checkT <= 0) {
      if (f.slide <= 0 && Math.hypot(f.x - f.lx, f.y - f.ly) < 4 && d > reach) {
        f.slide = 0.8; f.sdir = Math.random() < 0.5 ? 1 : -1;
      }
      f.checkT = 0.5; f.lx = f.x; f.ly = f.y;
    }
    if (d > want + 20) { f.x += Math.cos(a) * sp * dt; f.y += Math.sin(a) * sp * dt; }
    else if (d < want - 40) { f.x -= Math.cos(a) * sp * dt; f.y -= Math.sin(a) * sp * dt; }
    f.cd -= dt;
    if (f.cd <= 0 && d < reach) {
      f.cd = S.atk;
      shots.push({ x: f.x, y: f.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: S.dmg, mine: false, kind: 'arrow', life: 2 });
    }
  } else {
    if (d > S.reach) {
      /* Твари ходят по прямой, а деревья и камни их держат — и пара камней,
         вставших воротами, зажимала зверя намертво: кабан упирался в них и
         стоял так, сколько ни жди, а контракт не закрывался, пока его не
         найдёшь и не добьёшь. Уткнулся — пробуем обойти боком. */
      let a = Math.atan2(P.y - f.y, P.x - f.x);
      if (f.slide > 0) { f.slide -= dt; a += f.sdir * 1.15; }
      f.x += Math.cos(a) * sp * dt; f.y += Math.sin(a) * sp * dt;
      f.checkT -= dt;
      if (f.checkT <= 0) {
        if (f.slide <= 0 && Math.hypot(f.x - f.lx, f.y - f.ly) < 6) {
          f.slide = 0.8; f.sdir = Math.random() < 0.5 ? 1 : -1;
        }
        f.checkT = 0.5; f.lx = f.x; f.ly = f.y;
      }
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
  for (const o of obstNear(f.x, f.y)) {
    const need = o.r + f.r * 0.7, d = Math.hypot(f.x - o.x, f.y - o.y);
    if (d < need && d > 0.01) {
      const a = Math.atan2(f.y - o.y, f.x - o.x);
      f.x = o.x + Math.cos(a) * need; f.y = o.y + Math.sin(a) * need;
    }
  }
  f.x = clamp(f.x, f.r, WORLD_W - f.r); f.y = clamp(f.y, f.r, WORLD_H - f.r);
  keepOutOfCamp(f);
}
/* В лагерь нечисть не суётся: костёр, знаки, круг. Без этой границы тварей
   можно было привести за собой прямо к верстаку — а лагерь обещан местом,
   где никто не тронет. Выталкиваем по ближней меже, но только по той, что
   ведёт в мир: низ лагеря — это край карты, туда выпихивать некуда. */
function keepOutOfCamp(f) {
  push(SPOTS.camp.x, SPOTS.camp.y, CAMP_R);
  // в деревню нечисть тоже не заходит: там живут, там собаки и вилы
  const t = townAt(f.x, f.y);
  if (t) push(t.x, t.y, t.r);
  function push(cx, cy, R) {
    const dx = f.x - cx, dy = f.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= R) return;
    const a = d > 0.01 ? Math.atan2(dy, dx) : rnd(6.3);
    // ставим на шаг ЗА черту, а не ровно на неё: ровно на черте расстояние
    // считается то 300, то 299.99999999999994 — и тварь оказывается «внутри»
    f.x = cx + Math.cos(a) * (R + 2);
    f.y = cy + Math.sin(a) * (R + 2);
    f.x = clamp(f.x, f.r, WORLD_W - f.r); f.y = clamp(f.y, f.r, WORLD_H - f.r);
  }
}

/* =====================  КОНТРАКТЫ  ===================== */

/* Гуща и камни для ВСЕГО мира разом. Считаются от постоянного зерна —
   значит лес растёт всегда одинаково, и «та сосна у брода» будет на месте
   и в следующем походе. Густота своя у каждого края, тропы не зарастают,
   у костра чисто. */
function buildWorld() {
  const rng = mulberry(WORLD_SEED);
  const out = [];
  const want = { camp: 0.00004, field: 0.00006, road: 0.00003, woods: 0.00022,
                 swamp: 0.00009, barrow: 0.00019, ruins: 0.00016, shore: 0.00006,
                 farm: 0.00004, crag: 0.00026, heath: 0.00003 };
  const tries = Math.round(WORLD_W * WORLD_H * 0.00013);
  for (let i = 0; i < tries; i++) {
    const x = 30 + rng() * (WORLD_W - 60), y = 30 + rng() * (WORLD_H - 60);
    const id = locAt(x, y), S = LOCS[id];
    if (rng() > (want[id] || 0.00008) / 0.00013) continue;   // густота края
    if (Math.hypot(x - FIRE.x, y - FIRE.y) < 170) continue;  // у костра чисто
    if (onPath(x, y)) continue;                              // тропы не зарастают
    let nearSpot = false;
    for (const k in SPOTS) if (Math.hypot(x - SPOTS[k].x, y - SPOTS[k].y) < 70) nearSpot = true;
    if (nearSpot) continue;                                  // и к приметным местам можно подойти
    if (townAt(x, y)) continue;                              // и в деревне не растёт лес
    out.push({ x, y, r: S.rmin + rng() * (S.rmax - S.rmin), tree: rng() < (id === 'barrow' ? 0.25 : 0.6) });
  }
  /* Дворы поселений — такие же преграды, как камни: сквозь избу не ходят.
     Ставим их кольцом вокруг колодца, чтобы получилась улица, а не куча. */
  for (const t of TOWNS) {
    const r2 = mulberry(WORLD_SEED + t.x * 31 + t.y);
    for (let i = 0; i < t.huts; i++) {
      const a = (i / t.huts) * 6.283 + r2() * 0.5;
      const d = t.r * (0.42 + r2() * 0.36);
      out.push({ x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d,
                 r: 17 + r2() * 7, hut: true, town: t.k, big: r2() < 0.25 });
    }
  }
  return out;
}
/* Сетка препятствий. Мир втрое больше — значит и камней втрое больше, а
   перебирались они ЦЕЛИКОМ каждый кадр: и для ведьмака, и для каждой твари.
   Раскладываем по клеткам в 128 шагов и берём только соседние девять. */
const OG = 128;
let obstGrid = null, obstGW = 0, obstGH = 0;
function buildObstGrid(list) {
  obstGW = Math.ceil(WORLD_W / OG); obstGH = Math.ceil(WORLD_H / OG);
  obstGrid = new Array(obstGW * obstGH);
  for (const o of list) {
    const gx = clamp(Math.floor(o.x / OG), 0, obstGW - 1), gy = clamp(Math.floor(o.y / OG), 0, obstGH - 1);
    const i = gy * obstGW + gx;
    (obstGrid[i] || (obstGrid[i] = [])).push(o);
  }
}
function obstNear(x, y) {                              // всё, что может задеть точку
  if (!obstGrid) buildObstGrid(obst);
  const gx = clamp(Math.floor(x / OG), 0, obstGW - 1), gy = clamp(Math.floor(y / OG), 0, obstGH - 1);
  const out = [];
  for (let j = gy - 1; j <= gy + 1; j++) {
    if (j < 0 || j >= obstGH) continue;
    for (let i = gx - 1; i <= gx + 1; i++) {
      if (i < 0 || i >= obstGW) continue;
      const c = obstGrid[j * obstGW + i];
      if (c) for (const o of c) out.push(o);
    }
  }
  return out;
}
/* Взял работу — никто тебя никуда не переносит. Ты стоишь там, где стоял,
   а до места идёшь сам. Отсюда и стрелка на краю экрана, и метка на карте. */
function startContract(c) {
  const job = c || offers[0] || makeContract(JOBS[0], ci);
  if (taken.length >= MAX_JOBS) { message('Больше трёх работ разом не берут'); return; }
  if (taken.indexOf(job) >= 0) { message('Эта работа уже взята'); return; }
  job.left = job.n;                                    // свой счёт целей у каждой работы
  job.queue = job.n;                                   // и своя очередь выхода
  taken.push(job);
  offers = offers.filter(o => o !== job);              // с доски снимается только взятая
  contract = job;
  phase = 'FIGHT';
  panel = null;
  killsLeft = job.left;
  spawnT = 0;
  const S = LOCS[job.loc] || LOCS.woods;
  if (job.story && SPOTS[job.spot]) {
    message('📖 ' + job.t + ': иди к месту «' + SPOTS[job.spot].n + '» — стрелка покажет');
  } else {
    message('📜 ' + job.t + ': иди в ' + S.ico + ' ' + S.n.toLowerCase() + ' — целей ' + job.n + '. ' + S.note);
  }
}
/* Сюжетная работа начинается не когда взял, а когда ДОШЁЛ. */
function storyArrival() {
  const contract = taken.find(c => c.story && !c.arrived);
  if (!contract) return;
  const s = SPOTS[contract.spot];
  if (!s || Math.hypot(P.x - s.x, P.y - s.y) > 130) return;
  contract.arrived = true;
  if (contract.unique) {
    const u = contract.unique;
    spawnFoe(u.t, clamp(s.x + rnd(120) - 60, 20, WORLD_W - 20), clamp(s.y + rnd(120) - 60, 20, WORLD_H - 20), u);
    /* Именная тварь ТОЖЕ помнит свою работу. Без этой строчки задание
       закрывалось, пока Седой стоял живой посреди поля: проверка «все свои
       твари побиты» его не видела, потому что своей работы у него не было.
       Раньше проверка требовала пустого поля целиком и ловила это сама. */
    foes[foes.length - 1].job = contract;
    message('📖 ' + s.n + ': ' + u.name + ' здесь. Целей ' + contract.n);
  } else {
    message('📖 ' + s.n + '. Началось: целей ' + contract.n);
  }
}
let spawnT = 0;
/* Выпускает тварей по ТОЙ работе, на чьей земле ведьмак стоит. Если взяты
   три и все в разных краях, работать будет та, куда пришёл, — остальные ждут
   своей очереди и своего края. */
function spawnTick(dt) {
  spawnT -= dt;
  if (spawnT > 0) return;
  for (const c of taken) if (spawnOne(c)) { spawnT = 0.85; return; }
  spawnT = 0.2;                                        // никому не подошло — заглянем раньше
}
function spawnOne(contract) {
  if (contract.queue <= 0) return false;
  if (contract.story && !contract.arrived) return false;   // сюжет ждёт, пока дойдёшь до места
  /* В сюжете дело привязано к МЕСТУ, а не к краю: брод, например, лежит
     на берегу, хотя работа числится болотной, — и по краю там не вышло бы
     ни одного утопца. Работы с доски по-прежнему считаются по краю. */
  const S = contract.story && SPOTS[contract.spot] ? SPOTS[contract.spot] : null;
  if (S) { if (Math.hypot(P.x - S.x, P.y - S.y) > 430) return false; }
  else if (locAt(P.x, P.y) !== contract.loc) return false;
  /* Выходят где-то поблизости, но не в лицо и не в лагере: тычем наугад
     вокруг ведьмака и берём первую точку своего края. */
  let x = P.x, y = P.y, ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    const a = rnd(6.3), d = 230 + rnd(240);
    x = clamp(P.x + Math.cos(a) * d, 20, WORLD_W - 20);
    y = clamp(P.y + Math.sin(a) * d, 20, WORLD_H - 20);
    ok = !inCamp(x, y) && !townAt(x, y) &&
         (S ? Math.hypot(x - S.x, y - S.y) < 470 : locAt(x, y) === contract.loc);
  }
  /* Шестьдесят тычков наугад — и ни одного попадания: значит ведьмак стоит в
     узком месте, где кольцо в 230–470 шагов почти целиком лежит за межой.
     Такие точки редки (одна на четыре десятка на тракте), но работа в них
     вставала намертво: целей осталось восемь, а выходить некому. Тогда ищем
     не наугад, а ПО КАРТЕ КРАЁВ — она и так посчитана по клеткам. */
  if (!ok) {
    const good = [];
    for (let ty = Math.max(0, ((P.y - 700) / TILE) | 0); ty < Math.min(TH, ((P.y + 700) / TILE) | 0); ty++) {
      for (let tx = Math.max(0, ((P.x - 700) / TILE) | 0); tx < Math.min(TW, ((P.x + 700) / TILE) | 0); tx++) {
        const gx = tx * TILE + TILE / 2, gy = ty * TILE + TILE / 2;
        const d = Math.hypot(gx - P.x, gy - P.y);
        if (d < 150 || d > 700) continue;
        if (inCamp(gx, gy) || townAt(gx, gy)) continue;
        if (S ? Math.hypot(gx - S.x, gy - S.y) > 470 : SEEDS[regionTiles[ty * TW + tx]].id !== contract.loc) continue;
        good.push({ x: gx, y: gy });
      }
    }
    if (!good.length) return false;                    // совсем некуда — подождём шаг
    const g = pick(good); x = g.x; y = g.y;
  }
  spawnFoe(pick(contract.pool), x, y);
  // тварь помнит, по чьей работе вышла: иначе не понять, кому её засчитать
  foes[foes.length - 1].job = contract;
  contract.queue--;
  return true;
}
function finishContract(job) {
  const contract = job || taken[0];
  if (!contract) { phase = 'CAMP'; return; }           // без контракта закрывать нечего
  taken = taken.filter(c => c !== contract);
  foes = foes.filter(f => f.job !== contract);         // чужие твари остаются, свои расходятся
  const bonus = contract.gold;
  gold += bonus;
  gainXP(Math.round(40 + contract.n * 6 + ci * 4));    // за работу целиком — отдельно
  snd('quest');
  phase = taken.length ? 'FIGHT' : 'CAMP';             // остальные работы никуда не делись
  ci++;
  offers = rollBoard(ci);                              // на доске новые работы
  rollHotGood();                                       // и у скупщика новый спрос
  if (ci > best) { best = ci; try { localStorage.setItem('witcher_best', String(best)); } catch (e) {} }
  /* Награду кладём В СУМКУ. Раньше руда и шкуры падали на землю у костра —
     а костёр теперь на другом конце карты, и трофеи оставались лежать
     чёрт знает где. */
  const ore = 1 + ri(3), hide = 1 + ri(3);
  addStack('ore', ore); addStack('hide', hide);
  // сюжетная работа заканчивается не суммой, а тем, ЧТО выяснилось
  if (contract.story) {
    storyIdx = Math.min(STORY.length, storyIdx + 1);
    let tail = '  ·  ' + bonus + ' крон в кошель.';
    if (contract.reward) {
      const R = contract.reward;
      const it = R.kind === 'sword' ? mkSword(R.metal, R.tier, R.ench || null)
               : R.kind === 'armor' ? mkArmor(R.type, R.tier, R.ench || null)
               : null;
      if (it) { addItem(it); tail = '  ·  Награда: ' + fullName(it) + ' — в сумке'; }
      else { addStack(R.id, R.n); tail = '  ·  Награда: ' + itemName({ k: 'stack', id: R.id }) + ' ×' + R.n; }
    }
    // одно сообщение, а не два подряд: второе просто затирало первое
    if (storyIdx >= STORY.length) tail += '  ·  Сюжет пройден, дальше — работы с доски.';
    message('📖 ' + contract.done + tail);
  } else {
    message('✅ Контракт закрыт! ' + bonus + ' крон, ⛏' + ore + ' и 🧵' + hide + ' — сразу в сумку. За новой работой — к доске в лагере.');
  }
  saveRun();
}

/* =====================  ВЕРСТАК  ===================== */

function upCost(it) {
  const t = it.tier;
  // доспех чинят шкурами, железо (меч и арбалет) — рудой
  return { gold: Math.round(70 * Math.pow(1.75, t)), mat: 2 + t, matId: it.k === 'armor' ? 'hide' : 'ore' };
}
function upgrade(it) {
  if (it.tier >= TIERS.length - 1) { message('Это уже гроссмейстерская работа — выше некуда'); return; }
  const c = upCost(it);
  if (gold < c.gold) { message('Нужно ' + c.gold + ' крон'); return; }
  if (countStack(c.matId) < c.mat) { message('Нужно ' + c.mat + ' × ' + STUFF[c.matId].n.toLowerCase()); return; }
  gold -= c.gold; useStack(c.matId, c.mat);
  snd('forge');
  it.tier++;
  // у школьного доспеха ступень качает саму школу — так и говорим, что вышло
  const school = it.k === 'armor' && ARMOR[it.type].school;
  message('⚒ Теперь это ' + fullName(it) + (school ? ' · ' + schoolNote(it) : ''));
  saveRun();
}
function enchant(it) {
  const price = 120, need = 2;
  if (gold < price) { message('Зачарование стоит ' + price + ' крон'); return; }
  if (countStack('essence') < need) { message('Нужно ' + need + ' × эссенция'); return; }
  gold -= price; useStack('essence', need);
  snd('craft');
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
const TRADEABLE = ['ore', 'hide', 'herb', 'essence', 'bolt', 'boltsil', 'boltarm', 'boltfir', 'boltbom',
                   'oilsil', 'oilste', 'swallow', 'thunder', 'honey', 'shit'];
function rollHotGood() { hotGood = pick(TRADEABLE); }
function goodInfo(id) { return POTIONS[id] || STUFF[id]; }
/* С кем сейчас торгуем: у костра — своё королевство, у торговца в Каменце —
   его. Множитель королевства ложится и на покупку, и на продажу: где железо
   дёшево, там его и покупают дёшево. Поэтому возить выгодно, но не бесконечно. */
let marketKd = 'mezh';
function market() { return KINGDOMS[marketKd] || KINGDOMS.mezh; }
function kdMul(id) { return market().mul[goodKind(id)] || 1; }
function kdLacks(id) { return market().lacks.indexOf(id) >= 0; }
function buyPrice(id, base) { return Math.max(1, Math.round(base * kdMul(id))); }

function sellRate(id) { return id === hotGood ? 1 : TRADE_RATE; }
/* Цена за ШТУКУ округляется один раз, и связка — просто штука × количество.
   Раньше округлялась вся связка целиком, и арифметика в лавке не сходилась:
   строка говорила «4💰 за штуку», а кнопка «всё» за семь давала 25 вместо 28.
   Хуже того, продать семь раз по одной выходило дороже, чем всё разом, —
   лавка превращалась в кнопочную ферму. */
/* ПОТОЛОК СКУПКИ. Разные цены по уделам — это хорошо, но без потолка выходит
   вечный двигатель: купил зелье в Топях за 28, дошёл до Арда, продал за 54,
   вернулся. Проверка так и показала — наживаться можно было на ЛЮБОМ товаре.

   Правило простое и честное: скупщик не платит за вещь больше, чем за неё
   просят там, где она дешевле всего. Тогда разница в ценах остаётся (закупаться
   выгоднее в своём уделе), а возить туда-сюда — уже нет. */
const SHOP_UNIT = {};                                  // сколько стоит ОДНА штука на прилавке
function buildShopUnits() {
  for (const tab in TAB_STACKS) for (const [id, n, base] of TAB_STACKS[tab]) SHOP_UNIT[id] = base / n;
}
function sellCap(id) {
  if (SHOP_UNIT[id] == null) buildShopUnits();
  const u = SHOP_UNIT[id];
  if (u == null) return Infinity;                      // не торгуется на прилавке — потолка нет
  const kind = goodKind(id);
  let lo = Infinity;
  for (const k of KD_KEYS) {
    const K = KINGDOMS[k];
    if (K.lacks.indexOf(id) >= 0) continue;
    lo = Math.min(lo, u * (K.mul[kind] || 1));
  }
  return lo * 0.9;
}
function unitPrice(id) {
  const raw = goodInfo(id).price * sellRate(id) * kdMul(id);
  /* Округляем ВНИЗ, а не к ближайшему. Иначе дешёвый товар округляется вверх
     через потолок и щель открывается снова: болт стоил 1.8 при закупке, а
     потолок 1.6 округлялся до 2 — и десяток болтов приносил две кроны из
     воздуха. Вниз — значит никогда не больше потолка. */
  return Math.max(1, Math.floor(Math.min(raw, sellCap(id))));
}
function stackPrice(id, n) { return unitPrice(id) * Math.max(0, n | 0); }
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
  const gm = Math.min(kdMul('gear'), 0.9 * Math.min.apply(null, KD_KEYS.map(k => KINGDOMS[k].mul.gear)) / 0.6);
  const p = Math.max(1, Math.round(itemPrice(it) * 0.6 * gm));
  inv.splice(i, 1);
  gold += p;
  message('💰 Продано за ' + p);
  saveRun();
}
function buyBag(id) {
  const B = BAGS[id];
  if (!B) return;
  if (P.bag === id) { message('Такой уже за спиной'); return; }
  const price = buyPrice('bag', B.price);
  if (gold < price) { message('Нужно ' + price + ' крон, у тебя ' + Math.floor(gold)); return; }
  gold -= price;
  const old = P.bag ? BAGS[P.bag].n.toLowerCase() : null;
  P.bag = id;
  message('🎒 ' + B.n + ': предел веса теперь ' + capacity() + ' кг' + (old ? ' (' + old + ' ушёл в уплату)' : ''));
  saveRun();
}
/* Арбалет у оружейника. Слот пуст — вешаем сразу за спину: покупать оружие
   и потом искать, чем его надеть, глупо. Занят — кладём в сумку, там его
   можно сравнить с нынешним и поменять. */
function buyXbow(type) {
  const X = XBOW[type];
  if (!X) return;
  // цену берёт та же функция, что рисует карточку: иначе на прилавке одно, а
  // из кошеля уходит другое — и это заметили ровно на кузнеце в Каменце
  const price = buyPrice('xbow', X.price);
  if (gold < price) { message('Нужно ' + price + ' крон, у тебя ' + Math.floor(gold)); return; }
  gold -= price;
  const it = mkXbow(type, 0, null);
  if (!P.xbow) { P.xbow = it; message('🏹 ' + X.n + ' за спину: ' + X.bon); }
  else { inv.push(it); message('🏹 ' + X.n + ' — в сумке. «Надеть» на вкладке «Работа с железом»'); }
  saveRun();
}
/* Доспех у бронника — по той же правде, что и арбалет: слот пуст, значит
   надеваем сразу, занят — кладём в сумку, там его сравнят с нынешним. */
function buyArmor(type) {
  const A = ARMOR[type];
  if (!A) return;
  const price = buyPrice('armor', A.price);
  if (gold < price) { message('Нужно ' + price + ' крон, у тебя ' + Math.floor(gold)); return; }
  gold -= price;
  const it = mkArmor(type, 0, null);
  if (!P.armor) { P.armor = it; P.hp = Math.min(P.hp, maxHP()); message('🛡 ' + A.n + ': ' + schoolNote(it)); }
  else { inv.push(it); message('🛡 ' + A.n + ' — в сумке. «Надеть» на вкладке «Железо» или в сумке (I)'); }
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
   до победы посреди драки нельзя. Смерть запись больше НЕ стирает. */
const SAVE_KEY = 'witcher_run';
let saveT = 0;
function saveRun() {
  if (phase !== 'CAMP' || !P) return;
  /* Если пишем, пока ведьмак лежит, — пишем так, будто он уже поднялся:
     иначе закрытая посреди счёта вкладка возвращала бы его на месте гибели
     с единицей здоровья, а то и вовсе отменяла бы плату за лечение. */
  const downed = over;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, wv: 2, ci, gold, hp: downed ? maxHP() * 0.5 : P.hp,
      tox: downed ? 0 : P.tox, mutGauge: downed ? 0 : P.mutGauge, hand: P.hand, potSel: P.potSel,
      steel: P.steel, silver: P.silver, armor: P.armor, xbow: P.xbow, boltSel: P.boltSel,
      inv, offers, hot: hotGood,
      x: downed ? FIRE.x : P.x, y: downed ? FIRE.y + 60 : P.y,
      bag: P.bag, story: storyIdx, deaths,
      lvl: P.lvl, xp: P.xp, sp: P.sp, sk: P.sk,
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
  if (it.k === 'xbow' && XBOW[it.type]) return mkXbow(it.type, tier, ench);
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
  /* Записи, сделанные до появления арбалетов, поля xbow не знают вовсе.
     Отличаем «поля не было» от «продал последний»: в первом случае выдаём
     лёгкий, иначе вернувшийся игрок остался бы без арбалета ни за что. */
  if (s.xbow === undefined) P.xbow = mkXbow('light', 0, null);
  else { const xb = reviveItem(s.xbow); P.xbow = xb && xb.k === 'xbow' ? xb : null; }
  P.boltSel = BOLTS[s.boltSel] ? s.boltSel : 'bolt';
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
  /* Где стоял, там и встанешь. Записи, сделанные до того, как земля выросла
     втрое, помнят старые координаты: тогда лагерь был на 1580,1180, а теперь
     на 2765,2065. Растягиваем их тем же множителем 1.75 — иначе вернувшийся
     игрок обнаружил бы себя за тридевять земель от костра. */
  if (isFinite(+s.x) && isFinite(+s.y)) {
    const k = (+s.wv || 1) < 2 ? 1.75 : 1;
    P.x = clamp(+s.x * k, 9, WORLD_W - 9); P.y = clamp(+s.y * k, 9, WORLD_H - 9);
  }
  P.bag = BAGS[s.bag] && s.bag !== 'none' ? s.bag : null;
  storyIdx = clamp(Math.floor(+s.story) || 0, 0, STORY.length);
  deaths = clamp(Math.floor(+s.deaths) || 0, 0, 99999);
  /* Навыки из записи собираем по одному и только известные: чужой ключ или
     ступень 99 в правленом сохранении иначе прошли бы прямо в расчёт урона. */
  P.lvl = clamp(Math.floor(+s.lvl) || 1, 1, 999);
  P.xp = clamp(Math.floor(+s.xp) || 0, 0, 9e6);
  P.sp = clamp(Math.floor(+s.sp) || 0, 0, 999);
  P.sk = {};
  if (s.sk && typeof s.sk === 'object') {
    for (const k of SKILL_KEYS) {
      const v = clamp(Math.floor(+s.sk[k]) || 0, 0, SKILLS[k].max);
      if (v > 0) P.sk[k] = v;
    }
  }
  P.hp = Math.min(P.hp, maxHP());
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
    xbow: mkXbow('light', 0, null),   // арбалет теперь вещь, а не вечная кнопка
    boltSel: 'bolt',                  // какой болт в жёлобе — переключается на B
    atkCd: 0, boltCd: 0, dodge: 0, dodgeCd: 0, dx: 0, dy: 0, inv: 0, swing: null,
    runeCd: [0, 0, 0, 0], quen: 0, quenT: 0, yrden: null, mut: 0, mutGauge: 0,
    regen: 0, buffThunder: 0, biz: 0, slow: 0, shake: 0, face: -Math.PI / 2,
    potSel: 'swallow',        // после «Заново» выбор зелья не должен слетать в никуда
    lvl: 1, xp: 0, sp: 0, sk: {},   // ступень, опыт, нерастраченные очки и вложенное
    bag: null,                // рюкзак покупается у торговца и поднимает предел веса
  };
  P.hp = maxHP();
  inv = [mkStack('bolt', 20), mkStack('swallow', 2), mkStack('honey', 1)];
  gold = 120; ci = 0; foes = []; drops = []; shots = []; parts = []; floaties = [];
  contract = null; taken = []; phase = 'CAMP'; over = false; cause = ''; panel = null; paused = false;
  killsLeft = 0;
  // мир строится один раз на весь поход и больше не перетасовывается
  obst = buildWorld();
  obstGrid = null; buildObstGrid(obst);                // сетка для быстрого поиска соседей
  buildNPCs();                                         // люди по деревням
  vendorNpc = null; marketKd = kdAt(FIRE.x, FIRE.y); tradeTab = 'supply';
  curLoc = 'camp'; syncCam();
  offers = rollBoard(0); rollHotGood(); benchTab = 'work'; storyIdx = 0;
  deaths = 0; downT = 0; downLost = 0;
  message('Лагерь. 📜 доска работ — E, ⚒ верстак — U. До мест идти ногами.');
  updateButtons();
}
/* =====================  СМЕРТЬ И ВОЗВРАЩЕНИЕ  =====================
   Раньше смерть кончала поход: запись стиралась, сюжет обнулялся, и потерять
   его на тринадцатом задании было обиднее всего в игре. Теперь ведьмак не
   умирает насовсем — его подбирают у костра. Но не сразу и не даром:

     · лежишь DOWN_TIME секунд, и это видно на экране;
     · работа сорвана, твари расходятся;
     · четверть кошеля уходит тем, кто тебя тащил и латал;
     · встаёшь у костра с половиной здоровья.

   Снаряжение, сумка, сюжет и счёт закрытых контрактов остаются. */
const DOWN_TIME = 8;
let downT = 0, downLost = 0;
function endGame(why) {
  if (over) return;
  snd('die');
  over = true; cause = why; panel = null;
  downT = DOWN_TIME;
  downLost = Math.round(gold * 0.25);
  gold -= downLost;
  deaths++;
  contract = null; taken = []; phase = 'CAMP'; killsLeft = 0;
  foes = []; shots = [];
  saveRun();                                           // плата за лечение должна пережить закрытую вкладку
}
function rise() {
  snd('rise');
  over = false; downT = 0;
  P.x = FIRE.x; P.y = FIRE.y + 60;
  P.hp = maxHP() * 0.5; P.mp = maxMP() * 0.5;
  P.tox = 0; P.mut = 0; P.mutGauge = 0; P.regen = 0; P.buffThunder = 0; P.biz = 0;
  P.quen = 0; P.quenT = 0; P.yrden = null; P.slow = 0; P.dodge = 0; P.inv = 1.5;
  curLoc = locAt(P.x, P.y); syncCam();
  message('🔥 Очнулся у костра. Работа сорвана, ' + downLost + ' крон ушло за лечение. Снаряжение и сюжет целы.');
  saveRun();
}

function update(dt) {
  anim += dt;
  if (msgT > 0) msgT -= dt;
  for (const f of floaties) f.t += dt;
  floaties = floaties.filter(f => f.t < 1.1);
  for (const p of parts) { p.t += dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; }
  parts = parts.filter(p => p.t < (p.life || 0.6));
  // пока лежишь — время идёт, но играть нечем. Пауза останавливает и это
  if (over && !paused) { downT -= dt; if (downT <= 0) rise(); return; }
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
  P.tox = Math.max(0, P.tox - 1.2 * (1 + 0.3 * schoolPow('brew') + 0.2 * sk('purge')) * dt);
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
  for (const o of obstNear(P.x, P.y)) {
    const d = Math.hypot(P.x - o.x, P.y - o.y);
    if (d < o.r + 9 && d > 0) {
      const a = Math.atan2(P.y - o.y, P.x - o.x);
      P.x = o.x + Math.cos(a) * (o.r + 9); P.y = o.y + Math.sin(a) * (o.r + 9);
    }
  }
  curLoc = locAt(P.x, P.y);                            // где стоим — то и правила
  syncFocus();                                         // и то, какая из взятых работ сейчас в деле
  syncCam();
  storyArrival();                                      // дошёл до сюжетного места — начинается
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
        // обычный болт и договоры родству не подчиняются — бьют ровно,
        // а вот особые болты разбирают, в кого попали (см. boltHit)
        boltHit(s, f);
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
    /* Закрываем КАЖДУЮ работу, у которой цели кончились и своих тварей на
       поле не осталось. Чужие твари и чужая очередь при этом не мешают. */
    for (const c of taken.slice()) {
      if (c.left <= 0 && c.queue <= 0 && !foes.some(f => f.job === c && !f.dead)) finishContract(c);
    }
    if (!taken.length) phase = 'CAMP';
  } else {
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

/* Земля не меняется никогда: и края, и крапинки, и лужи, и тропы посчитаны
   от постоянного зерна. Значит рисовать её каждый кадр заново — впустую
   палить время (полтысячи заливок на кадр стоили половины скорости).
   Печём один раз в отдельный холст половинного размера и потом кладём
   одним куском. Половинный — чтобы не держать в памяти 28 мегабайт. */
const GSC = 0.5;
let groundCv = null;
function bakeGround() {
  if (!regionTiles) buildRegions();
  groundCv = document.createElement('canvas');
  groundCv.width = Math.ceil(WORLD_W * GSC); groundCv.height = Math.ceil(WORLD_H * GSC);
  const g = groundCv.getContext('2d');
  g.scale(GSC, GSC);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const G = LOCS[SEEDS[regionTiles[ty * TW + tx]].id];
    const x0 = tx * TILE, y0 = ty * TILE, h = hash2(tx, ty);
    g.fillStyle = G.ground; g.fillRect(x0, y0, TILE + 1, TILE + 1);
    if (h > 0.45) {                                    // крапинка, всегда одна и та же
      g.globalAlpha = 0.5; g.fillStyle = h > 0.72 ? G.sp1 : G.sp2;
      g.fillRect(x0 + (h * 13 | 0), y0 + (h * 17 | 0), 9, 5); g.globalAlpha = 1;
    }
    if (G.pools && h > 0.86) {                         // стоячая вода пятнами
      g.fillStyle = 'rgba(70,110,120,.18)';
      g.beginPath(); g.ellipse(x0 + 12, y0 + 12, 26 + h * 14, 13 + h * 8, h * 3, 0, 6.3); g.fill();
    }
    /* Ровная мгла болота — сюда же, в печать. Раньше она заливалась поверх
       ВСЕГО экрана каждый кадр: лишние 0.7 миллиона пикселей на кадр, из-за
       чего в болоте и проседало. Оттенок постоянный, значит ему место в
       земле, а не в каждом кадре. Живыми остаются только ползущие полосы. */
    if (G.haze) { g.fillStyle = G.haze; g.fillRect(x0, y0, TILE + 1, TILE + 1); }
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const p of PATHS) {                             // тропы поверх земли
    g.beginPath(); g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.strokeStyle = 'rgba(58,48,34,.85)'; g.lineWidth = PATH_W * 1.6; g.stroke();
    g.strokeStyle = 'rgba(96,80,54,.5)'; g.lineWidth = PATH_W * 0.9; g.stroke();
  }
}

let miniCv = null;
function bakeMini() {                                  // карта мира: клетка = пиксель
  if (!regionTiles) buildRegions();
  miniCv = document.createElement('canvas');
  miniCv.width = TW; miniCv.height = TH;
  const g = miniCv.getContext('2d');
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    g.fillStyle = LOCS[SEEDS[regionTiles[ty * TW + tx]].id].ground;
    g.fillRect(tx, ty, 1, 1);
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

  // земля со всеми крапинками, лужами и тропами испечена заранее — одним куском
  if (!groundCv) bakeGround();
  ctx.drawImage(groundCv, cam.x * GSC, cam.y * GSC, WW * GSC, WH * GSC, cam.x, cam.y, WW, WH);

  // приметные места — ориентиры, к ним же ведут сюжетные задания
  for (const k in SPOTS) {
    const s = SPOTS[k];
    if (k === 'camp') continue;                        // лагерь рисуется своими вещами
    if (s.x < cam.x - 60 || s.x > cam.x + WW + 60 || s.y < cam.y - 60 || s.y > cam.y + WH + 60) continue;
    ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.ico, s.x, s.y);
    txt(s.n, s.x, s.y + 22, 9, '#98a2ae', 'center');
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

  /* Поселения: колодец, площадь и название. Дворы стоят отдельно (они же
     преграды и рисуются вместе с камнями) — здесь только то, что делает из
     кучки изб деревню. */
  for (const t of TOWNS) {
    if (t.x < cam.x - t.r - 60 || t.x > cam.x + WW + t.r + 60 ||
        t.y < cam.y - t.r - 60 || t.y > cam.y + WH + t.r + 60) continue;
    ctx.fillStyle = 'rgba(60,52,38,.20)';              // утоптанная площадь
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.62, 0, 6.3); ctx.fill();
    ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.kind === 'пристань' ? '⚓' : t.kind === 'рудник' ? '⛏' : '🪣', t.x, t.y);
    txt(t.ico + ' ' + t.n, t.x, t.y - t.r * 0.62 - 8, 11, '#e8d9a8', 'center');
    const K = KINGDOMS[kdAt(t.x, t.y)];
    txt(t.kind + ' · ' + K.ico + ' ' + K.n, t.x, t.y + 16, 9, K.c, 'center');
  }
  /* Люди. Кто торгует — у того над головой монета, кто нет — тому просто
     есть что сказать. Рядом подписываем, что жать: без этого человек так и
     останется картинкой. */
  for (const p of NPCS) {
    if (p.x < cam.x - 40 || p.x > cam.x + WW + 40 || p.y < cam.y - 40 || p.y > cam.y + WH + 40) continue;
    const near = Math.hypot(P.x - p.x, P.y - p.y) < 46;
    const bob = Math.sin(anim * 2 + p.bob) * 1.5;
    ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.ico, p.x, p.y + bob);
    if (p.tabs) { ctx.font = '10px serif'; ctx.fillText('💰', p.x + 11, p.y - 10 + bob); }
    txt(p.n, p.x, p.y + 17, 9, near ? '#f2d59a' : '#98a2ae', 'center');
    if (near) txt('E — ' + (p.tabs ? 'торговать' : 'говорить'), p.x, p.y + 28, 9, '#c9a227', 'center');
  }

  // гуща, камни и дворы: у каждого края своё
  for (const o of obst) {
    if (o.x < cam.x - 40 || o.x > cam.x + WW + 40 || o.y < cam.y - 40 || o.y > cam.y + WH + 40) continue;
    if (o.hut) {                                       // изба: сруб и крыша
      const w = o.r * 1.7, h = o.r * 1.25;
      ctx.fillStyle = o.big ? '#3a2f22' : '#332a1f';
      ctx.fillRect(o.x - w / 2, o.y - h / 2, w, h);
      ctx.fillStyle = '#4a3a26';
      ctx.beginPath(); ctx.moveTo(o.x - w / 2 - 3, o.y - h / 2);
      ctx.lineTo(o.x, o.y - h / 2 - o.r * 0.75); ctx.lineTo(o.x + w / 2 + 3, o.y - h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(242,177,52,.45)';          // окошко: в избе горит
      ctx.fillRect(o.x - 3, o.y - 2, 6, 5);
      continue;
    }
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
    ctx.font = ((S.boss ? 30 : 20) * (f.name ? 1.35 : 1) | 0) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = f.hitT > 0 ? 0.5 : 1;
    ctx.fillText(S.ico, f.x + lx, f.y + ly + Math.sin(anim * 5 + f.bob) * 1.5);
    ctx.globalAlpha = 1;
    if (f.burn > 0) { ctx.font = '11px serif'; ctx.fillText('🔥', f.x + 9, f.y - 9); }
    if (f.slow > 0) { ctx.font = '10px serif'; ctx.fillText('❄', f.x - 10, f.y - 9); }
    const bw = f.name ? 40 : 26;                       // именной зверь и полосой шире
    bar(f.x - bw / 2, f.y - f.r - 8, bw, f.name ? 4 : 3, f.hp / f.max, S.fam === 'monster' ? '#a8c6e8' : '#e8a05a');
    if (f.name) txt(f.name, f.x, f.y - f.r - 18, 10, '#ffb0a8', 'center');
  }

  // снаряды
  for (const s of shots) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
    if (s.kind === 'paper') { ctx.fillStyle = '#f0ead6'; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = '#8a8f96'; ctx.fillRect(-3, -2, 6, 1); ctx.fillRect(-3, 1, 6, 1); }
    else {
      // болт видно, какой летит: серебро блестит, зажигательный тлеет
      ctx.fillStyle = s.mine ? (BOLT_COLOR[s.bolt] || '#e8d9a8') : '#c98a5a';
      ctx.fillRect(-6, -1.2, 12, 2.4);
      if (s.bolt === 'boltfir') { ctx.fillStyle = 'rgba(255,140,60,.75)'; ctx.fillRect(-9, -1, 4, 2); }
    }
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
  /* Темнота чащи. Сам круг с растяжкой — только вокруг ведьмака, а всё, что
     дальше трёхсот шагов, и так сплошная темень: там ровная заливка, которая
     считается вчетверо дешевле растяжки. Раньше растяжкой мазался весь экран. */
  if (S.dark) {
    const R = 290;
    const bx = P.x - R, by = P.y - R, bw = R * 2, bh = R * 2;
    ctx.fillStyle = 'rgba(0,0,0,.84)';
    if (by > cam.y) ctx.fillRect(cam.x, cam.y, WW, by - cam.y);                       // сверху
    const y2 = Math.min(cam.y + WH, by + bh), y1 = Math.max(cam.y, by);
    if (y2 > y1) {
      if (bx > cam.x) ctx.fillRect(cam.x, y1, bx - cam.x, y2 - y1);                   // слева
      const rx = bx + bw;
      if (rx < cam.x + WW) ctx.fillRect(rx, y1, cam.x + WW - rx, y2 - y1);            // справа
    }
    const bo = by + bh;
    if (bo < cam.y + WH) ctx.fillRect(cam.x, bo, WW, cam.y + WH - bo);                // снизу
    const g = ctx.createRadialGradient(P.x, P.y, 105, P.x, P.y, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.84)');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
  }
  /* Туман болота: ровная мгла ушла в печать земли (см. bakeGround), живыми
     остались только ползущие полосы марева — их всего три и они узкие. */
  if (S.fog) {
    ctx.fillStyle = 'rgba(175,195,200,.05)';
    for (let i = 0; i < 3; i++) {
      const y = cam.y + ((anim * (5 + i * 3) + i * 170) % (WH + 120)) - 60;
      ctx.fillRect(cam.x, y, WW, 44);
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
  const w = 116, h = 80, x = WX1 - w - 8, y = WY0 + 8;
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = 'rgba(8,7,6,.8)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  /* Карта тоже испечена заранее, клетка в пиксель. Раньше она рисовалась
     клетками вживую — двенадцать тысяч заливок КАЖДЫЙ КАДР, и это съедало
     больше половины скорости всей игры. */
  if (!miniCv) bakeMini();
  ctx.drawImage(miniCv, 0, 0, TW, TH, x, y, w, h);
  ctx.strokeStyle = 'rgba(201,162,39,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  // приметные места и лагерь
  ctx.font = '7px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const k in SPOTS) ctx.fillText(SPOTS[k].ico, x + (SPOTS[k].x / WORLD_W) * w, y + (SPOTS[k].y / WORLD_H) * h);
  // цель
  const aim = questGoal();
  if (aim) {
    ctx.strokeStyle = '#ff7a5a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + (aim.mx / WORLD_W) * w, y + (aim.my / WORLD_H) * h, 5, 0, 6.3); ctx.stroke();
  }
  // где ты
  ctx.fillStyle = '#f2d59a';
  ctx.beginPath(); ctx.arc(x + (P.x / WORLD_W) * w, y + (P.y / WORLD_H) * h, 2.5, 0, 6.3); ctx.fill();
  ctx.globalAlpha = 1;

  // стрелка к цели, если она за краем экрана
  const goal = aim;
  if (!goal) return;
  const a = Math.atan2(goal.my - P.y, goal.mx - P.x);
  const cx = WX0 + WW / 2, cy = WY0 + WH / 2, rr = Math.min(WW, WH) * 0.42;
  const ax = cx + Math.cos(a) * rr, ay = cy + Math.sin(a) * rr;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = 'rgba(242,177,52,.85)';
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  const dist2 = Math.round(Math.hypot(goal.mx - P.x, goal.my - P.y));
  txt(goal.n + ' · ' + dist2 + ' шагов', ax, ay + 14, 9, '#f2d59a', 'center');
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
  // ступень и опыт: без них прокачка была бы невидимой
  {
    const need = xpNeed(P.lvl), w = 92, bx2 = 174, by2 = 46;
    bar(bx2, by2, w, 6, clamp(P.xp / need, 0, 1), '#c9a227');
    txt('⭐ ' + P.lvl + (P.sp > 0 ? '  ·  очков ' + P.sp + ' (K)' : ''), bx2 + 2, by2 + 3, 8,
        P.sp > 0 ? '#f2b134' : '#98a2ae');
  }
  const ld = loadState();                              // не L: L() — это место, и оно тут же рядом
  txt('⚖ ' + carried().toFixed(1) + ' / ' + capacity() + ' кг', rx, 29, 10,
    ld.lvl === 0 ? '#98a2ae' : ld.lvl === 1 ? '#ffb43a' : '#ff5a4a', 'right');
  // болты: важно не «сколько всего», а сколько ТЕХ, что сейчас в жёлобе
  const bsel = STUFF[boltInfo()], bhave = countStack(boltInfo());
  txt(bsel.ico + ' ' + bsel.n.toLowerCase() + ': ' + bhave, rx, 41, 9, bhave ? '#98a2ae' : '#ff7a6a', 'right');

  // где ты и что делаешь. Место читается по ногам, а не по фазе игры
  const here = L().ico + ' ' + L().n;
  if (phase === 'FIGHT' && taken.length) {
    /* Работ теперь может быть до трёх. Пишем все, а ту, которой занят прямо
       сейчас, отбиваем цветом: иначе непонятно, чей счёт целей идёт. */
    const here2 = locAt(P.x, P.y);
    txt(here, 10, 50, 10, '#98a2ae');
    let lx2 = 10 + 96;
    for (const c of taken) {
      const now = c === contract;
      const wait = c.story && !c.arrived;
      const there = c.loc === here2;
      const s2 = (c.story ? '📖 ' : '') + c.t + (wait ? ' → место' : ' ' + Math.max(0, c.left) + '/' + c.n) +
                 (there || wait ? '' : ' → ' + (LOCS[c.loc] || LOCS.woods).ico);
      ctx.font = '10px Segoe UI';
      const w2 = ctx.measureText(s2).width + 10;
      if (lx2 + w2 > CW - 10) break;
      ctx.fillStyle = now ? 'rgba(96,78,36,.55)' : 'rgba(30,28,24,.55)';
      ctx.fillRect(lx2 - 4, 43, w2, 14);
      txt(s2, lx2, 50, 10, now ? '#f2d59a' : '#98a2ae');
      lx2 += w2 + 4;
    }
  } else {
    txt(here + ' · контракт ' + (ci + 1) + ' · рекорд: ' + best, CW / 2, 50, 10, '#98a2ae', 'center');
  }

  // --- нижний пояс: руны, арбалет, зелья ---
  const by = CH - 84;
  ctx.fillStyle = 'rgba(10,9,8,.94)'; ctx.fillRect(0, by, CW, CH - by);
  const hov = (x, y, w, h) => mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  let hint = '';

  /* Раскладка пояса. Раньше все восемь кнопок стояли по вбитым в код
     координатам и кончались ровно на 510-м пикселе — впритык к окну в 520.
     Но в полный экран на узком мониторе (телефон в портрете) игра ужимается
     до 480, и «мутация» уезжала за правый край: кнопка есть, нажать нельзя.
     Теперь ряд считается от ширины: не влезает — ужимаем всё разом. */
  const BELT = [56, 56, 56, 56, 76, 40, 85, 47];       // 4 руны, арбалет, болт, масло, мутация
  const BELT_GAP = 4;
  const beltNat = BELT.reduce((a, b) => a + b, 0) + BELT_GAP * (BELT.length - 1);
  const bk = Math.min(1, (CW - 20) / beltNat);
  const slot = []; { let sx = 10; for (const w of BELT) { slot.push({ x: sx, w: w * bk }); sx += (w + BELT_GAP) * bk; } }

  // РУНЫ. Раньше это были просто картинки: нарисованы кнопкой, а нажатие
  // не обрабатывалось вовсе — человек тыкал, и «магия не показывалась».
  RUNES.forEach((R, i) => {
    const h = 30, y = by + 4, x = slot[i].x, w = slot[i].w;
    const cost = runeCost(R);                          // грифоний доспех делает знаки дешевле
    const ready = P.runeCd[i] <= 0 && P.mp >= cost;
    uiHit.push({ x, y, w, h, fn: () => castRune(i) });
    if (hov(x, y, w, h)) hint = R.ico + ' ' + R.n + ' — ' + R.desc + ' · ' + cost + ' энергии' +
      (cost < R.mp ? ' (вместо ' + R.mp + ' — 🦅 грифон)' : '') + ' · клавиша ' + (i + 1);
    ctx.fillStyle = ready ? 'rgba(60,80,110,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ready ? '#6aa6e8' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(clipText(R.ico + ' ' + R.n, w - 8, 10), x + 4, y + 10, 10, ready ? '#cfe3ff' : '#6c7683');
    txt(clipText((i + 1) + ' · ' + cost + '✨', w - 8, 9), x + 4, y + 22, 9, cost < R.mp ? '#7fd6ff' : '#98a2ae');
    if (P.runeCd[i] > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h * clamp(P.runeCd[i] / R.cd, 0, 1)); }
  });

  // АРБАЛЕТ: показывает, ЧТО именно за спиной — от типа зависит всё
  {
    const x = slot[4].x, w = slot[4].w, y = by + 4, h = 30;
    const X = P.xbow ? XBOW[P.xbow.type] : null;
    const ready = !!X && bhave > 0;
    uiHit.push({ x, y, w, h, fn: () => shootBolt() });
    if (hov(x, y, w, h)) hint = X ? ('🏹 ' + fullName(P.xbow) + ' — ПКМ по полю или эта кнопка · урон ' +
        Math.round(X.dmg * TIERS[P.xbow.tier].m) + ', взвод ' + X.cd.toFixed(2) + ' с · ' + X.bon)
      : '🏹 Арбалета нет — купи у оружейника (⚒ верстак, вкладка «Оружейник»)';
    ctx.fillStyle = ready ? 'rgba(80,70,40,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ready ? '#c9a227' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(clipText(X ? X.ico + ' ' + X.sn : '🏹 нет', w - 8, 10), x + 4, y + 10, 10, ready ? '#f2d59a' : '#6c7683');
    txt(clipText(X ? 'ПКМ · взвод ' + X.cd.toFixed(2) : 'купи в лавке', w - 8, 8), x + 4, y + 22, 8, ready ? '#98a2ae' : '#ff7a6a');
    if (P.boltCd > 0 && X) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, w, h * clamp(P.boltCd / X.cd, 0, 1)); }
  }

  // БОЛТ В ЖЁЛОБЕ: клик или B — следующий сорт из тех, что есть в колчане
  {
    const x = slot[5].x, w = slot[5].w, y = by + 4, h = 30;
    uiHit.push({ x, y, w, h, fn: () => cycleBolt(1) });
    if (hov(x, y, w, h)) hint = bsel.ico + ' ' + bsel.n + ' ×' + bhave + ' — ' + bsel.desc + ' · клик или B — следующие';
    ctx.fillStyle = bhave ? 'rgba(60,60,80,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = bhave ? '#8a9ad8' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(bsel.ico, x + w / 2, y + 11, 13, bhave ? '#dfe4ff' : '#6c7683', 'center');
    txt('B ×' + bhave, x + w / 2, y + 23, 8, bhave ? '#98a2ae' : '#ff7a6a', 'center');
  }

  // МАСЛО на клинок, что сейчас в руке
  {
    const x = slot[6].x, w = slot[6].w, y = by + 4, h = 30;
    const sw2 = activeSword();
    const oilId = sw2 ? oilFor(sw2.metal) : 'oilste';
    const have = countStack(oilId), left = sw2 && sw2.oil > 0 ? sw2.oil : 0;
    const can = !!sw2 && have > 0;
    uiHit.push({ x, y, w, h, fn: () => applyOil(activeSword()) });
    if (hov(x, y, w, h)) hint = '🧴 ' + STUFF[oilId].n + ' — ' + STUFF[oilId].desc + ' · клавиша O · в сумке ' + have;
    ctx.fillStyle = left ? 'rgba(50,90,60,.55)' : can ? 'rgba(60,70,45,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = left ? '#7fd6a0' : can ? '#9ab04a' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt(clipText(STUFF[oilId].ico + ' Масло (O)', w - 8, 10), x + 4, y + 10, 10, can || left ? '#e0f0c0' : '#6c7683');
    txt(clipText(left ? 'на клинке ' + left + ' уд.' : 'в сумке ' + have + ' · +40%', w - 8, 8),
        x + 4, y + 22, 8, left ? '#7fd6a0' : have ? '#98a2ae' : '#6c7683');
  }

  // МУТАЦИЯ: в полном экране кнопок под игрой не видно, а R знают не все
  {
    const x = slot[7].x, w = slot[7].w, y = by + 4, h = 30;
    const ready = P.mut > 0 || P.mutGauge >= 100;
    uiHit.push({ x, y, w, h, fn: () => toggleMutation() });
    if (hov(x, y, w, h)) hint = '🩸 Кровавая ебатня — копится с убийств. Урон вдвое и чужая кровь лечит, но и по тебе бьёт больнее · клавиша R';
    ctx.fillStyle = P.mut > 0 ? 'rgba(140,30,30,.6)' : ready ? 'rgba(110,40,40,.55)' : 'rgba(35,32,28,.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ready ? '#ff6a5a' : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    txt('🩸 R', x + 4, y + 10, 10, ready ? '#ffb0a8' : '#6c7683');
    txt(clipText(P.mut > 0 ? P.mut.toFixed(1) + 'с' : Math.round(P.mutGauge) + '/100', w - 8, 8),
        x + 4, y + 22, 8, ready ? '#ffb0a8' : '#98a2ae');
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
  uiHit.push({ x, y, w, h, fn: dim ? () => { snd('deny'); if (why) message(why); }
                                   : () => { snd('ui'); fn(); } });
  ctx.fillStyle = dim ? 'rgba(40,36,30,.7)' : (col || 'rgba(60,52,40,.95)');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dim ? 'rgba(255,255,255,.06)' : 'rgba(201,162,39,.4)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  txt(label, x + w / 2, y + h / 2, 9, dim ? '#6c7683' : '#e6ebf2', 'center');
}

function drawEquipRow(y) {
  // четвёртым слотом встал арбалет: он такая же вещь, как меч и доспех
  const slots = [['Сталь', P.steel], ['Серебро', P.silver], ['Доспех', P.armor], ['Арбалет', P.xbow]];
  const w = 114;
  let x = 24;
  for (const [nm, it] of slots) {
    // перенос СПЕРВА, а не после: иначе последний слот оставлял под собой
    // пустую строку в сорок пикселей
    if (x + w > CW - 20) { x = 24; y += 40; }
    ctx.fillStyle = 'rgba(20,18,15,.9)'; ctx.fillRect(x, y, w, 34);
    ctx.strokeStyle = it ? TIERS[it.tier].c : 'rgba(255,255,255,.1)'; ctx.strokeRect(x + .5, y + .5, w - 1, 33);
    txt(nm, x + 5, y + 9, 8, '#98a2ae');
    if (it) {
      txt(clipText(itemIco(it) + ' ' + TIERS[it.tier].n, w - 10, 10), x + 5, y + 20, 10, TIERS[it.tier].c);
      let sub = it.k === 'sword' ? 'урон ' + Math.round(SWORD[it.metal].dmg * TIERS[it.tier].m)
              : it.k === 'xbow'  ? 'урон ' + Math.round(XBOW[it.type].dmg * TIERS[it.tier].m)
                                 : 'броня ' + Math.round(ARMOR[it.type].def * TIERS[it.tier].m);
      sub += ' · ' + itemWeight(it) + ' кг';
      if (it.k === 'armor' && ARMOR[it.type].school) sub += ' ' + ARMOR[it.type].ico;
      if (it.ench) sub += ' ' + ENCH[it.ench].ico;
      if (it.oil > 0) sub += ' 🧴' + it.oil;
      txt(clipText(sub, w - 10, 8), x + 5, y + 29, 8, '#98a2ae');
    } else txt('пусто', x + 5, y + 20, 10, '#5a616b');
    x += w + 6;
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
  // у школьного доспеха пишем не обещание, а что он даёт НА ЭТОЙ ступени
  if (P.armor) txt(ARMOR[P.armor.type].ico + ' ' + schoolNote(P.armor), 24, y - 6, 9,
                   ARMOR[P.armor.type].school ? ARMOR[P.armor.type].c : '#7fd6a0');
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
    // связку болтов можно положить в жёлоб прямо отсюда — не только по B
    else if (it.k === 'stack' && BOLTS[it.id])
      btn(CW - 142, rowY + 3, 52, 16, P.boltSel === it.id ? 'в жёлобе' : 'в жёлоб',
          () => { P.boltSel = it.id; message(STUFF[it.id].ico + ' ' + STUFF[it.id].n + ' — ' + STUFF[it.id].desc); },
          null, P.boltSel === it.id, 'Эти и так в жёлобе');
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
  // СЮЖЕТ отдельным листом сверху: он идёт по порядку и не пропадает
  const q = storyNow();
  let y = 68;
  ctx.fillStyle = 'rgba(38,30,18,.92)'; ctx.fillRect(24, y, CW - 48, q ? 92 : 34);
  ctx.strokeStyle = 'rgba(242,177,52,.55)'; ctx.lineWidth = 1; ctx.strokeRect(24.5, y + .5, CW - 49, (q ? 92 : 34) - 1);
  if (!q) {
    txt('📖 Сюжет пройден. Остались работы с доски.', CW / 2, y + 17, 10, '#c9a227', 'center');
    y += 42;
  } else {
    const S = LOCS[q.loc] || LOCS.woods, sp = SPOTS[q.spot];
    txt('📖 СЮЖЕТ ' + (storyIdx + 1) + '/' + STORY.length + ':  ' + q.t, 34, y + 14, 11, '#f2d59a');
    txt('💰 ' + q.gold, CW - 34, y + 14, 11, '#f2b134', 'right');
    for (let i = 0; i < q.brief.length && i < 3; i++) txt(q.brief[i], 34, y + 30 + i * 12, 9, '#c2cad2');
    txt((sp ? sp.ico + ' ' + sp.n + '  ·  ' : '') + S.ico + ' ' + S.n + '  ·  целей ' + q.n +
        (q.unique ? '  ·  ' + q.unique.name : ''), 34, y + 72, 9, '#c9a227');
    btn(CW - 116, y + 66, 82, 19, '📖 взяться', () => takeStory(), 'rgba(96,74,26,.95)');
    y += 100;
  }
  txt(taken.length ? 'Взято работ: ' + taken.length + ' из ' + MAX_JOBS + ' — ' + taken.map(c => c.t).join(', ')
                   : 'Работы с доски. Можно взять до трёх разом.',
      CW / 2, y, 9, taken.length >= MAX_JOBS ? '#ff7a6a' : '#98a2ae', 'center');
  y += 12;
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
    const full = taken.length >= MAX_JOBS;
    btn(CW - 116, y + 50, 82, 19, full ? 'занят' : '📜 взять', () => startContract(o),
        'rgba(80,66,30,.95)', full, 'Три работы уже на руках — доделай что-нибудь');
    y += 80;
  }
  panelFooter('E или ✕ — закрыть · плата тем больше, чем злее работа');
}

/* Верстак и лавка разъехались по вкладкам. Раньше они делили одну панель:
   список железа упирался в полку с товаром, а продавать припасы было
   негде вовсе — руда и лишние зелья просто копили вес. */
let benchTab = 'work';
// купец у костра держит всё: он и есть прежняя лавка верстака
const CAMP_VENDOR = { n: 'Купец у костра', ico: '🛒', tabs: null };
/* Карта земли на весь экран (клавиша M). Маленькая карта в углу говорит
   «ты где-то там», а эта отвечает на вопрос «куда идти и что вокруг»:
   настоящие очертания краёв, тропы, все приметные места с именами,
   ты сам и цель. */
function drawMap() {
  panelBox('🗺 КАРТА ЗЕМЛИ');
  const x0 = 24, y0 = 92, mw2 = CW - 48, mh = CH - 170;
  const k = Math.min(mw2 / WORLD_W, mh / WORLD_H);     // одинаковый масштаб по осям
  const w = WORLD_W * k, h = WORLD_H * k;
  const x = x0 + (mw2 - w) / 2, y = y0 + (mh - h) / 2;
  const px = wx => x + wx * k, py = wy => y + wy * k;

  if (!miniCv) bakeMini();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(miniCv, 0, 0, TW, TH, x, y, w, h);
  ctx.strokeStyle = 'rgba(201,162,39,.4)'; ctx.lineWidth = 1; ctx.strokeRect(x - .5, y - .5, w + 1, h + 1);

  // тропы
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(150,126,86,.8)'; ctx.lineWidth = Math.max(1.5, PATH_W * k * 0.7);
  for (const p of PATHS) {
    ctx.beginPath(); ctx.moveTo(px(p[0].x), py(p[0].y));
    for (let i = 1; i < p.length; i++) ctx.lineTo(px(p[i].x), py(p[i].y));
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

  // поселения: где живут люди — их видно раньше приметных мест
  for (const t of TOWNS) {
    ctx.fillStyle = 'rgba(201,162,39,.14)';
    ctx.beginPath(); ctx.arc(px(t.x), py(t.y), t.r * k, 0, 6.3); ctx.fill();
    ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.ico, px(t.x), py(t.y));
    txt(t.n, px(t.x), py(t.y) + 13, 9, '#f2d59a', 'center');
  }
  // приметные места
  for (const key in SPOTS) {
    const s = SPOTS[key];
    ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.ico, px(s.x), py(s.y));
    txt(s.n, px(s.x), py(s.y) + 12, 8, '#c2cad2', 'center');
  }
  // круг лагеря — куда нечисть не заходит
  ctx.strokeStyle = 'rgba(201,162,39,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px(SPOTS.camp.x), py(SPOTS.camp.y), CAMP_R * k, 0, 6.3); ctx.stroke();
  ctx.setLineDash([]);

  // цель: сюжетное место или край работы
  const aim = questGoal();
  if (aim) {
    ctx.strokeStyle = '#ff7a5a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(aim.mx), py(aim.my), 10, 0, 6.3); ctx.stroke();
    txt('цель: ' + aim.n, px(aim.mx), py(aim.my) - 16, 9, '#ff9a7a', 'center');
  }
  // ты и куда смотришь
  ctx.fillStyle = '#f2d59a';
  ctx.beginPath(); ctx.arc(px(P.x), py(P.y), 4, 0, 6.3); ctx.fill();
  ctx.strokeStyle = '#f2d59a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px(P.x), py(P.y));
  ctx.lineTo(px(P.x) + Math.cos(P.face) * 11, py(P.y) + Math.sin(P.face) * 11); ctx.stroke();

  // где ты сейчас и что тут за место
  const S = L();
  txt('Ты в ' + S.ico + ' ' + S.n.toLowerCase() + ' — ' + S.note, CW / 2, 74, 10, '#c9a227', 'center');

  // легенда красками краёв
  const legend = ['camp', 'field', 'road', 'woods', 'swamp', 'shore', 'ruins', 'barrow'];
  let lx = 24, ly = CH - 68;
  for (const id of legend) {
    const G = LOCS[id];
    ctx.fillStyle = G.ground; ctx.fillRect(lx, ly - 6, 12, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.strokeRect(lx + .5, ly - 5.5, 11, 11);
    txt(G.ico + ' ' + G.n, lx + 16, ly, 9, '#98a2ae');
    lx += 62 + (G.n.length > 6 ? 12 : 0);
    if (lx > CW - 90) { lx = 24; ly += 16; }
  }
  panelFooter('M или ✕ — закрыть · пунктиром обведён круг лагеря: туда нечисть не заходит');
}

function drawBench() {
  panelBox('⚒ ВЕРСТАК И ЛАВКА');
  /* Вкладок стало две, а не четыре: ковка отдельно, торг отдельно. Внутри
     торга свои вкладки-карточки — по родам товара, а не «всё в одну кучу». */
  const tabs = [['work', '⚒ Ковка'], ['trade', '💰 Лавка']];
  let tx = 24;
  const tw = Math.min(170, Math.floor((CW - 48 - 6) / 2));
  for (const [id, label] of tabs) {
    const on = benchTab === id;
    btn(tx, 62, tw, 20, label, () => { benchTab = id; benchScroll = 0; },
        on ? 'rgba(96,78,36,.95)' : 'rgba(34,31,26,.9)');
    tx += tw + 6;
  }
  if (benchTab === 'trade') { marketKd = kdAt(FIRE.x, FIRE.y); drawTrade(CAMP_VENDOR); return; }

  let y = 92;
  txt('Улучшение: обычный → улучшенный → отличный → мастерский → гроссмейстер', 24, y - 4, 9, '#98a2ae');
  y += 12;

  const gear = [P.steel, P.silver, P.armor, P.xbow].concat(inv.filter(i => i.k !== 'stack')).filter(Boolean);
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

/* =====================  ЛАВКА КАРТОЧКАМИ  =====================
   Лавка была списком кнопок в строчку: всё вперемешку, и чтобы найти нужное,
   приходилось читать подряд. Теперь товар разложен КАРТОЧКАМИ и разбит по
   родам — припасы, болты, зелья, арбалеты, доспехи, мешки, — и у каждой
   карточки написано, что это, чем берёт и сколько уже есть в сумке.

   Одна и та же лавка обслуживает и купца у костра, и любого торговца в
   деревне: разница только в том, ЧЕМ он торгует и в каком он королевстве. */
const TAB_N = { supply: 'Припасы', bolt: 'Болты', alch: 'Зелья', weapon: 'Арбалеты',
                armor: 'Доспехи', bag: 'Мешки', sell: 'Продать' };
const TAB_STACKS = {
  supply: [['ore', 3, 66], ['hide', 3, 54], ['herb', 5, 40], ['essence', 1, 34]],
  bolt:   [['bolt', 10, 24], ['boltsil', 8, 76], ['boltarm', 8, 58], ['boltfir', 6, 72], ['boltbom', 4, 105]],
  alch:   [['swallow', 1, 40], ['thunder', 1, 55], ['honey', 1, 35], ['shit', 1, 90],
           ['oilsil', 1, 45], ['oilste', 1, 45]],
};
/* Что лежит на прилавке в этой вкладке. Королевство может чего-то не знать
   вовсе — тогда карточки просто нет, и это честнее мёртвой кнопки. */
function shopCards(tab) {
  const out = [];
  if (TAB_STACKS[tab]) {
    for (const [id, n, base] of TAB_STACKS[tab]) {
      if (kdLacks(id)) continue;
      const S = goodInfo(id);
      out.push({ kind: 'stack', id, n, price: buyPrice(id, base), ico: S.ico,
                 name: S.n + (n > 1 ? ' ×' + n : ''), sub: S.desc,
                 have: countStack(id), buy: () => buy(id, n, buyPrice(id, base)) });
    }
  } else if (tab === 'weapon') {
    for (const id of XBOW_KEYS) {
      const X = XBOW[id], mine = P.xbow && P.xbow.type === id;
      out.push({ kind: 'xbow', id, price: buyPrice('xbow', X.price), ico: X.ico, name: X.n,
                 sub: 'урон ' + X.dmg + ' · взвод ' + X.cd.toFixed(2) + 'с · ' +
                      Math.round(X.spd * X.life) + ' шагов · ' + X.w + ' кг',
                 bon: X.bon, mine, buy: () => buyXbow(id) });
    }
  } else if (tab === 'armor') {
    for (const id of ARMOR_KEYS) {
      const A = ARMOR[id], mine = P.armor && P.armor.type === id;
      out.push({ kind: 'armor', id, price: buyPrice('armor', A.price), ico: A.ico, name: A.n,
                 sub: 'броня ' + A.def + ' · ' + A.w + ' кг · шаг ×' + A.spd.toFixed(2),
                 bon: schoolRange(id), mine, buy: () => buyArmor(id) });
    }
  } else if (tab === 'bag') {
    for (const id of ['hide', 'hunter', 'master']) {
      const B = BAGS[id], mine = P.bag === id;
      out.push({ kind: 'bag', id, price: buyPrice('bag', B.price), ico: B.ico, name: B.n,
                 sub: B.desc, mine, buy: () => buyBag(id) });
    }
  }
  return out;
}
/* Одна карточка. Вся она — кнопка: целиться в узкую полоску «купить» на
   ощупь неудобно, а промахнуться по карточке трудно. */
function drawCard(c, x, y, w, h) {
  const poor = gold < c.price, dim = c.mine || poor;
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.fillStyle = c.mine ? 'rgba(40,58,36,.9)' : hov && !dim ? 'rgba(52,45,32,.95)' : 'rgba(22,20,17,.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = c.mine ? 'rgba(127,214,160,.55)' : poor ? 'rgba(255,255,255,.07)' : 'rgba(201,162,39,.35)';
  ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  ctx.font = '17px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(c.ico, x + 7, y + 15);
  txt(clipText(c.name, w - 34, 10), x + 28, y + 15, 10, dim ? '#8a8f96' : '#e8d9a8');
  txt(clipText(c.sub || '', w - 14, 8), x + 7, y + 30, 8, '#98a2ae');
  if (c.bon) txt(clipText(c.bon, w - 14, 8), x + 7, y + 41, 8, '#6c7683');
  // нижняя полоса: цена, сколько уже есть, и состояние
  ctx.fillStyle = c.mine ? 'rgba(60,90,55,.6)' : poor ? 'rgba(40,30,28,.7)' : 'rgba(70,58,30,.75)';
  ctx.fillRect(x + 1, y + h - 17, w - 2, 16);
  txt(c.mine ? '✓ уже твоё' : c.price + '💰', x + 7, y + h - 9, 10,
      c.mine ? '#9ad9a0' : poor ? '#ff7a6a' : '#f2d59a');
  if (c.have != null) txt('в сумке ' + c.have, x + w - 7, y + h - 9, 9, '#98a2ae', 'right');
  else if (!c.mine) txt(poor ? 'не хватает' : 'купить', x + w - 7, y + h - 9, 9, poor ? '#ff7a6a' : '#c9a227', 'right');
  uiHit.push({ x, y, w, h, fn: dim
    ? () => { snd('deny'); message(c.mine ? 'Это уже твоё' : 'Нужно ' + c.price + ' крон, у тебя ' + Math.floor(gold)); }
    : () => { snd('ui'); c.buy(); } });
}

/* Прилавок целиком: заголовок с королевством, вкладки, сетка карточек. */
let tradeTab = 'supply';
function drawTrade(vendor) {
  const tabs = (vendor.tabs || ['supply', 'bolt', 'alch', 'weapon', 'armor', 'bag']).concat(['sell']);
  if (tabs.indexOf(tradeTab) < 0) tradeTab = tabs[0];
  const K = market();

  txt(vendor.ico + ' ' + vendor.n + (vendor.town ? ' · ' + vendor.town.n : ''), 24, 96, 11, '#e8d9a8');
  txt(K.ico + ' ' + K.n, CW - 24, 96, 11, K.c, 'right');
  txt(K.note, 24, 109, 9, '#98a2ae');
  // чем этот удел хорош и чем плох — иначе про множители никто не догадается
  const RU = { mat: 'руда и шкуры', alch: 'зелья и травы', bolt: 'болты', gear: 'железо' };
  const ord = Object.entries(K.mul).sort((a, b) => a[1] - b[1]);
  txt('дёшево: ' + RU[ord[0][0]] + ' ×' + ord[0][1].toFixed(2) +
      '   ·   дорого: ' + RU[ord[ord.length - 1][0]] + ' ×' + ord[ord.length - 1][1].toFixed(2),
      CW - 24, 109, 9, '#c9a227', 'right');

  let tx = 24;
  const tw = Math.min(96, Math.floor((CW - 48 - 5 * (tabs.length - 1)) / tabs.length));
  for (const t of tabs) {
    btn(tx, 120, tw, 19, TAB_N[t] || t, () => { tradeTab = t; benchScroll = 0; },
        tradeTab === t ? 'rgba(96,78,36,.95)' : 'rgba(34,31,26,.9)');
    tx += tw + 5;
  }

  if (tradeTab === 'sell') { drawSellList(150); return; }

  const cards = shopCards(tradeTab);
  if (!cards.length) {
    txt('Тут этого не держат — ' + K.n + ' обходится своим.', CW / 2, 200, 11, '#6c7683', 'center');
    panelFooter('вкладки сверху · у каждого удела свой прилавок и свои цены');
    return;
  }
  const gap = 8;
  const cols = Math.max(1, Math.floor((CW - 48 + gap) / (150 + gap)));
  const cw2 = Math.floor((CW - 48 - gap * (cols - 1)) / cols), ch2 = 64;
  const top = 150, bottom = CH - 66;
  const rows = Math.max(1, Math.floor((bottom - top) / (ch2 + gap)));
  const lines = Math.ceil(cards.length / cols);
  const maxScroll = Math.max(0, lines - rows);
  benchScroll = clamp(benchScroll, 0, maxScroll);
  const from = benchScroll * cols;
  cards.slice(from, from + rows * cols).forEach((c, i) => {
    drawCard(c, 24 + (i % cols) * (cw2 + gap), top + ((i / cols) | 0) * (ch2 + gap), cw2, ch2);
  });
  if (maxScroll > 0) {
    txt('строки ' + (benchScroll + 1) + '–' + Math.min(benchScroll + rows, lines) + ' из ' + lines +
        ' · колесо мыши', CW / 2 - 10, CH - 58, 9, '#98a2ae', 'center');
    btn(CW - 78, CH - 66, 25, 17, '▲', () => { benchScroll--; }, null, benchScroll <= 0);
    btn(CW - 50, CH - 66, 25, 17, '▼', () => { benchScroll++; }, null, benchScroll >= maxScroll);
  }
  panelFooter('вкладки сверху · цены зависят от королевства · продать — вкладка «Продать»');
}

/* Продажа осталась списком: тут важны не картинки, а «сколько дадут». */
function drawSellList(y) {
  const H = goodInfo(hotGood);
  txt('Скупщик берёт за 60% цены. Сегодня в цене: ' + H.ico + ' ' + H.n + ' — платит полную.',
      24, y, 9, '#f2b134');
  y += 14;
  const rowsAll = inv.filter(i => i.k === 'stack').concat(inv.filter(i => i.k !== 'stack'));
  const v = listView(rowsAll.length, y + 12, CH - 70, 24, benchScroll);
  benchScroll = v.from;
  if (v.max > 0) scrollBtns(y, v, () => benchScroll, n => { benchScroll = clamp(n, 0, v.max); });
  else txt(rowsAll.length ? 'всё лишнее — в кроны' : 'продавать нечего', CW - 24, y, 9, '#6c7683', 'right');
  y += 12;
  for (const it of rowsAll.slice(v.from, v.from + v.vis)) {
    const isStack = it.k === 'stack';
    const hot = isStack && it.id === hotGood;
    ctx.fillStyle = hot ? 'rgba(50,42,20,.85)' : 'rgba(20,18,15,.75)';
    ctx.fillRect(24, y, CW - 48, 22);
    if (hot) { ctx.fillStyle = 'rgba(242,177,52,.75)'; ctx.fillRect(24, y, 3, 22); }
    txt(clipText(itemIco(it) + '  ' + fullName(it), CW - 240, 10), 32, y + 11, 10,
        hot ? '#f2d59a' : isStack ? '#e6ebf2' : TIERS[it.tier].c);
    if (isStack) {
      const one = unitPrice(it.id), all = stackPrice(it.id, it.n);
      txt(one + '💰 за штуку', CW - 190, y + 11, 9, hot ? '#f2b134' : '#98a2ae', 'right');
      txt(itemWeight(it).toFixed(1) + ' кг', CW - 128, y + 11, 9, '#6c7683', 'right');
      btn(CW - 120, y + 3, 44, 16, '×1', () => sellStack(it.id, 1), 'rgba(70,60,30,.9)');
      btn(CW - 72, y + 3, 48, 16, 'всё ' + all + '💰', () => sellStack(it.id, it.n), 'rgba(70,60,30,.9)');
    } else {
      // тот же потолок и для железа: 0.83 от самой дешёвой закупки по уделам
      const gm = Math.min(kdMul('gear'), 0.9 * Math.min.apply(null, KD_KEYS.map(k => KINGDOMS[k].mul.gear)) / 0.6);
      const p = Math.max(1, Math.round(itemPrice(it) * 0.6 * gm));
      txt(itemWeight(it).toFixed(1) + ' кг', CW - 128, y + 11, 9, '#6c7683', 'right');
      btn(CW - 120, y + 3, 96, 16, 'продать ' + p + '💰', () => sell(it), 'rgba(70,60,30,.9)');
    }
    y += 24;
  }
  panelFooter('надетое не продаётся — сперва сними · цены зависят от королевства');
}

/* Разговор с торговцем: та же лавка, только прилавок его и цены его удела. */
let vendorNpc = null;
function drawVendor() {
  if (!vendorNpc) { panel = null; return; }
  panelBox(vendorNpc.ico + ' ' + vendorNpc.n.toUpperCase());
  drawTrade(vendorNpc);
}

/* =====================  ОКНО НАВЫКОВ (K)  =====================
   Три столбца по веткам. В каждой строке видно, сколько уже вложено, что
   даёт ступень и что даст следующая — чтобы очко тратилось осознанно. */
function drawSkills() {
  panelBox('⭐ НАВЫКИ');
  const need = xpNeed(P.lvl);
  txt('Ступень ' + P.lvl + '   ·   опыт ' + P.xp + ' / ' + need, 24, 96, 11, '#e8d9a8');
  txt(P.sp > 0 ? '⭐ очков навыка: ' + P.sp : 'очков нет — бей тварей и закрывай работы',
      CW - 24, 96, 11, P.sp > 0 ? '#f2b134' : '#6c7683', 'right');
  bar(24, 104, CW - 48, 7, clamp(P.xp / need, 0, 1), '#c9a227');

  const colW = Math.floor((CW - 48 - 12) / 3);
  BRANCHES.forEach((br, bi) => {
    const x = 24 + bi * (colW + 6);
    txt(br, x + colW / 2, 128, 11, '#f2d59a', 'center');
    let y = 140;
    for (const k of SKILL_KEYS) {
      const S = SKILLS[k]; if (S.br !== br) continue;
      const lv = sk(k), maxed = lv >= S.max, can = P.sp > 0 && !maxed;
      ctx.fillStyle = lv > 0 ? 'rgba(40,44,32,.9)' : 'rgba(20,18,15,.8)';
      ctx.fillRect(x, y, colW, 52);
      ctx.strokeStyle = maxed ? 'rgba(242,177,52,.6)' : lv > 0 ? 'rgba(201,162,39,.35)' : 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, colW - 1, 51);
      txt(clipText(S.ico + ' ' + S.n, colW - 40, 10), x + 5, y + 12, 10, lv > 0 ? '#e8d9a8' : '#98a2ae');
      txt(lv + '/' + S.max, x + colW - 5, y + 12, 10, maxed ? '#f2b134' : '#98a2ae', 'right');
      // полоска вложенного: видно с одного взгляда, куда уже сыпал
      for (let i = 0; i < S.max; i++) {
        ctx.fillStyle = i < lv ? '#c9a227' : 'rgba(255,255,255,.10)';
        ctx.fillRect(x + 5 + i * 11, y + 18, 9, 4);
      }
      txt(clipText(S.step, colW - 10, 8), x + 5, y + 32, 8, '#98a2ae');
      btn(x + 5, y + 38, colW - 10, 12, maxed ? 'предел' : can ? '+ вложить очко' : 'нужно очко',
          () => spend(k), null, !can,
          maxed ? 'Дальше некуда' : 'Очки дают за ступени — бей тварей и закрывай работы');
      y += 56;
    }
  });
  panelFooter('K или ✕ — закрыть · опыт идёт за головы и за закрытые работы');
}

/* =====================  ВАРКА (C)  =====================
   Открывается ГДЕ УГОДНО: котелок ведьмак носит с собой. Что можно сварить,
   решает навык, а не место. */
function drawCraft() {
  panelBox('⚗ ВАРКА В ДОРОГЕ');
  txt('Котелок при себе — варить можно хоть посреди болота.', 24, 96, 10, '#98a2ae');
  txt('⚗ Травничество ' + sk('brew') + '/3   ·   ➶ Болторезка ' + sk('fletch') + '/3',
      CW - 24, 96, 10, '#c9a227', 'right');
  txt('🌿 травы ' + countStack('herb') + '   ⛏ руда ' + countStack('ore') + '   ✨ эссенции ' + countStack('essence'),
      24, 112, 10, '#e8d9a8');

  const list = RECIPES.filter(r => sk(r.s) > 0 || r.lvl === 1);
  const top = 126;
  const v = listView(list.length, top, CH - 66, 30, benchScroll);
  benchScroll = v.from;
  if (v.max > 0) scrollBtns(top - 8, v, () => benchScroll, n => { benchScroll = clamp(n, 0, v.max); });
  let y = top;
  if (!list.length) txt('Пока не умеешь ничего: вложи очко в Травничество или Болторезку (K)', 24, y + 12, 10, '#6c7683');
  for (const r of list.slice(v.from, v.from + v.vis)) {
    const why = canCraft(r), ok = !why;
    ctx.fillStyle = ok ? 'rgba(34,40,28,.9)' : 'rgba(20,18,15,.75)';
    ctx.fillRect(24, y, CW - 48, 28);
    ctx.strokeStyle = ok ? 'rgba(127,214,160,.35)' : 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1; ctx.strokeRect(24.5, y + .5, CW - 49, 27);
    const G = goodInfo(r.id);
    txt(G.ico + ' ' + G.n + (r.out > 1 ? ' ×' + r.out : ''), 32, y + 10, 10, ok ? '#e8d9a8' : '#8a8f96');
    const need = Object.keys(r.need).map(k => STUFF[k].ico + r.need[k] + ' (есть ' + countStack(k) + ')').join('   ');
    txt(clipText(need + '   ·   ' + SKILLS[r.s].ico + ' ' + SKILLS[r.s].n + ' ' + r.lvl, CW - 190, 8),
        32, y + 21, 8, ok ? '#98a2ae' : '#6c7683');
    btn(CW - 118, y + 5, 94, 18, ok ? '⚗ сварить' : 'нельзя', () => craft(r), null, !ok, why);
    y += 30;
  }
  panelFooter('C или ✕ — закрыть · рецепты открывает навык, а не место');
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
  else if (panel === 'skills') drawSkills();
  else if (panel === 'craft') drawCraft();
  else if (panel === 'vendor') drawVendor();
  else if (panel === 'bench') drawBench();
  else if (panel === 'board') drawBoard();
  else if (panel === 'map') drawMap();

  if (paused && !over && !panel) {
    ctx.fillStyle = 'rgba(8,7,6,.72)'; ctx.fillRect(0, 0, CW, CH);
    txt('⏸ ПАУЗА', CW / 2, CH / 2, 26, '#e8d9a8', 'center');
    txt('P / Esc — продолжить', CW / 2, CH / 2 + 26, 12, '#98a2ae', 'center');
  }
  if (over) {
    ctx.fillStyle = 'rgba(20,6,6,.9)'; ctx.fillRect(0, 0, CW, CH);
    txt('☠ ВЕДЬМАК ПАЛ', CW / 2, CH / 2 - 76, 28, '#ff6a4a', 'center');
    txt(cause, CW / 2, CH / 2 - 46, 12, '#e6ebf2', 'center');
    txt('Работа сорвана · за лечение отдано ' + downLost + ' крон', CW / 2, CH / 2 - 22, 12, '#c2cad2', 'center');
    txt('Снаряжение, сумка и сюжет (' + storyIdx + '/' + STORY.length + ') остаются при тебе',
        CW / 2, CH / 2 + 2, 11, '#7fd6a0', 'center');
    // шкала «приходит в себя»: видно, что это не конец, а пауза
    const k = clamp(1 - downT / DOWN_TIME, 0, 1);
    bar(CW / 2 - 110, CH / 2 + 26, 220, 12, k, '#b5423f');
    txt('приходит в себя… ' + Math.max(0, downT).toFixed(1) + ' с', CW / 2, CH / 2 + 32, 11, '#ffd9d0', 'center');
    txt('Закрыто контрактов: ' + ci + '   ·   рекорд: ' + best + '   ·   падений: ' + deaths,
        CW / 2, CH / 2 + 60, 11, '#98a2ae', 'center');
    txt('«Заново» — начать поход с нуля', CW / 2, CH / 2 + 82, 10, '#6c7683', 'center');
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
  if (over) return;                                    // лежачего не поднять тычком — встанет сам
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
  if (panel === 'bag') bagScroll += d; else benchScroll += d;   // прилавок и верстак катаются одним счётчиком
}, { passive: false });
canvas.addEventListener('pointerup', () => { mouse.down = false; });
canvas.addEventListener('pointerleave', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function interact() {
  if (panel === 'board') { panel = null; return; }      // E у доски — и закрыть тоже
  if (panel === 'vendor') { panel = null; vendorNpc = null; return; }
  if (panel) return;
  /* Люди в деревне. Торговец открывает свой прилавок и торгует по ценам
     СВОЕГО королевства; тому, кому торговать нечем, есть что сказать. */
  const who = npcNear(P.x, P.y, 46);
  if (who) {
    if (who.tabs) {
      vendorNpc = who; marketKd = who.kd; tradeTab = who.tabs[0];
      benchScroll = 0; panel = 'vendor'; snd('ui');
      message(who.ico + ' ' + who.n + ' (' + who.town.n + '): «Показывай, чего надо»');
    } else { snd('ui'); message(npcTalk(who)); }
    return;
  }
  // доска и верстак стоят в мире: подошёл — работает, ушёл — нет
  if (Math.hypot(P.x - BOARD.x, P.y - BOARD.y) < 52) {
    if (taken.length >= MAX_JOBS) { message('Взято три работы — больше не берут. Доделай что-нибудь.'); return; }
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
  // в полном экране Esc выходит из него, а не ставит паузу
  if (e.code === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement)) return;
  /* Пауза работает и когда лежишь: счёт «приходит в себя» на паузе стоит,
     и отойти на минуту можно, не теряя восьми секунд. Всё остальное, пока
     лежишь, недоступно — иначе с того света переодеваются и жгут мутацию. */
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (panel) panel = null; else { paused = !paused; updateButtons(); }
    e.preventDefault(); return;
  }
  if (over) return;                                    // ждём, пока отлежится
  if (e.repeat) return;
  if (e.code === 'KeyI') { panel = panel === 'bag' ? null : 'bag'; bagScroll = 0; return; }
  if (e.code === 'KeyM') { panel = panel === 'map' ? null : 'map'; return; }   // карта земли
  if (e.code === 'KeyK') { panel = panel === 'skills' ? null : 'skills'; return; }
  if (e.code === 'KeyC') { panel = panel === 'craft' ? null : 'craft'; benchScroll = 0; return; }
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
  // B катает болты только вперёд: Shift занят увёртыванием, и «назад»
  // через Shift+B означало бы прыжок в кусты вместо смены болта
  if (e.code === 'KeyB') { cycleBolt(1); return; }
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
    // кошачий доспех: откат короче, бросок дальше — и то и другое от ступени
    const cat = schoolPow('dodge');
    const push = 460 * (1 + 0.08 * cat);
    P.dodge = 0.2; P.dodgeCd = 0.75 * (1 - 0.10 * cat); P.dx = mx / l * push; P.dy = my / l * push;
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
/* Кнопки под игрой тоже молчат, пока ведьмак лежит: клавиши-то мы закрыли,
   а через них можно было и меч сменить, и сумку открыть, и мутацию сжечь —
   лёжа без сознания. Пауза — исключение, она останавливает счёт. */
onBtn('swapBtn', () => { if (!over) swapHand(); });
onBtn('bagBtn', () => { if (over) return; panel = panel === 'bag' ? null : 'bag'; bagScroll = 0; });
onBtn('mutBtn', () => { if (!over) toggleMutation(); });
onBtn('pause', () => { paused = !paused; updateButtons(); });
onBtn('sndBtn', () => { if (window.sfx) window.sfx.toggle(); updateButtons(); });
onBtn('restart', () => { clearRun(); reset(); message('Новый ведьмак, новый поход.'); });
function updateButtons() {
  const b = document.getElementById('pause'); if (b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
  const s = document.getElementById('sndBtn');
  if (s) s.textContent = (window.sfx && window.sfx.on) ? '🔊 Звук' : '🔇 Тихо';
}

window.__fsFail = function (why) { message('⛶ Полный экран не открылся: ' + why); };

reset();
if (loadRun()) message('📜 Поход продолжен: впереди контракт ' + (ci + 1) + '. «Заново» — начать сначала.');
requestAnimationFrame(frame);

// ручки для проверки: тесты гоняют бой без мышки и без ожидания
if (typeof globalThis !== 'undefined') globalThis.__W = {
  reset, update, render, startContract, finishContract, spawnFoe, castRune, drink, upgrade, enchant, sell, buy,
  equip, addStack, countStack, dropItem, swordDamage, damageTaken, hurtFoe, hurtPlayer, toggleMutation,
  carried, capacity, loadState, itemWeight, itemPrice, fullName, mkSword, mkArmor, mkXbow, mkStack, lootFrom,
  XBOW, BOLTS, BOLT_IDS, buyXbow, cycleBolt, boltHit, xbowDamage, randomGear,
  ARMOR_KEYS, buyArmor, schoolNote, schoolRange, schoolPow, schoolStep, wornSchool,
  runeCost, runePower, armorDef, maxHP, mpRegen, moveSpeed,
  getBolt: () => P.boltSel, setBolt: v => { P.boltSel = v; },
  getP: () => P, getFoes: () => foes, setFoes: v => { foes = v; }, getInv: () => inv, setInv: v => { inv = v; },
  getGold: () => gold, setGold: v => { gold = v; }, getDrops: () => drops, getShots: () => shots,
  getPhase: () => phase, setPhase: v => { phase = v; }, getOver: () => over, getCi: () => ci, setCi: v => { ci = v; },
  getKillsLeft: () => killsLeft, getTaken: () => taken, MAX_JOBS, focusJob, syncFocus, finishContract, setPanel: v => { panel = v; }, setMouse: (x, y) => { mouse.x = x; mouse.y = y; },
  swing, shootBolt, applyOil, swapHand, saveRun, loadRun, clearRun, freeSpot,
  LOCS, JOBS, STORY, SPOTS, SEEDS, PATHS, WORLD_W, WORLD_H, FIRE, BENCH, BOARD, CAMP_R,
  TOWNS, townAt, obstNear, buildObstGrid, nearPath, buildPaths, TILE, TW, TH,
  buildWorld, buildRegions, locAt, regionSpot, onPath, inCamp, questGoal, takeStory, storyNow,
  compareNote, rollBoard, makeContract, jobFam, syncCam,
  getStory: () => storyIdx, setStory: v => { storyIdx = v; },
  getDown: () => downT, getDeaths: () => deaths, rise,
  BAGS, buyBag, capacity,
  getCam: () => cam,
  sellStack, stackPrice, unitPrice, rollHotGood, getHot: () => hotGood, setHot: v => { hotGood = v; },
  setBenchTab: v => { benchTab = v; }, getBenchTab: () => benchTab,
  KINGDOMS, KD_KEYS, kdAt, goodKind, kdMul, kdLacks, buyPrice, sellCap, SHOP_UNIT, buildShopUnits,
  SKILLS, SKILL_KEYS, BRANCHES, RECIPES, sk, spend, gainXP, xpNeed, canCraft, craft, NPCS: () => NPCS, NPC_KINDS,
  buildNPCs, npcNear, npcTalk, shopCards, TAB_STACKS, TAB_N, CAMP_VENDOR,
  getMarket: () => marketKd, setMarket: v => { marketKd = v; },
  setTradeTab: v => { tradeTab = v; }, getTradeTab: () => tradeTab,
  setVendor: v => { vendorNpc = v; }, getVendor: () => vendorNpc,
  getLoc: () => curLoc, getObst: () => obst, getOffers: () => offers, setOffers: v => { offers = v; },
  SWORD, ARMOR, TIERS, FOES, POTIONS, STUFF, RUNES, ENCH, WX0, WY0, WX1, WY1,
  getScroll: () => ({ bag: bagScroll, bench: benchScroll }),
  setScroll: (b, n) => { if (b === 'bag') bagScroll = n; else benchScroll = n; },
  getHits: () => uiHit,
};
