/* Облик ведьмака: таблицы, запись, зеркало, панель.
   Пишется по частям вместе с задачами 2, 5 и 6 плана. */
'use strict';
const { W, store, ok, note, head, done, paints } = require('./harness.js');

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

done();
