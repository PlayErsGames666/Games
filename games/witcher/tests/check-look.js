/* Облик ведьмака: таблицы, запись, зеркало, панель.
   Пишется по частям вместе с задачами 2, 5 и 6 плана. */
'use strict';
const { W, store, ok, note, head, done, paints, spins, nans, traces } = require('./harness.js');

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

head('Арбалет на поясе виден только когда он есть');
{
  const on  = paints(() => W.drawPawn(0, 0, 0, { xbow: true }));
  const off = paints(() => W.drawPawn(0, 0, 0, { xbow: false }));
  ok(on.indexOf('#6b5a3a') >= 0, 'арбалет нарисован');
  ok(off.indexOf('#6b5a3a') < 0, 'без арбалета на поясе пусто');
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

done();
