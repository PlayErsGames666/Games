/* =======================================================================
   КОНВЕЙЕР — минималистичная фабрика на сетке.
   Вся логика — это сетка клеток и один тик: каждый предмет пытается
   уехать на клетку вперёд, если там свободно.
   ======================================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CW = canvas.width, CH = canvas.height;
const GW = 22, GH = 20, T = 23;            // сетка и размер клетки
const GX = 7, GY = 44;                      // где начинается поле на канвасе
const BAR = CH - 96;                        // верх нижней панели

// --- ресурсы ---
const ITEMS = {
  ironOre:  { name:'Железная руда', col:'#9aa3ad', shape:'circle', ore:true,  pay:2 },
  copperOre:{ name:'Медная руда',   col:'#c07a45', shape:'circle', ore:true,  pay:2 },
  coal:     { name:'Уголь',         col:'#4a4a52', shape:'circle', ore:true,  pay:2 },
  iron:     { name:'Железный слиток',col:'#d5dae0', shape:'square', pay:5 },
  copper:   { name:'Медный слиток', col:'#d8aa5a', shape:'square', pay:5 },
  gear:     { name:'Шестерня',      col:'#7fb0d8', shape:'gear',   pay:14 },
  chip:     { name:'Схема',         col:'#7fd6a0', shape:'chip',   pay:34 },
};
const ITEM_KEYS = Object.keys(ITEMS);

// заводы сами выбирают рецепт по тому, что в них лежит
const RECIPES = [
  { in:{ ironOre:1,  coal:1 }, out:'iron',   time:1.1 },
  { in:{ copperOre:1,coal:1 }, out:'copper', time:1.1 },
  { in:{ iron:2 },             out:'gear',   time:1.3 },
  { in:{ copper:1, gear:1 },   out:'chip',   time:2.0 },
];

// --- здания ---
const EMPTY=0, BELT=1, MINER=2, FACT=3, SPLIT=4, SORT=5, HUB=6;
const BUILDINGS = [
  { id:BELT,  key:'1', ico:'➡',  name:'Конвейер',     cost:2  },
  { id:MINER, key:'2', ico:'⛏',  name:'Добытчик',     cost:25 },
  { id:FACT,  key:'3', ico:'🏭', name:'Завод',        cost:40 },
  { id:SPLIT, key:'4', ico:'⑂',  name:'Разделитель',  cost:14 },
  { id:SORT,  key:'5', ico:'🔻', name:'Сортировщик',  cost:18 },
];
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];    // 0 вверх, 1 вправо, 2 вниз, 3 влево
const ARROW = ['▲','▶','▼','◀'];

const TICK = 0.22;                            // секунд на одну клетку
const MINE_TIME = 1.5, BUF_CAP = 4;
const START_MONEY = 260;

// --- состояние ---
let cells, money, tickAcc, tickN, sel, dir, delMode, speed, paused, over, cause;
let contract, delivered, jamCount, madeTotal, best, msg, msgT, hubIdx;
let pops = [], income = 0;
let anim = 0, lastFrame = null, drag = null, uiHit = [], hover = -1;

const gi = (x,y) => y*GW + x;
const inb = (x,y) => x>=0 && y>=0 && x<GW && y<GH;
const rnd = n => Math.floor(Math.random()*n);
const clamp = (v,a,b) => v<a?a:v>b?b:v;

try { best = JSON.parse(localStorage.getItem('factory_best') || '{}'); } catch(e){ best = {}; }
best = { contracts:+best.contracts||0, money:+best.money||0 };

/* =====================  ПОЛЕ  ===================== */

function blank(){ return { b:EMPTY, dir:1, item:null, ore:null, buf:{}, craft:0, out:null, rr:0, filter:'ironOre', jam:0 }; }

function genMap(){
  cells = []; for(let i=0;i<GW*GH;i++) cells.push(blank());
  // пятна руды: три вида, каждый по паре месторождений
  const patch = (kind, n) => {
    for(let k=0;k<n;k++){
      let x, y, tries=0;
      do { x = 2+rnd(GW-4); y = 2+rnd(GH-6); tries++; }
      while(tries<200 && cells[gi(x,y)].ore);
      const r = 1 + rnd(2);
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        const nx=x+dx, ny=y+dy;
        if(!inb(nx,ny) || Math.hypot(dx,dy) > r+0.3) continue;
        if(!cells[gi(nx,ny)].ore) cells[gi(nx,ny)].ore = kind;
      }
    }
  };
  patch('ironOre', 2); patch('copperOre', 2); patch('coal', 2);

  // приёмник — снизу по центру, к нему всё и везём
  const hx = GW>>1, hy = GH-1;
  hubIdx = gi(hx,hy);
  cells[hubIdx] = blank(); cells[hubIdx].b = HUB; cells[hubIdx].ore = null;
}

/* =====================  КОНТРАКТЫ  ===================== */

const CHAIN = ['iron','copper','gear','chip'];
function newContract(n){
  const tier = Math.min(CHAIN.length-1, Math.floor(n/2));
  const item = CHAIN[Math.min(tier, CHAIN.length-1)];
  const need = 6 + n*3;
  return { n, item, need, done:0, time: 70 + need*9, max: 70 + need*9 };
}
function contractDone(){
  const bonus = 60 + contract.n*45;
  money += bonus;
  message('✅ Контракт ' + (contract.n+1) + ' сдан! +' + bonus + ' кр.');
  if(contract.n+1 > best.contracts){ best.contracts = contract.n+1; saveBest(); }
  contract = newContract(contract.n+1);
}
function saveBest(){ try { localStorage.setItem('factory_best', JSON.stringify(best)); } catch(e){} }

/* =====================  СТРОЙКА  ===================== */

function message(t){ msg = t; msgT = 3.2; }
function costOf(id){ const b = BUILDINGS.find(b=>b.id===id); return b ? b.cost : 0; }

function place(x,y){
  if(!inb(x,y) || over) return;
  const c = cells[gi(x,y)];
  if(c.b === HUB) return;
  if(delMode){ demolish(x,y); return; }
  const id = sel;
  if(id === MINER && !c.ore){ message('⛏ Добытчик ставится только на руду'); return; }
  if(id !== MINER && c.ore && id === EMPTY) return;
  // повторный клик по такому же зданию — просто поворот
  if(c.b === id){ c.dir = dir; return; }
  const cost = costOf(id);
  if(money < cost){ message('Не хватает кредитов: нужно ' + cost); return; }
  if(c.b !== EMPTY) refund(c);
  money -= cost;
  const ore = c.ore, keep = blank();
  keep.b = id; keep.dir = dir; keep.ore = ore;
  if(id === SORT) keep.filter = c.filter || 'ironOre';
  cells[gi(x,y)] = keep;
}
function refund(c){ money += Math.floor(costOf(c.b) * 0.6); }
function demolish(x,y){
  const c = cells[gi(x,y)];
  if(c.b === EMPTY || c.b === HUB) return;
  refund(c);
  const ore = c.ore; cells[gi(x,y)] = blank(); cells[gi(x,y)].ore = ore;
}

/* =====================  ЛОГИКА ТИКА  ===================== */

function ahead(i, d){
  const x = i % GW, y = (i / GW) | 0;
  const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
  return inb(nx,ny) ? gi(nx,ny) : -1;
}
function usedByRecipe(item){ return RECIPES.some(r => r.in[item]); }

// принимает ли клетка предмет прямо сейчас
function canAccept(i, item){
  if(i < 0) return false;
  const c = cells[i];
  if(c.b === BELT || c.b === SPLIT || c.b === SORT) return !c.item;
  if(c.b === HUB) return true;
  if(c.b === FACT){
    if(!usedByRecipe(item)) return false;           // лишнее завод не берёт — лента встанет
    return (c.buf[item] || 0) < BUF_CAP;
  }
  return false;
}
function give(i, item){
  const c = cells[i];
  if(c.b === HUB){
    const pay = ITEMS[item].pay;
    money += pay; delivered++; income += pay;
    pops.push({ i, txt:'+'+pay, t:0 });          // видно, что сдача реально платит
    if(contract && item === contract.item){ contract.done++; if(contract.done >= contract.need) contractDone(); }
    return;
  }
  if(c.b === FACT){ c.buf[item] = (c.buf[item] || 0) + 1; return; }
  c.item = { t:item, p:0 };
}
/* Бур и завод отдают в ЛЮБУЮ соседнюю клетку, которая готова принять:
   сначала туда, куда смотрит стрелка, дальше по кругу в остальные стороны.
   Раньше выход был только «вперёд», и это сбивало с толку: поставил бур,
   лента рядом — а из него ничего не выходит, потому что стрелка не туда. */
// на ленту, которая ведёт ОБРАТНО в нас, не отдаём: иначе завод выкидывает
// готовое в свою же входящую ленту, оно возвращается — и линия сама себя душит
function feedsMe(t, i){ return t >= 0 && cells[t].b === BELT && ahead(t, cells[t].dir) === i; }
// «приёмник в принципе»: сюда вообще имеет смысл отдавать
function isSink(i, t, item){
  if(t < 0 || feedsMe(t, i)) return false;
  const b = cells[t].b;
  // завод, которому этот предмет не нужен НИ ПО ОДНОМУ рецепту, — глухая стена,
  // а не «занятый приёмник»: ждать его бессмысленно, ищем другую сторону
  if(b === FACT) return usedByRecipe(item);
  return b === BELT || b === SPLIT || b === SORT || b === HUB;
}
/* Правило выдачи бура и завода:
   1) если ВПЕРЁД (куда смотрит стрелка) стоит приёмник — отдаём только туда,
      даже если он сейчас занят: ждём. Так линия предсказуема и бур не гадит
      рудой в чужие транзитные ленты, проходящие мимо;
   2) если впереди пусто или стена — ищем любую другую сторону. Это спасает
      от «поставил бур, лента сбоку, а он молчит». */
function outTargets(i, item){
  const c = cells[i], fwd = ahead(i, c.dir);
  if(isSink(i, fwd, item)) return [fwd];
  const list = [];
  for(let k=1;k<4;k++){ const t = ahead(i, (c.dir + k) % 4); if(isSink(i, t, item)) list.push(t); }
  return list;
}
function canPushOut(i, item){
  for(const t of outTargets(i, item)) if(canAccept(t, item)) return true;
  return false;
}
function pushOut(i, item){
  const c = cells[i], list = outTargets(i, item);
  if(!list.length) return false;
  for(let k=0;k<list.length;k++){
    const t = list[(c.rr + k) % list.length];
    if(canAccept(t, item)){ c.rr = (c.rr + k + 1) % list.length; give(t, item); return true; }
  }
  return false;
}

/* Куда клетка хочет отдать предмет.
   commit=false — это ТОЛЬКО вопрос (проверка затора), очередь разделителя
   трогать нельзя. Раньше проверка заторов дёргала ту же функцию и крутила
   счётчик впустую: разделитель с двумя выходами из трёх переставал
   чередовать и гнал всё в одну сторону — вторая ветка стояла голодная. */
function destOf(i, commit){
  const c = cells[i];
  if(c.b === BELT) return ahead(i, c.dir);
  if(c.b === SORT){
    const side = c.item && c.item.t === c.filter ? c.dir : (c.dir+1)%4;
    const t = ahead(i, side);
    // вбок сбрасываем куда угодно, кроме ленты, которая кормит сам сортировщик:
    // иначе предмет катается по кругу и занимает место на линии
    return feedsMe(t, i) ? -1 : t;
  }
  if(c.b === SPLIT){
    const order = [c.dir, (c.dir+1)%4, (c.dir+3)%4];
    for(let k=0;k<3;k++){
      const d = order[(c.rr + k) % 3];
      const t = ahead(i, d);
      if(feedsMe(t, i)) continue;                   // не отдаём назад тому, кто нас кормит
      if(canAccept(t, c.item.t)) { if(commit) c.rr = (c.rr + k + 1) % 3; return t; }
    }
    return -1;
  }
  return -1;
}

function stepTick(){
  tickN++;
  // --- 1. движение предметов ---
  // Ходим по кругу со сдвигом старта, чтобы одна ветка не голодала вечно,
  // и повторяем проходы: так вся цепочка сдвигается за один такт, а не по
  // одному предмету за такт.
  const moved = new Set();
  let changed = true, guard = 0;
  const start = tickN % cells.length;
  while(changed && guard++ < 8){
    changed = false;
    for(let k=0;k<cells.length;k++){
      const i = (start + k) % cells.length;
      const c = cells[i];
      if(!c.item || moved.has(i)) continue;
      if(c.b !== BELT && c.b !== SPLIT && c.b !== SORT) continue;
      const t = destOf(i, true);
      if(t >= 0 && canAccept(t, c.item.t)){
        const it = c.item; c.item = null;
        give(t, it.t);
        if(cells[t].item) cells[t].item.p = 0;
        moved.add(t); changed = true;
      }
    }
  }

  // --- 2. заводы ---
  for(let i=0;i<cells.length;i++){
    const c = cells[i];
    if(c.b !== FACT) continue;
    if(c.out && pushOut(i, c.out)) c.out = null;   // готовое ждёт отгрузки
    if(c.craft > 0){ c.craft -= TICK; if(c.craft < 0) c.craft = 0; }
    // готовое ждёт своей очереди, пока выход занят, и НЕ теряется:
    // раньше следующий рецепт затирал уже собранную деталь
    if(c.craft <= 0 && c.made && !c.out){ c.out = c.made; c.made = null; madeTotal++; }
    if(c.craft <= 0 && !c.made && !c.out){
      const r = RECIPES.find(r => Object.keys(r.in).every(k => (c.buf[k]||0) >= r.in[k]));
      if(r){ for(const k in r.in) c.buf[k] -= r.in[k]; c.craft = r.time; c.made = r.out; }
    }
  }

  // --- 3. добытчики ---
  for(let i=0;i<cells.length;i++){
    const c = cells[i];
    if(c.b !== MINER || !c.ore) continue;
    if(c.out && pushOut(i, c.out)) c.out = null;
    if(!c.out){ c.craft += TICK; if(c.craft >= MINE_TIME){ c.craft = 0; c.out = c.ore; } }
  }

  // --- 4. заторы: считаем всё, что стоит и не может уехать ---
  jamCount = 0;
  for(let i=0;i<cells.length;i++){
    const c = cells[i];
    const stuck = (c.item && !canAccept(destOf(i, false), c.item.t)) ||
                  ((c.b === MINER || c.b === FACT) && c.out && !canPushOut(i, c.out));
    if(stuck){ c.jam = Math.min(1, c.jam + 0.35); jamCount++; } else c.jam = Math.max(0, c.jam - 0.25);
  }
}

/* =====================  ЦИКЛ  ===================== */

function reset(){
  genMap();
  money = START_MONEY; tickAcc = 0; tickN = 0; sel = BELT; dir = 0; delMode = false;
  speed = 1; paused = false; over = false; cause = '';
  contract = newContract(0); delivered = 0; jamCount = 0; madeTotal = 0; pops = []; income = 0;
  drag = null; hover = -1;
  message('Деньги — за сдачу в 📦: вези туда хоть сырую руду (2 кр. за штуку)');
  updateButtons();
}
function endGame(why){
  if(over) return;
  over = true; cause = why;
  if(money > best.money) best.money = money;
  saveBest();
}

function update(dt){
  anim += dt;
  if(msgT > 0) msgT -= dt;
  for(const p of pops) p.t += dt;
  pops = pops.filter(p => p.t < 1.1);
  if(over || paused) return;
  const sdt = dt * speed;

  if(contract){
    contract.time -= sdt;
    if(contract.time <= 0) endGame('Контракт ' + (contract.n+1) + ' сорван — линия не успела');
  }
  tickAcc += sdt;
  while(tickAcc >= TICK){ tickAcc -= TICK; stepTick(); }
  for(const c of cells) if(c.item) c.item.p = Math.min(1, c.item.p + sdt/TICK);
}

/* =====================  ОТРИСОВКА  ===================== */

function syncRes(){
  const r = canvas.getBoundingClientRect();
  if(!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width*dpr)), h = Math.max(1, Math.round(r.height*dpr));
  if(canvas.width!==w || canvas.height!==h){ canvas.width = w; canvas.height = h; }
  ctx.setTransform(w/CW, 0, 0, h/CH, 0, 0);
}

function drawItem(x, y, item, s){
  const I = ITEMS[item]; if(!I) return;
  ctx.fillStyle = I.col;
  const r = s || 4.4;
  if(I.shape === 'circle'){ ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); }
  else if(I.shape === 'square'){ ctx.fillRect(x-r, y-r, r*2, r*2); }
  else if(I.shape === 'gear'){
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#1c2029'; ctx.beginPath(); ctx.arc(x, y, r*0.42, 0, 6.3); ctx.fill();
  } else { // chip
    ctx.fillRect(x-r, y-r*0.8, r*2, r*1.6);
    ctx.fillStyle = '#1c2029'; ctx.fillRect(x-r*0.4, y-r*0.3, r*0.8, r*0.6);
  }
}

function cellRect(i){ return { x: GX + (i%GW)*T, y: GY + ((i/GW)|0)*T }; }

function drawCell(i){
  const c = cells[i], p = cellRect(i);
  const x = p.x, y = p.y;
  // земля / руда
  ctx.fillStyle = ((i%GW + ((i/GW)|0)) & 1) ? '#171a21' : '#151820';
  ctx.fillRect(x, y, T, T);
  if(c.ore){
    ctx.globalAlpha = 0.5; ctx.fillStyle = ITEMS[c.ore].col;
    ctx.fillRect(x+1, y+1, T-2, T-2); ctx.globalAlpha = 1;
  }

  if(c.b === BELT || c.b === SPLIT || c.b === SORT){
    ctx.fillStyle = c.b === BELT ? '#333a46' : (c.b === SPLIT ? '#3d4a3a' : '#4a3a46');
    ctx.fillRect(x+1, y+1, T-2, T-2);
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.font = '11px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ARROW[c.dir], x+T/2, y+T/2);
    if(c.b === SORT){
      drawItem(x+5, y+5, c.filter, 3);           // какой ресурс пропускает
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillText('▸', x+T-6, y+T/2);
    }
    if(c.b === SPLIT){ ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fillText('⑂', x+5, y+6); }
  } else if(c.b === MINER){
    ctx.fillStyle = '#4a4030'; ctx.fillRect(x+1, y+1, T-2, T-2);
    ctx.fillStyle = '#d8aa5a'; ctx.font = '11px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⛏', x+T/2, y+T/2);
    ctx.fillStyle='rgba(255,255,255,.35)'; ctx.font='11px Segoe UI'; ctx.fillText(ARROW[c.dir], x+T-6, y+T-6);
  } else if(c.b === FACT){
    ctx.fillStyle = '#3a3550'; ctx.fillRect(x+1, y+1, T-2, T-2);
    ctx.fillStyle = '#c9b8f0'; ctx.font='11px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🏭', x+T/2, y+T/2-1);
    // что лежит в приёмном бункере
    let bx = x+3; for(const k in c.buf){ for(let n=0;n<Math.min(c.buf[k],3);n++){ drawItem(bx, y+T-4, k, 2.2); bx += 5; } }
    if(c.craft > 0){ const r = RECIPES.find(r=>r.out===c.made); const k = r ? 1-c.craft/r.time : 0;
      ctx.fillStyle='#d8aa5a'; ctx.fillRect(x+2, y+2, (T-4)*k, 2); }
    if(c.out) drawItem(x+T-6, y+6, c.out, 3);
    ctx.fillStyle='rgba(255,255,255,.35)'; ctx.font='11px Segoe UI'; ctx.fillText(ARROW[c.dir], x+5, y+6);
  } else if(c.b === HUB){
    ctx.fillStyle = '#2f5a44'; ctx.fillRect(x+1, y+1, T-2, T-2);
    ctx.fillStyle = '#a8e6c0'; ctx.font='14px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('📦', x+T/2, y+T/2);
  }

  // едущий предмет: подтягиваем к следующей клетке для плавности
  if(c.item){
    const d = DIRS[c.b === SORT && c.item.t !== c.filter ? (c.dir+1)%4 : c.dir];
    const k = (c.b === BELT || c.b === SPLIT || c.b === SORT) ? (c.item.p - 0.5) * T : 0;
    drawItem(x+T/2 + d[0]*k, y+T/2 + d[1]*k, c.item.t);
  }

  if(c.jam > 0.05){
    ctx.strokeStyle = 'rgba(216,100,90,' + (0.25 + c.jam*0.55).toFixed(2) + ')';
    ctx.lineWidth = 2; ctx.strokeRect(x+1.5, y+1.5, T-3, T-3);
  }
}

function uiBtn(x,y,w,h,fn,active,dim){
  uiHit.push({ x,y,w,h,fn });
  ctx.fillStyle = active ? 'rgba(216,170,90,.28)' : 'rgba(38,44,56,.95)';
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = active ? '#d8aa5a' : 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
  if(dim){ ctx.fillStyle = 'rgba(10,12,16,.55)'; ctx.fillRect(x,y,w,h); }
}

function drawHUD(){
  uiHit = [];
  // верхняя строка
  ctx.fillStyle = 'rgba(10,12,17,.9)'; ctx.fillRect(0,0,CW,GY-2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.font = 'bold 14px Consolas, monospace'; ctx.fillStyle = '#d8aa5a';
  ctx.fillText('💰 ' + Math.floor(money), 8, 19);
  ctx.font = '11px Segoe UI'; ctx.fillStyle = '#98a2ae';
  ctx.fillText('сдано ' + delivered + ' · заработано ' + income, 8, 33);

  if(contract){
    const c = contract;
    ctx.textAlign='center';
    ctx.font = 'bold 11px Segoe UI'; ctx.fillStyle = '#e6ebf2';
    ctx.fillText('КОНТРАКТ ' + (c.n+1) + ': ' + c.done + '/' + c.need + ' ' + ITEMS[c.item].name, CW/2, 16);
    const w = 150, x = CW/2 - w/2;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, 22, w, 7);
    ctx.fillStyle = '#7fd6a0'; ctx.fillRect(x+1, 23, (w-2)*clamp(c.done/c.need,0,1), 5);
    const tk = clamp(c.time/c.max,0,1);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, 31, w, 5);
    ctx.fillStyle = c.time < 25 ? '#d8645a' : '#6a8fb8'; ctx.fillRect(x+1, 32, (w-2)*tk, 3);
    ctx.font = '11px Segoe UI'; ctx.fillStyle = c.time < 25 ? '#e69a94' : '#98a2ae';
    ctx.fillText('осталось ' + Math.ceil(c.time) + 'с', CW/2, 43);
  }
  ctx.textAlign='right'; ctx.font='11px Segoe UI';
  ctx.fillStyle = jamCount ? '#e69a94' : '#7fd6a0';
  ctx.fillText((jamCount ? '⚠ заторов: ' + jamCount : '✓ линия идёт'), CW-8, 18);
  ctx.fillStyle = '#98a2ae'; ctx.font='11px Segoe UI';
  ctx.fillText('скорость ×' + speed + ' · рекорд ' + best.contracts + ' контр.', CW-8, 33);

  // нижняя панель: здания
  ctx.fillStyle = 'rgba(10,12,17,.94)'; ctx.fillRect(0,BAR,CW,CH-BAR);
  let x = 8;
  for(const b of BUILDINGS){
    const w = 62, y = BAR+8, h = 34;
    uiBtn(x, y, w, h, ()=>{ sel = b.id; delMode = false; }, sel===b.id && !delMode, money < b.cost);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='14px serif'; ctx.fillStyle='#e6ebf2'; ctx.fillText(b.ico, x+w/2, y+11);
    ctx.font='9px Segoe UI'; ctx.fillStyle='#98a2ae'; ctx.fillText(b.name, x+w/2, y+23);
    ctx.font='9px Segoe UI'; ctx.fillStyle='#d8aa5a'; ctx.fillText(b.cost + 'кр', x+w/2, y+32);
    ctx.textAlign='left'; ctx.font='9px Segoe UI'; ctx.fillStyle='rgba(255,255,255,.35)'; ctx.fillText(b.key, x+3, y+8);
    x += w+4;
  }
  uiBtn(CW-104, BAR+8, 44, 34, ()=>{ dir = (dir+1)%4; }, false, false);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='14px Segoe UI'; ctx.fillStyle='#e6ebf2';
  ctx.fillText(ARROW[dir], CW-82, BAR+21);
  ctx.font='9px Segoe UI'; ctx.fillStyle='#98a2ae'; ctx.fillText('R поворот', CW-82, BAR+35);
  uiBtn(CW-56, BAR+8, 48, 34, ()=>{ delMode = !delMode; }, delMode, false);
  ctx.font='14px Segoe UI'; ctx.fillStyle= delMode ? '#e69a94' : '#e6ebf2'; ctx.fillText('❌', CW-32, BAR+21);
  ctx.font='9px Segoe UI'; ctx.fillStyle='#98a2ae'; ctx.fillText('X снос', CW-32, BAR+35);

  // рецепты
  ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.font='9px Segoe UI'; ctx.fillStyle='#98a2ae';
  let rx = 10; const ry = BAR+56;
  ctx.fillText('РЕЦЕПТЫ:', rx, ry); rx += 52;
  for(const r of RECIPES){
    for(const k in r.in){ for(let n=0;n<r.in[k];n++){ drawItem(rx, ry, k, 3.4); rx += 9; } }
    ctx.fillStyle='#98a2ae'; ctx.fillText('→', rx, ry); rx += 10;
    drawItem(rx, ry, r.out, 3.4); rx += 16;
  }
  // нижняя строка: подсказка, а когда есть что сказать — сообщение.
  // Над полем плашку не вешаем: она накрывала нижний ряд с приёмником
  if(msgT > 0){
    ctx.globalAlpha = clamp(msgT,0,1);
    ctx.font='11px Segoe UI'; ctx.fillStyle='#d8aa5a';
    ctx.fillText(msg, 10, BAR+76);
    ctx.globalAlpha = 1;
  } else {
    ctx.font='9px Segoe UI'; ctx.fillStyle='#6c7683';
    ctx.fillText('ЛКМ ставить · протянуть — дорожка · ПКМ снести · клик по 🔻 — фильтр · T скорость · P пауза', 10, BAR+76);
  }
}

function render(){
  syncRes();
  ctx.fillStyle = '#0e1015'; ctx.fillRect(0,0,CW,CH);
  if(!cells) return;
  for(let i=0;i<cells.length;i++) drawCell(i);

  // всплывающие «+N» над приёмником: сразу видно, что сдача платит
  for(const p of pops){
    const r = cellRect(p.i);
    ctx.globalAlpha = clamp(1 - p.t/1.1, 0, 1);
    ctx.fillStyle = '#d8aa5a'; ctx.font = 'bold 11px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.txt, r.x + T/2, r.y + T/2 - 6 - p.t*16);
    ctx.globalAlpha = 1;
  }

  // курсор-призрак
  if(hover >= 0 && !over){
    const p = cellRect(hover);
    ctx.strokeStyle = delMode ? '#d8645a' : '#d8aa5a'; ctx.lineWidth = 2;
    ctx.strokeRect(p.x+1, p.y+1, T-2, T-2);
    if(!delMode){
      ctx.globalAlpha = 0.35; ctx.fillStyle='#d8aa5a';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='11px Segoe UI';
      ctx.fillText(ARROW[dir], p.x+T/2, p.y+T/2); ctx.globalAlpha = 1;
    }
  }
  // рамка поля
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
  ctx.strokeRect(GX-0.5, GY-0.5, GW*T+1, GH*T+1);

  drawHUD();

  if(paused && !over){
    ctx.fillStyle='rgba(8,10,14,.72)'; ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center'; ctx.fillStyle='#e6ebf2'; ctx.font='bold 26px Segoe UI'; ctx.textBaseline='alphabetic';
    ctx.fillText('⏸ ПАУЗА', CW/2, CH/2);
    ctx.font='14px Segoe UI'; ctx.fillText('P / Esc — продолжить · стройка работает и на паузе', CW/2, CH/2+24);
  }
  if(over){
    ctx.fillStyle='rgba(18,6,8,.88)'; ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='#d8645a'; ctx.font='bold 30px Georgia, serif';
    ctx.fillText('ЛИНИЯ ОСТАНОВЛЕНА', CW/2, CH/2-60);
    ctx.fillStyle='#e6ebf2'; ctx.font='14px Segoe UI'; ctx.fillText(cause, CW/2, CH/2-30);
    ctx.font='14px Segoe UI'; ctx.fillStyle='#c2cad2';
    ctx.fillText('Контрактов сдано: ' + (contract ? contract.n : 0) + '   ·   кредитов: ' + Math.floor(money), CW/2, CH/2);
    ctx.fillText('Деталей собрано: ' + madeTotal + '   ·   доставлено: ' + delivered, CW/2, CH/2+22);
    ctx.fillText('Рекорд: ' + best.contracts + ' контрактов', CW/2, CH/2+48);
    ctx.fillStyle='#d8aa5a'; ctx.font='14px Segoe UI';
    ctx.fillText('Enter / тап — новая фабрика', CW/2, CH/2+84);
  }
}

function frame(now){
  if(lastFrame===null) lastFrame = now;
  let dt = (now-lastFrame)/1000; lastFrame = now;
  if(dt > 0.05) dt = 0.05;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* =====================  ВВОД  ===================== */

function canvasPos(e){
  const r = canvas.getBoundingClientRect();
  return { x:(e.clientX-r.left)*(CW/r.width), y:(e.clientY-r.top)*(CH/r.height) };
}
function cellAt(p){
  const x = Math.floor((p.x-GX)/T), y = Math.floor((p.y-GY)/T);
  return inb(x,y) ? { x, y, i:gi(x,y) } : null;
}

canvas.addEventListener('pointerdown', e => {
  const p = canvasPos(e);
  if(over){ reset(); return; }
  for(let i=uiHit.length-1;i>=0;i--){
    const b = uiHit[i];
    if(p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h){ b.fn(); return; }
  }
  const c = cellAt(p); if(!c) return;
  // ПКМ тоже тянется: сносить дорожку по одной клетке — мучение
  if(e.button === 2){
    demolish(c.x, c.y);
    drag = { last:c, btn:2 };
    try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) {}   // палец мог уже уйти — тогда захват просто не нужен
    return;
  }
  // клик по сортировщику меняет фильтр — так его настраивают
  const cell = cells[c.i];
  if(cell.b === SORT && sel === SORT && !delMode){
    const k = ITEM_KEYS.indexOf(cell.filter);
    cell.filter = ITEM_KEYS[(k+1) % ITEM_KEYS.length];
    message('🔻 Фильтр: ' + ITEMS[cell.filter].name);
    return;
  }
  place(c.x, c.y);
  drag = { last:c, btn:e.button };
  try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) {}   // палец мог уже уйти — тогда захват просто не нужен
});
canvas.addEventListener('pointermove', e => {
  const p = canvasPos(e);
  const c = cellAt(p);
  hover = c ? c.i : -1;
  if(!drag || !c) return;
  if(c.i === drag.last.i) return;
  // протяжка: конвейер сам поворачивается по направлению движения мыши
  const dx = c.x - drag.last.x, dy = c.y - drag.last.y;
  if(Math.abs(dx) + Math.abs(dy) === 1 && sel === BELT && !delMode){
    dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
    place(drag.last.x, drag.last.y);
  }
  if(drag.btn === 2 || delMode) demolish(c.x, c.y); else place(c.x, c.y);
  drag.last = c;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('pointerleave', () => { hover = -1; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
  if(e.target && e.target.tagName === 'INPUT') return;
  if(over){ if(e.code === 'Enter') reset(); return; }
  // в полном экране Esc — это «выйти из полного экрана», а не «пауза»:
  // иначе выходишь и обнаруживаешь игру внезапно поставленной на паузу
  if(e.code === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement)) return;
  if(e.code === 'KeyP' || e.code === 'Escape'){ paused = !paused; updateButtons(); e.preventDefault(); return; }
  if(e.repeat) return;
  if(e.code === 'KeyR'){ dir = (dir+1)%4; return; }
  if(e.code === 'KeyX'){ delMode = !delMode; return; }
  if(e.code === 'KeyT'){ speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; return; }
  if(e.code.startsWith('Digit')){
    const n = +e.code.slice(5);
    if(n >= 1 && n <= BUILDINGS.length){ sel = BUILDINGS[n-1].id; delMode = false; }
  }
});

function onBtn(id, fn){ const b = document.getElementById(id); if(b) b.addEventListener('click', ()=>{ b.blur(); fn(); }); }
onBtn('rotBtn', ()=>{ dir = (dir+1)%4; });
onBtn('delBtn', ()=>{ delMode = !delMode; });
onBtn('speedBtn', ()=>{ speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; });
onBtn('pause', ()=>{ if(!over){ paused = !paused; updateButtons(); } });
onBtn('restart', ()=>reset());
function updateButtons(){ const b = document.getElementById('pause'); if(b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза'; }

window.__fsFail = function(why){ message('⛶ Полный экран не открылся: ' + why); };

reset();
requestAnimationFrame(frame);

if(typeof globalThis !== 'undefined') globalThis.__F = {
  reset, update, render, stepTick, place, demolish, canAccept, destOf, ahead, newContract,
  getCells:()=>cells, getMoney:()=>money, setMoney:v=>{money=v;}, getContract:()=>contract,
  getOver:()=>over, getCause:()=>cause, getJams:()=>jamCount, getMade:()=>madeTotal,
  getDelivered:()=>delivered, setSel:v=>{sel=v;}, setDir:v=>{dir=v;}, setDel:v=>{delMode=v;},
  getHub:()=>hubIdx, endGame, gi, GW, GH, T, TICK, EMPTY, BELT, MINER, FACT, SPLIT, SORT, HUB,
  ITEMS, RECIPES, BUILDINGS,
};
