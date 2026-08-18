/* Зоны знаков и потолок частиц.

   Знаки переписываются ради красоты, а красота живёт в тех же строчках, что
   и зона поражения. Эта проверка меряет зону ПОВЕДЕНИЕМ: ставит тварь на
   известное расстояние и смотрит, достало её или нет. Так она не зависит от
   того, как знак нарисован, и переживает любую переделку. */
'use strict';
const { W, ok, note, head, done, paints, paintsFull, traces, arcs, nans,
        sandbox } = require('./harness.js');

/* Достаёт ли знак тварь, поставленную на расстоянии d под углом da от взгляда.
   Тварь ставим свежую и с запасом здоровья, чтобы «не достало» нельзя было
   спутать с «убило с одного удара».

   Тварь при рождении может сдвинуться — её выталкивают из преград и держат
   в границах земли (см. clampFoe/spawnFoe). На мерках, что стоят вплотную к
   границе, сдвиг на пару шагов перевернёт ответ, поэтому здесь же меряем
   ФАКТИЧЕСКОЕ расстояние и предупреждаем, если оно разошлось с заказанным:
   мерка, которая меряет не то, что думает, хуже отсутствующей. */
function reach(rune, d, da) {
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.face = 0; P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.syncCam();
  W.setFoes([]);
  const a = (da || 0);
  W.spawnFoe('drowner', P.x + Math.cos(a) * d, P.y + Math.sin(a) * d);
  const f = W.getFoes()[0];
  const real = Math.hypot(f.x - P.x, f.y - P.y);
  if (Math.abs(real - d) > 1) note('тварь сдвинулась при рождении: заказано ' + d + ', вышло ' + real.toFixed(1));
  f.hp = 100000;
  const hp0 = f.hp, kx0 = f.kx || 0;
  W.castRune(rune);
  W.update(0.016);
  return { hurt: f.hp < hp0, pushed: Math.abs((f.kx || 0) - kx0) > 1 };
}

/* ВАЖНО про допуск. inCone сравнивает dist(f, P) > len + f.r: радиус твари
   идёт В ЗАЧЁТ дальности. У утопца он 10, поэтому Игни на бумаге бьёт 120, а
   на деле достаёт до 130. Мерки ниже считаются ОТ ЭТОЙ границы и стоят к ней
   вплотную: сетка, у которой между «достаёт» и «мимо» девяносто шагов, не
   ловит ничего. Считаем радиус из таблицы, а не числом: поменяется утопец —
   поедет и мерка. */
const FR = W.FOES.drowner.r;

head('Игни: конус 120 шагов, полураскрытие 0.7');
{
  const edge = 120 + FR;
  note('граница Игни с учётом радиуса твари: ' + edge);
  ok(reach(0, edge - 5, 0).hurt, 'за пять шагов до границы — достаёт');
  ok(!reach(0, edge + 5, 0).hurt, 'через пять шагов после границы — мимо');
  ok(reach(0, 100, 0.65).hurt, 'вбок на 0.65 радиана — достаёт');
  ok(!reach(0, 100, 0.75).hurt, 'вбок на 0.75 радиана — мимо');
}

head('Аард: конус 100 шагов, полураскрытие 0.8');
{
  const edge = 100 + FR;
  note('граница Аарда с учётом радиуса твари: ' + edge);
  ok(reach(1, edge - 5, 0).pushed, 'за пять шагов до границы — сбивает');
  ok(!reach(1, edge + 5, 0).pushed, 'через пять шагов после границы — не сбивает');
  ok(reach(1, 80, 0.75).pushed, 'вбок на 0.75 радиана — сбивает');
  ok(!reach(1, 80, 0.85).pushed, 'вбок на 0.85 радиана — мимо');
}

head('Ирден: ловушка радиусом 58');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.face = 0; P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.syncCam(); W.setFoes([]);
  W.castRune(3);
  const y = P.yrden;
  ok(!!y, 'ловушка поставлена');
  note('радиус ловушки: ' + (y ? y.r : '—'));
  ok(y && y.r === 58, 'радиус тот же — 58');
}

/* У ведьмака НЕТ радиуса в правилах: твари меряют расстояние до его середины,
   а девятка жила только в рисовалке. Значит пешка размером ничего сдвинуть не
   может. Зато меч рисуется в тех же строчках, что и фигура, — вот его
   дальность и стережём: 40 шагов плюс радиус твари. */
head('Меч достаёт на прежние 40 шагов');
{
  /* Утопец идёт на ведьмака и во время замаха, а мерка стоит вплотную к
     границе (±3 шага) — подрезать число кадров прогона было бы починкой на
     глаз: сколько кадров ни возьми, это будет держаться на том, что подход
     твари за это время меньше трёхшагового допуска, а не на том, что тварь
     не движется. Поменяется скорость утопца, длина кадра или повадка — и
     мерка развалится молча, соврав вместо того, чтобы упасть.

     Вместо этого пришпиливаем тварь: f.stun > 0 выкидывает её из
     обновления сразу (game.js: if (f.stun > 0) { f.stun -= dt; return; }),
     а проверка попадания мечом на оглушение не смотрит вовсе — только
     расстояние и угол. Оглушённая тварь бьётся как обычная и никуда не
     сдвинется, так что можно смело держать все 6 кадров прогона. */
  function swingHits(d) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    const P = W.getP();
    P.x = 3000; P.y = 3000; P.face = 0; P.atkCd = 0; W.syncCam();
    W.setFoes([]);
    W.spawnFoe('drowner', P.x + d, P.y);
    const f = W.getFoes()[0]; f.hp = 100000;
    f.stun = 5;                       // пришпилена: оглушённая тварь не двигается
                                      // (game.js: if (f.stun > 0) ... return), а меч
                                      // на оглушение не смотрит — бьёт как обычно.
                                      // Без этого утопец за кадры сам подходил на
                                      // пару шагов, и допуск ±3 держался на волоске
    const x0 = f.x, y0 = f.y, hp0 = f.hp;
    W.swing();
    for (let i = 0; i < 6; i++) W.update(0.016);
    const moved = Math.hypot(f.x - x0, f.y - y0);
    if (moved > 0.5) note('пришпиленная тварь всё равно сдвинулась на ' + moved.toFixed(2) + ' шага');
    return f.hp < hp0;
  }
  const fr = W.FOES.drowner.r;
  note('радиус утопца: ' + fr + ', значит меч должен доставать до ' + (40 + fr));
  ok(swingHits(40 + fr - 3), 'чуть ближе предела — попадает');
  ok(!swingHits(40 + fr + 3), 'чуть дальше предела — мимо');
}

/* ПОТОЛОК ЧАСТИЦ.

   Мерить потолок арифметикой нельзя: «длина не больше PART_CAP» при сравнении
   с тем же PART_CAP не падает никогда, сколько бы частиц ни насыпали. Поэтому
   здесь всё меряется поведением: сколько частиц ЗАКАЗАНО, сколько осталось,
   КОГО именно вытеснило и попадает ли свежая искра в тот самый массив, который
   через кадр рисуют.

   Заказ считаем ударами меча: удар даёт постоянное число брызг, и сколько
   именно — стенд ВЫМЕРЯЕТ сам, а не берёт числом из игры. Поменяется щедрость
   крови — мерка поедет следом, а не соврёт. */
head('Потолок частиц');
{
  /* Источник частиц: тварь ставим далеко и пришпиливаем оглушением. Она не
     должна ни бить (тогда в массив полезет кровь игрока), ни двигаться —
     иначе счёт заказанного поедет, и мерка начнёт мерить не то, что думает. */
  function pin() {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    const P = W.getP();
    P.x = 3000; P.y = 3000; P.face = 0; W.syncCam();
    W.setFoes([]);
    W.spawnFoe('drowner', P.x + 300, P.y);
    const f = W.getFoes()[0];
    f.hp = 1e9;                          // бессмертна: источник брызг не должен иссякнуть
    f.stun = 1e9;                        // и неподвижна (game.js: if (f.stun > 0) ... return)
    return f;
  }

  ok(typeof W.PART_CAP === 'number' && W.PART_CAP > 0, 'потолок объявлен и открыт стенду');

  let f = pin();
  const n0 = W.getParts().length;
  W.hurtFoe(f, 1, 'sword');
  const perHit = W.getParts().length - n0;
  note('брызг за один удар: ' + perHit);
  ok(perHit > 0, 'удар вообще сыплет частицы — иначе мерить нечем');

  // --- держит ли потолок настоящую нагрузку ---
  const HITS = 400;
  const asked = perHit * HITS;
  for (let i = 0; i < HITS; i++) W.hurtFoe(f, 1, 'sword');
  note('заказано частиц: ' + asked + ', осталось: ' + W.getParts().length + ', потолок: ' + W.PART_CAP);
  ok(asked > W.PART_CAP * 2, 'нагрузка вдвое перекрыла потолок — значит ему было что резать');
  ok(W.getParts().length === W.PART_CAP, 'массив встал ровно на потолке, а не вырос по заказу');

  // --- вытесняются САМЫЕ СТАРЫЕ, а не какие попало ---
  /* Метим то, что лежит, порядковыми числами и смотрим, чьи метки пережили
     следующий удар. Свежая искра важнее догорающей: уйти должны метки с
     начала, а хвост — остаться целиком. */
  const was = W.getParts().length;
  W.getParts().forEach((p, i) => { p.mark = i; });
  W.hurtFoe(f, 1, 'sword');
  const left = W.getParts().filter(p => p.mark !== undefined).map(p => p.mark);
  const lo = left.length ? Math.min.apply(null, left) : -1;
  const hi = left.length ? Math.max.apply(null, left) : -1;
  note('меток уцелело ' + left.length + ' из ' + was + ', от ' + lo + ' до ' + hi);
  ok(W.getParts().length === W.PART_CAP, 'после добавки массив всё ещё ровно на потолке');
  ok(left.length === was - perHit, 'ушло ровно столько старых, сколько пришло новых');
  ok(lo === perHit, 'ушли самые старые: младшая уцелевшая метка — ' + lo + ', ждали ' + perHit);
  ok(hi === was - 1, 'хвост цел: самая свежая из старых меток на месте');

  // --- то, что лежит в массиве, действительно попадает на экран ---
  /* Длина массива сама по себе ничего не обещает: важно, что рисовалка ходит
     ПО ТОМУ ЖЕ массиву. Кровь красится единственным на всю игру цветом —
     по нему и считаем нарисованное. */
  const drawnBlood = paints(() => W.render()).filter(c => c === '#a4222a').length;
  note('брызг нарисовано за кадр: ' + drawnBlood + ', в массиве: ' + W.getParts().length);
  ok(drawnBlood === W.getParts().length, 'сколько частиц в массиве — столько и нарисовано');

  /* --- свежая частица ложится в ЖИВОЙ массив, а не в выброшенный ---

     Каждый кадр массив не чистится на месте, а ЗАМЕНЯЕТСЯ новым
     (game.js: parts = parts.filter(...)). Если добавлялка держит ссылку,
     взятую однажды, новые частицы уедут в выброшенный массив: потолок
     «сработает», на экране не появится ничего, а мерка на длину останется
     зелёной. Ловим это дельтой ВОКРУГ подмены: считаем длину сразу после
     кадра и сразу после удара, между ними не происходит ничего. */
  f = pin();
  for (let i = 0; i < 3; i++) W.update(0.016);   // здесь массив трижды заменён фильтром
  const live = W.getParts().length;
  ok(live < W.PART_CAP, 'после кадров массив ниже потолка — вытеснению взяться неоткуда');
  W.hurtFoe(f, 1, 'sword');
  ok(W.getParts().length === live + perHit,
     'после подмены массива фильтром новые частицы ложатся в живой массив: было ' + live + ', стало ' + W.getParts().length);

  // и потолок продолжает держать уже ПОСЛЕ подмены, а не только на свежем массиве
  for (let i = 0; i < HITS; i++) W.hurtFoe(f, 1, 'sword');
  ok(W.getParts().length === W.PART_CAP, 'потолок держит и после того, как массив пережил кадры');
}

/* ==================  ГРАНИЦА, КОТОРАЯ НЕ ВРЁТ  ==================

   Знаки стали зрелищными, и вся новая опасность — в том, что зрелище начнёт
   обещать не то, что делает: пламя улетит дальше, чем бьёт, или дуга ляжет
   не там, где зона. Читаемость важнее красоты, а «читаемость» здесь значит
   ровно три вещи, и каждая меряется отдельно:

     · нарисованная граница совпадает с ЗАМЕРЕННОЙ поведением зоной;
     · ни одна частица знака не вылетает за эту границу…
     · …но и не жмётся к ведьмаку: зона должна быть заполнена, иначе
       «внутри границы» выполнялось бы пустым знаком.

   Ни одно число зоны здесь не берётся из игры: длина и раствор нащупываются
   двоичным поиском по тому, кого знак ДОСТАЛ. Сдвинь зону — поедет мерка;
   сдвинь рисунок — мерка упрётся в замер и упадёт. */

// Двоичный поиск дальности по попаданию: где перестаёт доставать.
function measureLen(rune, key) {
  let lo = 12, hi = 400;                               // 12 — заведомо достаёт, 400 — заведомо нет
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (reach(rune, m, 0)[key]) lo = m; else hi = m;
  }
  return (lo + hi) / 2 - FR;                           // радиус твари шёл в зачёт — снимаем
}
// Тот же поиск по раствору: докуда вбок ещё берёт. Расстояние далеко от
// границы по длине, чтобы одно не мешало другому.
function measureHalf(rune, key) {
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (reach(rune, 60, m)[key]) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// Чистое поле и один знак: всё, что окажется в частицах, — от него одного.
function cast(rune, a) {
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.face = a; P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.syncCam(); W.setFoes([]);
  W.render();                                          // прогрев: первый кадр печёт землю
  W.getParts().length = 0;
  W.castRune(rune);
  return P;
}

/* Что именно добавили к кадру ВОТ ЭТИ частицы. Кадр рисуется целиком — землёй,
   пешкой, поясом, — и мазки знака в нём тонут; отличать их по цвету значило бы
   заранее знать цвет, то есть переспрашивать саму игру. Поэтому рисуем кадр
   дважды: пустым и с нужными частицами, и берём кусок, которого в пустом не
   было. Общие начало и хвост совпадают до мазка — кадр от вызова к вызову
   одинаков (и это здесь же проверяется). Массив правим НА МЕСТЕ: игра держит
   ту же ссылку, пока её не заменит фильтр в update. */
function onlyParts(keep, rec) {
  const ps = W.getParts();
  const all = ps.slice();
  const put = list => { ps.length = 0; for (const p of list) ps.push(p); };
  put([]);
  const base = rec(() => W.render());
  put(keep);
  const full = rec(() => W.render());
  put(all);
  const same = (x, y) => x !== undefined && y !== undefined && JSON.stringify(x) === JSON.stringify(y);
  let i = 0; while (i < base.length && same(base[i], full[i])) i++;
  let j = 0; while (j < base.length - i && same(base[base.length - 1 - j], full[full.length - 1 - j])) j++;
  return { got: full.slice(i, full.length - j), base: base.length, full: full.length };
}

/* Допуск сравнения с замеренной зоной. Дальность нащупывается двоичным
   поиском: 20 делений отрезка [12, 400] дают точность 0.0004 шага. Ровно на
   границу ложатся выжиг и волна — им положено, — и без допуска они падали бы
   на последнем знаке после запятой. Сотая шага в сотни раз меньше любого
   вылета, который стоит ловить. */
const EPS = 0.01;
const KINDS = ['glyph', 'edge', 'scorch', 'flame', 'spark', 'smoke', 'wave', 'dust'];
const kindOf = p => KINDS.find(k => p[k]) || 'прочее';
function nrm(x) { while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; }

head('Кадр повторяем — иначе вырезать из него знак нельзя');
{
  cast(0, 0.4);
  const d = onlyParts([], paintsFull);
  ok(d.got.length === 0 && d.base === d.full,
     'два кадра с одними и теми же частицами дали ровно одно и то же (' + d.base + ' мазков)');
}

/* Сам стенд тоже надо проверять: мерки ниже читают у дуг краску и густоту, и
   если обвязка отдаёт их неверно, врать будут именно мерки — молча и уверенно. */
head('Обвязка отдаёт дугу честно');
{
  const c = sandbox.__canvas.getContext();
  ok(nans(() => c.arc(1, 2, 3, 4, 5, NaN)).indexOf('arc') >= 0,
     'чушь в шестом доводе arc (обход против часовой) замечена, а не пропущена');
  const built = arcs(() => { c.beginPath(); c.arc(1, 2, 3, 0, 6.3); });
  ok(built.length === 0, 'дуга, которую построили и бросили не обведя, на экран не попала');
  const painted = arcs(() => {
    c.beginPath(); c.arc(1, 2, 3, 0, 6.3);
    c.strokeStyle = '#111111'; c.globalAlpha = 0.25; c.lineWidth = 7; c.stroke();
  });
  ok(painted.length === 1 && painted[0].c === '#111111' && painted[0].al === 0.25 && painted[0].w === 7,
     'краска снята в момент обводки, а не построения пути: ' +
     (painted[0] ? painted[0].c + ' при ' + painted[0].al + ' и ' + painted[0].w : 'ничего'));
  c.globalAlpha = 1;
}

for (const S of [{ r: 0, n: 'Игни', key: 'hurt' }, { r: 1, n: 'Аард', key: 'pushed' }]) {
  head(S.n + ': нарисованная граница совпадает с замеренной зоной');
  const LEN = measureLen(S.r, S.key), HALF = measureHalf(S.r, S.key);
  note('замерено поведением: дальность ' + LEN.toFixed(2) + ', раствор ' + HALF.toFixed(3));

  const AIM = 0.4;                                     // не по осям — чтобы косые ошибки не прятались
  const P = cast(S.r, AIM);
  const ps = W.getParts();
  const edges = ps.filter(p => p.edge);
  ok(edges.length === 1, 'граница ровно одна на знак, а не набор дуг: ' + edges.length);

  /* --- дуга ---
     Дуга у границы ОДНА, но обведена дважды: тёмная подложка и светлая
     линия поверх. Значит записей две, а геометрия у них обязана быть одна и
     та же — по ней и меряем. */
  const arc = onlyParts(edges, arcs).got;
  const geom = new Set(arc.map(A => [A.x, A.y, A.r, A.a0, A.a1].join('|')));
  ok(geom.size === 1, 'вся граница построена по одной дуге: разных дуг ' + geom.size);
  ok(arc.length === 2 && arc.every(A => A.k === 'stroke'),
     'её обводят дважды и не заливают: мазков ' + arc.length +
     ' (' + arc.map(A => A.k).join(', ') + ')');
  if (geom.size === 1) {
    const A = arc[0];
    /* Заодно это единственная мерка, которая читает у дуги КРАСКУ. Холст
       строит путь раньше, чем ставят стиль, и обвязка обязана снимать стиль
       в момент stroke, а не arc, — иначе здесь окажется краска предыдущей
       частицы, и «обод Ирдена фиолетовый» в следующей задаче будет враньём. */
    const bright = arc.find(A2 => A2.c === edges[0].c);
    const under = arc.find(A2 => A2 !== bright);
    ok(!!bright && !!under, 'у дуги нашлись обе обводки: своя краска и подложка');
    if (bright && under) {
      note('светлая ' + bright.c + ' при густоте ' + bright.al.toFixed(2) + ' и толщине ' + bright.w +
           ', подложка ' + under.c + ' при ' + under.al.toFixed(2) + ' и ' + under.w);
      ok(under.w > bright.w, 'подложка шире светлой линии — иначе её не видно из-под неё');
      ok(bright.al >= 0.95, 'светлая линия идёт в полную густоту');
    }
    note('дуга: радиус ' + A.r.toFixed(2) + ', от ' + A.a0.toFixed(3) + ' до ' + A.a1.toFixed(3));
    ok(Math.abs(A.r - LEN) <= 0.5,
       'радиус дуги равен замеренной дальности: ' + A.r.toFixed(2) + ' против ' + LEN.toFixed(2));
    ok(Math.abs(nrm((A.a0 + A.a1) / 2 - AIM)) <= 0.01, 'дуга смотрит туда же, куда ведьмак');
    ok(Math.abs((A.a1 - A.a0) / 2 - HALF) <= 0.02,
       'полураствор дуги равен замеренному: ' + ((A.a1 - A.a0) / 2).toFixed(3) + ' против ' + HALF.toFixed(3));
    ok(Math.hypot(A.x - P.x, A.y - P.y) < 0.01, 'дуга построена от ведьмака, а не от произвольной точки');
  }

  // --- рёбра: два луча к концам дуги ---
  const rays = onlyParts(edges, traces).got;
  const tips = rays.filter(t => t.k === 'lineTo');
  ok(rays.length === 4 && tips.length === 2,
     'у границы два ребра (moveTo+lineTo дважды): точек пути ' + rays.length);
  for (const t of tips) {
    const d = Math.hypot(t.x - P.x, t.y - P.y), da = nrm(Math.atan2(t.y - P.y, t.x - P.x) - AIM);
    ok(Math.abs(d - LEN) <= 0.5 && Math.abs(Math.abs(da) - HALF) <= 0.01,
       'ребро упирается ровно в угол зоны: ' + d.toFixed(1) + ' шагов под ' + da.toFixed(3) + ' рад');
  }

  head(S.n + ': стихия живёт внутри границы и заполняет её');
  {
    /* Меряем ВИДИМЫЙ КРАЙ, а не середину частицы. Обещает граница глазу, а
       глаз видит пятно: у искры к её месту добавляется полурадиус кружка, у
       языка — полудлина, у волны — её ход вместе с половиной обводки. Число
       берём у самой рисовалки (p.ext, проставляется в момент рисования) —
       поэтому кадр здесь и рисуется. Сравнивай мерка середины — можно было
       бы раздуть искру до шести шагов, и она полезла бы за дугу молча.

       Угол по-прежнему считаем по серединам, и намеренно: круглая частица у
       самого края конуса всегда торчит наружу на свой радиус, это неизбежно
       и невидимо. За раствор отвечает направление вылета, а не толщина.

       Гоняем знак в разные стороны: у частиц свой снос, и по одному
       направлению боковой вылет не поймать. */
    let worstD = 0, worstA = 0, wdK = '', waK = '', pinned = 0, noExt = 0, waveMax = 0;
    const far = {};                                    // докуда дотягивается каждый род
    for (const AIM2 of [0, 0.9, 1.571, 2.4, 3.1, -0.9, -1.571, -2.4]) {
      const P2 = cast(S.r, AIM2);
      for (let i = 0; i < 150; i++) {                  // 2.4 с — дольше самой долгой частицы
        W.update(0.016);
        W.render();                                    // рисовалка проставляет p.ext
        for (const p of W.getParts()) {
          if (p.t < (p.at || 0)) continue;             // ещё не вышла — её на экране нет
          if (p.edge) continue;                        // сама граница и ЕСТЬ обещание
          if (p.ext === undefined) { noExt++; continue; }
          const d = Math.hypot(p.x - P2.x, p.y - P2.y);
          const vis = d + p.ext;                       // докуда достаёт рисунок
          const da = Math.abs(nrm(Math.atan2(p.y - P2.y, p.x - P2.x) - AIM2));
          const kd = kindOf(p);
          if (vis > worstD) { worstD = vis; wdK = kd; }
          if (vis > (far[kd] || 0)) far[kd] = vis;
          if (p.wave && vis > waveMax) waveMax = vis;
          if (d > 1 && da > worstA) { worstA = da; waK = kd; }
          if (p.rmax && Math.abs(d - p.rmax) < 0.01) pinned++;
        }
      }
    }
    /* Род без клейма прошёл бы мимо мерки с вылетом в ноль — то есть по
       середине, ровно как раньше. Считаем таких и требуем ноль. */
    ok(noExt === 0, 'у каждого нарисованного рода проставлен вылет рисунка: без клейма ' + noExt);
    note('дальше всех видно ' + wdK + ': ' + worstD.toFixed(1) + ' при границе ' + LEN.toFixed(1));
    note('шире всех отклонился ' + waK + ': ' + worstA.toFixed(3) + ' при растворе ' + HALF.toFixed(3));
    note('докуда видно каждый род: ' +
         Object.keys(far).map(k => k + ' ' + far[k].toFixed(1)).join(', '));
    ok(worstD <= LEN + EPS, 'ни одну частицу не видно за границей');
    ok(worstA <= HALF, 'ни одна частица не вышла за раствор');

    if (waveMax > 0) {
      /* Волна — второе прочтение зоны: уходит от ладони и гаснет РОВНО на
         дуге. Не дойди она — толчок выглядел бы короче, чем бьёт, и от него
         отступали бы на шаг там, где отступать не надо. Меряем внешний край
         мазка: он и есть то, что видно. */
      note('дальше всего волну видно на ' + waveMax.toFixed(2) + ' при границе ' + LEN.toFixed(1));
      ok(waveMax >= LEN - 3, 'волна доходит до самой границы, а не гаснет на полпути');
    }

    /* Каждый ЛЕТЯЩИЙ род поодиночке заполняет зону. Одной общей мерки на всех
       мало: искры одни дотягивались бы до дуги и за пламя, а пламя тем временем
       жалось бы к ладони — и Игни выглядел бы пшиком в яркой раме. Дым сюда не
       входит намеренно: он след, а не удар, и держится ближе. */
    for (const kd of ['flame', 'spark', 'dust']) {
      if (far[kd] === undefined) continue;
      ok(far[kd] >= LEN * 0.75,
         'зону заполняет и «' + kd + '»: доходит до ' + far[kd].toFixed(1) +
         ' при трёх четвертях границы ' + (LEN * 0.75).toFixed(1));
    }

    /* Подрезка по rmax — СТРАХОВКА на просадку кадра, а не рабочий ход. Если
       на ровных кадрах частицы упираются в неё, значит их разогнали дальше,
       чем обещает дуга, и они кучей залипают на границе вместо полёта. */
    ok(pinned === 0, 'на ровных кадрах ничто не упирается в подрезку: залипших ' + pinned);

    /* ПРОСЕВШИЙ КАДР — отдельно. Считать «сколько частица успеет за свой срок»
       мало: при dt 0.05 шаг втрое длиннее, и один такой шаг вынес бы искру за
       дугу. Держит это радиальная подрезка (p.rmax в update), и без этого
       прохода её пропажи никто бы не заметил — на ровных кадрах она молчит. */
    let lagD = 0, lagK = '';
    for (const AIM3 of [0, 1.571, 3.1, -1.571]) {
      const P3 = cast(S.r, AIM3);
      for (let i = 0; i < 60; i++) {
        W.update(0.05);
        W.render();
        for (const p of W.getParts()) {
          if (p.t < (p.at || 0) || p.edge || p.ext === undefined) continue;
          const vis = Math.hypot(p.x - P3.x, p.y - P3.y) + p.ext;
          if (vis > lagD) { lagD = vis; lagK = kindOf(p); }
        }
      }
    }
    note('на просевших кадрах (dt 0.05) дальше всех видно ' + lagK + ': ' + lagD.toFixed(1));
    ok(lagD <= LEN + EPS, 'и на просадке кадра ничто не перелетает границу');

    /* А теперь без всякого «повезёт — не повезёт»: разгоняем всё летящее
       ВТРОЕ и смотрим, держит ли граница. Просадка кадра — только один из
       способов вынести частицу за дугу; будущая правка скорости сделает то
       же самое молча. Подрезка обещает: чем бы частицу ни разогнало, за дугу
       она не выйдет. Мерка на случайный разброс такое ловит через раз —
       эта ловит всегда. */
    let fastD = 0, fastK = '';
    for (const AIM4 of [0, 1.571, 3.1, -1.571]) {
      const P4 = cast(S.r, AIM4);
      for (const p of W.getParts()) { if (p.vx || p.vy) { p.vx *= 3; p.vy *= 3; } }
      for (let i = 0; i < 80; i++) {
        W.update(0.016);
        W.render();
        for (const p of W.getParts()) {
          if (p.t < (p.at || 0) || p.edge || p.ext === undefined) continue;
          const vis = Math.hypot(p.x - P4.x, p.y - P4.y) + p.ext;
          if (vis > fastD) { fastD = vis; fastK = kindOf(p); }
        }
      }
    }
    note('разогнанное втрое дальше всех унесло ' + fastK + ': ' + fastD.toFixed(1));
    ok(fastD <= LEN + EPS, 'даже разогнанное втрое остаётся внутри границы — подрезка на месте');
  }

  head(S.n + ': граница ярче стихии, стихия — всегда сквозь');
  {
    /* Мазки делим не по цвету, а ПО ЧАСТИЦАМ: отдельно рисуем кадр с одной
       границей, отдельно — со всем прочим. Цвет знать не нужно вовсе. */
    cast(S.r, 0.4);
    let edgeMax = 0, elemMax = 0, elemWorst = "", worstFrame = null;
    for (let i = 0; i < 60; i++) {
      const cur = W.getParts();
      const e = cur.filter(p => p.edge), rest = cur.filter(p => !p.edge);
      for (const m of onlyParts(e, paintsFull).got) if (m.a > edgeMax) edgeMax = m.a;
      for (const m of onlyParts(rest, paintsFull).got) {
        if (m.a > elemMax) { elemMax = m.a; worstFrame = rest.slice(); }
      }
      W.update(0.016);
    }
    // кто именно оказался самым густым — доискиваемся только на том кадре, где это вышло
    if (worstFrame) {
      const ps = W.getParts(); const all = ps.slice();
      ps.length = 0; for (const p of worstFrame) ps.push(p);
      let best = -1;
      for (const p of worstFrame) {
        for (const m of onlyParts([p], paintsFull).got) if (m.a > best) { best = m.a; elemWorst = kindOf(p); }
      }
      ps.length = 0; for (const p of all) ps.push(p);
    }
    note('самый густой мазок границы: ' + edgeMax.toFixed(3) +
         ', самый густой мазок стихии (' + elemWorst + '): ' + elemMax.toFixed(3));
    ok(edgeMax >= 0.95, 'граница выходит в полную яркость — её видно поверх всего');
    ok(elemMax <= 0.85, 'ничто внутри границы не пишется гуще 0.85 — сквозь стихию видно бой');
    ok(edgeMax > elemMax, 'граница гуще самого густого, что горит внутри неё');
  }
}

head('Глиф под ладонью — общая основа всех знаков');
{
  const lives = [];
  for (const r of [0, 1, 2, 3]) {                      // огонь, удар, щит и ловушка — все четыре
    const P = cast(r, 0.4);
    const g = W.getParts().filter(p => p.glyph);
    ok(g.length === 1, 'знак ' + r + ' зажёг ровно один глиф: ' + g.length);
    if (g.length !== 1) continue;
    const d = Math.hypot(g[0].x - P.x, g[0].y - P.y);
    ok(d <= 20, 'глиф у самой ладони (' + d.toFixed(1) + ' шага), а не посреди поля');
    ok(Math.abs(nrm(Math.atan2(g[0].y - P.y, g[0].x - P.x) - 0.4)) < 0.01, 'глиф вынесен по руке');
    ok(g[0].life > 0 && g[0].life <= 0.2, 'глиф гаснет за мгновение: ' + g[0].life);
    lives.push(g[0].life);
  }
  ok(lives.length === 4 && lives.every(v => v === lives[0]),
     'все четыре знака зажигают ОДИН И ТОТ ЖЕ глиф: у ведьмака одна рука на все знаки');
}

head('Отложенная частица ждёт на месте, а не летит вслепую');
{
  cast(0, 0.4);
  const w = W.getParts().find(p => p.at > 0.06 && (p.vx || p.vy));
  ok(!!w, 'у знака есть частицы с отсрочкой — иначе пламя выходило бы одним пыхом');
  if (w) {
    const x0 = w.x, y0 = w.y;
    W.update(0.03);                                    // меньше отсрочки
    ok(w.x === x0 && w.y === y0, 'пока ждёт — стоит: ' + w.t.toFixed(3) + ' с при отсрочке ' + w.at.toFixed(3));
    while (w.t < w.at + 0.1) W.update(0.016);
    ok(Math.hypot(w.x - x0, w.y - y0) > 1, 'дождалась своего часа — полетела');
  }
}

/* =====================  КВЕН И ИРДЕН  =====================

   Эти два знака рисуются НЕ частицами, а прямо от состояния: P.quen и
   P.yrden. Ни одной частицы они не тратят (кроме общего глифа под ладонью),
   значит потолка не касаются и вырезать их из кадра диффом не нужно —
   обе рисовалки выставлены наружу, зовём поштучно.

   Меряется здесь другое, чем у Игни с Аардом. У Квена зоны нет вовсе: он
   про поглощение урона, и обещание у него одно — «по куполу видно, сколько
   щит ещё держит, и купол не закрывает самого ведьмака». У Ирдена зона
   настоящая (замедление), и её граница обязана совпасть с нарисованным
   ободом — ровно как у конусов огня и удара. */

/* Ближайшая к точке (0,0) точка ОТРЕЗКА. Мерить одни концы мало: грань
   купола — это ХОРДА, и к середине она подходит своей серединой, а не
   вершинами. Ровно на этом попалась предыдущая задача: запас до границы
   считали по середине частицы, а съедал его нарисованный размер. */
/* НАСТОЯЩАЯ густота мазка. Прозрачность в игре живёт в двух разных местах:
   у обода и рун — в globalAlpha, а у паутины и разрядов она вписана прямо
   в краску (`rgba(196,150,255,.44)`), и globalAlpha при этом единица.
   Спрашивать одно globalAlpha значит считать нить в 0.44 такой же густой,
   как обод, — мерка называлась бы громче, чем меряет. Перемножаем. */
function ink(m) {
  const g = m.a === undefined ? 1 : m.a;
  const rgba = /^rgba?\(([^)]*)\)/.exec(m.c);
  if (!rgba) return g;                                 // '#c496ff' и прочие непрозрачные
  const parts = rgba[1].split(',');
  return g * (parts.length > 3 ? parseFloat(parts[3]) : 1);
}

function segNear(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t, ay + dy * t);
}

head('Квен копит трещины, но не бесконечно');
{
  const P = cast(2, 0.4);
  ok(P.quen > 0, 'щит поставлен');
  ok(Array.isArray(P.quenHits) && P.quenHits.length === 0, 'у свежего щита трещин нет');

  /* hurtPlayer ПЕРВОЙ строкой отбрасывает удар, если ведьмак в неуязвимости
     или в уклонении, а после попадания неуязвимость включается сама. Без
     сброса двенадцать ударов стали бы одним, и мерка проверила бы пустоту. */
  const seen = [];
  let first = null;
  for (let i = 0; i < 12; i++) {
    P.quen = 500; P.inv = 0; P.dodge = 0;
    W.hurtPlayer(5, null);
    if (i === 0) first = P.quenHits[0];
    seen.push(P.quenHits.length);
  }
  note('трещин после каждого из двенадцати ударов: ' + seen.join(' '));
  ok(seen[0] === 1 && seen[1] === 2 && seen[2] === 3, 'каждый удар оставляет ровно одну трещину');
  /* Потолок меряем ПОВЕДЕНИЕМ, а не сверкой с той же константой: счёт
     перестал расти, хотя удары продолжались. «length <= QUEN_CRACKS» не
     упало бы никогда, сколько бы трещин ни насыпали. */
  ok(seen[11] === seen[10] && seen[11] < 12,
     'счёт упёрся в потолок: ' + seen[11] + ' трещин при двенадцати ударах');
  ok(seen[11] >= 3, 'но потолок не в одну-две: по трещинам должно быть видно, сколько щит уже съел');
  ok(P.quenHits[0] === first, 'первая трещина никуда не делась — трещины копятся, а не сменяют друг друга');
  ok(P.quenHits.every(h => h.a >= 0 && h.a < 6.284), 'у каждой трещины свой угол по ободу');
  ok(new Set(P.quenHits.map(h => h.a)).size === P.quenHits.length, 'углы разные — трещины не в одной точке');

  const n = P.quenHits.length;
  P.quen = 0; P.inv = 0; P.dodge = 0;
  W.hurtPlayer(5, null);
  ok(P.quenHits.length === n, 'без щита удар трещин не оставляет — трещина значит «щит принял»');

  P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.castRune(2);
  ok(P.quenHits.length === 0, 'новый щит — целое стекло');

  P.quenHits = [{ a: 1 }, { a: 3 }];
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'треснувший щит рисуется');
  ok(nans(() => W.drawQuenDome(0, 0)).length === 0, 'и ни одной координаты купола не ушло в NaN');
}

head('Купол Квена — гранёный, а не круг');
{
  const P = cast(2, 0.4);
  P.quenHits = [];
  const t = traces(() => W.drawQuenDome(0, 0));
  const mv = t.filter(e => e.k === 'moveTo'), ln = t.filter(e => e.k === 'lineTo');
  ok(mv.length === ln.length && mv.length + ln.length === t.length && mv.length >= 6,
     'купол собран из отрезков: граней ' + mv.length);

  const rs = t.map(e => Math.hypot(e.x, e.y));
  const spread = Math.max.apply(null, rs) - Math.min.apply(null, rs);
  note('обод купола: ' + Math.max.apply(null, rs).toFixed(2) + ' шага');
  ok(spread < 0.01, 'все вершины лежат на одном ободе: разброс ' + spread.toFixed(4));

  let gap = 0;                                         // грани обязаны сомкнуться
  for (let i = 0; i < ln.length; i++) {
    const nx = mv[(i + 1) % mv.length];
    gap = Math.max(gap, Math.hypot(ln[i].x - nx.x, ln[i].y - nx.y));
  }
  ok(gap < 1e-9, 'грани смыкаются в замкнутый купол без щербин: наибольший разрыв ' + gap.toExponential(2));

  const A = arcs(() => W.drawQuenDome(0, 0));
  const round = A.filter(a => a.k === 'stroke');
  ok(round.length === 0, 'обведённого круга у купола нет вовсе — обводок дугой ' + round.length);

  /* Волна света по граням: у каждой свой сдвиг фазы. Постоянная краска
     означала бы мёртвый купол — и это ровно то, что было у кольца. */
  const cols = new Set(paints(() => W.drawQuenDome(0, 0)).filter(c => c.indexOf('rgba(150,225,255') === 0));
  ok(cols.size >= 3, 'грани горят по-разному — по куполу бежит волна: разных красок ' + cols.size);
}

head('Купол вращается, а не стоит истуканом');
{
  cast(2, 0.4);
  const a0 = traces(() => W.drawQuenDome(0, 0))[0];
  const a0b = traces(() => W.drawQuenDome(0, 0))[0];
  ok(Math.hypot(a0.x - a0b.x, a0.y - a0b.y) < 1e-9, 'в одном и том же кадре купол стоит смирно');
  W.update(0.25);
  const a1 = traces(() => W.drawQuenDome(0, 0))[0];
  const turn = Math.abs(nrm(Math.atan2(a1.y, a1.x) - Math.atan2(a0.y, a0.x)));
  note('за четверть секунды купол повернулся на ' + turn.toFixed(3) + ' рад');
  ok(turn > 0.02, 'со временем купол поворачивается');
}

head('Купол не закрывает ведьмака');
{
  /* PAWN_R — это обещание игры о том, какой след занимает пешка: по нему
     зеркало вписывает фигуру в рамку. Сперва убеждаемся, что обещание не
     врёт, и только потом им меряем — иначе «купол снаружи PAWN_R» держалось
     бы на числе, которого никто не проверял.

     Меряем ВСЁ, что пешка рисует: точки пути, скруглённые углы плаща
     (rrect → arcTo) и круги с овалами вместе с их радиусом. Обвязку ради
     этого научили писать arcTo и ellipse — без них пешка мерилась бы без
     плаща, тени и наплечников. */
  let pawnMax = 0, worst = '';
  /* Состояния берём с ЗАПАСОМ на всё, что фигура вообще умеет показать:
     доспех, мутацию обеих ступеней, замах в обе стороны и ободок зелья.
     Каждое из них добавляет свои мазки, и любой из них может однажды
     вылезти за след — а купол стоит вплотную к нему. */
  const sts = [
    {}, { walk: 1.4 },
    { armor: 'heavy', steel: true, silver: true, xbow: true, mut: true, mut2: true, walk: 1.4, look: W.LOOK_DEF },
    { armor: 'light', steel: true, silver: true, xbow: true, walk: 3.1, look: W.LOOK_DEF },
    { armor: 'bear', steel: true, silver: true, swing: -1, walk: 1.4, look: W.LOOK_DEF },
    { armor: 'bear', steel: true, silver: true, swing: 1, walk: 1.4, look: W.LOOK_DEF },
    { armor: 'bear', potion: W.POTIONS.swallow.c, walk: 1.4, look: W.LOOK_DEF },
    { armor: 'bear', potion: W.POTIONS.thunder.c, mut: true, mut2: true, walk: 1.4, look: W.LOOK_DEF },
  ];
  for (const h in W.HAIRS) {
    sts.push({ armor: 'heavy', walk: 1.4,
               look: Object.assign({}, W.LOOK_DEF, { hair: h, beard: 'full', scar: 'eye' }) });
  }
  for (const st of sts) {
    for (const e of traces(() => W.drawPawn(0, 0, 0, st))) {
      const d = Math.hypot(e.x, e.y); if (d > pawnMax) { pawnMax = d; worst = e.k; }
    }
    for (const a of arcs(() => W.drawPawn(0, 0, 0, st))) {
      const d = Math.hypot(a.x, a.y) + a.r; if (d > pawnMax) { pawnMax = d; worst = a.oval ? 'овал' : 'круг'; }
    }
  }
  note('дальше всего пешка рисует в ' + pawnMax.toFixed(2) + ' шага (' + worst + ') при PAWN_R ' + W.PAWN_R);
  ok(pawnMax > 0, 'след пешки вообще замерился — рисовалка что-то чертит');
  ok(pawnMax <= W.PAWN_R, 'PAWN_R не врёт: вся пешка укладывается в свой след');

  const P = cast(2, 0.4);
  P.quenHits = [{ a: 0.3 }, { a: 2.0 }, { a: 3.14 }, { a: 4.4 }, { a: 5.9 }];
  const t = traces(() => W.drawQuenDome(0, 0));
  let near = Infinity, far = 0;
  for (let i = 0; i + 1 < t.length; i += 2) {
    near = Math.min(near, segNear(t[i].x, t[i].y, t[i + 1].x, t[i + 1].y));
    far = Math.max(far, Math.hypot(t[i].x, t[i].y), Math.hypot(t[i + 1].x, t[i + 1].y));
  }
  note('купол занимает кольцо от ' + near.toFixed(2) + ' до ' + far.toFixed(2) + ' шага');
  ok(near >= W.PAWN_R,
     'ни один мазок купола — ни грань, ни трещина — не залезает на фигуру: ближе всего ' +
     near.toFixed(2) + ' при следе пешки ' + W.PAWN_R);

  // стекло внутри — сквозное, потому бой через щит и видно
  const fills = arcs(() => W.drawQuenDome(0, 0)).filter(a => a.k === 'fill');
  ok(fills.length === 1, 'стекло у купола одно: заливок ' + fills.length);
  ok(fills[0] && fills[0].al <= 0.2, 'и оно почти прозрачно: густота ' + (fills[0] ? fills[0].al : '—'));

  /* И самое прямое: в готовом кадре купол ложится РАНЬШЕ пешки — значит
     физически не может её закрыть, чем бы его ни раздули. Пешку узнаём по
     глазам: кошачий жёлтый больше нигде в кадре не встречается, и это
     здесь же проверяется. */
  cast(2, 0.4);
  const seq = paints(() => W.render());
  const eye = W.EYES.cat.c;
  const eyes = [];
  const dome = [];
  seq.forEach((c, i) => {
    if (c === eye) eyes.push(i);
    if (c.indexOf('rgba(150,225,255') === 0) dome.push(i);
  });
  ok(eyes.length === 2, 'глаза пешки в кадре нашлись и только они: мазков цвета ' + eye + ' — ' + eyes.length);
  ok(dome.length >= 6, 'грани купола в том же кадре нашлись: ' + dome.length);
  ok(dome.length > 0 && eyes.length > 0 && Math.max.apply(null, dome) < Math.min.apply(null, eyes),
     'купол нарисован ДО пешки: последняя грань мазком № ' + Math.max.apply(null, dome) +
     ', глаза — № ' + Math.min.apply(null, eyes));
}

head('Трещина показывает, ОТКУДА прилетело');
{
  /* Это не украшение, а сведения игроку: трещины кучкой с одного боку
     значат «оттуда и лезут». Меряем сквозь всё — от твари, которая ударила,
     до угла нарисованного луча. Случайный угол такую мерку не пройдёт. */
  const P = cast(2, 0.4);
  W.setFoes([]);
  for (const want of [0, 1.9, -2.6]) {
    P.quenHits = []; P.quen = 500; P.inv = 0; P.dodge = 0;
    W.setFoes([]);
    W.spawnFoe('drowner', P.x + Math.cos(want) * 60, P.y + Math.sin(want) * 60);
    const f = W.getFoes()[0];
    const real = Math.atan2(f.y - P.y, f.x - P.x);     // где тварь ОКАЗАЛАСЬ, а не где заказана
    W.hurtPlayer(5, f);
    const got = P.quenHits.length === 1 ? P.quenHits[0].a : null;
    ok(got !== null && Math.abs(nrm(got - real)) < 0.01,
       'удар с ' + real.toFixed(2) + ' рад оставил трещину на ' +
       (got === null ? 'ничего' : got.toFixed(2)) + ' рад');
    /* И на КУПОЛЕ трещина оказалась там же — сведения доходят до глаза, а
       не оседают в состоянии. Веер расходится на ±0.34 рад от места удара,
       поэтому спрашиваем: все ли его точки лежат в этом секторе. */
    const t = traces(() => W.drawQuenDome(0, 0));
    let wide = 0, cnt = 0;
    for (const e of t.slice(16)) {                     // первые 16 точек — восемь граней
      cnt++;
      if (Math.abs(nrm(Math.atan2(e.y, e.x) - real)) > 0.4) wide++;
    }
    ok(cnt > 0 && wide === 0,
       'и весь нарисованный веер лежит с той же стороны: точек ' + cnt + ', мимо ' + wide);
  }

  /* Откат. Болт прилетает без обидчика вовсе (game.js: hurtPlayer(s.dmg, null)),
     и трещина всё равно обязана появиться — иначе щит, съевший стрелу,
     выглядел бы нетронутым. */
  P.quenHits = []; P.quen = 500; P.inv = 0; P.dodge = 0;
  W.hurtPlayer(5, null);
  ok(P.quenHits.length === 1, 'удар без обидчика (болт, яд) трещину всё равно оставляет');
  ok(P.quenHits.length === 1 && isFinite(P.quenHits[0].a),
     'и угол у неё числовой: ' + (P.quenHits[0] || {}).a);
  ok(nans(() => W.drawQuenDome(0, 0)).length === 0, 'такая трещина рисуется без NaN');
}

head('Трещины сидят там, куда прилетело');
{
  const P = cast(2, 0.4);
  P.quenHits = [];
  const clean = traces(() => W.drawQuenDome(0, 0));
  const rimR = Math.hypot(clean[0].x, clean[0].y);     // обод меряем, а не спрашиваем

  P.quenHits = [{ a: 1.0 }];
  const one = traces(() => W.drawQuenDome(0, 0));
  const rays = (one.length - clean.length) / 2;
  ok(rays >= 3, 'трещина — веер, а не одна чёрточка: лучей ' + rays);

  const starts = one.slice(clean.length).filter(e => e.k === 'moveTo');
  let bad = 0;
  for (const s of starts) {
    if (Math.abs(nrm(Math.atan2(s.y, s.x) - 1.0)) > 0.01) bad++;
    else if (Math.abs(Math.hypot(s.x, s.y) - rimR) > 0.01) bad++;
  }
  ok(starts.length === rays && bad === 0,
     'все лучи выходят из одной точки обода — с того самого угла удара: не оттуда ' + bad);

  const a = traces(() => W.drawQuenDome(0, 0)).slice(clean.length);
  W.update(0.2);
  const b = traces(() => W.drawQuenDome(0, 0)).slice(clean.length);
  ok(JSON.stringify(a) === JSON.stringify(b),
     'трещина стоит на месте и через кадр — это след удара, а не рябь');

  P.quenHits = [{ a: 0.2 }, { a: 2.2 }, { a: 4.2 }];
  const three = traces(() => W.drawQuenDome(0, 0));
  ok(three.length - clean.length === rays * 2 * 3,
     'сколько трещин в состоянии — столько и на куполе: лучей ' + ((three.length - clean.length) / 2));
}

/* ---- ИРДЕН ----------------------------------------------------------
   Ловушку ставим сами и сами же меряем её зону поведением: тварь на
   известном расстоянии от СЕРЕДИНЫ ПЕЧАТИ — вязнет или нет. Тварь
   пришпиливаем оглушением: замедление от Ирдена считается в stepFoe ДО
   строки «оглушённая — стоит и выходит», поэтому пришпиленная тварь
   вязнет как обычная и при этом никуда не уползает. */
function seal() {
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.face = 0; P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.setMouse(-100, -100);                              // курсор вне поля: ловушка ляжет перед собой
  W.syncCam(); W.setFoes([]);
  W.render();                                          // прогрев: первый кадр печёт землю
  W.castRune(3);
  return P.yrden;
}
function caught(d) {
  const Y = seal();
  W.spawnFoe('drowner', Y.x + d, Y.y);
  const f = W.getFoes()[0];
  f.stun = 5; f.slow = 0; f.hp = 100000;
  const real = Math.hypot(f.x - Y.x, f.y - Y.y);
  if (Math.abs(real - d) > 1) note('тварь сдвинулась при рождении: заказано ' + d + ', вышло ' + real.toFixed(1));
  W.update(0.016);
  return { slowed: f.slow > 0, Y, f };
}
// Сколько разрядов бьёт из середины печати: у каждого свой moveTo в самой середине.
function sparks(Y) {
  return traces(() => W.drawYrdenSeal(Y))
    .filter(e => e.k === 'moveTo' && Math.hypot(e.x - Y.x, e.y - Y.y) < 0.01).length;
}

/* Радиус зоны нащупываем ОДИН РАЗ и держим для всех мерок печати: и для
   обода, и для проб вплотную к границе. Вбить сюда 58 руками значило бы,
   что при поехавшем радиусе обе пробы окажутся по одну его сторону и
   мерка станет пустой, ничего не заметив. */
const SEAL_R = (() => {
  let lo = 5, hi = 300;                                // 5 — заведомо вяжет, 300 — заведомо нет
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (caught(m).slowed) lo = m; else hi = m; }
  return (lo + hi) / 2;
})();

head('Ирден: нарисованный обод и есть граница замедления');
{
  const R = SEAL_R;
  note('замерено поведением: печать вяжет тварь до ' + R.toFixed(3) + ' шага от своей середины');

  const Y = seal();
  const A = arcs(() => W.drawYrdenSeal(Y));
  const strokes = A.filter(a => a.k === 'stroke');
  const rim = strokes.slice().sort((x, y) => y.w - x.w)[0];
  ok(!!rim, 'обод у печати вообще обведён');
  note('обод: радиус ' + rim.r.toFixed(2) + ', толщина ' + rim.w + ', густота ' + rim.al.toFixed(2));
  ok(Math.abs(rim.r - R) <= 0.5,
     'обод нарисован ровно по границе: ' + rim.r.toFixed(2) + ' против замеренных ' + R.toFixed(2));
  ok(Math.abs(rim.x - Y.x) < 0.01 && Math.abs(rim.y - Y.y) < 0.01,
     'печать лежит там, где ловушка, а не под ведьмаком');

  /* Обод — ГРАНИЦА, и это должно быть видно с одного взгляда: он самый
     толстый мазок печати и единственный в полную густоту.

     «Единственный» спрашиваем НЕ У ДУГ, а у всего, чем печать вообще
     мажет по холсту. Перебирать одни дуги здесь значило бы не заметить
     ни восьми меток по ободу, ни надписей, если они когда-нибудь вернутся. */
  const rest = strokes.filter(a => a !== rim);
  ok(rest.every(a => a.w < rim.w), 'обод — самый толстый мазок печати');
  ok(rim.al >= 0.99, 'обод идёт в полную густоту: ' + rim.al.toFixed(2));
  const all = paintsFull(() => W.drawYrdenSeal(Y));
  const loud = all.filter(m => ink(m) >= 0.99);
  note('чем печать мажет: ' + all.length + ' мазков; самые густые — ' +
       all.slice().sort((x, y) => ink(y) - ink(x)).slice(0, 4)
          .map(m => m.k + ' ' + m.c + ' → ' + ink(m).toFixed(2)).join(', '));
  ok(loud.length === 1 && loud[0].k === 'stroke' && loud[0].c === '#c496ff',
     'в полную густоту на печати идёт ТОЛЬКО обод — ни нить, ни волна, ни метка с ним не спорят');
  /* И ни единой НАДПИСИ: печать рисуется отрезками, а не знаками. Знак
     потребовал бы шрифта, которого в системе может не оказаться, — а на
     границе зоны вместо метки встал бы прямоугольник. */
  ok(all.every(m => m.k !== 'text'), 'на печати нет ни одной надписи — только рисованное');
  ok(strokes.filter(a => Math.abs(a.r - R) < 0.5).length === 1,
     'по самой границе проведён ровно один мазок: обод один, двоиться ему нельзя');

  /* Внутри обода — нити и метки. Между ними и ободом должен остаться
     ПОЯСОК: иначе глаз перестанет отличать «край ловушки» от «ещё одна
     чёрточка». Мерить «меньше R» мало — нить, дотянувшаяся ровно до обода,
     прошла бы такую мерку на последнем знаке после запятой.

     Раньше эта мерка НЕ ВИДЕЛА рун: их писали через fillText, а сюда идут
     точки пути. Метки — отрезки, и теперь они в счёте наравне с нитями,
     то есть поясок стережётся целиком, а не наполовину. */
  let webMax = 0, webMin = Infinity;
  for (const e of traces(() => W.drawYrdenSeal(Y))) {
    const d = Math.hypot(e.x - Y.x, e.y - Y.y);
    webMax = Math.max(webMax, d); webMin = Math.min(webMin, d);
  }
  note('нити и метки занимают от ' + webMin.toFixed(1) + ' до ' + webMax.toFixed(1) +
       ' при границе ' + R.toFixed(1) + ', поясок до обода ' + (R - webMax).toFixed(1));
  ok(R - webMax >= R * 0.1, 'между рисунком печати и ободом есть поясок — граница не тонет в нём');
  ok(webMax > R * 0.6, 'но и не жмётся к середине: печать заполнена, а не пуста');

  // волна: раз в секунду проходит от середины к ободу и за него не выходит
  let pMax = 0, pMin = Infinity;
  for (let i = 0; i < 90; i++) {                       // 1.44 с — дольше одного круга волны
    W.update(0.016);
    const p = arcs(() => W.drawYrdenSeal(Y)).find(x => x.k === 'stroke' && Math.abs(x.r - R) > 0.01);
    if (p) { pMax = Math.max(pMax, p.r); pMin = Math.min(pMin, p.r); }
  }
  note('волна ходит от ' + pMin.toFixed(1) + ' до ' + pMax.toFixed(1) + ' при границе ' + R.toFixed(1));
  ok(pMax <= R + 0.01, 'волна не выходит за обод');
  ok(pMax > R * 0.8 && pMin < R * 0.25, 'волна проходит печать всю — от середины до края');
}

/* Прежняя мерка на этом месте называлась «все восемь рун написаны», а мерила
   ОДНУ: обвязка не моделирует ctx.rotate, и все восемь надписей ложились у
   неё в одну и ту же точку. Метки считаются в мировых осях, поэтому теперь
   меряется каждая — и что их восемь, и что они разведены по кругу, и что ни
   одна не залезла на обод. */
head('Метки идут по ободу печати и не спорят с ним');
{
  const Y = seal();
  const R = SEAL_R;
  /* Нити паутины отличаем от штрихов метки ДЛИНОЙ: нить перекидывается через
     печать (её концы разведены по углу нарочно несоизмеримыми шагами), штрих
     метки — короткая насечка вдоль радиуса. Порог берём от самого радиуса, а
     не числом: поедет зона — поедет и он. */
  const t = traces(() => W.drawYrdenSeal(Y));
  const segs = [];
  for (let i = 0; i + 1 < t.length; i += 2) {
    const a = t[i], b = t[i + 1];
    segs.push({ len: Math.hypot(b.x - a.x, b.y - a.y),
                r0: Math.hypot(a.x - Y.x, a.y - Y.y), r1: Math.hypot(b.x - Y.x, b.y - Y.y),
                ang: Math.atan2((a.y + b.y) / 2 - Y.y, (a.x + b.x) / 2 - Y.x) });
  }
  const nicks = segs.filter(s => s.len < R * 0.2);
  note('штрихов-насечек ' + nicks.length + ' из ' + segs.length + ' отрезков печати');
  ok(nicks.length === W.YRDEN_MARKS * W.YRDEN_NICKS,
     'меток ' + W.YRDEN_MARKS + ' по ' + W.YRDEN_NICKS + ' штриха — всего ' +
     (W.YRDEN_MARKS * W.YRDEN_NICKS) + ', нашлось ' + nicks.length);
  /* Само ЧИСЛО меток мерке не подчиняется: спросить «их восемь?» у той же
     восьмёрки — тавтология, такая мерка не упадёт никогда. Зато стеречь
     можно рамки замысла: венец из трёх меток — редкий частокол, из сорока —
     каша по ободу, и то и другое перестаёт читаться печатью. */
  ok(W.YRDEN_MARKS >= 6 && W.YRDEN_MARKS <= 12,
     'меток по ободу столько, чтобы венец читался венцом: ' + W.YRDEN_MARKS);
  ok(W.YRDEN_NICKS >= 3 && W.YRDEN_NICKS <= 4,
     'и в каждой по три-четыре штриха: ' + W.YRDEN_NICKS);

  /* Разведены ли они по кругу — считаем сами: сколько кучек получится, если
     сгребать штрихи, отстоящие друг от друга меньше чем на полшага между
     метками. Кучек обязано выйти ровно столько, сколько меток. */
  const step = Math.PI * 2 / W.YRDEN_MARKS;
  const angs = nicks.map(s => ((s.ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  let heaps = angs.length ? 1 : 0;
  for (let i = 1; i < angs.length; i++) if (angs[i] - angs[i - 1] > step / 2) heaps++;
  if (angs.length > 1 && (angs[0] + Math.PI * 2) - angs[angs.length - 1] <= step / 2) heaps--;
  ok(heaps === W.YRDEN_MARKS,
     'метки разведены по кругу, а не свалены в кучу: кучек ' + heaps + ' при ' + W.YRDEN_MARKS + ' метках');

  const rMax = Math.max.apply(null, nicks.map(s => Math.max(s.r0, s.r1)));
  const rMin = Math.min.apply(null, nicks.map(s => Math.min(s.r0, s.r1)));
  note('метки стоят в ' + rMin.toFixed(1) + '–' + rMax.toFixed(1) + ' шага от середины при границе ' + R.toFixed(1));
  ok(rMax < R, 'ни один штрих не выходит за обод — граница остаётся крайней');
  ok(rMin > R * 0.75, 'и не сползают внутрь печати: метки — насечки на ободе, а не вторая паутина');

  // средний штрих длиннее крайних — иначе это пунктир, а не насечка
  const lens = nicks.map(s => +s.len.toFixed(6));
  const uniq = Array.from(new Set(lens)).sort((a, b) => b - a);
  note('длины штрихов: ' + uniq.map(v => v.toFixed(2)).join(', '));
  ok(uniq.length >= 2 && lens.filter(v => v === uniq[0]).length === W.YRDEN_MARKS,
     'в каждой метке ровно один штрих длиннее прочих — это насечка, а не пунктир');

  // и вполсилы: метка украшает обод, а не спорит с ним
  const marks = paintsFull(() => W.drawYrdenSeal(Y)).filter(m => m.c === 'rgba(224,200,255,.55)');
  ok(marks.length === W.YRDEN_MARKS, 'метки мажут своей краской: мазков ' + marks.length);
  ok(marks.every(m => ink(m) < 0.99), 'и идут вполсилы: ' + (marks[0] ? ink(marks[0]).toFixed(2) : '—'));
  // толщину не вбиваем руками, а снимаем с обоих мазков и сравниваем
  const nickW = marks.length ? marks[0].w : Infinity;
  const rimW = arcs(() => W.drawYrdenSeal(Y)).filter(a => a.k === 'stroke')
    .slice().sort((x, y) => y.w - x.w)[0];
  ok(!!rimW && nickW < rimW.w, 'штрих тоньше обода: ' + nickW + ' против ' + (rimW ? rimW.w : '—'));

  /* И метки едут ВМЕСТЕ с печатью: они её часть, а не наклейка на экране.
     Без этого венец мог бы стоять неподвижно, пока крутится всё остальное. */
  const angsAt = () => traces(() => W.drawYrdenSeal(Y))
    .filter((e, i) => i % 2 === 0)
    .map(e => Math.atan2(e.y - Y.y, e.x - Y.x));
  const before = angsAt();
  W.update(0.4);
  const after = angsAt();
  const moved = before.filter((a, i) => Math.abs(a - after[i]) > 1e-6).length;
  ok(moved === before.length, 'печать повернулась целиком: сдвинулось ' + moved + ' из ' + before.length);
}

head('Разряды идут только к тем, кого печать держит');
{
  const Y = seal();
  W.setFoes([]);
  ok(sparks(Y) === 0, 'без тварей от середины печати не идёт ни один разряд');

  W.spawnFoe('drowner', Y.x + Y.r * 0.5, Y.y);
  const n1 = sparks(Y);
  ok(n1 > 0, 'к пойманной твари разряды идут: ' + n1);
  ok(n1 <= 3, 'но не столько, чтобы печать превратилась в кашу из линий: ' + n1);

  W.spawnFoe('drowner', Y.x + Y.r * 0.7, Y.y - Y.r * 0.3);
  ok(sparks(Y) === n1 * 2, 'вторая пойманная — вдвое разрядов: ' + sparks(Y));

  /* Главное: разряд и замедление обязаны совпадать ВПЛОТНУЮ к границе.
     Иначе нашёлся бы поясок, где тварь вязнет без единого разряда или
     искрит на воле, — и обод перестал бы значить то, что обещает. */
  for (const k of [-3, 3]) {
    const d = SEAL_R + k;                              // ЗАМЕРЕННЫЙ радиус, а не вбитый рукой:
    const c = caught(d);                               // иначе обе пробы уедут по одну сторону
    const lit = sparks(c.Y) > 0;                       // границы, и мерка замолчит навсегда
    ok(c.slowed === lit,
       'на ' + d.toFixed(1) + ' шага от середины: вязнет — ' + c.slowed +
       ', искрит — ' + lit + ' (одно и то же)');
  }
  ok(caught(SEAL_R - 3).slowed && !caught(SEAL_R + 3).slowed,
     'и обе пробы легли по РАЗНЫЕ стороны границы — иначе они не сравнивали бы ничего');
}

done();
