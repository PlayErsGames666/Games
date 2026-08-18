# Моделька ведьмака, облик и знаки — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить ведьмака-из-двух-кругов на пешку в духе RimWorld, показывающую снаряжение и состояние; дать место в лагере, где облик собирается под себя; переделать четыре знака из конусов и кругов в глиф со стихией.

**Architecture:** Весь код идёт в `games/witcher/game.js` отдельными разделами со своими таблицами — так же, как там уже лежат `LOCS`, `ARMOR`, `RUNES`. Моделька рисуется одной функцией `drawPawn`, которая ничего не считает: правила боя её не видят. Знаки остаются на существующей системе частиц `parts[]`, ей добавляется потолок. Панель облика — ещё одно значение `panel`, рядом с `bag`, `skills`, `bench`.

**Tech Stack:** Чистый браузерный JavaScript без сборки и зависимостей. Проверки — node, стенд `games/witcher/tests/`, запуск `node games/witcher/tests/run.js`.

## Global Constraints

- Весь новый код — в `games/witcher/game.js`. Новых файлов игры не создавать: стенд грузит ровно этот файл и берётся за `globalThis.__W`.
- Ни одной внешней картинки, шрифта или библиотеки. Всё рисуется кодом, игра открывается с `file://` двойным щелчком.
- **Правила боя не меняются.** Радиус столкновений ведьмака, дальность удара, зоны знаков — те же. Игни бьёт 120 шагов при полураскрытии 0.7, Аард — 100 при 0.8, Ирден ловит в радиусе 58. Это закрыто проверкой в задаче 2, и она пишется ПЕРВОЙ.
- Облик хранится в отдельном ключе `witcher_look`, не внутри записи похода: он переживает «Заново».
- Потолок частиц — 320 штук, вытесняются самые старые.
- Язык кода и комментариев — русский, как во всём файле.
- Коммит после каждой задачи. Ветку не заводить: в этом репозитории всё идёт в `main`.

## Чего стенд не может, и что с этим делать

Стенд подставляет холст-заглушку: он знает, что игра ПРОСИЛА нарисовать, но не знает, что получилось. Поэтому в каждой задаче шаги делятся на два рода, и это помечено прямо в шагах:

- **Проверкой** — то, что стенд видит: зоны поражения, число частиц, что панель не падает, что запись читается, что до зеркала можно дойти.
- **Глазами** — то, что стенд не видит: красиво ли. Открыть `games/witcher/index.html` двойным щелчком и посмотреть.

Шаг «посмотреть глазами» — это настоящий шаг, а не формальность: половина задач тут именно про картинку.

## Карта файлов

| Файл | За что отвечает | Что с ним делаем |
|---|---|---|
| `games/witcher/game.js` | Вся игра | Правим: таблицы облика, `drawPawn`, зеркало, панель, знаки |
| `games/witcher/tests/check-signs.js` | Зоны знаков, потолок частиц | **Создаём** |
| `games/witcher/tests/check-look.js` | Облик: таблицы, запись, панель, зеркало | **Создаём** |
| `games/witcher/tests/check-world.js` | Записи, размеры земли | Правим: стойкость записи облика |
| `games/witcher/tests/check-render.js` | Отрисовка всех панелей | Правим: панель облика в общий прогон |
| `games/witcher/tests/check-audit.js` | Достижимость всего в мире | Правим: зеркало в список |
| `games/witcher/tests/README.txt` | Что где лежит в стенде | Правим: два новых файла проверок |
| `games/witcher/управление.txt` | Справка по управлению | Правим: зеркало и E у него |

---

### Задача 1: Страховочная сетка — правила боя не изменились

Эта задача идёт первой намеренно. Дальше мы перепишем и фигуру, и все четыре знака; без этой сетки сдвиг зоны поражения на десять шагов не заметит никто. Проверка меряет зоны ПОВЕДЕНИЕМ — ставит тварь на известное расстояние и смотрит, достало её или нет, — поэтому она переживёт любую переделку внутренностей.

**Files:**
- Create: `games/witcher/tests/check-signs.js`
- Modify: `games/witcher/game.js` — раздел `globalThis.__W` в конце файла

**Interfaces:**
- Produces: `__W.getParts()` — прямой доступ к массиву частиц; `__W.PART_CAP` появится в задаче 7, здесь ещё нет.

- [ ] **Шаг 1: Открыть частицы стенду**

В `games/witcher/game.js`, в объекте `globalThis.__W` (около строки 4698), рядом с `getShots: () => shots,` дописать:

```js
  getParts: () => parts,
```

- [ ] **Шаг 2: Написать проверку зон**

Создать `games/witcher/tests/check-signs.js`:

```js
/* Зоны знаков и потолок частиц.

   Знаки переписываются ради красоты, а красота живёт в тех же строчках, что
   и зона поражения. Эта проверка меряет зону ПОВЕДЕНИЕМ: ставит тварь на
   известное расстояние и смотрит, достало её или нет. Так она не зависит от
   того, как знак нарисован, и переживает любую переделку. */
'use strict';
const { W, ok, note, head, done } = require('./harness.js');

/* Достаёт ли знак тварь, поставленную на расстоянии d под углом da от взгляда.
   Тварь ставим свежую и с запасом здоровья, чтобы «не достало» нельзя было
   спутать с «убило с одного удара». */
function reach(rune, d, da) {
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.face = 0; P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.syncCam();
  W.setFoes([]);
  const a = (da || 0);
  W.spawnFoe('drowner', P.x + Math.cos(a) * d, P.y + Math.sin(a) * d);
  const f = W.getFoes()[0];
  f.hp = 100000;
  const hp0 = f.hp, kx0 = f.kx || 0;
  W.castRune(rune);
  W.update(0.016);
  return { hurt: f.hp < hp0, pushed: Math.abs((f.kx || 0) - kx0) > 1 };
}

head('Игни: конус 120 шагов, полураскрытие 0.7');
ok(reach(0, 100, 0).hurt, 'в ста шагах прямо перед собой — достаёт');
ok(!reach(0, 190, 0).hurt, 'в ста девяноста — не достаёт');
ok(reach(0, 100, 0.5).hurt, 'вбок на 0.5 радиана — достаёт');
ok(!reach(0, 100, 1.2).hurt, 'вбок на 1.2 радиана — мимо');

head('Аард: конус 100 шагов, полураскрытие 0.8');
ok(reach(1, 80, 0).pushed, 'в восьмидесяти шагах — сбивает');
ok(!reach(1, 170, 0).pushed, 'в ста семидесяти — не сбивает');
ok(reach(1, 80, 0.6).pushed, 'вбок на 0.6 радиана — сбивает');
ok(!reach(1, 80, 1.4).pushed, 'вбок на 1.4 радиана — мимо');

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
  function swingHits(d) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    const P = W.getP();
    P.x = 3000; P.y = 3000; P.face = 0; P.atkCd = 0; W.syncCam();
    W.setFoes([]);
    W.spawnFoe('drowner', P.x + d, P.y);
    const f = W.getFoes()[0]; f.hp = 100000;
    const hp0 = f.hp;
    W.swing();
    for (let i = 0; i < 6; i++) W.update(0.016);
    return f.hp < hp0;
  }
  const fr = W.FOES.drowner.r;
  note('радиус утопца: ' + fr + ', значит меч должен доставать до ' + (40 + fr));
  ok(swingHits(40 + fr - 4), 'чуть ближе предела — попадает');
  ok(!swingHits(40 + fr + 8), 'чуть дальше предела — мимо');
}

done();
```

- [ ] **Шаг 3: Прогнать — должна пройти на нынешнем коде**

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: все проверки прошли. Это не TDD наоборот — это сетка, снятая с работающего кода, чтобы ловить будущие сдвиги.

Если `P.r` окажется не 9 — исправить число в проверке на то, что в игре, и записать в примечании настоящее. Проверка описывает то, что есть, а не то, что мне кажется.

- [ ] **Шаг 4: Убедиться, что сетка ловит**

Временно поменять в `castRune` для Игни `120` на `95` (в обеих строчках — и в частице, и в `inCone`). Запустить проверку.
Ожидаем: `БАГ в ста шагах прямо перед собой — достаёт`.
Вернуть `120` обратно, прогнать снова — чисто.

Это обязательный шаг: проверка, которая не падает на подсунутой поломке, ничего не стоит.

- [ ] **Шаг 5: Прогнать весь стенд**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: `проверок пройдено: 10 из 10 · всё чисто`

- [ ] **Шаг 6: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-signs.js
git commit -m "Ведьмак: сетка на зоны знаков — до того, как их переписывать"
```

---

### Задача 2: Таблицы облика и его хранение

**Files:**
- Modify: `games/witcher/game.js` — новый раздел после `const ARMOR_KEYS` (около строки 172); раздел `__W` в конце
- Modify: `games/witcher/tests/check-world.js` — стойкость записи облика
- Create: `games/witcher/tests/check-look.js`

**Interfaces:**
- Produces: `look` (глобальный объект облика), `LOOK_FIELDS`, `LOOK_DEF`, `LOOK_KEY`, `loadLook()`, `saveLook()`, `randomLook()`, `HAIRS`, `HAIR_C`, `BEARDS`, `SCARS`, `SKINS`, `EYES`. Через `__W`: `getLook`, `setLook`, `loadLook`, `saveLook`, `randomLook`, `LOOK_FIELDS`, `LOOK_DEF`.

- [ ] **Шаг 1: Написать падающую проверку**

Создать `games/witcher/tests/check-look.js`:

```js
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
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: падение с `TypeError: W.loadLook is not a function` — ничего этого ещё нет.

- [ ] **Шаг 3: Написать таблицы и хранение**

В `games/witcher/game.js` сразу после строки `const ARMOR_KEYS = Object.keys(ARMOR);` вставить:

```js
/* =====================  ОБЛИК ВЕДЬМАКА  =====================
   Шесть полей, шесть таблиц. Таблицы держим тут, рядом с ARMOR и LOCS:
   их читают глазом и правят, не заглядывая в рисовалку.

   Облик лежит в СВОЁМ ключе, а не в записи похода. «Заново» стирает поход,
   но не лицо: собирать себе ведьмака заново после каждой новой игры —
   раздражение на ровном месте. */
const HAIRS  = { mane:{n:'Грива'}, tail:{n:'Хвост'}, braid:{n:'Коса'}, crop:{n:'Ёжик'}, bald:{n:'Лысина'} };
const HAIR_C = { white:{n:'Седой',c:'#e8dcc0'}, ash:{n:'Пепельный',c:'#b9b3a4'},
                 black:{n:'Чёрный',c:'#33302e'}, brown:{n:'Каштановый',c:'#5a3b25'},
                 red:{n:'Рыжий',c:'#8f4322'} };
const BEARDS = { none:{n:'Нет'}, stubble:{n:'Щетина'}, short:{n:'Короткая'}, full:{n:'Окладистая'} };
const SCARS  = { none:{n:'Нет'}, eye:{n:'Через глаз'}, cheek:{n:'Через щёку'} };
const SKINS  = { pale:{n:'Бледная',c:'#e0bd9a'}, fair:{n:'Светлая',c:'#d9b48c'},
                 tan:{n:'Смуглая',c:'#bb8f66'}, olive:{n:'Оливковая',c:'#a9825c'},
                 dark:{n:'Тёмная',c:'#7d5a3c'} };
const EYES   = { cat:{n:'Кошачий жёлтый',c:'#c8b400'}, amber:{n:'Янтарный',c:'#d08a2a'},
                 grey:{n:'Серый',c:'#9aa6ad'}, green:{n:'Зелёный',c:'#6fa257'} };

const LOOK_FIELDS = [
  { k:'skin',  n:'Кожа',       tab:SKINS  },
  { k:'hair',  n:'Причёска',   tab:HAIRS  },
  { k:'hairC', n:'Цвет волос', tab:HAIR_C },
  { k:'beard', n:'Борода',     tab:BEARDS },
  { k:'scar',  n:'Шрам',       tab:SCARS  },
  { k:'eye',   n:'Глаза',      tab:EYES   },
];
const LOOK_DEF = { skin:'fair', hair:'mane', hairC:'white', beard:'stubble', scar:'none', eye:'cat' };
const LOOK_KEY = 'witcher_look';
let look = Object.assign({}, LOOK_DEF);

function saveLook() {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(Object.assign({ v:1 }, look))); } catch (e) {}
}
/* Читаем ровно так же осторожно, как запись похода: сперва кладём умолчание,
   потом берём из записи ТОЛЬКО те ключи, которые есть в таблицах. Чужой ключ,
   число вместо строки, обрывок json — всё это молча заменяется умолчанием, а
   не роняет игру. Запись лежит в localStorage, туда лазают руками. */
function loadLook() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch (e) { s = null; }
  look = Object.assign({}, LOOK_DEF);
  if (s && typeof s === 'object') {
    for (const F of LOOK_FIELDS) if (F.tab[s[F.k]]) look[F.k] = s[F.k];
  }
  return look;
}
function randomLook() {
  for (const F of LOOK_FIELDS) {
    const ks = Object.keys(F.tab);
    look[F.k] = ks[Math.floor(rnd(ks.length))];
  }
  saveLook();
  return look;
}
```

- [ ] **Шаг 4: Читать облик при запуске и открыть его стенду**

В `globalThis.__W` рядом с `getP: () => P,` дописать:

```js
  getLook: () => look, setLook: v => { look = Object.assign({}, LOOK_DEF, v); },
  loadLook, saveLook, randomLook, LOOK_FIELDS, LOOK_DEF,
  HAIRS, HAIR_C, BEARDS, SCARS, SKINS, EYES,
```

И там, где игра запускается, — рядом с вызовом `loadRun()` — добавить `loadLook();`, чтобы облик читался при входе.

- [ ] **Шаг 5: Прогнать — должна пройти**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: `все проверки прошли (11)`

- [ ] **Шаг 6: Дописать стойкость облика в check-world**

В `games/witcher/tests/check-world.js`, в конце раздела про битую запись, перед `done();` дописать:

```js
head('Запись облика — такая же битая, такая же безопасная');
{
  store['witcher_look'] = ' {{{';
  let fell = false;
  try { W.loadLook(); } catch (e) { fell = true; }
  ok(!fell, 'мусор в записи облика не роняет игру');
  ok(W.getLook().hair === 'mane', 'взято умолчание');
}
```

Дописать `store` и `W` в список того, что берётся из `harness.js` в начале файла, если их там ещё нет.

- [ ] **Шаг 7: Прогнать весь стенд**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: `проверок пройдено: 11 из 11 · всё чисто`

- [ ] **Шаг 8: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-look.js games/witcher/tests/check-world.js
git commit -m "Ведьмак: таблицы облика и его запись"
```

---

### Задача 3: Пешка — фигура, облик, поворот

**Files:**
- Modify: `games/witcher/game.js` — новый раздел рисовалки перед `// игрок` (около строки 3381); замена самой отрисовки игрока
- Modify: `games/witcher/tests/check-look.js` — отрисовка всех значений таблиц

**Interfaces:**
- Consumes: `look`, `LOOK_FIELDS`, `HAIRS`, `HAIR_C`, `BEARDS`, `SCARS`, `SKINS`, `EYES` из задачи 2.
- Produces: `rrect(x, y, w, h, r)` — путь скруглённого прямоугольника; `drawPawn(x, y, a, st)` — рисует пешку, где `st` это `{ armor, hand, mut, mut2, quen, dodge, down, walk, potion }`, все поля необязательные; `pawnState()` — собирает `st` из `P`. Через `__W`: `drawPawn`, `pawnState`.

- [ ] **Шаг 1: Написать проверку отрисовки всех обликов**

В `games/witcher/tests/check-look.js` перед `done();` дописать:

```js
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
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: падение с `TypeError: W.setLook is not a function`, если задача 2 не сделана; иначе проверки пройдут вхолостую — пешки ещё нет, но старая отрисовка не падает. В этом случае считаем шаг пройденным: настоящая ценность этой проверки начнётся со следующего шага, когда рисовать станет что.

- [ ] **Шаг 3: Написать рисовалку**

В `games/witcher/game.js` перед комментарием `// игрок` в отрисовке (около строки 3381) вставить:

```js
/* =====================  ПЕШКА  =====================
   Ведьмак рисуется как пешка в RimWorld: вид сверху с наклоном, видно плечи,
   макушку и лицо. Фигура поворачивается ЦЕЛИКОМ по взгляду.

   Эта функция ничего не считает и ни на что не влияет: правила боя её не
   видят. Радиус столкновений остаётся девяткой, зоны знаков — своими. Видимый
   след пешки (около 20×26) чуть выше и уже прежнего круга, и это единственное,
   что меняется, — картинка.

   Местные оси: «вперёд» — это -Y, поэтому поворот на a + PI/2. */
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
function pawnState() {
  return {
    armor: P.armor ? P.armor.type : null,
    hand: P.hand, mut: P.mut > 0, mut2: P.mut2 > 0,
    quen: P.quen > 0, dodge: P.dodge > 0, down: over,
    walk: P.walk || 0, xbow: !!P.xbow,
  };
}
function drawPawn(x, y, a, st) {
  st = st || {};
  const A = st.armor && ARMOR[st.armor] ? ARMOR[st.armor] : null;
  const cloak = st.mut2 ? '#5a2020' : (A ? A.c : '#6b6f78');
  // силуэт по ВЕСУ доспеха: лёгкий узкий, тяжёлый широкий с пластинами
  const heavy = A ? A.w >= 20 : false, mid = A ? A.w >= 12 && A.w < 20 : false;
  const bw = heavy ? 16 : mid ? 15 : 13;
  const bob = Math.sin(st.walk * 9) * 0.8;

  ctx.save();
  ctx.translate(x, y);
  if (st.down) { ctx.rotate(a + Math.PI / 2 + 1.3); ctx.globalAlpha = 0.8; }
  else ctx.rotate(a + Math.PI / 2);

  ctx.fillStyle = 'rgba(0,0,0,.35)';                       // тень
  ctx.beginPath(); ctx.ellipse(0, 2, bw * 0.42, 9, 0, 0, 6.3); ctx.fill();

  // мечи за спиной: в руке — только один, второй остаётся торчать
  const steel = P.steel && st.hand !== 'steel', silver = P.silver && st.hand !== 'silver';
  if (steel)  { ctx.strokeStyle = SWORD.steel.c;  ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(-4, -6 + bob); ctx.lineTo(-7, -14 + bob); ctx.stroke(); }
  if (silver) { ctx.strokeStyle = SWORD.silver.c; ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(4, -6 + bob); ctx.lineTo(7, -14 + bob); ctx.stroke(); }

  ctx.fillStyle = cloak;                                    // плащ
  rrect(-bw / 2, -4 + bob, bw, 17, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();
  if (heavy) {                                              // пластины
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.moveTo(-bw / 2 + 1, 2 + bob); ctx.lineTo(bw / 2 - 1, 2 + bob);
    ctx.moveTo(-bw / 2 + 1, 7 + bob); ctx.lineTo(bw / 2 - 1, 7 + bob); ctx.stroke();
  }
  if (heavy || mid) {                                       // наплечники
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(-bw / 2, -1 + bob, 2.6, 4, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bw / 2, -1 + bob, 2.6, 4, 0, 0, 6.3); ctx.fill();
  }
  if (st.xbow) {                                            // арбалет на поясе
    ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(bw / 2 - 1, 8 + bob); ctx.lineTo(bw / 2 + 4, 10 + bob); ctx.stroke();
  }

  const hc = (HAIR_C[look.hairC] || HAIR_C.white).c;
  const sc = (SKINS[look.skin] || SKINS.fair).c;
  const ec = (EYES[look.eye] || EYES.cat).c;
  ctx.fillStyle = st.mut2 ? '#c98a7a' : sc;                 // голова
  ctx.beginPath(); ctx.arc(0, -7 + bob, 5.2, 0, 6.3); ctx.fill();

  ctx.fillStyle = hc;                                       // волосы
  if (look.hair !== 'bald') {
    ctx.beginPath(); ctx.arc(0, -7 + bob, 5.2, Math.PI, 0); ctx.fill();
  }
  if (look.hair === 'mane') {                               // грива по бокам
    rrect(-5.2, -7 + bob, 1.8, 6, 0.9); ctx.fill();
    rrect(3.4, -7 + bob, 1.8, 6, 0.9); ctx.fill();
  } else if (look.hair === 'tail') {                        // хвост назад
    rrect(-1.2, -13 + bob, 2.4, 5, 1.2); ctx.fill();
  } else if (look.hair === 'braid') {                       // коса вбок
    rrect(3.6, -9 + bob, 1.8, 7, 0.9); ctx.fill();
  }

  ctx.fillStyle = ec;                                       // глаза
  ctx.beginPath(); ctx.arc(-2, -6 + bob, 0.85, 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.arc(2, -6 + bob, 0.85, 0, 6.3); ctx.fill();

  if (look.beard !== 'none') {                              // борода
    ctx.fillStyle = look.beard === 'stubble' ? 'rgba(90,80,70,.55)' : hc;
    const bh = look.beard === 'full' ? 4 : look.beard === 'short' ? 2.6 : 1.6;
    rrect(-3.2, -4.4 + bob, 6.4, bh, 1.4); ctx.fill();
  }
  if (look.scar !== 'none') {                               // шрам
    ctx.strokeStyle = 'rgba(150,90,80,.85)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (look.scar === 'eye') { ctx.moveTo(-2.6, -9 + bob); ctx.lineTo(-1.4, -4 + bob); }
    else { ctx.moveTo(2.2, -8 + bob); ctx.lineTo(3.4, -4.5 + bob); }
    ctx.stroke();
  }
  if (st.mut || st.mut2) {                                  // жилы мутации
    ctx.strokeStyle = st.mut2 ? 'rgba(255,60,40,.9)' : 'rgba(200,60,50,.6)';
    ctx.lineWidth = st.mut2 ? 1.4 : 0.9;
    ctx.beginPath(); ctx.moveTo(-4, -9 + bob); ctx.lineTo(-2, -5 + bob);
    ctx.moveTo(4, -9 + bob); ctx.lineTo(2, -5 + bob); ctx.stroke();
  }
  if (st.mut2) {                                            // когти
    ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(bw / 2 - 1, 4 + i * 2.5 + bob);
      ctx.lineTo(bw / 2 + 4, 3 + i * 3 + bob); ctx.stroke();
    }
  }
  ctx.restore();
}
```

- [ ] **Шаг 4: Поставить пешку вместо двух кругов**

В отрисовке игрока (около строки 3388) заменить:

```js
  if (P.biz > 0) {
    drawIco('💼', 22, px, py);
  } else {
    ctx.fillStyle = P.mut2 > 0 ? '#ff2a2a' : P.mut > 0 ? '#c0303a' : '#2b2f38';
    ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.3); ctx.fill();
    ctx.strokeStyle = P.mut2 > 0 ? '#ffd0a0' : P.mut > 0 ? '#ff6a5a' : '#8a8f96';
    ctx.lineWidth = P.mut2 > 0 ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#e8d9a8';                                  // белая грива
    ctx.beginPath(); ctx.arc(px, py - 2, 5, 0, 6.3); ctx.fill();
  }
```

на:

```js
  if (P.biz > 0) {
    drawIco('💼', 22, px, py);
  } else {
    drawPawn(px, py, P.face, pawnState());
  }
```

- [ ] **Шаг 5: Завести счётчик шага**

В `update`, там где ведьмак двигается (рядом со строкой, где меняются `P.x`/`P.y` от ходьбы), добавить накопление:

```js
  P.walk = (P.walk || 0) + (moving ? dt : 0);
```

где `moving` — уже существующий признак того, что ведьмак идёт (ненулевой `mx` или `my`). Если такого признака под рукой нет, вычислить рядом: `const moving = mx !== 0 || my !== 0;`.

- [ ] **Шаг 6: Открыть стенду**

В `globalThis.__W` дописать: `drawPawn, pawnState, rrect,`

- [ ] **Шаг 7: Прогнать проверки**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: `обликов отрисовано: 26` и обе новые проверки прошли.

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: всё чисто — радиус ведьмака 9, зоны знаков не тронуты. Это главное подтверждение, что пешка не полезла в правила.

- [ ] **Шаг 8: Посмотреть ГЛАЗАМИ**

Открыть `games/witcher/index.html` двойным щелчком. Походить во все стороны.

Смотрим:
- фигура поворачивается целиком и читается на всех восьми направлениях;
- при ходьбе есть покачивание, но не «дрожь»;
- пешка не сливается с землёй ни в чаще, ни на болоте;
- рядом с 🐺 не выглядит чужеродной.

Если что-то из этого не так — правим `drawPawn` и смотрим снова. Стенд тут не помощник.

- [ ] **Шаг 9: Прогнать весь стенд и замерить**

```bash
node games/witcher/tests/run.js
node games/witcher/tests/perf-draw.js
```

Записать в коммит число операций холста до и после — оно понадобится, если позже встанет вопрос про печь.

- [ ] **Шаг 10: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-look.js
git commit -m "Ведьмак: пешка вместо двух кругов"
```

---

### Задача 4: Снаряжение и состояние на фигуре

Задача 3 уже нарисовала снаряжение, но никто не проверил, что игра не падает на КАЖДОМ сочетании. Восемь доспехов, две руки, две ступени мутации, Квен, уклонение, падение — здесь это закрывается.

**Files:**
- Modify: `games/witcher/tests/check-look.js`
- Modify: `games/witcher/game.js` — правки в `drawPawn` по результатам

**Interfaces:**
- Consumes: `drawPawn`, `pawnState` из задачи 3; `ARMOR_KEYS`, `buyArmor`, `mkArmor`, `equip` — уже есть в `__W`.

- [ ] **Шаг 1: Написать проверку**

В `games/witcher/tests/check-look.js` перед `done();` дописать:

```js
head('Рисуется в любом доспехе');
{
  let fell = null;
  for (const k of W.ARMOR_KEYS) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    W.equip(W.mkArmor(k, 0, null));
    try { W.render(); } catch (e) { fell = k + ': ' + e.message; break; }
  }
  note('доспехов проверено: ' + W.ARMOR_KEYS.length);
  ok(!fell, fell || 'все восемь доспехов рисуются');
}

head('Рисуется в любом состоянии');
{
  const cases = [
    ['голый',            P => { P.steel = null; P.silver = null; P.xbow = null; }],
    ['со сталью в руке', P => { P.hand = 'steel'; }],
    ['с серебром в руке',P => { P.hand = 'silver'; }],
    ['под Квеном',       P => { P.quen = 50; P.quenT = 5; }],
    ['в уклонении',      P => { P.dodge = 0.2; }],
    ['мутация первая',   P => { P.mut = 5; }],
    ['мутация вторая',   P => { P.mut = 5; P.mut2 = 5; }],
  ];
  let fell = null;
  for (const [name, set] of cases) {
    W.reset(); W.setPhase('HUNT'); W.setPanel(null);
    set(W.getP());
    try { W.render(); } catch (e) { fell = name + ': ' + e.message; break; }
  }
  ok(!fell, fell || 'все семь состояний рисуются');
}

head('Лежачий ведьмак тоже рисуется');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  W.hurtPlayer(999999, 'проверка');
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(W.getOver(), 'ведьмак и правда упал');
  ok(!fell, fell || 'лежачая фигура рисуется');
}
```

- [ ] **Шаг 2: Прогнать**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: если `drawPawn` где-то обращается к `P.steel` при `P.steel === null` — упадёт с понятным сообщением. Чинить в `drawPawn`, а не в проверке.

- [ ] **Шаг 3: Починить найденное**

Типовая поломка: в `drawPawn` мечи берутся как `P.steel && st.hand !== 'steel'` — это уже безопасно. Если падение всё же есть, добавить недостающие проверки на `null` там, где показало сообщение.

- [ ] **Шаг 4: Прогнать — должно пройти**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: все проверки прошли.

- [ ] **Шаг 5: Посмотреть ГЛАЗАМИ**

Открыть игру. Купить в лавке лёгкий, средний и тяжёлый доспех и школьный; переключить меч клавишей смены руки; сорваться в мутацию (R дважды).

Смотрим: силуэт правда меняется между лёгким и тяжёлым; цвет школы виден; в руке остаётся один меч, второй торчит за спиной; вторая ступень мутации выглядит как срыв, а не как «покрасили в красный».

- [ ] **Шаг 6: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-look.js
git commit -m "Ведьмак: на пешке видно доспех, мечи и мутацию"
```

---

### Задача 5: Зеркало в лагере

**Files:**
- Modify: `games/witcher/game.js` — константа рядом с `BOARD` (строка 942); отрисовка обстановки лагеря (около 3266); `interact()` (около 4578); `__W`
- Modify: `games/witcher/tests/check-audit.js`
- Modify: `games/witcher/tests/check-look.js`

**Interfaces:**
- Produces: `MIRROR` — `{ x, y }`; значение `'look'` для `panel`. Через `__W`: `MIRROR`, `getPanel`.

- [ ] **Шаг 1: Написать падающую проверку**

В `games/witcher/tests/check-look.js` перед `done();` дописать:

```js
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
  ok(W.obstNear(M.x, M.y).length === 0, 'на самом зеркале нет преграды');
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
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: `БАГ зеркало заведено` — `W.MIRROR` не определено.

- [ ] **Шаг 3: Завести зеркало**

Рядом со строкой 942 (`const BOARD = ...`) дописать:

```js
/* Зеркало — четвёртое место лагеря, к северу от костра. Расстояние выбрано
   не на глаз: обстановка лагеря расставляется в обход круга радиусом 170
   вокруг костра (см. «у костра чисто»), и 90 шагов — внутри этого круга.
   Значит зеркало не зарастёт кустами и к нему всегда можно подойти. */
const MIRROR = { x: SPOTS.camp.x, y: SPOTS.camp.y - 60 };
```

- [ ] **Шаг 4: Нарисовать его**

Около строки 3266, рядом с отрисовкой костра, верстака и доски, дописать:

```js
  drawIco('🪞', 26, MIRROR.x, MIRROR.y);
```

и рядом с подписями:

```js
  txt('E — облик', MIRROR.x, MIRROR.y + 24, 10, '#c9a0ff', 'center');
```

- [ ] **Шаг 5: Научить E открывать**

В `interact()`, рядом с проверкой доски (около строки 4578), ДО проверки верстака, дописать:

```js
  // E у зеркала открывает облик и закрывает его же — как у доски работ
  if (panel === 'look') { panel = null; return; }
  if (Math.hypot(P.x - MIRROR.x, P.y - MIRROR.y) < 46) { panel = 'look'; return; }
```

- [ ] **Шаг 6: Открыть стенду**

В `globalThis.__W` дописать `MIRROR, getPanel: () => panel,` — `getPanel` там сейчас нет, он нужен проверке ниже.

- [ ] **Шаг 7: Прогнать — должна пройти**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: обе новые проверки прошли. Панель `look` ещё не рисуется — это задача 6; здесь проверяется только, что она ОТКРЫВАЕТСЯ.

- [ ] **Шаг 8: Дописать зеркало в аудит**

В `games/witcher/tests/check-audit.js` найти список мест, к которым проверяется подход, и дописать в него зеркало тем же способом, каким там уже перечислены костёр, верстак и доска.

- [ ] **Шаг 9: Прогнать весь стенд**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: всё чисто.

- [ ] **Шаг 10: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-look.js games/witcher/tests/check-audit.js
git commit -m "Ведьмак: зеркало в лагере"
```

---

### Задача 6: Панель облика

**Files:**
- Modify: `games/witcher/game.js` — новая функция `drawLook` рядом с `drawSkills` (около 4381); цепочка панелей (около 4480)
- Modify: `games/witcher/tests/check-look.js`
- Modify: `games/witcher/tests/check-render.js`

**Interfaces:**
- Consumes: `drawPawn` (задача 3), `LOOK_FIELDS`, `look`, `randomLook`, `saveLook` (задача 2), `panelBox`, `btn`, `txt`, `uiHit` — уже есть в игре.
- Produces: `drawLook()`; `lookSpin` — угол вращения превью.

- [ ] **Шаг 1: Написать падающую проверку**

В `games/witcher/tests/check-look.js` перед `done();` дописать:

```js
head('Панель облика рисуется и листается');
{
  W.reset(); W.setPhase('CAMP');
  W.setLook(W.LOOK_DEF);
  W.setPanel('look');
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'панель облика рисуется');

  const said = W.frame();
  ok(said.some(s => s.indexOf('ОБЛИК') >= 0), 'заголовок на месте');
  ok(said.some(s => s.indexOf('Причёска') >= 0), 'строка причёски на месте');
  ok(said.some(s => s.indexOf('наугад') >= 0), 'кнопка «наугад» на месте');
}

head('Стрелка листает причёску и запоминает');
{
  W.reset(); W.setPhase('CAMP');
  W.setLook(W.LOOK_DEF); W.setPanel('look');
  W.render();                                   // отрисовка расставляет uiHit
  const was = W.getLook().hair;
  const keys = Object.keys(W.HAIRS);
  W.lookStep('hair', 1);
  const now = W.getLook().hair;
  note('причёска: ' + was + ' → ' + now);
  ok(now !== was, 'причёска сменилась');
  ok(keys.indexOf(now) === (keys.indexOf(was) + 1) % keys.length, 'сменилась на следующую по таблице');
  ok(JSON.parse(store['witcher_look']).hair === now, 'и сразу записалась');
}

head('Листание по кругу не выходит за таблицу');
{
  W.setLook(W.LOOK_DEF);
  const keys = Object.keys(W.HAIRS);
  for (let i = 0; i < keys.length * 3 + 1; i++) W.lookStep('hair', 1);
  ok(!!W.HAIRS[W.getLook().hair], 'после многих щелчков ключ всё ещё из таблицы');
  for (let i = 0; i < keys.length * 3 + 1; i++) W.lookStep('hair', -1);
  ok(!!W.HAIRS[W.getLook().hair], 'и в обратную сторону тоже');
}
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: `TypeError: W.lookStep is not a function`.

- [ ] **Шаг 3: Написать листание**

В `games/witcher/game.js` рядом с `randomLook` дописать:

```js
/* Листание поля облика по кругу. Ключи берём из таблицы, поэтому выйти за неё
   нельзя: сколько ни щёлкай, значение всегда своё. */
function lookStep(field, d) {
  const F = LOOK_FIELDS.find(f => f.k === field); if (!F) return;
  const ks = Object.keys(F.tab);
  let i = ks.indexOf(look[field]);
  if (i < 0) i = 0;
  look[field] = ks[(i + d + ks.length * 2) % ks.length];
  saveLook();
}
```

- [ ] **Шаг 4: Написать панель**

Рядом с `drawSkills` (около строки 4381) вставить:

```js
let lookSpin = 0;
/* Панель облика. Слева ведьмак вчетверо крупнее и медленно поворачивается —
   так видно и лицо, и затылок с причёской, и мечи за спиной. Справа шесть
   строк со стрелками: тот же приём, что в лавке и на верстаке, переучиваться
   не надо. Менять облик даром: косметика ничего не решает и платы не стоит. */
function drawLook() {
  panelBox('🪞 ОБЛИК');
  lookSpin += 0.012;

  const px = 96, py = 190;
  ctx.save();
  ctx.translate(px, py); ctx.scale(4, 4); ctx.translate(-px, -py);
  drawPawn(px, py, lookSpin, pawnState());
  ctx.restore();
  txt('поворачивается сам — посмотри со всех сторон', px, 268, 9, '#6c7683', 'center');

  const x = 200, w = CW - 24 - x;
  let y = 104;
  for (const F of LOOK_FIELDS) {
    txt(F.n, x, y, 10, '#98a2ae');
    const cur = F.tab[look[F.k]] || F.tab[LOOK_DEF[F.k]];
    txt(cur.n, x + w / 2, y + 16, 11, '#e8d9a8', 'center');
    btn(x, y + 8, 18, 16, '‹', () => lookStep(F.k, -1));
    btn(x + w - 18, y + 8, 18, 16, '›', () => lookStep(F.k, 1));
    y += 38;
  }

  btn(x, y + 6, 84, 20, '🎲 наугад', () => randomLook());
  btn(x + w - 84, y + 6, 84, 20, '✔ готово', () => { panel = null; });
}
```

- [ ] **Шаг 5: Включить панель в цепочку**

Около строки 4480, в цепочке `if (panel === 'bag') drawBag();`, дописать ветку:

```js
  else if (panel === 'look') drawLook();
```

- [ ] **Шаг 6: Открыть стенду**

В `globalThis.__W` дописать: `lookStep, drawLook,`

- [ ] **Шаг 7: Прогнать — должна пройти**

Запустить: `node games/witcher/tests/check-look.js`
Ожидаем: все проверки прошли.

- [ ] **Шаг 8: Дописать панель в общий прогон отрисовки**

В `games/witcher/tests/check-render.js` найти список панелей, которые рисуются подряд, и дописать в него `'look'` тем же способом, каким там уже перечислены `bag`, `skills`, `bench`.

- [ ] **Шаг 9: Посмотреть ГЛАЗАМИ**

Открыть игру, дойти до зеркала, нажать E.

Смотрим:
- превью крупное и не выходит за рамку панели;
- строки не наезжают друг на друга и на превью;
- стрелки нажимаются мышью;
- «наугад» правда меняет всё разом;
- вышел из панели — ведьмак в мире тот же, что был в превью.

- [ ] **Шаг 10: Прогнать весь стенд и замерить**

```bash
node games/witcher/tests/run.js
node games/witcher/tests/perf-draw.js
```

Если панель облика окажется заметно дороже прочих — испечь превью один раз при открытии, как сказано в замысле. Если нет — не трогать.

- [ ] **Шаг 11: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-look.js games/witcher/tests/check-render.js
git commit -m "Ведьмак: панель облика у зеркала"
```

---

### Задача 7: Потолок частиц

Делается ДО красивых знаков: иначе первый же Игни по толпе покажет, зачем он был нужен.

**Files:**
- Modify: `games/witcher/game.js` — рядом с объявлением `parts`; все места `parts.push`
- Modify: `games/witcher/tests/check-signs.js`

**Interfaces:**
- Produces: `PART_CAP` (число 320), `addPart(p)`. Через `__W`: `PART_CAP`.

- [ ] **Шаг 1: Написать падающую проверку**

В `games/witcher/tests/check-signs.js` перед `done();` дописать:

```js
head('Частицы не переполняют массив');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.x = 3000; P.y = 3000; P.mp = 99999; W.syncCam();
  W.setFoes([]);
  for (let i = 0; i < 12; i++) W.spawnFoe('drowner', P.x + 40 + i * 6, P.y);
  // сто залпов подряд, без передышки на угасание
  for (let i = 0; i < 100; i++) { P.runeCd = [0, 0, 0, 0]; W.castRune(0); W.castRune(1); }
  for (const f of W.getFoes()) W.hurtFoe(f, 5, 'sword');
  note('частиц в массиве: ' + W.getParts().length + ' при потолке ' + W.PART_CAP);
  ok(W.getParts().length <= W.PART_CAP, 'массив частиц не перерос потолок');
}
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: `TypeError: Cannot read properties of undefined` на `W.PART_CAP`, либо `БАГ массив частиц не перерос потолок` с числом сильно больше 320.

- [ ] **Шаг 3: Ввести потолок**

Рядом с объявлением `parts` дописать:

```js
/* Потолок частиц. Раньше массив рос свободно: на двух частицах за знак это
   было незаметно, но с живым пламенем разрывной болт по толпе плюс три Игни
   подряд забьют его за секунду, и кадр ляжет. Вытесняем самые старые: свежая
   искра важнее догорающей. */
const PART_CAP = 320;
function addPart(p) {
  if (parts.length >= PART_CAP) parts.splice(0, parts.length - PART_CAP + 1);
  parts.push(p);
  return p;
}
```

- [ ] **Шаг 4: Перевести все выбросы на addPart**

Заменить `parts.push(` на `addPart(` во всех местах файла: строки около 1725 (разрывной болт), 1793 (Квен), 1823 и 1826 (Игни и Аард), 3081 (кровь). Проверить, что других мест нет:

```bash
grep -n "parts.push" games/witcher/game.js
```

Ожидаем: пусто.

- [ ] **Шаг 5: Открыть стенду**

В `globalThis.__W` дописать: `PART_CAP,`

- [ ] **Шаг 6: Прогнать — должна пройти**

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: все проверки прошли, в примечании число не больше 320.

- [ ] **Шаг 7: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-signs.js
git commit -m "Ведьмак: потолок частиц перед тем, как жечь по-настоящему"
```

---

### Задача 8: Глиф и граница — общая машинка для знаков

**Files:**
- Modify: `games/witcher/game.js` — рядом с `castRune`; отрисовка частиц (около 3414)

**Interfaces:**
- Consumes: `addPart` (задача 7).
- Produces: два новых рода частиц — `{ glyph:true, x, y, a, c, t, life }` и `{ edge:true, x, y, a, w, len, c, t, life }`; функция `signCast(a, col)` ставит глиф у ладони.

- [ ] **Шаг 1: Написать глиф и границу**

Рядом с `castRune` вставить:

```js
/* Глиф под ладонью — общий для всех четырёх знаков. Вспыхивает, растёт и
   гаснет за 0.12 с: ровно столько, чтобы глаз успел прочитать, что ведьмак
   что-то СДЕЛАЛ, и не столько, чтобы это мешало смотреть на бой. */
function signCast(a, col) {
  addPart({ glyph: true, x: P.x + Math.cos(a) * 14, y: P.y + Math.sin(a) * 14,
            a, c: col, t: 0, life: 0.12 });
}
```

- [ ] **Шаг 2: Нарисовать оба рода**

В отрисовке частиц (около строки 3414), в цепочке `if (p.cone) ... else if (p.ring) ...`, ДО ветки `p.cone` дописать:

```js
    if (p.glyph) {
      const s = 1 - Math.abs(k - 0.5) * 2;                 // вспыхнул и погас
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.globalAlpha = clamp(s, 0, 1) * 0.95;
      ctx.strokeStyle = p.c; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {                        // треугольник знака
        const an = i / 3 * 6.283 - 1.57, r = 6 + (1 - k) * 4;
        if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
        else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
      }
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = clamp(s, 0, 1) * 0.5;
      ctx.beginPath(); ctx.arc(0, 0, 3 + (1 - k) * 6, 0, 6.3); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (p.edge) {
      /* Граница поражения. Рисуется ярко и ровно один раз за знак: это не
         украшение, а обещание — досюда достанет. Всё остальное живёт внутри
         неё и полупрозрачно. */
      ctx.strokeStyle = p.c; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.len, p.a - p.w, p.a + p.w); ctx.stroke();
    } else if (p.cone) {
```

и убрать лишний `if (p.cone) {` со следующей строки, чтобы цепочка осталась целой.

- [ ] **Шаг 3: Прогнать — ничего не должно сломаться**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: всё чисто. Новых родов частиц пока никто не выбрасывает, кроме `signCast`, который тоже пока не зовётся — это каркас под задачи 9 и 10.

- [ ] **Шаг 4: Коммит**

```bash
git add games/witcher/game.js
git commit -m "Ведьмак: глиф и граница — общая основа знаков"
```

---

### Задача 9: Игни и Аард

**Files:**
- Modify: `games/witcher/game.js` — ветки `igni` и `aard` в `castRune` (строки 1822–1831); отрисовка частиц
- Modify: `games/witcher/tests/check-signs.js`

**Interfaces:**
- Consumes: `addPart`, `signCast`, роды `glyph` и `edge` (задачи 7 и 8).
- Produces: роды частиц `flame`, `spark`, `smoke`, `scorch`, `wave`, `dust`.

- [ ] **Шаг 1: Переписать выброс Игни**

Ветку `if (R.k === 'igni')` заменить на:

```js
  if (R.k === 'igni') {
    signCast(a, '#ffd06a');
    addPart({ edge: true, x: P.x, y: P.y, a, w: 0.7, len: 120, c: '#ffc45a', t: 0, life: 0.28 });
    addPart({ scorch: true, x: P.x, y: P.y, a, w: 0.7, len: 120, c: '#0a0705', t: 0, life: 2 });
    for (let i = 0; i < 26; i++) {                   // языки пламени
      const sp = 0.45 + rnd(0.55), an = a + (Math.random() - 0.5) * 1.3;
      addPart({ flame: true, x: P.x, y: P.y, a: an, sp, t: 0, life: 0.25 + rnd(0.2), at: rnd(0.28) });
    }
    for (let i = 0; i < 22; i++) {                   // искры — летят дальше огня
      const an = a + (Math.random() - 0.5) * 1.5;
      addPart({ spark: true, x: P.x + Math.cos(an) * 12, y: P.y + Math.sin(an) * 12,
                vx: Math.cos(an) * (240 + rnd(160)), vy: Math.sin(an) * (240 + rnd(160)),
                c: '#ffe9a8', r: 1.6, t: 0, life: 0.3 + rnd(0.2) });
    }
    for (let i = 0; i < 9; i++) {                    // дым всплывает следом
      const an = a + (Math.random() - 0.5) * 1.1, rr = 40 + rnd(80);
      addPart({ smoke: true, x: P.x + Math.cos(an) * rr, y: P.y + Math.sin(an) * rr,
                vy: -18, t: 0, life: 0.8 + rnd(0.3), at: 0.3 + rnd(0.5) });
    }
    for (const f of foes) if (inCone(f, a, 120, 0.7)) { hurtFoe(f, 24 * pow, 'rune'); f.burn = 4; }
  }
```

- [ ] **Шаг 2: Переписать выброс Аарда**

Ветку `else if (R.k === 'aard')` заменить на:

```js
  } else if (R.k === 'aard') {
    signCast(a, '#9fd8ff');
    addPart({ wave: true, x: P.x, y: P.y, a, w: 0.8, c: '#cfeaff', t: 0, life: 0.42, thick: 3 });
    addPart({ wave: true, x: P.x, y: P.y, a, w: 0.8, c: '#cfeaff', t: 0, life: 0.42, thick: 1.6, at: 0.09 });
    for (let i = 0; i < 30; i++) {                   // пыль с земли
      const an = a + (Math.random() - 0.5) * 1.7, sp = 120 + rnd(180);
      addPart({ dust: true, x: P.x + Math.cos(an) * 16, y: P.y + Math.sin(an) * 16,
                vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: 0, life: 0.5 + rnd(0.25) });
    }
    for (const f of foes) if (inCone(f, a, 100, 0.8)) {
      hurtFoe(f, 7 * pow, 'rune');
      const d = Math.atan2(f.y - P.y, f.x - P.x);
      f.kx = Math.cos(d) * 260; f.ky = Math.sin(d) * 260; f.stun = Math.max(f.stun, 1.3);
    }
```

- [ ] **Шаг 3: Нарисовать новые роды**

В отрисовке частиц, в цепочку после ветки `p.edge`, дописать:

```js
    } else if (p.scorch) {                            // выжженная земля
      ctx.globalAlpha = clamp(k, 0, 1) * 0.5; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, p.len, p.a - p.w, p.a + p.w); ctx.closePath(); ctx.fill();
    } else if (p.flame) {
      /* Язык пламени остывает по дороге: белый → жёлтый → оранжевый →
         тёмно-красный. Цвет берём от прожитой доли, а не от времени: так
         короткий и длинный языки остывают одинаково честно. */
      const lt = p.t - (p.at || 0); if (lt < 0) { ctx.globalAlpha = 1; continue; }
      const kk = clamp(lt / (p.life - (p.at || 0)), 0, 1);
      const rr = kk * 120 * p.sp;
      const fx = p.x + Math.cos(p.a) * rr, fy = p.y + Math.sin(p.a) * rr;
      ctx.globalAlpha = (1 - kk) * 0.85;
      ctx.fillStyle = kk < 0.25 ? '#fff6d0' : kk < 0.5 ? '#ffd25a' : kk < 0.75 ? '#ff8a2a' : '#c22c10';
      ctx.beginPath();
      ctx.ellipse(fx, fy, (1 - kk * 0.5) * 9 * p.sp, (1 - kk * 0.5) * 5.5 * p.sp, p.a, 0, 6.3);
      ctx.fill();
    } else if (p.spark) {
      ctx.globalAlpha = clamp(k, 0, 1); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
    } else if (p.smoke) {
      const lt = p.t - (p.at || 0); if (lt < 0) { ctx.globalAlpha = 1; continue; }
      const kk = clamp(lt / (p.life - (p.at || 0)), 0, 1);
      ctx.globalAlpha = (1 - kk) * 0.26; ctx.fillStyle = '#4a423c';
      ctx.beginPath(); ctx.arc(p.x, p.y - kk * 20, 7 + kk * 18, 0, 6.3); ctx.fill();
    } else if (p.wave) {
      const lt = p.t - (p.at || 0); if (lt < 0) { ctx.globalAlpha = 1; continue; }
      const kk = clamp(lt / (p.life - (p.at || 0)), 0, 1);
      ctx.globalAlpha = (1 - kk) * 0.9; ctx.strokeStyle = p.c;
      ctx.lineWidth = p.thick * (1 - kk * 0.5);
      ctx.beginPath(); ctx.arc(p.x, p.y, 16 + kk * 100, p.a - p.w, p.a + p.w); ctx.stroke();
    } else if (p.dust) {
      ctx.globalAlpha = clamp(k, 0, 1) * 0.55; ctx.fillStyle = '#9c9484';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1 - k) * 4, 0, 6.3); ctx.fill();
```

- [ ] **Шаг 4: Прогнать сетку зон — главное подтверждение**

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: все проверки прошли. Игни всё ещё достаёт на сто и не достаёт на сто девяносто; Аард всё ещё сбивает на восьмидесяти. Если хоть одна упала — красота залезла в правила, чинить надо код, а не проверку.

- [ ] **Шаг 5: Прогнать весь стенд**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: всё чисто.

- [ ] **Шаг 6: Посмотреть ГЛАЗАМИ**

Открыть игру, взять работу, пустить Игни и Аард в тварей и в пустоту.

Смотрим:
- видно, ДОКУДА достанет: яркая дуга по краю читается;
- языки пламени не сливаются в одно пятно и правда остывают;
- дым не заслоняет тварей;
- Аард читается как толчок, а не как вспышка;
- после трёх Игни подряд кадр не проседает.

- [ ] **Шаг 7: Замерить**

```bash
node games/witcher/tests/perf-draw.js
node games/witcher/tests/perf-frame.js
```

Записать числа в коммит.

- [ ] **Шаг 8: Коммит**

```bash
git add games/witcher/game.js
git commit -m "Ведьмак: Игни горит по-настоящему, Аард бьёт волной"
```

---

### Задача 10: Квен и Ирден

Оба рисуются от состояния, а не частицами: `P.quen` и `P.yrden` уже живут в игре. Частиц не тратят вовсе.

**Files:**
- Modify: `games/witcher/game.js` — отрисовка Квена (около 3383), ловушки Ирдена (около 3256), ветки `quen` и `yrden` в `castRune`, `hurtPlayer` (около 1794)
- Modify: `games/witcher/tests/check-signs.js`

**Interfaces:**
- Consumes: `signCast` (задача 8).
- Produces: `P.quenHits` — массив `{ a, t }` до пяти трещин; `drawQuenDome(x, y)`; `drawYrdenSeal(y)`.

- [ ] **Шаг 1: Написать проверку трещин**

В `games/witcher/tests/check-signs.js` перед `done();` дописать:

```js
head('Квен копит трещины, но не бесконечно');
{
  W.reset(); W.setPhase('HUNT'); W.setPanel(null);
  const P = W.getP();
  P.mp = 999; P.runeCd = [0, 0, 0, 0];
  W.castRune(2);
  ok(P.quen > 0, 'щит поставлен');
  ok(Array.isArray(P.quenHits) && P.quenHits.length === 0, 'трещин пока нет');
  for (let i = 0; i < 12; i++) { P.quen = 500; W.hurtPlayer(5, 'проверка'); }
  note('трещин после двенадцати ударов: ' + P.quenHits.length);
  ok(P.quenHits.length <= 5, 'трещин не больше пяти — иначе щит станет решетом');
  ok(P.quenHits.length > 0, 'но они есть');
  let fell = null;
  try { W.render(); } catch (e) { fell = e.message; }
  ok(!fell, fell || 'треснувший щит рисуется');
}
```

- [ ] **Шаг 2: Прогнать — должна упасть**

Запустить: `node games/witcher/tests/check-signs.js`
Ожидаем: `БАГ трещин пока нет` — `P.quenHits` не существует.

- [ ] **Шаг 3: Завести трещины**

В ветке `else if (R.k === 'quen')` в `castRune` дописать после установки щита:

```js
    signCast(a, '#9fe6ff');
    P.quenHits = [];
```

В `hurtPlayer`, там где щит поглощает урон (около строки 1794), рядом с `if (P.quen <= 0) message('🛡 Квен разбит');` дописать ДО этой строки:

```js
    /* Трещина остаётся до конца щита: по ней видно, сколько он ещё держит.
       Больше пяти не копим — иначе купол превращается в решето и перестаёт
       читаться, а он должен читаться в первую очередь. */
    if (!P.quenHits) P.quenHits = [];
    if (P.quenHits.length < 5) P.quenHits.push({ a: rnd(6.283), t: 0 });
```

- [ ] **Шаг 4: Нарисовать гранёный купол**

Заменить отрисовку Квена (около строки 3383):

```js
  if (P.quen > 0) {
    ctx.strokeStyle = 'rgba(120,210,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 16 + Math.sin(anim * 8) * 1.2, 0, 6.3); ctx.stroke();
  }
```

на:

```js
  if (P.quen > 0) drawQuenDome(px, py);
```

И рядом с `drawPawn` вставить:

```js
/* Гранёный купол вместо круга: восемь граней, медленно вращается, по граням
   бежит волна света. Круг ничего не говорил о состоянии щита — купол говорит:
   трещины остаются там, куда прилетело. */
function drawQuenDome(x, y) {
  const N = 8, R = 17, rot = anim * 0.7;
  for (let i = 0; i < N; i++) {
    const a1 = rot + i / N * 6.283, a2 = rot + (i + 1) / N * 6.283;
    const sh = 0.35 + 0.65 * Math.max(0, Math.sin(anim * 3.4 - i * 0.7));
    ctx.strokeStyle = 'rgba(150,225,255,' + (0.3 + sh * 0.55).toFixed(2) + ')';
    ctx.lineWidth = 1 + sh * 1.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R);
    ctx.lineTo(x + Math.cos(a2) * R, y + Math.sin(a2) * R);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#8ad8ff';
  ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
  for (const h of (P.quenHits || [])) {
    const hx = x + Math.cos(h.a) * R, hy = y + Math.sin(h.a) * R;
    ctx.strokeStyle = 'rgba(210,245,255,.8)'; ctx.lineWidth = 0.9;
    for (let c = 0; c < 4; c++) {
      const an = h.a + (c - 1.5) * 0.45;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(an) * (5 + c * 2), hy - Math.sin(an) * (5 + c * 2));
      ctx.stroke();
    }
  }
}
```

- [ ] **Шаг 5: Нарисовать печать Ирдена**

Заменить отрисовку ловушки (около строки 3256) на вызов `drawYrdenSeal(P.yrden);` и рядом с `drawQuenDome` вставить:

```js
/* Печать Ирдена: обод с рунами вращается, внутри дрожит паутина, раз в
   секунду от середины к краю проходит волна. Обод — граница: внутри
   замедляет, снаружи нет, и это должно быть видно с одного взгляда. */
function drawYrdenSeal(Y) {
  if (!Y) return;
  const rot = anim * 0.45, pu = (anim % 1);
  ctx.globalAlpha = 0.1; ctx.fillStyle = '#7a4fd0';
  ctx.beginPath(); ctx.arc(Y.x, Y.y, Y.r, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {                       // паутина
    const a1 = rot + (i * 2.399) % 6.283, a2 = rot + (i * 4.129) % 6.283;
    const r1 = Y.r * (0.25 + (i % 5) * 0.14), r2 = Y.r * (0.25 + ((i + 3) % 5) * 0.14);
    ctx.strokeStyle = 'rgba(196,150,255,' + (0.2 + 0.28 * Math.abs(Math.sin(anim * 3 + i))).toFixed(2) + ')';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(Y.x + Math.cos(a1) * r1, Y.y + Math.sin(a1) * r1);
    ctx.lineTo(Y.x + Math.cos(a2) * r2, Y.y + Math.sin(a2) * r2);
    ctx.stroke();
  }
  ctx.globalAlpha = (1 - pu) * 0.7; ctx.strokeStyle = '#d9b8ff'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(Y.x, Y.y, Y.r * pu, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#c496ff'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(Y.x, Y.y, Y.r, 0, 6.3); ctx.stroke();
  ctx.save(); ctx.translate(Y.x, Y.y); ctx.rotate(rot);
  for (let i = 0; i < 8; i++) {                        // руны по ободу
    ctx.save(); ctx.rotate(i / 8 * 6.283);
    txt('ᛟᚹᛉᛃᛈᚱᛗᛞ'[i], 0, -Y.r + 8, 9, '#e0c8ff', 'center');
    ctx.restore();
  }
  ctx.restore();
  for (const f of foes) {                              // разряды к пойманным
    if (Math.hypot(f.x - Y.x, f.y - Y.y) > Y.r) continue;
    ctx.strokeStyle = 'rgba(214,170,255,.8)'; ctx.lineWidth = 1;
    for (let c = 0; c < 3; c++) {
      const mx = (Y.x + f.x) / 2 + Math.sin(anim * 9 + c) * 12;
      const my = (Y.y + f.y) / 2 + Math.cos(anim * 7 + c) * 12;
      ctx.beginPath(); ctx.moveTo(Y.x, Y.y); ctx.quadraticCurveTo(mx, my, f.x, f.y); ctx.stroke();
    }
  }
}
```

И в ветке `else if (R.k === 'yrden')` в `castRune` дописать `signCast(a, '#c496ff');` перед установкой ловушки.

- [ ] **Шаг 6: Прогнать проверки**

```bash
node games/witcher/tests/check-signs.js
node games/witcher/tests/run.js
```
Ожидаем: всё чисто, радиус Ирдена всё ещё 58.

- [ ] **Шаг 7: Посмотреть ГЛАЗАМИ**

Открыть игру. Поставить Квен и дать себя ударить несколько раз; поставить Ирден и загнать в него тварь.

Смотрим:
- по трещинам правда видно, что щит доживает;
- купол не заслоняет самого ведьмака;
- обод печати читается как граница;
- разряды к твари видны, но не превращают экран в кашу.

- [ ] **Шаг 8: Коммит**

```bash
git add games/witcher/game.js games/witcher/tests/check-signs.js
git commit -m "Ведьмак: гранёный Квен с трещинами и рунная печать Ирдена"
```

---

### Задача 11: Справка и README стенда

**Files:**
- Modify: `games/witcher/управление.txt`
- Modify: `games/witcher/tests/README.txt`
- Modify: `README.md` в корне — строка про ведьмака

- [ ] **Шаг 1: Дописать зеркало в управление**

В `games/witcher/управление.txt`, в раздел про лагерь, рядом с верстаком и доской работ, дописать:

```
  🪞 Зеркало ............. подойди и нажми E — собрать облик
                           ведьмака: кожа, причёска, цвет волос,
                           борода, шрам, глаза. Меняется даром и
                           когда угодно. Облик переживает «Заново»:
                           новый поход — тот же ведьмак.
```

- [ ] **Шаг 2: Дописать раздел про то, что видно на фигуре**

Туда же, отдельным разделом:

```
ЧТО ВИДНО ПО ФИГУРЕ
──────────────────────────────────────────────
  Доспех .......... лёгкий узкий, средний с наплечниками,
                    тяжёлый с пластинами; цвет — от школы
  Мечи ............ оба за спиной; тот, что достал, — в руке
  Арбалет ......... на поясе, пока не стреляешь
  Мутация ......... первая ступень: жилы и глаза краснеют
                    вторая: фигура горбится, растут когти
```

- [ ] **Шаг 3: Дописать новые проверки в README стенда**

В `games/witcher/tests/README.txt`, в раздел «ЧТО ГДЕ», после строки про `check-render.js` дописать:

```
  check-signs.js ... знаки: зоны поражения не поехали от переделки
                     красоты, потолок частиц держит, трещины Квена
                     копятся до пяти
  check-look.js .... облик: таблицы, запись и её стойкость, зеркало
                     в лагере, панель и листание полей
```

- [ ] **Шаг 4: Поправить строку в корневом README**

В `README.md` в дереве игр строку про ведьмака дополнить: после «пять ведьмачьих школ доспеха» дописать «, облик у зеркала».

- [ ] **Шаг 5: Прогнать весь стенд последний раз**

Запустить: `node games/witcher/tests/run.js`
Ожидаем: `проверок пройдено: 11 из 11 · всё чисто`

- [ ] **Шаг 6: Коммит**

```bash
git add games/witcher/управление.txt games/witcher/tests/README.txt README.md
git commit -m "Ведьмак: справка про облик и что видно по фигуре"
```

---

## Самопроверка плана

**Покрытие замысла.** Прошёл по разделам замысла:

| Раздел замысла | Задача |
|---|---|
| Таблицы облика, шесть полей | 2 |
| `drawPawn`, слои, поворот | 3 |
| Правила не меняются | 1 (сетка), подтверждается в 3 и 9 |
| Не пекём, замерить потом | 3 шаг 9, 6 шаг 10, 9 шаг 7 |
| Что показывает снаряжение | 3 (рисуется), 4 (проверяется) |
| Что показывает состояние | 3 (рисуется), 4 (проверяется) |
| Хранение, ключ `witcher_look` | 2 |
| Зеркало: где стоит, как открывается | 5 |
| Панель облика | 6 |
| Общее правило знаков: глиф и граница | 8 |
| Игни | 9 |
| Аард | 9 |
| Квен | 10 |
| Ирден | 10 |
| Потолок частиц | 7 |
| Проверки: `check-signs`, `check-look`, правки в трёх файлах | 1, 2, 5, 6, 7, 10, 11 |
| Обновить README стенда | 11 |

Пробелов не нашёл.

**Заглушки.** Прошёл поиском по «TBD», «TODO», «и так далее», «аналогично задаче». Не нашёл: в каждом шаге лежит настоящий код или настоящая команда.

**Согласованность имён.** Сверил сквозные имена: `look`, `LOOK_FIELDS`, `LOOK_DEF`, `LOOK_KEY`, `loadLook`, `saveLook`, `randomLook`, `lookStep`, `drawPawn`, `pawnState`, `rrect`, `MIRROR`, `PART_CAP`, `addPart`, `signCast`, `drawQuenDome`, `drawYrdenSeal`, `P.quenHits`, `P.walk`. Каждое объявляется ровно в одной задаче и дальше только используется. Роды частиц — `glyph`, `edge`, `scorch`, `flame`, `spark`, `smoke`, `wave`, `dust` — заводятся в задачах 8 и 9 и там же получают отрисовку.

**Что нашлось при сверке с кодом и уже исправлено.** Три места в плане ссылались на то, чего в игре нет: поле `P.r` (радиуса у ведьмака не существует вовсе — заменено на проверку дальности меча), `obstNear` с тремя мерками вместо двух и с булевым ответом вместо списка, и `getPanel` как якобы уже существующая ручка `__W`.

**Что придётся уточнить по месту.** Три шага зависят от кода, который я не читал построчно и честно это помечаю прямо в них: признак «ведьмак идёт» для `P.walk` (задача 3, шаг 5), список мест в `check-audit.js` (задача 5, шаг 8) и список панелей в `check-render.js` (задача 6, шаг 8). В каждом сказано, по образцу чего действовать.
