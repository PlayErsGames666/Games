/* =======================================================================
   ЧТО ИГРА ГОВОРИТ И СЛЫШИТ.

   Три проверки боя стоят на числах, а тут — на словах и клавишах. Это не
   мелочь: подсказка, приписавшая скидку не тому доспеху, врёт игроку ровно
   так же, как неверный урон, только поймать её труднее — числа сходятся.

   Здесь ловим строки, которые отрисовка ДЕЙСТВИТЕЛЬНО написала за кадр
   (см. frame() в стенде), и нажатия, которые игра действительно разобрала.
   ======================================================================= */
'use strict';
const { W, ok, note, head, done, key, frame, said, peek } = require('./harness.js');

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

done();
