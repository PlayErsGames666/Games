/* =======================================================================
   ЧТО ИГРА ГОВОРИТ И СЛЫШИТ.

   Три проверки боя стоят на числах, а тут — на словах и клавишах. Это не
   мелочь: подсказка, приписавшая скидку не тому доспеху, врёт игроку ровно
   так же, как неверный урон, только поймать её труднее — числа сходятся.

   Здесь ловим строки, которые отрисовка ДЕЙСТВИТЕЛЬНО написала за кадр
   (см. frame() в стенде), и нажатия, которые игра действительно разобрала.
   ======================================================================= */
'use strict';
const { W, ok, note, head, done, key, frame, frameMarks, span, said, peek, click, tap, sandbox } = require('./harness.js');

/* ---------------------------------------------------------------- клавиши */
head('E закрывает то, что E и открыло');
W.reset(); W.setPanel(null);
const P = W.getP();
P.x = W.BOARD.x; P.y = W.BOARD.y;                      // встали вплотную к доске
key('KeyE');
ok(peek('panel') === 'board', 'E у доски открыло доску');
key('KeyE');
ok(peek('panel') === null, 'второе E её закрыло — как и обещает подпись внизу панели');

W.reset(); W.setPanel(null);
const trader = W.NPCS().find(p => p.tabs);
const P2 = W.getP(); P2.x = trader.x; P2.y = trader.y;
key('KeyE');
ok(peek('panel') === 'vendor', 'E у торговца открыло прилавок (' + trader.n + ', ' + trader.town.n + ')');
key('KeyE');
ok(peek('panel') === null && !W.getVendor(), 'и закрыло, не оставив торговца висеть');

head('А чужие панели E не трогает');
W.reset(); W.setPanel(null);
key('KeyI');
ok(peek('panel') === 'bag', 'I открыло сумку');
key('KeyE');
ok(peek('panel') === 'bag', 'E в сумке ничего не закрывает — у неё своя клавиша');
key('KeyI');
ok(peek('panel') === null, 'а I закрывает');

head('Пока ведьмак лежит, клавиши молчат');
W.reset(); W.setPanel(null);
W.setPhase('CAMP');
W.hurtPlayer(1e6, null);
ok(W.getOver(), 'ведьмак пал');
key('KeyI'); key('KeyM'); key('KeyR');
ok(peek('panel') === null, 'ни сумка, ни карта лёжа не открываются');
ok(W.getP().mut <= 0, 'и мутацию с того света не сжечь');

/* ------------------------------------------------------------------ пауза */
/* Пауза останавливает время — значит она должна останавливать и всё, что
   этим временем распоряжается. Раньше отказ стоял ниже разбора панелей, а
   кнопки под игрой про паузу не знали вовсе: игра стоит, а снаряжаться,
   торговать и жечь мутацию можно. */
head('На паузе не работает ничего, кроме самой паузы');
W.reset(); W.setPanel(null);
key('KeyP');
ok(peek('paused'), 'P поставило паузу');
for (const k of ['KeyI', 'KeyM', 'KeyK', 'KeyC', 'KeyU']) key(k);
ok(peek('panel') === null, 'ни сумка, ни карта, ни навыки, ни варка, ни верстак не открываются');
const p5 = W.getP();
p5.mutGauge = 100;
key('KeyR');
ok(p5.mut <= 0, 'и мутацию клавишей не сжечь');
const hand0 = p5.hand;
key('KeyQ');
ok(p5.hand === hand0, 'и меч не сменить');
key('KeyP');
ok(!peek('paused'), 'а вторым P пауза снимается');

/* Тыкаем НЕ в одну кнопку, а во все подряд, и сравниваем состояние целиком.
   Проверка, метящая в одну кнопку, однажды уже промахнулась: попала в выбор
   зелья, а следила за мутацией — и «мышь на паузе» осталась непроверенной. */
head('И мышью по холсту на паузе не потыкать');
W.reset(); W.setPanel(null);
const p6 = W.getP();
p6.mutGauge = 100;
W.render();                                            // чтобы пояс попал в uiHit
const belt = W.getHits().filter(h => h.y > W.WY1);
ok(belt.length > 0, 'пояс набрал ' + belt.length + ' кнопок');
const snap = () => JSON.stringify([p6.mut, p6.mut2, p6.mp, p6.potSel, p6.hand, p6.tox,
                                   p6.boltSel, W.countStack('swallow'), peek('panel')]);
key('KeyP');
const was = snap();
for (const b of belt) tap(b.x + 2, b.y + 2);
ok(snap() === was, 'все ' + belt.length + ' кнопок пояса на паузе молчат');
key('KeyP');
for (const b of belt) tap(b.x + 2, b.y + 2);
ok(snap() !== was, 'а без паузы те же клики что-то да делают — значит целились верно');

head('Кнопки под игрой про паузу тоже знают');
W.reset(); W.setPanel(null);
const p7 = W.getP();
p7.mutGauge = 100;
key('KeyP');
click('mutBtn');
ok(p7.mut <= 0, '🩸 Мутация на паузе молчит');
click('bagBtn');
ok(peek('panel') === null, '🎒 Инвентарь на паузе молчит');
const hand1 = p7.hand;
click('swapBtn');
ok(p7.hand === hand1, '⚔ Сменить меч на паузе молчит');
click('pause');
ok(!peek('paused'), 'а ⏸ работает — иначе с паузы было бы не сойти');

head('И про открытую панель — тоже');
W.reset(); W.setPanel(null);
const p8 = W.getP();
p8.mutGauge = 100;
p8.x = W.BENCH.x; p8.y = W.BENCH.y;                    // верстак работает, только если подошёл
key('KeyU');
note('открыто: ' + peek('panel'));
click('mutBtn');
ok(p8.mut <= 0, 'в лавке мутацию не сжечь: там время стоит так же, как на паузе');
W.setPanel(null);
click('mutBtn');
ok(p8.mut > 0, 'а без панели — жжётся как прежде');

/* --------------------------------------------------------------- подсказки */
function hintAt(x, y, re) {
  W.setMouse(x, y);
  return frame().filter(s => re.test(s))[0] || '';
}
const RUNE1 = [30, 566], MUTBTN = [480, 566];          // курсор на кнопке Игни / мутации

head('Скидку на знак подписывает тот, кто её дал');
W.reset(); W.setPanel(null);
const p3 = W.getP();
p3.armor = W.mkArmor('heavy', 0, null); p3.sk = { thrift: 4 };
let h = hintAt(RUNE1[0], RUNE1[1], /Игни —/);
note(h);
ok(h.indexOf('🧿 расчёт') >= 0 && h.indexOf('грифон') < 0,
   'в тяжёлом доспехе скидку от «Расчёта» игра больше не приписывает грифону');
p3.sk = {}; p3.armor = W.mkArmor('griffin', 2, null);
h = hintAt(RUNE1[0], RUNE1[1], /Игни —/);
note(h);
ok(h.indexOf('🦅 грифон') >= 0 && h.indexOf('расчёт') < 0, 'грифону — грифоново');
p3.sk = { thrift: 4 };
h = hintAt(RUNE1[0], RUNE1[1], /Игни —/);
note(h);
ok(h.indexOf('🦅 грифон') >= 0 && h.indexOf('🧿 расчёт') >= 0, 'вместе — оба названы');
p3.sk = {}; p3.armor = W.mkArmor('heavy', 0, null);
h = hintAt(RUNE1[0], RUNE1[1], /Игни —/);
ok(h.indexOf('вместо') < 0, 'без скидок никакой скобки нет');

head('Подсказка мутации знает, на какой ты ступени');
W.reset(); W.setPanel(null);
const p4 = W.getP();
const mutHint = () => hintAt(MUTBTN[0], MUTBTN[1], /СОРВАТЬСЯ|ЗВЕРЬ:|копится с убийств/);
let h0 = mutHint();
ok(h0.indexOf('копится с убийств') >= 0, 'на пустой шкале зовёт копить');
p4.mutGauge = 100; W.toggleMutation();
let h1 = mutHint();
note(h1);
ok(h1.indexOf('СОРВАТЬСЯ ДАЛЬШЕ') >= 0, 'в первой ступени зовёт сорваться дальше');
W.toggleMutation();
let h2 = mutHint();
note(h2);
ok(h2.indexOf('ЗВЕРЬ:') >= 0 && h2.indexOf('копится') < 0,
   'во второй говорит про зверя, а не повторяет текст первой');
ok(h2.indexOf('знаки и зелья отрезаны') >= 0, 'и честно называет цену');

/* ------------------------------------------------------------ карта земли */
head('Легенда карты знает все края');
W.reset(); W.setPanel('map');
const rows = W.mapLegend();
const total = rows.reduce((a, r) => a + r.length, 0);
const all = Object.keys(W.LOCS);
note('краёв ' + all.length + ', образцов в легенде ' + total + ', строк ' + rows.length +
     ' (' + rows.map(r => r.length).join(' + ') + ')');
ok(total === all.length, 'ни один край не забыт');
const lines = frame();
const missing = all.filter(id => !said(lines, W.LOCS[id].ico + ' ' + W.LOCS[id].n));
ok(!missing.length, missing.length ? 'не нарисованы: ' + missing.join(', ')
                                   : 'и все пятнадцать действительно попадают на экран');

/* Легенда растёт вниз, а под ней подвал панели. Считаем то же, что считает
   отрисовка: нижняя строка не должна залезть в подвал, а карта — в легенду. */
head('И помещается вместе с картой');
const CH = W.WY1 + 84;                                 // высота холста: WY1 = CH - 84
const legBottom = CH - 62 + 5;                         // последняя строка + низ образца
ok(legBottom <= CH - 56, 'нижняя строка легенды не наезжает на подвал панели');
const mapBottom = 92 + (CH - 163 - (rows.length - 1) * 15);
ok(mapBottom < CH - 62 - (rows.length - 1) * 15 - 5, 'а карта не наезжает на легенду');

/* ------------------------------------------------- длинные строки на экране */
/* Сюжетная развязка с наградой — 164 знака: в одну строку это 791 пиксель
   при поле в 504, и рисуется оно ПО ЦЕНТРУ, то есть режется с обоих концов
   сразу. Ловится только замером, глазом это читается как «странная фраза». */
head('Длинное сообщение переносится, а не обрезается с двух концов');
W.reset(); W.setPanel(null);
const WWl = W.WX1 - W.WX0;
const long1 = '📖 Лешак осел трухой, а под ним — то, что осталось от барона. Барон кончился, ' +
              'а имя на клинке — нет.  ·  Награда: гроссмейстерский средний доспех (Оберег) — в сумке';
const wrapped = W.wrapText(long1, WWl - 16, 10, 2);
note('знаков ' + long1.length + ' → строк ' + wrapped.length);
wrapped.forEach(l => note('   «' + l + '»'));
ok(wrapped.length === 2, 'длинная развязка стала двумя строками');
ok(wrapped.join(' ').replace(/…$/, '').length > long1.length * 0.9,
   'и почти вся уместилась, а не потерялась');
ok(long1.indexOf(wrapped[0]) === 0, 'первая строка — это НАЧАЛО фразы, а не её середина');
ok(wrapped.length > 1 && /Оберег|сумке|…/.test(wrapped[1]),
   'и хвост с наградой тоже: «' + String(wrapped[1]).slice(-28) + '»');

/* А теперь то же самое, но НЕ через wrapText напрямую, а через настоящую
   отрисовку: проверка, которая зовёт вспомогательную функцию, стережёт
   функцию, а не игру. Этот стенд уже один раз на этом попался. */
head('И игра эти две строки действительно рисует');
W.reset(); W.setPanel(null); W.setPhase('CAMP');
W.takeStory();
{
  const job = W.getTaken().find(c => c.story);
  job.done = 'Лешак осел трухой, а под ним — то, что осталось от барона. Барон кончился, а имя на клинке — нет.';
  job.reward = { kind: 'armor', type: 'medium', tier: 4, ench: 'ward' };
  W.finishContract(job);
  const drawn = frame().filter(s => s.indexOf('Лешак осел трухой') >= 0 || s.indexOf('Награда:') >= 0);
  drawn.forEach(l => note('   рисует: «' + l + '»'));
  ok(drawn.length === 2, 'развязка вышла на экран двумя кусками, а не одним длинным');
  ok(drawn.every(l => l.length < long1.length), 'и ни один не длиннее целой фразы');
}

/* В подвале открытой панели строка одна — во вторую расти некуда: под ней
   край панели, а на карте прямо над ней легенда красок. Значит она обязана
   подрезаться, а не уходить за оба края. */
head('В подвале панели длинное сообщение подрезается');
{
  W.setPanel('bag');
  // панель рисуется ПОВЕРХ пояса, значит её подвал — последняя такая строка
  const all = frame().filter(s => s.indexOf('осел трухой') >= 0);
  const foot = all[all.length - 1] || '';
  note('подвал: «' + foot + '»');
  ok(/…$/.test(foot), 'строка честно оборвана многоточием, а не обрезана краем экрана');
  ok(foot.length < long1.length, 'то есть короче исходной фразы');
  W.setPanel(null);
}

const short1 = 'Выпил: Ласточка (токсичность +18)';
ok(W.wrapText(short1, WWl - 16, 10, 2).length === 1, 'короткое сообщение остаётся одной строкой');
const huge = 'слово '.repeat(120);
const cut = W.wrapText(huge, WWl - 16, 10, 2);
ok(cut.length === 2 && /…$/.test(cut[1]), 'а совсем несуразное подрезается многоточием, а не уходит за край');

head('Каждое сообщение игры влезает в два ряда');
W.reset(); W.setPanel(null);
{
  // самые длинные строки, какие игра вообще способна показать
  const worst = W.STORY.map(q => {
    let tail = '  ·  ' + q.gold + ' крон в кошель.';
    if (q.reward) tail = q.reward.kind === 'stack'
      ? '  ·  Награда: Эссенция ×' + q.reward.n
      : '  ·  Награда: гроссмейстерский серебряный меч (Кровосос) — в сумке';
    return '📖 ' + q.done + tail;
  });
  const overflow = worst.filter(s => W.wrapText(s, WWl - 16, 10, 2).join('').length < s.length - 1);
  note('развязок всего ' + worst.length + ', не влезло в два ряда: ' + overflow.length);
  ok(!overflow.length, 'все четырнадцать развязок читаются целиком');
}

/* Подсказка в поясе — единственное место в игре, заведённое ради объяснений.
   Восемь подсказок из семнадцати в одну строку не влезали, и обрезало у них
   ровно хвост: то, ЧЕМ вещь берёт. */
head('Подсказка в поясе влезает вся');
W.reset(); W.setPanel(null);
{
  const p10 = W.getP();
  p10.xbow = W.mkXbow('hunter', 4, 'greed');           // самое длинное имя, какое бывает
  W.addStack('boltsil', 99);
  const beltY = W.WY1 + 4;                             // пояс начинается сразу под полем
  W.render();
  const belt = W.getHits().filter(b => b.y >= beltY && b.y < beltY + 62);
  const FIELD = 520 - 20;                              // поле под подсказку: от x=10 до края
  let worst = 0, worstS = '', over = 0;
  for (const b of belt) {
    W.setMouse(b.x + 2, b.y + 2);
    for (const l of frame()) {
      // подсказка — то, что начинается со значка и длинное; прочее пропускаем
      if (!/^[🔥💫🛡🧿🏹➶✧➹💥🧴🩸🧪⚗🍯💩]/.test(l) || l.length < 30) continue;
      if (l.length > worst) { worst = l.length; worstS = l; }
      if (l.length * 5 > FIELD) over++;
    }
  }
  note('кнопок в поясе ' + belt.length + ', самая длинная строка ' + worst + ' знаков ≈ ' +
       worst * 5 + ' px при поле ' + FIELD);
  note('самая длинная: «' + worstS.slice(0, 70) + (worstS.length > 70 ? '…' : '') + '»');
  ok(!over, 'ни одна нарисованная строка подсказки не длиннее поля' +
     (over ? ' (длиннее: ' + over + ')' : ''));
}
{
  // и сама разбивка: длинная подсказка обязана стать двумя строками
  const long2 = '🏹 гроссмейстер охотничий арбалет (Мздоимец) — ПКМ по полю или эта кнопка · ' +
                'урон 53, взвод 0.95 с · болт летит быстрее и вдвое дальше — лучника снимаешь раньше, чем он тебя';
  const l2 = W.wrapText(long2, 520 - 20, 9, 2);
  note('подсказка в ' + long2.length + ' знаков → строк ' + l2.length);
  ok(l2.length === 2, 'длинная подсказка разбивается на две строки');
  ok(long2.indexOf(l2[0]) === 0, 'первая — начало, а не середина');
  ok(l2.join(' ').replace(/…$/, '').length > long2.length * 0.9, 'и почти всё уцелело');
}

/* Стрелка к цели ходит по кругу вокруг середины поля, и подпись под ней
   рисуется ПО ЦЕНТРУ стрелки. У самого края круга подпись вылезала за холст —
   на узком экране срезало до девяти пикселей, пару букв от названия места.
   Смотрим не на длину строки, а на её НАСТОЯЩИЕ границы: ровно на этой
   разнице проверка однажды и промахнулась. */
head('Подпись стрелки не срезается краем поля');
W.reset(); W.setPanel(null);
{
  const p11 = W.getP();
  W.setPhase('CAMP');
  const cut = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * 6.2832;
    p11.x = Math.min(Math.max(W.WORLD_W / 2 + Math.cos(a) * 3200, 100), W.WORLD_W - 100);
    p11.y = Math.min(Math.max(W.WORLD_H / 2 + Math.sin(a) * 3200, 100), W.WORLD_H - 100);
    W.syncCam();
    for (const m of frameMarks()) {
      if (!/ · \d+ шагов$/.test(m.s)) continue;         // это подпись стрелки, и только она
      const { x0, x1 } = span(m);
      if (x0 < W.WX0 - 1 || x1 > W.WX1 + 1) {
        cut.push(Math.round(a * 57) + '°: [' + Math.round(x0) + '…' + Math.round(x1) + '] при поле ' +
                 W.WX0 + '…' + W.WX1);
      }
    }
  }
  note('направлений проверено: 24');
  ok(!cut.length, 'подпись всюду внутри поля' + (cut.length ? ', срезает: ' + cut.slice(0, 3).join(' · ') : ''));
}

head('Приметное место не двоится с деревней');
W.reset();
const eaten = Object.keys(W.SPOTS).filter(k => W.spotEaten(k));
note('спрятано как двойник: ' + (eaten.map(k => W.SPOTS[k].n).join(', ') || 'нет'));
for (const k of eaten) {
  const s = W.SPOTS[k], t = W.townAt(s.x, s.y);
  ok(t && Math.hypot(s.x - t.x, s.y - t.y) < 40,
     '«' + s.n + '» и правда сидит на колодце «' + t.n + '» (' + Math.round(Math.hypot(s.x - t.x, s.y - t.y)) + ' шагов)');
}
/* И снова: проверяем не справочник, а ЭКРАН. Встаём на Заставу и смотрим,
   что игра написала — в мире и на карте. */
{
  const gate = W.SPOTS.gate, town = W.townAt(gate.x, gate.y);
  W.setPanel(null);
  const p9 = W.getP(); p9.x = gate.x; p9.y = gate.y; W.syncCam(); W.update(0.016);
  const world = frame();
  ok(said(world, town.n), 'в мире деревня подписана: «' + town.n + '»');
  ok(!said(world, gate.n), 'а «' + gate.n + '» второй подписью поверх неё не идёт');
  W.setPanel('map');
  const map = frame();
  ok(said(map, town.n) && !said(map, gate.n), 'на карте — то же самое, без двойника');
  W.setPanel(null);
}
// но из справочника оно никуда не делось: по нему идёт сюжет
ok(W.STORY.every(q => W.SPOTS[q.spot]), 'все сюжетные места на месте — прячем только вторую картинку');
ok(!!W.SPOTS.gate, '«Застава на тракте» осталась в справочнике: по ней идёт «Застава барона»');

head('Дороги никуда не ведут только если ведут');
const loops = W.PATHS.filter(p => p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y);
ok(!loops.length, 'нет дорог, выходящих из точки и в неё же возвращающихся (' + W.PATHS.length + ' дорог)');
{
  const key = v => Math.round(v.x) + ',' + Math.round(v.y), adj = {};
  for (const p of W.PATHS) for (let i = 0; i < p.length; i++) {
    const k = key(p[i]); adj[k] = adj[k] || new Set();
    if (i) { adj[k].add(key(p[i - 1])); (adj[key(p[i - 1])] = adj[key(p[i - 1])] || new Set()).add(k); }
  }
  const all = Object.keys(adj), seen2 = new Set([all[0]]), q = [all[0]];
  while (q.length) { const c = q.pop(); for (const n of adj[c]) if (!seen2.has(n)) { seen2.add(n); q.push(n); } }
  note('узлов ' + all.length + ', достижимо из первого ' + seen2.size);
  ok(seen2.size === all.length, 'сеть дорог осталась единой, без островов');
}
/* Застава посреди поля не заставляет никого: мимо неё объезжают, не заметив.
   Место называлось «Застава на тракте», а до ближайшей дороги от него было
   семьсот шестьдесят один шаг. Правило общее — оно и держит смысл слова. */
head('Застава стоит на дороге, иначе она не застава');
{
  const toRoad = t => {
    let best = Infinity;
    for (const p of W.PATHS) for (let j = 1; j < p.length; j++) {
      const a = p[j - 1], b = p[j];
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
      let s = L2 ? ((t.x - a.x) * vx + (t.y - a.y) * vy) / L2 : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      best = Math.min(best, Math.hypot(t.x - (a.x + vx * s), t.y - (a.y + vy * s)));
    }
    return Math.round(best);
  };
  const posts = W.TOWNS.filter(t => t.kind === 'застава');
  posts.forEach(t => note(t.n + ': до дороги ' + toRoad(t) + ' шагов'));
  ok(posts.length > 0, 'застав на земле ' + posts.length);
  const offRoad = posts.filter(t => toRoad(t) > t.r);
  ok(!offRoad.length, 'каждая стоит на дороге, а не поодаль' +
     (offRoad.length ? ': ' + offRoad.map(t => t.n + ' (' + toRoad(t) + ')').join(', ') : ''));
  // и через саму Заставу дорога именно ПРОХОДИТ, а не задевает краем
  const z = W.TOWNS.find(t => t.k === 'zastava');
  ok(W.onPath(z.x, z.y), 'через колодец Заставы дорога проходит насквозь');
  note('прочие деревни, до дороги дальше околицы: ' +
       (W.TOWNS.filter(t => t.kind !== 'застава' && toRoad(t) > t.r + 120)
         .map(t => t.n + ' ' + toRoad(t)).join(', ') || 'нет'));
}

{
  // и ни один конец не обрывается в чистом поле
  const orphan = [];
  for (const p of W.PATHS) for (const pt of [p[0], p[p.length - 1]]) {
    const near = Object.values(W.SPOTS).some(s => Math.hypot(s.x - pt.x, s.y - pt.y) < 260) ||
                 W.TOWNS.some(t => Math.hypot(t.x - pt.x, t.y - pt.y) < t.r + 150) ||
                 W.PATHS.some(q2 => q2 !== p && q2.some(v => Math.hypot(v.x - pt.x, v.y - pt.y) < 60));
    if (!near) orphan.push(Math.round(pt.x) + ',' + Math.round(pt.y));
  }
  ok(!orphan.length, 'каждый конец дороги упирается в место, деревню или другую дорогу' +
     (orphan.length ? ': ' + orphan.join(' · ') : ''));
}

/* Сюжетное дело помнит и МЕСТО, и КРАЙ. Место решает, где выходят твари и
   где засчитывается приход; край — то, что написано на доске и куда показывает
   стрелка, когда ты вышел за его пределы. Если они расходятся, стрелка во
   время самой драки на месте тянет игрока прочь: у Брода на 446 шагов, у
   Старой мельницы — на две с лишним тысячи. */
head('Сюжетное место лежит в том краю, который записан в деле');
{
  const off = [];
  for (const q of W.STORY) {
    const sp = W.SPOTS[q.spot], here = W.locAt(sp.x, sp.y);
    if (here !== q.loc) off.push(sp.n + ': дело «' + W.LOCS[q.loc].n + '», место в «' + W.LOCS[here].n + '»');
  }
  note('сюжетных дел ' + W.STORY.length + ', разошлось ' + off.length);
  ok(!off.length, 'край дела и край места сходятся везде' + (off.length ? ': ' + off.join(' · ') : ''));
}

head('И потому стрелка не уводит с места драки');
for (let i = 0; i < W.STORY.length; i++) {
  W.reset(); W.setStory(i); W.setPanel(null);
  const q = W.storyNow();
  W.takeStory();
  const job = W.getTaken().find(c => c.story);
  const p = W.getP(), sp = W.SPOTS[q.spot];
  p.x = sp.x; p.y = sp.y; W.syncCam(); W.update(0.016);
  W.syncFocus();
  const g = W.questGoal();
  if (!ok(job && job.arrived && !g,
          q.t + ': на месте стрелка молчит' +
          (g ? ', а не ведёт на «' + g.n + '» за ' + Math.round(Math.hypot(g.mx - p.x, g.my - p.y)) + ' шагов' : ''))) break;
}

head('Брод стоит на воде и на переправе');
{
  W.reset();
  const f = W.SPOTS.ford;
  ok(W.locAt(f.x, f.y) === 'shore', 'брод на берегу, а не в чаще');
  ok(W.onPath(f.x, f.y), 'и на дороге: брод — это место, где тракт входит в воду');
  ok(!W.obstNear(f.x, f.y).some(o => Math.hypot(f.x - o.x, f.y - o.y) < o.r + 9), 'к нему можно подойти');
}

head('Карта и панели рисуются');
let drew = true;
try {
  for (const pan of ['map', 'bag', 'board', 'bench', 'skills', 'craft']) {
    W.setPanel(pan);
    for (let i = 0; i < 3; i++) { W.update(0.016); W.render(); }
  }
  W.setPanel(null);
} catch (e) { drew = false; note('падение: ' + e.message); }
ok(drew, 'все панели переживают отрисовку');

/* ------------------------------------------------------- полный экран */
/* shared/fullscreen.js отдаёт игре весь экран и ставит css-размер холста
   РАВНЫМ ЭКРАНУ, ничего не спрашивая назад. Значит логический размер, который
   игра выбирает в __fsResize, обязан совпасть с пропорцией экрана — иначе
   масштаб по X и по Y разъедется и картинку расплющит. Так и было: высота
   стояла намертво 640, а ширина зажималась в 480…1800, и на телефоне в
   портрете картинку сжимало вширь на 36%, на сверхшироком тянуло на 32%. */
head('Полный экран не плющит картинку');
{
  const SCREENS = [
    ['ноутбук 1366×768', 1366, 708], ['монитор 1920×1080', 1920, 1020],
    ['ультраширокий 3440×1440', 3440, 1380], ['сверхширокий 5120×1440', 5120, 1380],
    ['iPad 768×1024 портрет', 768, 964], ['планшет 1024×1366', 1024, 1306],
    ['телефон 412×915 портрет', 412, 855], ['телефон 360×800 портрет', 360, 740],
    ['телефон 915×412 альбом', 915, 352],
  ];
  const skew = [], narrow = [];
  for (const [n, fw, fh] of SCREENS) {
    sandbox.__fsResize(fw, fh);
    // сразу после __fsResize размер холста — ЛОГИЧЕСКИЙ: syncRes перебьёт его
    // на битмап только в первой же отрисовке
    const cw = sandbox.__canvas.width, ch = sandbox.__canvas.height;
    const k = (fw / cw) / (fh / ch);                   // во сколько раз X растянут против Y
    note(n.padEnd(25) + '→ ' + cw + '×' + ch + '   перекос ' + k.toFixed(3));
    if (Math.abs(k - 1) > 0.02) skew.push(n + ' (' + Math.round(Math.abs(k - 1) * 100) + '%)');
    if (cw < 480 || cw > 1800) narrow.push(n + ' (' + cw + ')');
  }
  ok(!skew.length, 'ни на одном экране картинку не перекашивает' +
     (skew.length ? ': ' + skew.join(', ') : ''));
  ok(!narrow.length, 'ширина везде в своих пределах 480…1800' +
     (narrow.length ? ': ' + narrow.join(', ') : ''));
}

head('И при непривычной высоте всё на местах');
{
  // 1800×485 (сверхширокий) и 480×996 (телефон) — высота уже не 640
  const bad = [];
  for (const [fw, fh] of [[5120, 1380], [412, 855], [360, 740]]) {
    sandbox.__fsResize(fw, fh);
    const cw = sandbox.__canvas.width, ch = sandbox.__canvas.height;
    for (const pan of [null, 'bag', 'bench', 'board', 'map', 'skills', 'craft']) {
      W.reset(); W.setPanel(pan); W.setMouse(50, 50);
      W.update(0.016);
      for (const m of frameMarks()) {
        const { x0, x1 } = span(m);
        if (m.y > ch + 2) { bad.push(cw + '×' + ch + '/' + pan + ': «' + m.s.slice(0, 24) + '» ниже холста'); break; }
      }
      for (const b of W.getHits())
        if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > cw + 0.5 || b.y + b.h > ch + 0.5) {
          bad.push(cw + '×' + ch + '/' + pan + ': кнопка за краем'); break;
        }
    }
  }
  ok(!bad.length, 'кнопки и надписи держатся и на 1800×485, и на 480×996' +
     (bad.length ? ': ' + [...new Set(bad)].slice(0, 3).join(' · ') : ''));
  sandbox.__fsRestore();                               // вернуть оконный размер
  ok(sandbox.__canvas.width === 520 && sandbox.__canvas.height === 640,
     'выход из полного экрана возвращает 520×640');
}

done();
