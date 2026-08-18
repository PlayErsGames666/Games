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

done();
