/* Облик ведьмака: таблицы, запись, зеркало, панель.
   Пишется по частям вместе с задачами 2, 5 и 6 плана. */
'use strict';
const { W, store, ok, note, head, done } = require('./harness.js');

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

done();
