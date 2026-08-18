/* Облик ведьмака: таблицы, запись, зеркало, панель.
   Пишется по частям вместе с задачами 2, 5 и 6 плана. */
'use strict';
const { W, store, ok, note, head, done, paints, paintsFull, spins, nans, traces, arcs,
        frame, frameMarks, frameMarksAll, tap, peek, key, keyDown } = require('./harness.js');

head('Умолчание, когда записи нет');
{
  delete store['witcher_look'];
  const L = W.loadLook();
  ok(!!L, 'облик вернулся');
  ok(L.hair === 'mane' && L.hairC === 'white' && L.eye === 'cat',
     'по умолчанию седая грива и кошачьи глаза');
}

head('Записался и прочитался обратно');
{
  W.setLook({ skin: 'dark', hair: 'braid', hairC: 'black', beard: 'full', scar: 'eye', eye: 'green' });
  W.saveLook();
  const raw = store['witcher_look'];
  note('в записи: ' + raw);
  const L = W.loadLook();
  ok(L.hair === 'braid' && L.skin === 'dark' && L.scar === 'eye', 'всё вернулось как было');
}

head('Битая и чужая запись не роняют игру');
{
  store['witcher_look'] = '{это не json';
  let fell = false;
  try { W.loadLook(); } catch (e) { fell = true; note('падение: ' + e.message); }
  ok(!fell, 'обрывок json прочитан без падения');
  ok(W.getLook().hair === 'mane', 'взято умолчание');

  store['witcher_look'] = JSON.stringify({ hair: 'мохоук', eye: 'лазерный', skin: 'fair', beard: 42 });
  W.loadLook();
  const L = W.getLook();
  ok(L.hair === 'mane', 'незнакомая причёска отброшена');
  ok(L.eye === 'cat', 'незнакомый глаз отброшен');
  ok(L.skin === 'fair', 'а знакомое поле из той же записи взято');
  ok(L.beard === 'stubble', 'число вместо ключа бороды отброшено');

  // Ключи из прототипа: F.tab['__proto__'] и F.tab['constructor'] — истина,
  // хотя таких ключей в таблице нет. Простая проверка «F.tab[ключ]» на этом
  // и попадалась: чужое значение проходило как своё.
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    store['witcher_look'] = JSON.stringify({ hair: bad });
    W.loadLook();
    ok(W.getLook().hair === 'mane', 'ключ из прототипа «' + bad + '» отброшен');
  }
}

head('Наугад даёт только знакомые ключи');
{
  for (let i = 0; i < 40; i++) {
    W.randomLook();
    const L = W.getLook();
    for (const F of W.LOOK_FIELDS) {
      if (!F.tab[L[F.k]]) { ok(false, 'наугад выдал чужой ключ в поле ' + F.k + ': ' + L[F.k]); done(); return; }
    }
  }
  ok(true, 'сорок бросков подряд — все ключи из таблиц');
}

head('Рисуется любой облик из таблиц');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  let fell = null, n = 0;
  for (const F of W.LOOK_FIELDS) {
    for (const k of Object.keys(F.tab)) {
      const L = Object.assign({}, W.LOOK_DEF); L[F.k] = k;
      W.setLook(L);
      n++;
      try { W.render(); } catch (e) { fell = F.k + '=' + k + ': ' + e.message; break; }
    }
    if (fell) break;
  }
  note('обликов отрисовано: ' + n);
  ok(!fell, fell ? ('падение на ' + fell) : 'все значения всех шести таблиц рисуются');
}

head('Пешка поворачивается на все стороны');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  let fell = null;
  for (let i = 0; i < 16; i++) {
    P.face = i / 16 * Math.PI * 2;
    try { W.render(); } catch (e) { fell = 'угол ' + i + ': ' + e.message; break; }
  }
  ok(!fell, fell || 'шестнадцать направлений — рисуется без падения');
}

/* Зеркало в лагере обязано показывать облик, который человек ЕЩЁ ЛИСТАЕТ, —
   тот не принят и в глобальный ещё не лёг. Пока drawPawn читала глобальный
   облик мимо своей же подписи, превью в зеркале показывало бы что угодно,
   кроме нужного. Проверяем по краскам: другого следа от картинки нет. */
head('Пешка слушается переданного облика, а не глобального');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  W.setLook({ skin: 'dark', hair: 'mane', hairC: 'black', beard: 'stubble', scar: 'none', eye: 'grey' });
  const mine = { skin: 'pale', hair: 'mane', hairC: 'red', beard: 'stubble', scar: 'none', eye: 'green' };
  const used = paints(() => W.drawPawn(0, 0, 0, { look: mine }));
  note('красок за один вызов: ' + used.length);

  ok(used.indexOf(W.HAIR_C.red.c) >= 0, 'волосы взяты из переданного облика');
  ok(used.indexOf(W.HAIR_C.black.c) < 0, 'глобальный цвет волос не просочился');
  ok(used.indexOf(W.SKINS.pale.c) >= 0, 'кожа взята из переданного облика');
  ok(used.indexOf(W.SKINS.dark.c) < 0, 'глобальная кожа не просочилась');
  ok(used.indexOf(W.EYES.green.c) >= 0, 'глаза взяты из переданного облика');
  ok(used.indexOf(W.EYES.grey.c) < 0, 'глобальные глаза не просочились');

  // а вызов БЕЗ облика по-прежнему рисует текущего ведьмака: запасной путь цел
  const cur = paints(() => W.drawPawn(0, 0, 0, {}));
  ok(cur.indexOf(W.HAIR_C.black.c) >= 0 && cur.indexOf(W.HAIR_C.red.c) < 0,
     'без облика в st берётся глобальный');
}

head('Мечи за спиной — из st, а не из игрока');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.steel = null; P.silver = null;                     // у игрока мечей нет вовсе
  const two = paints(() => W.drawPawn(0, 0, 0, { steel: true, silver: true }));
  ok(two.indexOf(W.SWORD.steel.c) >= 0 && two.indexOf(W.SWORD.silver.c) >= 0,
     'оба меча нарисованы по st, хотя у игрока их нет');

  const none = paints(() => W.drawPawn(0, 0, 0, {}));
  ok(none.indexOf(W.SWORD.steel.c) < 0 && none.indexOf(W.SWORD.silver.c) < 0,
     'без мечей в st за спиной пусто');

  // тот, что в руке, за спиной не торчит
  const one = paints(() => W.drawPawn(0, 0, 0, { steel: true, silver: true, hand: 'silver' }));
  ok(one.indexOf(W.SWORD.steel.c) >= 0 && one.indexOf(W.SWORD.silver.c) < 0,
     'серебро в руке — за спиной только сталь');
}

/* Краской положение не поймать — оба меча стального цвета что спереди,
   что сзади. Единственный след геометрии, который холст готов отдать, —
   точки moveTo/lineTo самого пути. Местные оси: «вперёд» — это -Y (там
   же голова, в y=-7), значит меч за спиной обязан идти в +Y. */
head('Мечи за спиной идут в +Y, назад, а не на макушку');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);

  const steelT = traces(() => W.drawPawn(0, 0, 0, { steel: true }));
  const steelHilt = steelT.find(p => p.k === 'moveTo' && p.x === -4);
  const steelTip  = steelT.find(p => p.k === 'lineTo' && p.x === -7);
  ok(!!steelHilt && steelHilt.y === 6, 'сталь у плеча лежит на +6 — за спиной, не перед лицом');
  ok(!!steelTip && steelTip.y === 14, 'остриё стали на +14 — дальше по спине, не выше макушки (-12.2)');

  const silverT = traces(() => W.drawPawn(0, 0, 0, { silver: true }));
  const silverHilt = silverT.find(p => p.k === 'moveTo' && p.x === 4);
  const silverTip  = silverT.find(p => p.k === 'lineTo' && p.x === 7);
  ok(!!silverHilt && silverHilt.y === 6, 'серебро у плеча лежит на +6 — за спиной');
  ok(!!silverTip && silverTip.y === 14, 'остриё серебра на +14 — за спиной, не спереди');
}

/* Хвост-причёска — тот же трюк: голова круг радиусом 5.2 с серединой в -7,
   её задний край — -1.8. Хвост обязан начинаться ровно там, а не торчать
   у темени (было -13, это ближе к макушке, чем сама макушка -12.2). */
head('Хвост-причёска растёт от заднего края головы, а не от макушки');
{
  const headBack = -7 + 5.2;
  const L = Object.assign({}, W.LOOK_DEF, { hair: 'tail' });
  const tailT = traces(() => W.drawPawn(0, 0, 0, { look: L }));
  const tailStart = tailT.find(p => p.k === 'moveTo' && p.x === 0);
  ok(!!tailStart, 'хвост нашёлся в пути отрисовки');
  ok(!!tailStart && Math.abs(tailStart.y - headBack) < 1e-9,
     'хвост начинается на y=' + headBack.toFixed(1) + ' — сразу за головой, не на макушке');
}

head('pawnState отдаёт мечи и облик игрока');
{
  W.reset();
  const P = W.getP();
  P.steel = W.mkSword('steel', 0); P.silver = null;
  W.setLook({ skin: 'tan', hair: 'braid', hairC: 'ash', beard: 'full', scar: 'eye', eye: 'amber' });
  const st = W.pawnState();
  ok(st.steel === true && st.silver === false, 'мечи сведены к да/нет по тому, что надето');
  ok(!!st.look && st.look.hairC === 'ash' && st.look.hair === 'braid', 'облик игрока вложен в st');
}

/* =====================  СНАРЯЖЕНИЕ И СОСТОЯНИЕ НА ФИГУРЕ  =====================
   Восемь доспехов, две руки, две ступени мутации, арбалет, Квен, уклонение,
   падение. Проверка «не упало» тут самая слабая из возможных: она проходит и
   тогда, когда рисовалка молча не нарисовала ничего. Поэтому всё, что вообще
   оставляет след, проверяем по СЛЕДУ — по краске, по повороту, по NaN. */

head('Рисуется в любом доспехе');
{
  /* equip() берёт вещь ТОЛЬКО из сумки: сделать mkArmor и сразу отдать его
     equip — значит получить «Этого нет в сумке» и прогнать восемь кругов по
     одному и тому же лёгкому доспеху. Кладём в сумку и сверяем, что надето. */
  let fell = null, n = 0;
  for (const k of W.ARMOR_KEYS) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    const it = W.mkArmor(k, 0, null);
    W.getInv().push(it); W.equip(it);
    if (W.getP().armor !== it) { fell = k + ': доспех не надет, рисовать нечего'; break; }
    if (W.pawnState().armor !== k) { fell = k + ': pawnState отдал доспех «' + W.pawnState().armor + '»'; break; }
    try { W.render(); } catch (e) { fell = k + ': ' + e.message; break; }
    n++;
  }
  note('доспехов надето и отрисовано: ' + n + ' из ' + W.ARMOR_KEYS.length);
  ok(!fell, fell || 'все восемь доспехов надеваются и рисуются');
}

head('Плащ красится по надетому доспеху');
{
  let bad = null;
  for (const k of W.ARMOR_KEYS) {
    const used = paints(() => W.drawPawn(0, 0, 0, { armor: k }));
    if (used.indexOf(W.ARMOR[k].c) < 0) { bad = k + ' (ждали ' + W.ARMOR[k].c + ')'; break; }
  }
  ok(!bad, bad ? ('плащ не покрашен цветом доспеха: ' + bad) : 'у всех восьми доспехов плащ своего цвета');

  const bare = paints(() => W.drawPawn(0, 0, 0, { armor: null }));
  ok(bare.indexOf('#6b6f78') >= 0 && bare.indexOf(W.ARMOR.light.c) < 0,
     'без доспеха плащ серый, а не цвета лёгкого');

  const junk = paints(() => W.drawPawn(0, 0, 0, { armor: 'доспех-которого-нет' }));
  ok(junk.indexOf('#6b6f78') >= 0, 'незнакомый ключ доспеха не роняет и красит серым');
}

/* Пластины и наплечники — единственное, чем тяжёлый доспех отличается от
   лёгкого на глаз. Ловим по краске: больше этих двух цветов в пешке никто не
   берёт. Порог — ВЕС: тяжело от 20, средне от 12. */
head('Тяжёлый доспех виден пластинами, средний — наплечниками');
{
  const PLATE = 'rgba(255,255,255,.16)', PAD = 'rgba(0,0,0,.3)';
  const at = k => paints(() => W.drawPawn(0, 0, 0, { armor: k }));

  ok(at('heavy').indexOf(PLATE) >= 0, 'у тяжёлого (вес 23) нарисованы пластины');
  ok(at('bear').indexOf(PLATE) >= 0, 'у медвежьего (вес 26) тоже');
  ok(at('medium').indexOf(PLATE) < 0 && at('wolf').indexOf(PLATE) < 0,
     'у средних (13 и 15) пластин нет');
  ok(at('light').indexOf(PLATE) < 0, 'у лёгкого пластин нет');

  ok(at('heavy').indexOf(PAD) >= 0 && at('medium').indexOf(PAD) >= 0 && at('wolf').indexOf(PAD) >= 0,
     'наплечники и у тяжёлого, и у средних');
  let bare = null;
  for (const k of ['light', 'cat', 'griffin', 'viper']) {          // вес 6, 5.5, 10, 11
    const u = at(k);
    if (u.indexOf(PAD) >= 0 || u.indexOf(PLATE) >= 0) { bare = k; break; }
  }
  ok(!bare, bare ? ('лёгкий «' + bare + '» отрисован как тяжёлый') : 'все четыре лёгких — без пластин и наплечников');
}

head('Мутация видна на фигуре');
{
  const VEIN1 = 'rgba(200,60,50,.6)', VEIN2 = 'rgba(255,60,40,.9)';
  const CLAW = '#ffd0a0', RAGE = '#5a2020', FACE2 = '#c98a7a';
  const L = W.LOOK_DEF;                                   // кожа fair, чтобы было с чем сравнивать
  const calm = paints(() => W.drawPawn(0, 0, 0, { armor: 'heavy', look: L }));
  const m1   = paints(() => W.drawPawn(0, 0, 0, { armor: 'heavy', look: L, mut: true }));
  const m2   = paints(() => W.drawPawn(0, 0, 0, { armor: 'heavy', look: L, mut: true, mut2: true }));

  ok(calm.indexOf(VEIN1) < 0 && calm.indexOf(VEIN2) < 0 && calm.indexOf(CLAW) < 0,
     'без мутации ни жил, ни когтей');
  ok(m1.indexOf(VEIN1) >= 0, 'первая ступень — жилы на лице');
  ok(m1.indexOf(CLAW) < 0 && m1.indexOf(RAGE) < 0,
     'на первой ступени когтей ещё нет и плащ не сорвало в красный');
  ok(m1.indexOf(W.ARMOR.heavy.c) >= 0, 'на первой ступени плащ ещё цвета доспеха');

  ok(m2.indexOf(VEIN2) >= 0 && m2.indexOf(VEIN1) < 0, 'на второй ступени жилы своей, яркой краской');
  ok(m2.indexOf(CLAW) >= 0, 'на второй ступени вылезли когти');
  ok(m2.indexOf(RAGE) >= 0 && m2.indexOf(W.ARMOR.heavy.c) < 0,
     'на второй ступени плащ красный, цвета доспеха уже не видно');
  ok(m2.indexOf(FACE2) >= 0 && m2.indexOf(W.SKINS.fair.c) < 0,
     'и лицо на срыве налилось, а не осталось обычной кожей');
}

/* Замысел обещает второй ступенью не «жилы поярче», а СРЫВ: «фигура горбится,
   когти, горящий контур». Когти были, горба и контура не было — обещание
   стерегло только слово в замысле, а слово ничего не стережёт. */
head('Зверь горбится и горит контуром');
{
  const L = W.LOOK_DEF;
  const base = { armor: 'heavy', look: L, mut: true };
  const beast = { armor: 'heavy', look: L, mut: true, mut2: true };
  const FIRE = 'rgba(255,120,36,';

  const calm = paints(() => W.drawPawn(0, 0, 0, base));
  const hot  = paints(() => W.drawPawn(0, 0, 0, beast));
  ok(!calm.some(c => c.indexOf(FIRE) === 0), 'на первой ступени контур не горит');
  ok(hot.some(c => c.indexOf(FIRE) === 0), 'на второй — силуэт обведён горящим контуром');

  /* ГОРБ меряем по голове: она рисуется одним кругом, и у зверя он и мельче
     (фигура сжата), и подан ВПЕРЁД (вперёд — это −Y). Круг узнаём по краске
     лица: на срыве она своя, и больше нигде на пешке не встречается.
     Смотрим sx/sy — место НА ХОЛСТЕ: сжатие и сдвиг живут в них, в местных
     осях фигуры их не видно вовсе. */
  const headOf = (st, col) => arcs(() => W.drawPawn(0, 0, 0, st))
    .find(a => a.k === 'fill' && a.c === col && !a.oval);
  const h1 = headOf(base, W.SKINS.fair.c), h2 = headOf(beast, '#c98a7a');
  ok(!!h1 && !!h2, 'голова нашлась в обеих отрисовках');
  note('голова: обычная r=' + (h1 ? h1.rs.toFixed(2) : '—') + ' на y=' + (h1 ? h1.sy.toFixed(2) : '—') +
       ', у зверя r=' + (h2 ? h2.rs.toFixed(2) : '—') + ' на y=' + (h2 ? h2.sy.toFixed(2) : '—'));
  ok(!!h1 && !!h2 && h2.rs < h1.rs, 'фигура зверя сжата: она мельче своей же обычной');
  ok(!!h1 && !!h2 && h2.sy < h1.sy, 'и подана вперёд — это и есть горб');
  /* Но не в кляксу: ведьмак обязан остаться ведьмаком. Больше чем на четверть
     сжиматься нечему, иначе рядом с тварями это уже не фигура, а комок. */
  ok(!!h1 && !!h2 && h2.rs > h1.rs * 0.75, 'и сжата умеренно: ' + (h2 && h1 ? (h2.rs / h1.rs).toFixed(2) : '—') + ' от обычной');
}

head('Арбалет на поясе виден только когда он есть');
{
  const on  = paints(() => W.drawPawn(0, 0, 0, { xbow: true }));
  const off = paints(() => W.drawPawn(0, 0, 0, { xbow: false }));
  ok(on.indexOf('#6b5a3a') >= 0, 'арбалет нарисован');
  ok(off.indexOf('#6b5a3a') < 0, 'без арбалета на поясе пусто');
}

/* «Арбалет: на поясе, ПОКА НЕ СТРЕЛЯЕТ» — строка замысла. Взвод (P.boltCd) и
   есть те секунды, когда он снят с пояса; раньше он висел на боку даже в тот
   миг, когда из него бьют. */
head('Арбалет уходит с пояса на время выстрела');
{
  const XB = '#6b5a3a';
  const idle = paints(() => W.drawPawn(0, 0, 0, { xbow: true, shooting: false }));
  const shot = paints(() => W.drawPawn(0, 0, 0, { xbow: true, shooting: true }));
  ok(idle.indexOf(XB) >= 0, 'пока не стреляет — висит на поясе');
  ok(shot.indexOf(XB) < 0, 'пока стреляет — с пояса пропал');

  // и это не выдумка стенда: признак берётся от настоящего взвода
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  ok(W.pawnState().shooting === false, 'в покое взвода нет');
  W.shootBolt();
  note('взвод после выстрела: ' + P.boltCd.toFixed(2) + ' с');
  ok(P.boltCd > 0 && W.pawnState().shooting === true, 'выстрелил — пешка про это знает');
  ok(paints(() => W.drawPawn(0, 0, 0, W.pawnState())).indexOf(XB) < 0,
     'и на фигуре арбалета в этот миг нет');
  for (let i = 0; i < 200 && P.boltCd > 0; i++) W.update(0.016);
  ok(W.pawnState().shooting === false, 'взвод кончился — признак снялся');
  ok(paints(() => W.drawPawn(0, 0, 0, W.pawnState())).indexOf(XB) >= 0, 'и арбалет вернулся на пояс');
}

/* «Замах: плечи доворачиваются; меч рисуется прежним кодом» — строка замысла.
   P.swing не доходил до pawnState вовсе, то есть фигура о замахе не знала. */
head('Замах доворачивает плечи');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  ok(W.pawnState().swing === 0, 'в покое доворота нет');
  W.swing();
  const phase = [W.pawnState().swing];
  for (let i = 0; i < 3; i++) { W.update(0.11); phase.push(W.pawnState().swing); }
  note('доворот по ходу замаха: ' + phase.map(v => v.toFixed(2)).join(' → '));
  ok(phase[0] <= -0.99, 'замах начинается с одного края');
  ok(phase[1] > phase[0] && phase[2] > phase[1], 'и идёт к другому, не дёргаясь назад');
  ok(phase[3] === 0, 'кончился замах — плечи вернулись');

  /* Доворачиваются именно ПЛЕЧИ, а не вся пешка: у фигуры появляется ВТОРОЙ
     поворот холста, вложенный в общий. Один общий был и остаётся — по нему
     фигура смотрит туда, куда смотрит ведьмак, и замах его не трогает. */
  const rest = spins(() => W.drawPawn(0, 0, 0, { swing: 0 }));
  const beg  = spins(() => W.drawPawn(0, 0, 0, { swing: -1 }));
  const end  = spins(() => W.drawPawn(0, 0, 0, { swing: 1 }));
  ok(rest.length === 1, 'в покое поворот один — общий, по взгляду');
  ok(beg.length === 2 && end.length === 2, 'на замахе добавился ровно один поворот — плечевой');
  ok(beg[0] === rest[0] && end[0] === rest[0], 'общий поворот замах не тронул: фигура смотрит туда же');
  const b = beg[1], e = end[1];
  note('плечи доворачиваются от ' + b.toFixed(3) + ' до ' + e.toFixed(3) + ' рад');
  ok(b < 0 && e > 0, 'плечи уходят вслед за клинком: в начале в одну сторону, в конце в другую');
  ok(Math.abs(b + e) < 1e-9, 'и ровно на столько же — замах не косой');
  ok(Math.abs(e) > 0.05, 'доворот заметен глазу');
  ok(Math.abs(e) < 0.6, 'но фигуру боком не ставит — это отклик, а не анимация удара');
}

/* «Зелье в силе → цветной ободок и редкие искры цвета зелья» — строка
   замысла, которой в коде не было вовсе: pawnState о зельях не отдавал
   ничего, drawPawn о них не знал. */
head('Зелье в силе видно ободком своего цвета');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  ok(W.pawnState().potion === null, 'без зелья ободка нет');

  W.addStack('swallow', 1); W.drink('swallow');
  ok(P.regen > 0, 'Ласточка пошла');
  ok(W.pawnState().potion === W.POTIONS.swallow.c,
     'ободок взял цвет самой Ласточки: ' + W.pawnState().potion);

  P.regen = 0; P.tox = 0;
  W.addStack('thunder', 1); W.drink('thunder');
  ok(P.buffThunder > 0 && W.pawnState().potion === W.POTIONS.thunder.c,
     'у Грома свой цвет: ' + W.pawnState().potion);

  /* Белый мёд не длится ни секунды — он срабатывает разом. Показывать нечего,
     и ободка от него быть не должно. */
  P.buffThunder = 0; P.tox = 60;
  W.addStack('honey', 1); W.drink('honey');
  ok(W.pawnState().potion === null, 'от Белого мёда ободка нет — он не длится');

  const c = W.POTIONS.swallow.c;
  const off = paints(() => W.drawPawn(0, 0, 0, { armor: 'heavy' }));
  const on  = paints(() => W.drawPawn(0, 0, 0, { armor: 'heavy', potion: c }));
  ok(off.indexOf(c) < 0, 'без зелья цвета зелья на фигуре нет');
  ok(on.indexOf(c) >= 0, 'с зельем — есть');
  const rimArcs = arcs(() => W.drawPawn(0, 0, 0, { armor: 'heavy', potion: c }))
    .filter(a => a.c === c);
  const rim = rimArcs.filter(a => a.k === 'stroke'), sparks = rimArcs.filter(a => a.k === 'fill');
  ok(rim.length === 1, 'ободок один, а не венок: ' + rim.length);
  ok(sparks.length >= 2 && sparks.length <= 5,
     'искры РЕДКИЕ — их горсть, а не сыпь: ' + sparks.length);

  /* Подсказка, а не украшение: спорить ободок не должен ни с горящим
     контуром зверя, ни с чем бы то ни было ещё на фигуре.

     Густота живёт в ДВУХ местах: у ободка в globalAlpha, у контура вписана
     прямо в краску. Спрашивать одно globalAlpha значило бы считать контур
     в полную силу, а он в половину, — мерка называлась бы громче, чем
     меряет. Перемножаем (тот же приём, что у печати в check-signs).

     И оба дышат по часам игры, поэтому берём НЕ один кадр, а полный круг
     обоих колебаний: иначе мерка держалась бы на том, в какой фазе её
     застали, и мигала бы через раз. */
  const ink = m => {
    const g = m.a === undefined ? 1 : m.a;
    const rgba = /^rgba?\(([^)]*)\)/.exec(String(m.c));
    if (!rgba) return g;
    const p = rgba[1].split(',');
    return g * (p.length > 3 ? parseFloat(p[3]) : 1);
  };
  let rimLoud = 0, fireQuiet = Infinity, seenRim = 0, seenFire = 0;
  for (let i = 0; i < 130; i++) {                        // 2.08 с — дольше обоих колебаний
    W.update(0.016);
    for (const m of paintsFull(() => W.drawPawn(0, 0, 0, { armor: 'heavy', potion: c, mut: true, mut2: true }))) {
      if (m.c === c) { seenRim++; rimLoud = Math.max(rimLoud, ink(m)); }
      if (String(m.c).indexOf('rgba(255,120,36,') === 0) { seenFire++; fireQuiet = Math.min(fireQuiet, ink(m)); }
    }
  }
  note('за круг колебаний: самый густой мазок ободка ' + rimLoud.toFixed(2) +
       ', самый тусклый мазок контура ' + fireQuiet.toFixed(2));
  ok(seenRim > 0 && rimLoud < 0.5, 'ободок идёт вполсилы даже в самой яркой своей фазе: ' + rimLoud.toFixed(2));
  ok(seenFire > 0 && rimLoud < fireQuiet,
     'и тише горящего контура в любой фазе обоих — срыв важнее выпитого');
}

/* ====================  ТРИ СТРОКИ ТАБЛИЦЫ «ЧТО ПОКАЗЫВАЕТ СОСТОЯНИЕ»  ======
   Их не стерёг никто, и это доказано подменами на копии: обнуление
   покачивания (bob = 0), остановка превью (lookSpin += 0) и снятая
   полупрозрачность уклонения не уронили ни одной мерки из ста шестидесяти
   трёх. Все три — прямые обещания замысла, и все три ниже. */

head('Ходьба покачивает фигуру, а стояние — нет');
{
  /* Покачивание — единственное, чем ходьба видна на фигуре. Обнулить его
     значило не тронуть ни красок, ни поворотов, ни NaN: стенду было не за
     что взяться. Берёмся за ТОЧКИ ПУТИ — покачивание живёт ровно в них. */
  const yOf = w => traces(() => W.drawPawn(0, 0, 0, { armor: 'heavy', look: W.LOOK_DEF, walk: w }))
                     .map(e => e.y);
  const PERIOD = Math.PI * 2 / 9;                       // bob = sin(walk · 9)
  const base = yOf(0), quarter = yOf(PERIOD / 4);       // четверть круга — от нуля до края
  ok(base.length > 0 && base.length === quarter.length, 'фигура нарисована и в покое, и на ходу');
  const moved = base.filter((y, i) => Math.abs(y - quarter[i]) > 1e-9).length;
  note('точек фигуры сдвинулось: ' + moved + ' из ' + base.length);
  ok(moved === base.length, 'на ходу сдвинулась ВСЯ фигура, а не часть её');
  const dy = quarter[0] - base[0];
  ok(base.every((y, i) => Math.abs((quarter[i] - y) - dy) < 1e-9),
     'и ровно на одну и ту же величину — это качание, а не перекос');
  note('размах покачивания: ' + dy.toFixed(2) + ' шага');
  ok(Math.abs(dy) > 0.2, 'покачивание заметно глазу');
  ok(Math.abs(dy) < 3, 'но фигуру не колотит');

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 40; i++) {                       // полный круг покачивания
    const d = yOf(i / 40 * PERIOD)[0] - base[0];
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  note('за круг фигура ходит от ' + lo.toFixed(2) + ' до ' + hi.toFixed(2));
  ok(lo < -0.2 && hi > 0.2, 'качает в ОБЕ стороны, а не сдвигает раз и навсегда');

  /* И часы шага идут только на ходу: иначе пешка покачивалась бы стоя. */
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const w0 = W.pawnState().walk;
  for (let i = 0; i < 10; i++) W.update(0.016);
  ok(W.pawnState().walk === w0, 'стоя на месте часы шага не идут: ' + W.pawnState().walk);
  keyDown('KeyD');                                      // зажали «вправо» и не отпустили
  for (let i = 0; i < 10; i++) W.update(0.016);
  const w1 = W.pawnState().walk;
  key('KeyD');                                          // и отпустили, чтобы не тянуть в другие мерки
  note('часы шага после десяти кадров ходьбы: ' + w1.toFixed(3));
  ok(w1 > w0, 'а на ходу идут — покачивание подхватывается');
}

head('Ведьмак в зеркале поворачивается сам');
{
  /* Превью в зеркале крутится, чтобы было видно и лицо, и затылок с
     причёской, и мечи за спиной. Остановить его значило показать одну
     сторону — и ни одна мерка этого не замечала. Поворот виден в ctx.rotate:
     первый из них у пешки и есть её разворот. */
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  const turn = () => spins(() => W.drawLook())[0];
  const seen = [turn()];
  for (let i = 0; i < 3; i++) { W.update(0.2); seen.push(turn()); }
  note('поворот превью по кадрам: ' + seen.map(v => v.toFixed(3)).join(' → '));
  ok(seen.every(v => typeof v === 'number' && isFinite(v)), 'поворот вообще снялся');
  let same = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) same++;
  ok(same === 0, 'между кадрами поворот меняется каждый раз — фигура крутится, а не стоит');
  const steps = seen.slice(1).map((v, i) => v - seen[i]);
  ok(steps.every(s => s > 0), 'и крутится в одну сторону, а не дёргается: шаги ' +
     steps.map(s => s.toFixed(3)).join(', '));
  ok(steps.every(s => s < 2), 'и не мельтешит: самый большой шаг ' +
     Math.max.apply(null, steps).toFixed(3) + ' рад');
}

head('Уклонение видно полупрозрачностью');
{
  /* «Уклонение — полупрозрачность, как сейчас» — строка замысла. Снять её
     значило рисовать перекат так же, как ходьбу; ни одна мерка не падала.
     Густоту снимаем с ГЛАЗ: кошачий жёлтый больше нигде в кадре не
     встречается (это отдельно проверено в check-signs), и по нему видно
     ровно ту фигуру, о которой речь. */
  W.reset(); W.setPhase('HUNT'); W.setPanel(null); W.setLook(W.LOOK_DEF);
  const P = W.getP();
  const eye = W.EYES.cat.c;
  const inkOf = () => paintsFull(() => W.render()).filter(m => m.c === eye).map(m => m.a);

  const calm = inkOf();
  ok(calm.length === 2, 'глаза пешки в кадре нашлись: мазков ' + calm.length);
  ok(calm.every(a => a >= 0.999), 'в покое фигура непрозрачна: ' + calm.join(', '));

  P.dodge = 0.2;
  const roll = inkOf();
  note('густота фигуры: в покое ' + calm.join('/') + ', в уклонении ' + roll.join('/'));
  ok(roll.length === calm.length, 'в уклонении рисуется та же фигура, а не другая');
  ok(roll.every(a => a < calm[0]), 'и рисуется СКВОЗЬ — густота упала');
  ok(roll.every(a => a > 0.25), 'но не пропадает вовсе: в перекате себя видно');

  /* Полупрозрачность взяла ФИГУРУ, а не весь кадр — и не залипла после неё.
     Ставится она на холст целиком, поэтому забыть вернуть единицу значило бы
     выцветить всё, что рисуется дальше: меч, частицы, тварей, пояс. По глазам
     такое не увидеть — они рисуются раньше. Считаем, сколько мазков во всём
     кадре идут ровно с той густотой, что у фигуры. */
  const factor = roll[0];
  const dimCount = () => paintsFull(() => W.render()).filter(m => Math.abs(m.a - factor) < 1e-9).length;
  const nRoll = dimCount();
  P.dodge = 0;
  const nCalm = dimCount();
  const total = paintsFull(() => W.render()).length;
  note('мазков с густотой переката: в уклонении ' + nRoll + ', в покое ' + nCalm + ' (всего в кадре ' + total + ')');
  ok(nRoll > 0 && nRoll < total / 2, 'сквозь рисуется фигура, а не весь кадр');
  ok(nCalm === 0, 'а вне переката — ни одного: густота вернулась, а не залипла');
  ok(inkOf().every(a => a >= 0.999), 'перекат кончился — фигура снова плотная');
}

head('Рисуется в любом состоянии');
{
  const cases = [
    ['голый',             P => { P.steel = null; P.silver = null; P.xbow = null; P.armor = null; }],
    ['со сталью в руке',  P => { P.hand = 'steel'; }],
    ['с серебром в руке', P => { P.hand = 'silver'; }],
    ['под Квеном',        P => { P.quen = 50; P.quenT = 5; }],
    ['в уклонении',       P => { P.dodge = 0.2; }],
    ['мутация первая',    P => { P.mut = 5; }],
    ['мутация вторая',    P => { P.mut = 5; P.mut2 = 5; }],
    ['на ходу',           P => { P.walk = 3.7; }],
  ];
  let fell = null;
  for (const [name, set] of cases) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    set(W.getP());
    try { W.render(); } catch (e) { fell = name + ': ' + e.message; break; }
  }
  ok(!fell, fell || 'все восемь состояний рисуются');
}

/* Холст МОЛЧА глотает путь, у которого в координатах NaN: ни ошибки, ни следа,
   просто пусто на экране. Ровно так пешка и пропадала бы в зеркале — там
   drawPawn зовут со своим st, где про шаг ничего не сказано. */
head('Пешка не уходит в NaN, когда про шаг не сказано');
{
  const full = { armor: 'heavy', steel: true, silver: true, xbow: true, mut: true, mut2: true, look: W.LOOK_DEF };
  const bad = nans(() => W.drawPawn(0, 0, 0, full));
  ok(bad.length === 0, bad.length
     ? ('в NaN ушли вызовы: ' + Array.from(new Set(bad)).join(', '))
     : 'без st.walk все координаты остались числами');

  const bad2 = nans(() => W.drawPawn(0, 0, 0, { walk: 1.4 }));
  ok(bad2.length === 0, bad2.length ? ('с шагом в NaN ушли: ' + Array.from(new Set(bad2)).join(', ')) : 'и с шагом тоже');
}

head('Лежачий ведьмак тоже рисуется');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.inv = 0; P.dodge = 0;                       // иначе удар отбрасывается на первой же строке
  W.hurtPlayer(999999, 'проверка');
  ok(W.getOver(), 'ведьмак и правда упал');
  ok(W.pawnState().down === true, 'pawnState это заметил');
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'лежачая фигура рисуется');
}

/* Лежачего от стоячего на стенде отличить нечем, кроме поворота холста: своих
   красок у него нет, прозрачность наружу не выходит. Пишем углы. */
head('Лежачий повёрнут иначе стоячего');
{
  const up   = spins(() => W.drawPawn(0, 0, 0, { down: false }));
  const down = spins(() => W.drawPawn(0, 0, 0, { down: true }));
  ok(up.length === 1 && Math.abs(up[0] - Math.PI / 2) < 1e-9,
     'стоячий развёрнут ровно на четверть оборота: вперёд — это -Y');
  ok(down.length === 1 && Math.abs(down[0] - (Math.PI / 2 + 1.3)) < 1e-9,
     'лежачий довёрнут ещё на 1.3 радиана — фигура завалена набок');

  const look = spins(() => W.drawPawn(0, 0, 1.0, {}));
  ok(look.length === 1 && Math.abs(look[0] - (1.0 + Math.PI / 2)) < 1e-9,
     'взгляд входит в поворот целиком: фигура смотрит туда же, куда ведьмак');
}

head('Зеркало стоит в лагере и к нему можно подойти');
{
  const M = W.MIRROR, F = W.FIRE;
  ok(!!M, 'зеркало заведено');
  const d = Math.hypot(M.x - F.x, M.y - F.y);
  note('от костра до зеркала: ' + Math.round(d) + ' шагов');
  ok(d < 170, 'внутри чистого круга у костра — не зарастёт кустами');
  ok(d > 40, 'и не вплотную к костру');
  ok(Math.hypot(M.x - W.BENCH.x, M.y - W.BENCH.y) > 40, 'не налезает на верстак');
  ok(Math.hypot(M.x - W.BOARD.x, M.y - W.BOARD.y) > 40, 'не налезает на доску');
  /* obstNear отдаёт всё из соседних клеток сетки, а не «накрыло ли точку», —
     потому меряем сами и той же меркой, что аудит: r + 12, чтобы у зеркала
     было где встать, а не только куда воткнуть значок. */
  const near = W.obstNear(M.x, M.y);
  const hit = near.filter(o => Math.hypot(o.x - M.x, o.y - M.y) < o.r + 12);
  const gap = near.length ? Math.min.apply(null, near.map(o => Math.hypot(o.x - M.x, o.y - M.y) - o.r)) : Infinity;
  note('преград рядом: ' + near.length + ', до ближайшей ' +
       (gap === Infinity ? 'ни одной' : Math.round(gap) + ' шагов'));
  ok(hit.length === 0, 'на самом зеркале нет преграды');
}

/* Мало, чтобы зеркало было заведено, — его должны РИСОВАТЬ. Подпись ищем в
   следе кадра и сверяем не с числом на экране (его двигает камера), а с
   подписью костра: разность их мест обязана совпасть с разностью мест
   в мире. Так проверка переживёт любой сдвиг лагеря. */
head('Зеркало и его подпись правда рисуются');
{
  W.reset(); W.setPhase('CAMP'); W.setPanel(null);
  const P = W.getP();
  P.x = W.MIRROR.x; P.y = W.MIRROR.y + 20; W.syncCam();
  const ms = frameMarksAll();
  const m = ms.find(t => t.s === 'E — облик'), f = ms.find(t => t.s === 'костёр');
  ok(!!m, m ? 'подпись «E — облик» написана' : 'подписи «E — облик» в кадре нет');
  ok(!!f, 'подпись костра на месте — есть с чем сверять');
  if (m && f) {
    ok(Math.abs((m.x - f.x) - (W.MIRROR.x - W.FIRE.x)) < 1e-6 &&
       Math.abs((m.y - f.y) - (W.MIRROR.y - W.FIRE.y)) < 1e-6,
       'и стоит она относительно костра ровно там, где стоит само зеркало');
    ok(m.al === 'center', 'выключена по середине значка, как и остальные подписи лагеря');
  }
}

head('E у зеркала открывает и закрывает облик');
{
  W.reset(); W.setPhase('CAMP'); W.setPanel(null);
  const P = W.getP();
  P.x = W.MIRROR.x; P.y = W.MIRROR.y + 20; W.syncCam();
  W.interact();
  ok(W.getPanel && W.getPanel() === 'look', 'подошёл, нажал E — открылся облик');
  W.interact();
  ok(W.getPanel() === null, 'ещё раз E — закрылся');
}

/* =====================  ЛИСТАНИЕ ПОЛЕЙ  ===================== */

head('Стрелка листает причёску и запоминает');
{
  W.reset(); W.setPhase('CAMP');
  W.setLook(W.LOOK_DEF); W.setPanel('look');
  const was = W.getLook().hair;
  const keys = Object.keys(W.HAIRS);
  W.lookStep('hair', 1);
  const now = W.getLook().hair;
  note('причёска: ' + was + ' → ' + now);
  ok(now !== was, 'причёска сменилась');
  ok(keys.indexOf(now) === (keys.indexOf(was) + 1) % keys.length, 'сменилась на следующую по таблице');
  ok(JSON.parse(store['witcher_look']).hair === now, 'и сразу записалась');

  W.lookStep('hair', -1);
  ok(W.getLook().hair === was, 'шаг назад возвращает ровно предыдущую');
}

head('Листание по кругу не выходит за таблицу');
{
  W.setLook(W.LOOK_DEF);
  const keys = Object.keys(W.HAIRS);
  for (let i = 0; i < keys.length * 3 + 1; i++) W.lookStep('hair', 1);
  ok(!!W.HAIRS[W.getLook().hair], 'после многих щелчков ключ всё ещё из таблицы');
  for (let i = 0; i < keys.length * 3 + 1; i++) W.lookStep('hair', -1);
  ok(!!W.HAIRS[W.getLook().hair], 'и в обратную сторону тоже');
  ok(W.getLook().hair === W.LOOK_DEF.hair, 'столько же шагов туда и обратно — там же, где начали');

  // чужое имя поля не должно ни ронять игру, ни портить облик
  const before = JSON.stringify(W.getLook());
  let fell = null;
  try { W.lookStep('нос', 1); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'незнакомое поле листается вхолостую, без падения');
  ok(JSON.stringify(W.getLook()) === before, 'и облик от этого не изменился');
}

/* =====================  ПАНЕЛЬ У ЗЕРКАЛА  =====================
   Панель — это то, что человек видит глазами, и «не упало» тут не мерка:
   молча не нарисовать можно всё что угодно. Меряем по следу: что написано,
   ГДЕ написано, куда расставлены попадания и какими красками нарисовано
   превью. */

head('Панель облика рисуется и подписана');
{
  W.reset(); W.setPhase('CAMP');
  W.setLook(W.LOOK_DEF);
  W.setPanel('look');
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'панель облика рисуется');

  const lines = frame();
  ok(lines.some(s => s.indexOf('ОБЛИК') >= 0), 'заголовок на месте');
  for (const F of W.LOOK_FIELDS) {
    ok(lines.some(s => s === F.n), 'строка «' + F.n + '» на месте');
    ok(lines.some(s => s === F.tab[W.LOOK_DEF[F.k]].n),
       'и рядом написано текущее значение «' + F.tab[W.LOOK_DEF[F.k]].n + '»');
  }
  ok(lines.some(s => s.indexOf('наугад') >= 0), 'кнопка «наугад» на месте');
  ok(lines.some(s => s.indexOf('готово') >= 0), 'кнопка «готово» на месте');

  /* Холст глотает путь с NaN в координатах МОЛЧА: ни ошибки, ни следа, просто
     пустое место вместо превью. Проверка «не упало» такое пропускает целиком. */
  const bad = nans(() => W.drawLook());
  ok(bad.length === 0, bad.length ? 'холсту дали NaN: ' + bad.join(', ')
                                  : 'ни одного NaN в доводах холста');
}

/* Раскладка считается ОТДЕЛЬНО от отрисовки — значит её можно померить на
   любом размере холста, не видя пикселей. Полный экран меняет и CW, и CH:
   на сверхшироком мониторе высота падает до 400. */
head('Панель складывается на любом холсте');
{
  for (const [cw0, ch] of [[520, 640], [480, 640], [1800, 640], [1800, 400], [640, 1400]]) {
    const cw = Math.min(W.PANEL_MAX, cw0);             // панель сама сужает колонку
    const A = W.lookLayout(cw, ch);
    const r = A.s * W.PAWN_R;
    const nm = cw0 + 'x' + ch + ': ';
    ok(A.px - r >= A.box.x && A.px + r <= A.box.x + A.box.w &&
       A.py - r >= A.box.y && A.py + r <= A.box.y + A.box.h,
       nm + 'фигура в ЛЮБОМ повороте внутри рамки превью (радиус ' + r.toFixed(1) +
       ' при полурамке ' + (Math.min(A.box.w, A.box.h) / 2) + ')');
    ok(A.box.x >= 14 && A.box.x + A.box.w <= cw - 14 &&
       A.box.y >= 68 && A.box.y + A.box.h + 16 <= ch - 56,
       nm + 'рамка превью с подписью внутри панели, ниже шапки и выше подвала');
    ok(A.px + r <= A.fx, nm + 'превью не налезает на колонку полей');
    const last = A.y0 + A.step * (W.LOOK_FIELDS.length - 1);
    ok(last + 24 <= A.by, nm + 'последняя строка не налезает на кнопки');
    ok(A.by + 20 <= ch - 56, nm + 'кнопки не налезают на подвал панели');
    ok(A.step >= 26, nm + 'между строками остаётся просвет (шаг ' + A.step + ')');
    ok(A.fw >= 200 && A.fx + A.fw <= cw - 14, nm + 'колонка полей не схлопнулась (ширина ' + A.fw + ')');
    ok(A.fw - 2 * 96 >= 8, nm + 'две кнопки внизу колонки не наезжают друг на друга');
  }
}

head('Строки правда нарисованы там, где считает раскладка');
{
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  const A = W.lookLayout(Math.min(W.PANEL_MAX, 520), 640);
  const ms = frameMarks();
  const bad = [];
  W.LOOK_FIELDS.forEach((F, i) => {
    const m = ms.find(t => t.s === F.n);
    if (!m) { bad.push(F.n + ': не написано'); return; }
    if (Math.abs(m.x - A.fx) > 0.5 || Math.abs(m.y - (A.y0 + i * A.step)) > 0.5)
      bad.push(F.n + ': ' + Math.round(m.x) + ',' + Math.round(m.y) +
               ' вместо ' + A.fx + ',' + (A.y0 + i * A.step));
  });
  ok(bad.length === 0, bad.length ? 'разъехалось: ' + bad.join('; ')
                                  : 'все шесть строк стоят в колонке ровно по шагу раскладки');
  const onBox = ms.filter(t => W.LOOK_FIELDS.some(F => F.n === t.s))
                  .filter(t => t.x < A.box.x + A.box.w);
  ok(onBox.length === 0, 'ни одна строка не заезжает на рамку превью');
}

/* Превью — единственное место в игре, где холст РАСТЯГИВАЕТСЯ: translate →
   scale → translate. Забудь один сдвиг — и фигура не вырастет на месте, а
   уедет вчетверо дальше от угла холста. Ни краска, ни поворот, ни местные
   оси от этого не меняются: поймать можно только по точкам пути, приведённым
   к холсту (p.sx/p.sy), — их стенд и ведёт. */
head('Превью правда нарисовано в своей рамке, а не уехало от угла');
{
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  W.render();
  const A = W.lookLayout(Math.min(W.PANEL_MAX, 520), 640);
  const pts = traces(() => W.drawLook());
  note('точек пути в превью: ' + pts.length);
  ok(pts.length > 0, 'путь фигуры вообще проложен — есть что мерить');
  const out = pts.filter(p => p.sx < A.box.x || p.sx > A.box.x + A.box.w ||
                              p.sy < A.box.y || p.sy > A.box.y + A.box.h);
  ok(out.length === 0, out.length
     ? 'за рамкой оказалось точек: ' + out.length + ', первая в ' +
       Math.round(out[0].sx) + ',' + Math.round(out[0].sy) +
       ' при рамке ' + A.box.x + '…' + (A.box.x + A.box.w) + ' на ' +
       A.box.y + '…' + (A.box.y + A.box.h)
     : 'все точки фигуры легли внутрь рамки превью');
  /* Поворот стенд не считает, но он и не нужен: середина фигуры совпадает с
     серединой рамки, а поворот расстояния до неё не меняет. Значит по этим же
     точкам видно, не занижен ли PAWN_R, из которого считается увеличение. */
  const rmax = Math.max.apply(null, pts.map(p => Math.hypot(p.sx - A.px, p.sy - A.py))) / A.s;
  note('дальняя точка пути от середины: ' + rmax.toFixed(1) + ' при заявленных ' + W.PAWN_R);
  ok(rmax <= W.PAWN_R, 'заявленный радиус пешки не занижен — рамка не обманывает сама себя');
}

/* Полный экран: холст становится вдвое шире, а панель сама сужается в колонку
   посередине (panelStart) и сдвигает вместе с собой попадания. Посчитай
   раскладку по НЕсуженной ширине — и стрелки уедут за правый край панели.
   В окне 520 эта ошибка не видна вовсе: там сужать нечего. */
head('В полный экран панель остаётся в своей колонке');
{
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  peek('__fsResize')(1600, 900);
  const cw = peek('CW'), ch = peek('CH');
  note('холст в полный экран: ' + cw + 'x' + ch);
  const colW = Math.min(W.PANEL_MAX, cw), shift = Math.round((cw - colW) / 2);
  note('колонка панели: ' + (shift + 14) + '…' + (shift + colW - 14));
  ok(shift > 0, 'колонка правда уже холста — есть что проверять');

  W.render();
  const out = W.getHits().filter(b => b.x < shift + 14 || b.x + b.w > shift + colW - 14 ||
                                      b.y < 24 || b.y + b.h > ch - 36);
  ok(out.length === 0, out.length
     ? 'за колонку уехало кнопок: ' + out.length + ' (правый край ' +
       Math.round(out[0].x + out[0].w) + ')'
     : 'все кнопки панели остались в колонке посередине экрана');

  const A = W.lookLayout(colW, ch);
  const m = frameMarks().find(t => t.s === 'Причёска');
  ok(!!m && Math.abs(m.x - (shift + A.fx)) < 0.5,
     m ? 'и строки написаны в той же колонке' : 'строки «Причёска» в кадре нет');

  peek('__fsRestore')();
  W.render();
  ok(peek('CW') === 520 && peek('CH') === 640, 'обратно в окно — холст прежний');
}

/* Превью обязано показывать облик, который человек ЛИСТАЕТ ПРЯМО СЕЙЧАС.
   Испечь картинку один раз при открытии — соблазн (так и написано в замысле
   про быстродействие), и ровно от этого она молча перестала бы отвечать на
   стрелки. Ловим по краскам: другого следа от картинки нет. */
head('Превью показывает облик, который сейчас листают, а не испечённый однажды');
{
  W.reset(); W.setPhase('CAMP'); W.setPanel('look');
  W.setLook(W.LOOK_DEF);                                // hairC = white
  const a = paints(() => W.drawLook());
  note('красок за отрисовку панели: ' + a.length);
  ok(a.indexOf(W.HAIR_C.white.c) >= 0, 'седые волосы в превью нарисованы');
  W.lookStep('hairC', 1);                               // white → ash
  note('цвет волос: ' + W.getLook().hairC);
  const b = paints(() => W.drawLook());
  ok(b.indexOf(W.HAIR_C.ash.c) >= 0, 'после щелчка в превью новый цвет');
  ok(b.indexOf(W.HAIR_C.white.c) < 0, 'а старого не осталось — картинка не испечена наперёд');
}

head('Стрелки и «наугад» нажимаются мышью, а не только зовутся из кода');
{
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  W.render();                                           // отрисовка расставляет попадания
  const A = W.lookLayout(Math.min(W.PANEL_MAX, 520), 640);
  const i = W.LOOK_FIELDS.findIndex(f => f.k === 'hair');
  const ry = A.y0 + i * A.step;
  const keys = Object.keys(W.HAIRS);

  const was = W.getLook().hair;
  tap(A.fx + A.fw - 9, ry + 16);                        // середина правой стрелки
  const now = W.getLook().hair;
  note('щёлкнули «›» в ' + Math.round(A.fx + A.fw - 9) + ',' + (ry + 16) + ': ' + was + ' → ' + now);
  ok(keys.indexOf(now) === (keys.indexOf(was) + 1) % keys.length, 'клик по «›» листает вперёд');
  ok(JSON.parse(store['witcher_look']).hair === now, 'и сразу записывается');

  W.render();
  tap(A.fx + 9, ry + 16);                               // середина левой стрелки
  ok(W.getLook().hair === was, 'клик по «‹» возвращает назад');

  W.setLook(W.LOOK_DEF); W.render();
  let changed = false;
  for (let n = 0; n < 20 && !changed; n++) {
    tap(A.fx + 48, A.by + 10);                          // середина «наугад»
    changed = W.LOOK_FIELDS.some(F => W.getLook()[F.k] !== W.LOOK_DEF[F.k]);
    W.render();
  }
  ok(changed, 'кнопка «наугад» правда меняет облик');
  const strange = W.LOOK_FIELDS.filter(F => !F.tab[W.getLook()[F.k]]);
  ok(strange.length === 0, 'и после неё все поля из своих таблиц');
}

/* Панель перекрывает пояс с зельями, и в этой игре уже случалось, что клик по
   «пустому» месту переключал зелье сквозь окно. panelBox затирает старые
   попадания — значит все, что остались, обязаны лежать внутри рамки. */
head('Сквозь панель ничего не нажать');
{
  W.reset(); W.setPhase('CAMP'); W.setPanel('look');
  W.render();
  const hits = W.getHits();
  note('попаданий в панели: ' + hits.length);
  ok(hits.length === W.LOOK_FIELDS.length * 2 + 3,
     'двенадцать стрелок, «наугад», «готово» и «закрыть» — и больше ничего');
  const out = hits.filter(b => b.x < 14 || b.y < 24 || b.x + b.w > 520 - 14 || b.y + b.h > 640 - 36);
  ok(out.length === 0, out.length ? 'за рамкой оказалось кнопок: ' + out.length
                                  : 'все попадания внутри рамки — пояс с зельями закрыт');
}

head('Облик у зеркала меняется даром и время похода при этом стоит');
{
  W.reset(); W.setPhase('CAMP'); W.setLook(W.LOOK_DEF); W.setPanel('look');
  const P = W.getP();
  const gold0 = W.getGold(), hp0 = P.hp;
  P.tox = 40; P.mut = 3;
  const mut0 = P.mut, tox0 = P.tox;
  for (let i = 0; i < 60; i++) { W.update(0.016); W.render(); }
  for (let n = 0; n < 8; n++) W.lookStep('hair', 1);
  ok(W.getGold() === gold0, 'золото не тронуто: облик даром');
  ok(P.hp === hp0, 'здоровье не тронуто');
  ok(P.mut === mut0 && P.tox === tox0, 'почти секунда с открытой панелью — а мутация и отрава стоят');
}

done();
