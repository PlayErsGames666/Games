/* =======================================================================
   ТИХИЙ КВАРТАЛ — top-down зомби-стелс
   Сетка тайлов + луч видимости (fog of war) + A* для зомби + шум.
   ======================================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
/* Логический размер экрана. В окне он такой, как в разметке, а в ПОЛНЫЙ
   ЭКРАН игра перестраивается под монитор: высота остаётся прежней (буквы
   и полоски не едут), а ширина считается из пропорции экрана — видно
   больше мира, а не крупнее. Раньше картинка просто уезжала целиком и на
   широком мониторе стояла столбиком посреди чёрного поля. */
let CW = canvas.width, CH = canvas.height;
const BASE_W = CW, BASE_H = CH;
function setLogicalSize(w, h) {
  CW = Math.round(w); CH = Math.round(h);
  /* Переставляем и саму битмапу: в css у холста height:auto, и высота
     считается из её пропорции. Не тронешь — после выхода из полного
     экрана холст в окне сплющится. */
  canvas.width = CW; canvas.height = CH;
}
window.__fsResize = function (sw, sh) {
  const w = Math.round(BASE_H * sw / Math.max(1, sh));
  setLogicalSize(Math.max(BASE_W, Math.min(BASE_W * 3, w)), BASE_H);
};
window.__fsRestore = function () { setLogicalSize(BASE_W, BASE_H); };
const T = 26, MAPW = 58, MAPH = 58;               // тайл и размер квартала

// --- типы тайлов ---
const ROAD=0, GRASS=1, FLOOR=2, WALL=3, DOOR=4, ODOOR=5, WIN=6, FENCE=7, SHELF=8, TREE=9, CAR=10, BWIN=11;
//                     ROAD GRASS FLOOR WALL DOOR ODOOR WIN FENCE SHELF TREE CAR BWIN
const SOLID  = [0,0,0,1,1,0,1,1,1,1,1,0];
const OPAQUE = [0,0,0,1,1,0,0,0,0,1,1,0];
const solid  = t => SOLID[t] === 1;
const opaq   = t => OPAQUE[t] === 1;

// --- баланс ---
const FOV_R = 10.2, FOV_HALF = 0.95, NEAR_R = 2.7, RAYS = 150;   // зрение игрока
const SPD_WALK = 3.3, SPD_RUN = 5.7, SPD_SNEAK = 1.8;            // клеток в секунду
const CAP = 14;                                                   // кг без штрафа
const ZOMBIES = 54, Z_HP = 3, Z_SPD_IDLE = 1.15, Z_SPD_HUNT = 2.55, Z_SIGHT = 8.2, Z_CONE = 1.15;
const Z_ATK_CD = 1.15, Z_REACH = 0.78;
const DOOR_HP = 7, WINDOW_HP = 3;
const BLOOD_MAX = 100, VIRUS_TIME = 260;                          // укус убивает за ~4.5 минуты
const SEARCH_TIME = 1.5, CLIMB_TIME = 1.0, PRY_TIME = 2.2, BREAK_CD = 0.75;

// --- предметы ---
const ITEMS = {
  bandage:   { ico:'🩹', name:'Бинт',            w:0.20 },
  antiseptic:{ ico:'🧴', name:'Антисептик',      w:0.30 },
  pills:     { ico:'💊', name:'Обезболивающее',  w:0.10 },
  splint:    { ico:'🦯', name:'Шина',            w:0.60 },
  antibio:   { ico:'💉', name:'Антибиотик',      w:0.15 },
  food:      { ico:'🥫', name:'Консервы',        w:0.50 },
  water:     { ico:'🚰', name:'Вода',            w:0.60 },
  knife:     { ico:'🔪', name:'Нож',             w:0.50, weapon:1 },
  crowbar:   { ico:'🪛', name:'Лом',             w:3.20, weapon:2 },
  pistol:    { ico:'🔫', name:'Пистолет',        w:1.30, weapon:3 },
  ammo:      { ico:'🔩', name:'Патрон',          w:0.02 },
  keys:      { ico:'🔑', name:'Ключи от машины', w:0.05, quest:true },
  fuel:      { ico:'⛽', name:'Канистра бензина',w:8.00, quest:true },
  valuables: { ico:'💍', name:'Ценности',        w:0.80, score:20 },
};
const LOOT = [   // [id, вес шанса]
  ['bandage',20],['antiseptic',10],['pills',8],['splint',5],['antibio',4],
  ['food',11],['water',11],['ammo',9],['valuables',6],
  ['knife',4],['crowbar',3],['pistol',2],['',7],
];
const LOOT_TOTAL = LOOT.reduce((s,l)=>s+l[1],0);

const WEAPONS = [
  { id:'fists',   ico:'✊', name:'Кулаки',    dmg:1, range:0.95, arc:1.0, cd:0.55, noise:3,  stam:6 },
  { id:'knife',   ico:'🔪', name:'Нож',       dmg:1, range:1.05, arc:0.85,cd:0.42, noise:2,  stam:4, stealth:true },
  { id:'crowbar', ico:'🪛', name:'Лом',       dmg:2, range:1.30, arc:1.15,cd:0.78, noise:7,  stam:10, breach:true },
  { id:'pistol',  ico:'🔫', name:'Пистолет',  dmg:3, range:14,   cd:0.55, noise:46, stam:2, gun:true },
];

const PARTS = [
  { id:'head',  name:'Голова',       vital:true },
  { id:'torso', name:'Торс',         vital:true },
  { id:'larm',  name:'Левая рука',   arm:true },
  { id:'rarm',  name:'Правая рука',  arm:true },
  { id:'lleg',  name:'Левая нога',   leg:true },
  { id:'rleg',  name:'Правая нога',  leg:true },
];
const PART_W = [ ['head',8], ['torso',24], ['larm',20], ['rarm',20], ['lleg',14], ['rleg',14] ];

// --- состояние ---
let tiles, vis, containers, doorHp, locked, corpses, bloodSpots;
let player, body, inv, zombies, rings, log, exitPos, spawnPos;
let survivors = [];                    // тела всех выживших; своё — survivors[meSeat()]
const MAXP = 4;
var net = null, netAcc = 0;
function isNet(){ return net && net.isOnline(); }
function meSeat(){ return isNet() ? net.me : 0; }
function amHost(){ return !isNet() || net.isHost(); }
let time, over, overT, win, cause, paused, panel;
let stepAcc, noiseLevel, killCount, searched, alerted;
let lastFrame = null, anim = 0, shots = [];
let best = loadBest();
function loadBest(){
  try { const b = JSON.parse(localStorage.getItem('zombie_best') || '{}'); return { esc:+b.esc||0, time:+b.time||0 }; }
  catch(e){ return { esc:0, time:0 }; }
}

const held = { up:false, down:false, left:false, right:false };
let runHeld = false, crouch = false, mouseT = -99;   // mouseT — когда мышь двигали последний раз
const idx = (x,y) => y*MAPW + x;
const inb = (x,y) => x>=0 && y>=0 && x<MAPW && y<MAPH;
const tAt = (x,y) => inb(x,y) ? tiles[idx(x,y)] : WALL;
const rnd = n => Math.floor(Math.random()*n);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const dist = (ax,ay,bx,by) => Math.hypot(ax-bx, ay-by);

/* =====================  ГЕНЕРАЦИЯ КВАРТАЛА  ===================== */

function setT(x,y,t){ if(inb(x,y)) tiles[idx(x,y)] = t; }

function genBuilding(x0,y0,w,h){
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){
    const edge = (x===x0||y===y0||x===x0+w-1||y===y0+h-1);
    setT(x,y, edge ? WALL : FLOOR);
  }
  splitRoom(x0,y0,w,h,2);

  // окна по периметру (не в углах)
  for(let x=x0+1;x<x0+w-1;x++){
    if(Math.random()<0.20) setT(x,y0,WIN);
    if(Math.random()<0.20) setT(x,y0+h-1,WIN);
  }
  for(let y=y0+1;y<y0+h-1;y++){
    if(Math.random()<0.20) setT(x0,y,WIN);
    if(Math.random()<0.20) setT(x0+w-1,y,WIN);
  }

  // 1-2 входные двери (часть заперта). Дверь ставим только там, где ЗА НЕЙ пол:
  // иначе внутренняя перегородка может подпереть проём, и вход окажется фикцией
  const nd = 1 + (Math.random()<0.45?1:0);
  for(let i=0;i<nd;i++){
    for(let tries=0;tries<24;tries++){
      const side = rnd(4);
      let dx,dy,ix,iy;
      if(side===0){ dx = x0+1+rnd(w-2); dy = y0;     ix = dx;   iy = dy+1; }
      else if(side===1){ dx = x0+1+rnd(w-2); dy = y0+h-1; ix = dx; iy = dy-1; }
      else if(side===2){ dx = x0; dy = y0+1+rnd(h-2); ix = dx+1; iy = dy; }
      else { dx = x0+w-1; dy = y0+1+rnd(h-2); ix = dx-1; iy = dy; }
      if(tAt(dx,dy)!==WALL) continue;
      if(tAt(ix,iy)!==FLOOR) continue;
      setT(dx,dy,DOOR);
      if(Math.random()<0.38) locked.add(idx(dx,dy));
      break;
    }
  }

  // шкафы вдоль внутренних стен
  for(let y=y0+1;y<y0+h-1;y++) for(let x=x0+1;x<x0+w-1;x++){
    if(tAt(x,y)!==FLOOR) continue;
    const nearWall = [[1,0],[-1,0],[0,1],[0,-1]].some(d=>tAt(x+d[0],y+d[1])===WALL);
    const nearDoor = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
                      .some(d=>{ const t=tAt(x+d[0],y+d[1]); return t===DOOR||t===ODOOR; });
    if(nearWall && !nearDoor && Math.random()<0.22) setT(x,y,SHELF);
  }
}

// рекурсивно режем дом на комнаты, в каждой перегородке — дверной проём
function splitRoom(x0,y0,w,h,d){
  if(d<=0 || (w<11 && h<11)) return;
  if(w>=h && w>=11){
    const cx = x0 + 4 + rnd(w-8);
    for(let y=y0;y<y0+h;y++) setT(cx,y,WALL);
    const dy = y0 + 1 + rnd(h-2); setT(cx,dy,ODOOR);
    splitRoom(x0,y0,cx-x0+1,h,d-1);
    splitRoom(cx,y0,x0+w-cx,h,d-1);
  } else if(h>=11){
    const cy = y0 + 4 + rnd(h-8);
    for(let x=x0;x<x0+w;x++) setT(x,cy,WALL);
    const dx = x0 + 1 + rnd(w-2); setT(dx,cy,ODOOR);
    splitRoom(x0,y0,w,cy-y0+1,d-1);
    splitRoom(x0,cy,w,y0+h-cy,d-1);
  }
}

function fenceYard(x0,y0,w,h){
  for(let x=x0;x<x0+w;x++){ setT(x,y0,FENCE); setT(x,y0+h-1,FENCE); }
  for(let y=y0;y<y0+h;y++){ setT(x0,y,FENCE); setT(x0+w-1,y,FENCE); }
  // калитки
  for(let i=0;i<2;i++){
    const side = rnd(4);
    if(side===0) setT(x0+1+rnd(w-2), y0, GRASS);
    else if(side===1) setT(x0+1+rnd(w-2), y0+h-1, GRASS);
    else if(side===2) setT(x0, y0+1+rnd(h-2), GRASS);
    else setT(x0+w-1, y0+1+rnd(h-2), GRASS);
  }
}

function makeLot(x0,y0,w,h){
  fenceYard(x0,y0,w,h);
  const bw = Math.min(w-4, 9+rnd(5)), bh = Math.min(h-4, 9+rnd(5));
  if(bw<7||bh<7) return;
  const bx = x0 + 2 + rnd(Math.max(1,w-4-bw+1));
  const by = y0 + 2 + rnd(Math.max(1,h-4-bh+1));
  genBuilding(bx,by,bw,bh);
  for(let i=0;i<3;i++){
    const tx = x0+1+rnd(w-2), ty = y0+1+rnd(h-2);
    if(tAt(tx,ty)===GRASS) setT(tx,ty,TREE);
  }
}
function makePark(x0,y0,w,h){
  for(let i=0;i<Math.floor(w*h*0.16);i++){
    const tx = x0+rnd(w), ty = y0+rnd(h);
    if(tAt(tx,ty)===GRASS) setT(tx,ty,TREE);
  }
}
function makeParking(x0,y0,w,h){
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) if(tAt(x,y)===GRASS) setT(x,y,ROAD);
  for(let i=0;i<3+rnd(3);i++){
    const tx = x0+1+rnd(w-2), ty = y0+1+rnd(h-2);
    if(tAt(tx,ty)===ROAD) setT(tx,ty,CAR);
  }
}

/* =====================  КУДА ИГРОК ВООБЩЕ ДОЙДЁТ  =====================
   Разлив от места высадки ПО ТЕМ ЖЕ правилам, по каким ходит игрок:

     · по свободной клетке — просто идёт;
     · дверь проходима всегда: незапертую открывает, запертую отжимает ломом
       или выламывает ударом (шумно, но можно) — см. interact и attack;
     · забор и окно перелезает, но ТОЛЬКО если за ними есть свободное место,
       ровно как проверяет climb: «За препятствием нет места».

   Зачем это на генерации. Победа тут одна: найти ключи и бензин, дойти до
   машины. Шкаф, ключи и машина — НЕПРОХОДИМЫЕ клетки, к ним надо встать
   вплотную. А шкафы ставятся пачками вдоль внутренних стен, и шкаф может
   оказаться замурован соседями со всех четырёх сторон; машину же кладут «где
   вышло», если восемь тычков не нашли дороги. Ни то, ни другое ничем не
   проверялось, и квартал раздавался игроку невыигрываемым: на четырёх сотнях
   карт ключи или бензин оказывались за стеной в 1.25% случаев, машина — ещё
   в 0.75%. Заметить это в игре нельзя вовсе — ходишь и ходишь, пока не
   кончится терпение.

   Ломать стены и шкафы игрок не умеет: удар бьёт зомби, двери и окна, и
   только их. Значит замурованное замуровано навсегда. */
function reachFrom(sx, sy){
  const seen = new Uint8Array(MAPW*MAPH);
  if(sx<0||sy<0||sx>=MAPW||sy>=MAPH) return seen;
  const st = [sy*MAPW+sx]; seen[st[0]] = 1;
  const D = [[1,0],[-1,0],[0,1],[0,-1]];
  while(st.length){
    const i = st.pop(), x = i%MAPW, y = (i/MAPW)|0;
    for(const [dx,dy] of D){
      const nx = x+dx, ny = y+dy;
      if(nx<0||ny<0||nx>=MAPW||ny>=MAPH) continue;
      const j = ny*MAPW+nx, v = tiles[j];
      if(!solid(v) || v===DOOR){ if(!seen[j]){ seen[j]=1; st.push(j); } continue; }
      if(v===WIN || v===FENCE){                        // перелезаем — если за ним пусто
        const cx = nx+dx, cy = ny+dy;
        if(cx<0||cy<0||cx>=MAPW||cy>=MAPH) continue;
        const k = cy*MAPW+cx;
        if(solid(tiles[k])) continue;
        if(!seen[k]){ seen[k]=1; st.push(k); }
      }
    }
  }
  return seen;
}
/* Можно ли ВСТАТЬ ВПЛОТНУЮ к этой клетке. Именно так и обыскивают шкаф и
   заводят машину: сама клетка непроходима, годится любая соседняя. */
function canStandBy(seen, x, y){
  return [[1,0],[-1,0],[0,1],[0,-1]].some(function(d){
    const nx = x+d[0], ny = y+d[1];
    return nx>=0 && ny>=0 && nx<MAPW && ny<MAPH && seen[ny*MAPW+nx] === 1;
  });
}

function genMap(){
  tiles = new Uint8Array(MAPW*MAPH).fill(GRASS);
  locked = new Set();
  doorHp = new Map();

  const bands = [[1,11],[15,29],[33,47],[51,56]];
  const roads = [[12,14],[30,32],[48,50]];
  for(const [a,b] of roads){
    for(let x=a;x<=b;x++) for(let y=0;y<MAPH;y++) setT(x,y,ROAD);
    for(let y=a;y<=b;y++) for(let x=0;x<MAPW;x++) setT(x,y,ROAD);
  }
  for(const bx of bands) for(const by of bands){
    const w = bx[1]-bx[0]+1, h = by[1]-by[0]+1;
    if(w<9 || h<9){ makePark(bx[0],by[0],w,h); continue; }
    const r = Math.random();
    if(r<0.82) makeLot(bx[0],by[0],w,h);
    else if(r<0.92) makePark(bx[0],by[0],w,h);
    else makeParking(bx[0],by[0],w,h);
  }
  // край карты — глухая лесополоса
  for(let x=0;x<MAPW;x++){ setT(x,0,TREE); setT(x,MAPH-1,TREE); }
  for(let y=0;y<MAPH;y++){ setT(0,y,TREE); setT(MAPW-1,y,TREE); }

  // машина-эвакуация на дороге в углу
  const corners = [[6,MAPH-9],[MAPW-9,6],[6,6],[MAPW-9,MAPH-9]];
  const c = corners[rnd(corners.length)];
  let ex = c[0], ey = c[1];
  for(let r=0;r<8 && tAt(ex,ey)!==ROAD;r++){ ex = clamp(ex+rnd(3)-1,1,MAPW-2); ey = clamp(ey+rnd(3)-1,1,MAPH-2); }
  setT(ex,ey,CAR); exitPos = { x:ex, y:ey };

  // старт — проходимая клетка подальше от машины
  spawnPos = null;
  for(let tries=0; tries<4000 && !spawnPos; tries++){
    const x = 1+rnd(MAPW-2), y = 1+rnd(MAPH-2);
    if(solid(tAt(x,y))) continue;
    if(tAt(x,y)===FLOOR) continue;
    if(dist(x,y,ex,ey) < 34) continue;
    spawnPos = { x:x+0.5, y:y+0.5 };
  }
  if(!spawnPos){
    for(let y=1;y<MAPH-1 && !spawnPos;y++) for(let x=1;x<MAPW-1 && !spawnPos;x++)
      if(!solid(tAt(x,y)) && dist(x,y,ex,ey)>20) spawnPos = { x:x+0.5, y:y+0.5 };
  }

  // шкафы -> контейнеры
  containers = new Map();
  for(let y=0;y<MAPH;y++) for(let x=0;x<MAPW;x++)
    if(tiles[idx(x,y)]===SHELF) containers.set(idx(x,y), { x, y, searched:false, special:null, reach:false });

  /* ГОДНОСТЬ КАРТЫ меряем достижимым, а не нарисованным. Шкафов на квартал
     выходит десятка три, но замурованные среди них есть на каждой четвёртой
     карте, и прежний счёт «шестнадцать шкафов» их считал наравне с прочими —
     то есть обещал вдвое больше добычи, чем на карте лежит.

     Машину проверяем тем же разливом. Она ставится «где вышло», если восемь
     тычков не нашли дороги, и изредка оказывается заперта в чужом дворе:
     три карты из четырёхсот. Не годится — генерируем заново, попыток шесть
     (см. reset), и до шести дело не доходило ни разу. */
  if(!spawnPos) return false;
  const seen = reachFrom(spawnPos.x|0, spawnPos.y|0);
  let live = 0;
  for(const c of containers.values()){
    c.reach = canStandBy(seen, c.x, c.y);
    if(c.reach) live++;
  }
  return canStandBy(seen, exitPos.x, exitPos.y) && live >= 16;
}

/* =====================  ИНВЕНТАРЬ  ===================== */

function addItem(id,n){
  n = n||1;
  const it = inv.find(i=>i.id===id);
  if(it) it.n += n; else inv.push({ id, n });
}
function removeItem(id,n){
  n = n||1;
  const it = inv.find(i=>i.id===id); if(!it) return false;
  it.n -= n; if(it.n<=0) inv.splice(inv.indexOf(it),1);
  return true;
}
function countItem(id){ const it = inv.find(i=>i.id===id); return it?it.n:0; }
// то же, но по всей группе — для условия побега
function teamCount(id){ let n = 0; for(const sv of survivors){ if(sv.gone) continue; const it = sv.inv.find(i=>i.id===id); if(it) n += it.n; } return n; }
function weight(){ let w=0; for(const i of inv) w += ITEMS[i.id].w * i.n; return w; }
function encum(){ return weight()/CAP; }                  // 1.0 = ровно по норме
function hasWeapon(k){ return WEAPONS[k] && (k===0 || countItem(WEAPONS[k].id)>0); }

/* =====================  ТЕЛО И МЕДИЦИНА  ===================== */

function newPart(){ return { hp:100, bleed:0, inf:0, fx:false, band:0, disinf:false, bite:false, splint:false }; }
function bodyPart(id){ return body[id]; }
function totalBleed(){ let s=0; for(const p of PARTS){ const b=body[p.id]; if(b.band<=0) s+=b.bleed; } return s; }
function maxInf(){ let m=0; for(const p of PARTS) m = Math.max(m, body[p.id].inf); return m; }
function painLevel(){
  let p = 0;
  for(const q of PARTS){ const b = body[q.id]; p += (100-b.hp)*0.16; if(b.fx) p += b.splint?10:26; p += b.bleed*5; }
  // обезболивающее снимает фиксированные 45 очков и отпускает плавно в последние 8 секунд
  const relief = 45 * Math.min(1, player.painkill/8);
  return Math.max(0, p - relief);
}
function legFactor(){
  const l = body.lleg, r = body.rleg;
  let f = (l.hp + r.hp)/200;
  f = 0.55 + 0.45*f;
  if(l.fx) f *= l.splint?0.72:0.5;
  if(r.fx) f *= r.splint?0.72:0.5;
  return f;
}
function armFactor(){
  const l = body.larm, r = body.rarm;
  let f = 0.55 + 0.45*((l.hp+r.hp)/200);
  if(l.fx) f *= 0.7; if(r.fx) f *= 0.7;
  return f;
}
function pickPart(){
  let r = Math.random()*100, a = 0;
  for(const [id,w] of PART_W){ a += w; if(r<=a) return id; }
  return 'torso';
}

function wound(partId, kind){
  const b = body[partId], nm = PARTS.find(p=>p.id===partId).name;
  if(kind==='scratch'){ b.hp = Math.max(0,b.hp-7);  b.bleed = Math.min(3,b.bleed+0.6); b.disinf=false; b.band=0; logMsg('🩸 Царапина: '+nm); }
  if(kind==='deep'){    b.hp = Math.max(0,b.hp-17); b.bleed = Math.min(3,b.bleed+1.6); b.disinf=false; b.band=0; logMsg('🩸 ГЛУБОКАЯ РАНА: '+nm); }
  if(kind==='bite'){
    b.hp = Math.max(0,b.hp-13); b.bleed = Math.min(3,b.bleed+1.2); b.disinf=false; b.band=0; b.bite = true;
    if(!player.virusOn){ player.virusOn = true; logMsg('🦷 УКУС! Заражение не лечится…'); }
    else logMsg('🦷 Ещё один укус: '+nm);
  }
  if(kind==='fx'){ if(!b.fx){ b.fx = true; b.splint = false; b.fxT = 0; logMsg('🦴 ПЕРЕЛОМ: '+nm); } }
  player.hurtT = 0.45;
}

function treat(partId, itemId){
  const b = body[partId], nm = PARTS.find(p=>p.id===partId).name;
  if(itemId==='bandage'){
    if(b.bleed<=0){ logMsg('Нечего перевязывать: '+nm); return false; }
    if(!removeItem('bandage')) return false;
    b.band = 75; logMsg('🩹 Перевязано: '+nm); player.actT = 0.9; return true;
  }
  if(itemId==='antiseptic'){
    if(b.disinf){ logMsg('Уже обработано: '+nm); return false; }
    if(!removeItem('antiseptic')) return false;
    b.disinf = true; b.inf = Math.max(0, b.inf-18); logMsg('🧴 Рана обработана: '+nm); player.actT = 0.9; return true;
  }
  if(itemId==='splint'){
    if(!b.fx){ logMsg('Перелома нет: '+nm); return false; }
    if(b.splint){ logMsg('Шина уже наложена'); return false; }
    if(!removeItem('splint')) return false;
    b.splint = true; logMsg('🦯 Шина: '+nm); player.actT = 1.4; return true;
  }
  if(itemId==='antibio'){
    if(b.inf<=0){ logMsg('Инфекции нет: '+nm); return false; }
    if(!removeItem('antibio')) return false;
    b.inf = Math.max(0, b.inf-55); logMsg('💉 Антибиотик: '+nm); player.actT = 0.8; return true;
  }
  return false;
}

function quickBandage(){
  let worst = null, wv = 0;
  for(const p of PARTS){ const b = body[p.id]; if(b.bleed>wv && b.band<=0){ wv = b.bleed; worst = p.id; } }
  if(!worst){ logMsg('Кровотечений нет'); return; }
  if(countItem('bandage')<=0){ logMsg('Нет бинтов!'); return; }
  treat(worst,'bandage');
}

/* =====================  ШУМ И ЗВУК  ===================== */

function makeNoise(x, y, radius, color, tag){
  rings.push({ x, y, r:0.6, max:radius, t:0, life:0.85, color:color||'#e8eef5' });
  noiseLevel = Math.max(noiseLevel, radius);
  for(const z of zombies){
    if(z.dead) continue;
    const d = dist(z.x,z.y,x,y);
    if(d > radius) continue;
    if(z.state==='chase' && tag==='player') continue;      // уже гонится — цель важнее
    z.tx = x; z.ty = y; z.repath = 0;
    // цепная реакция: услышал громкое — может подхватить рык и позвать соседей.
    // шанс намеренно низкий, иначе одна пробежка поднимает весь квартал
    if(z.state==='idle' && radius>=8 && z.groanCd<=0 && Math.random()<0.12) queueGroan(z);
    z.state = 'hunt';
    z.lost = 0;
  }
}
// отложенный рык зомби (без setTimeout — через таймер самого зомби)
function queueGroan(z){ z.groan = 0.25 + Math.random()*0.5; z.groanCd = 9; }

/* =====================  ЗОМБИ И A*  ===================== */

const gCost = new Float32Array(MAPW*MAPH);
const gStamp = new Int32Array(MAPW*MAPH);
const cameFrom = new Int32Array(MAPW*MAPH);
let stamp = 0;
const NDIR = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

function stepCost(t){
  if(t===DOOR) return 9;        // выбьют
  if(t===WIN)  return 13;       // пролезут
  if(t===FENCE) return 11;      // перелезут
  if(solid(t)) return 0;        // непроходимо
  return 1;
}
// двоичная куча
function heapPush(h, node){ h.push(node); let i=h.length-1; while(i>0){ const p=(i-1)>>1; if(h[p].f<=h[i].f) break; const t=h[p]; h[p]=h[i]; h[i]=t; i=p; } }
function heapPop(h){ const top=h[0], last=h.pop(); if(h.length){ h[0]=last; let i=0; for(;;){ const l=i*2+1, r=l+1; let m=i; if(l<h.length&&h[l].f<h[m].f) m=l; if(r<h.length&&h[r].f<h[m].f) m=r; if(m===i) break; const t=h[m]; h[m]=h[i]; h[i]=t; i=m; } } return top; }

function astar(sx,sy,gx,gy,maxNodes){
  if(!inb(sx,sy)||!inb(gx,gy)) return null;
  stamp++;
  const si = idx(sx,sy), gi = idx(gx,gy);
  const open = [];
  gCost[si] = 0; gStamp[si] = stamp; cameFrom[si] = -1;
  heapPush(open, { i:si, f:dist(sx,sy,gx,gy) });
  let nodes = 0;
  while(open.length){
    const cur = heapPop(open);
    if(cur.i === gi) return rebuild(gi);
    if(++nodes > maxNodes) break;
    const cx = cur.i % MAPW, cy = (cur.i / MAPW) | 0;
    for(const [dx,dy] of NDIR){
      const nx = cx+dx, ny = cy+dy;
      if(!inb(nx,ny)) continue;
      const ni = idx(nx,ny);
      const c = stepCost(tiles[ni]);
      if(c===0 && ni!==gi) continue;
      if(dx && dy){   // без срезки углов
        if(stepCost(tAt(cx+dx,cy))===0 || stepCost(tAt(cx,cy+dy))===0) continue;
      }
      const ng = gCost[cur.i] + c*(dx&&dy?1.42:1);
      if(gStamp[ni]===stamp && gCost[ni]<=ng) continue;
      gStamp[ni] = stamp; gCost[ni] = ng; cameFrom[ni] = cur.i;
      heapPush(open, { i:ni, f:ng + dist(nx,ny,gx,gy) });
    }
  }
  return null;
}
function rebuild(gi){
  const path = [];
  let c = gi, guard = 0;
  while(c !== -1 && guard++ < 4000){ path.push(c); c = cameFrom[c]; }
  path.pop(); path.reverse();
  return path;
}

function makeZombie(x,y){
  return { x:x+0.5, y:y+0.5, face:Math.random()*6.28, hp:Z_HP, state:'idle', tx:null, ty:null,
           path:null, pi:0, repath:0, atk:0, lost:0, wander:0, groan:0, groanCd:0, dead:false,
           climb:null, hitT:0, stagger:0, bob:Math.random()*6.28 };
}

function losClear(x0,y0,x1,y1){
  const d = dist(x0,y0,x1,y1); if(d<0.001) return true;
  const steps = Math.ceil(d/0.25), dx=(x1-x0)/steps, dy=(y1-y0)/steps;
  let x=x0, y=y0;
  for(let i=0;i<steps;i++){ x+=dx; y+=dy; if(opaq(tAt(x|0,y|0))) return false; }
  return true;
}

function zombieSees(z){
  if(player.dead) return false;
  let range = Z_SIGHT;
  if(crouch) range *= 0.45;
  if(runHeld && (held.up||held.down||held.left||held.right)) range *= 1.2;
  const d = dist(z.x,z.y,player.x,player.y);
  if(d > range) return false;
  if(d > 1.2){
    const a = Math.atan2(player.y-z.y, player.x-z.x);
    let diff = Math.abs(((a - z.face + Math.PI*3) % (Math.PI*2)) - Math.PI);
    if(diff > Z_CONE) return false;
  }
  return losClear(z.x,z.y,player.x,player.y);
}

function damageObstacle(z, tx, ty){
  const i = idx(tx,ty), t = tiles[i];
  if(z.hitT > 0) return;
  z.hitT = 0.85;
  const hp = (doorHp.get(i) || (t===WIN?WINDOW_HP:DOOR_HP)) - 1;
  doorHp.set(i, hp);
  makeNoise(tx+0.5, ty+0.5, t===WIN?10:12, '#d9843b', 'z');
  if(hp<=0){
    tiles[i] = (t===WIN) ? BWIN : ODOOR;
    doorHp.delete(i); locked.delete(i);
    makeNoise(tx+0.5, ty+0.5, 14, '#ff6b4a', 'z');
    logMsg(t===WIN ? '🪟 Окно выбито…' : '🚪 Дверь выломана!');
  }
}

function updateZombie(z, dt){
  if(z.dead) return;
  if(z.hitT>0) z.hitT -= dt;
  if(z.groanCd>0) z.groanCd -= dt;
  if(z.stagger>0){ z.stagger -= dt; return; }

  // перелезание
  if(z.climb){
    z.climb.t += dt;
    const k = Math.min(1, z.climb.t/2.4);
    z.x = z.climb.fx + (z.climb.tx-z.climb.fx)*k;
    z.y = z.climb.fy + (z.climb.ty-z.climb.fy)*k;
    if(k>=1){ z.climb = null; z.path = null; }
    return;
  }

  const sees = zombieSees(z);
  if(sees){
    // увидел — рычит и зовёт ближних: так один замеченный превращается в толпу
    if(z.state!=='chase'){ z.state='chase'; if(z.groanCd<=0 && Math.random()<0.6) queueGroan(z); }
    z.tx = player.x; z.ty = player.y; z.lost = 0;
  } else if(z.state==='chase'){
    z.lost += dt;
    if(z.lost > 7){ z.state='hunt'; }
  }

  if(z.groan>0){
    z.groan -= dt;
    if(z.groan<=0){ makeNoise(z.x,z.y,6.5,'#c05a5a','z'); }
  }

  // блуждание без цели
  if(z.state==='idle'){
    z.wander -= dt;
    if(z.wander<=0){
      z.wander = 2.5 + Math.random()*4;
      if(Math.random()<0.55){
        const a = Math.random()*6.28, r = 3+Math.random()*5;
        z.tx = clamp(z.x+Math.cos(a)*r,1,MAPW-2); z.ty = clamp(z.y+Math.sin(a)*r,1,MAPH-2);
        z.repath = 0;
      } else { z.tx = null; }
      // бормотание «в пустоту»: игрок слышит (кольцо), но других зомби не поднимает
      if(Math.random()<0.14) rings.push({ x:z.x, y:z.y, r:0.6, max:5.5, t:0, life:0.9, color:'#8a5a5a' });
    }
  }

  if(z.tx===null || z.ty===null) return;

  // атака игрока
  const dp = dist(z.x,z.y,player.x,player.y);
  if(dp < Z_REACH && !player.dead){
    z.atk -= dt;
    if(z.atk<=0){ z.atk = Z_ATK_CD; zombieHit(z); }
    z.face = Math.atan2(player.y-z.y, player.x-z.x);
    return;
  }

  // путь
  z.repath -= dt;
  const cx = z.x|0, cy = z.y|0, gx = clamp(z.tx|0,0,MAPW-1), gy = clamp(z.ty|0,0,MAPH-1);
  if(z.repath<=0 || !z.path || z.pi>=z.path.length){
    z.repath = 0.6 + Math.random()*0.7;
    if(pathBudget>0){ pathBudget--; z.path = astar(cx,cy,gx,gy, z.state==='idle'?400:2200); z.pi = 0; }
  }

  const spd = (z.state==='idle' ? Z_SPD_IDLE : Z_SPD_HUNT) * (1 + (z.state==='chase'?0.06:0));
  let tgx, tgy;
  if(z.path && z.pi < z.path.length){
    const n = z.path[z.pi];
    const nx = n % MAPW, ny = (n/MAPW)|0;
    const t = tiles[n];
    if(solid(t)){
      if(t===DOOR || t===WIN){
        // ломится только тот, кто кого-то ищет. Праздный разворачивается:
        // иначе бесцельно бродящие вышибают двери по всему кварталу и
        // грохотом поднимают орду на пустом месте
        if(z.state==='idle'){ z.path = null; z.tx = null; z.wander = 1 + Math.random()*2; return; }
        damageObstacle(z,nx,ny); z.face = Math.atan2(ny+0.5-z.y, nx+0.5-z.x); return;
      }
      if(t===FENCE){
        const after = z.path[z.pi+1];
        const ax = after!=null ? (after%MAPW)+0.5 : nx+0.5 + (nx+0.5-z.x);
        const ay = after!=null ? ((after/MAPW)|0)+0.5 : ny+0.5 + (ny+0.5-z.y);
        z.climb = { fx:z.x, fy:z.y, tx:ax, ty:ay, t:0 };
        z.pi += 2;
        return;
      }
      z.path = null; return;
    }
    tgx = nx+0.5; tgy = ny+0.5;
    if(dist(z.x,z.y,tgx,tgy) < 0.28) { z.pi++; return; }
  } else { tgx = z.tx; tgy = z.ty; }

  const a = Math.atan2(tgy-z.y, tgx-z.x);
  z.face = a;
  let nx = z.x + Math.cos(a)*spd*dt, ny = z.y + Math.sin(a)*spd*dt;
  // столкновение
  if(!solid(tAt(nx|0, z.y|0))) z.x = nx;
  if(!solid(tAt(z.x|0, ny|0))) z.y = ny;
  // расталкивание, чтобы не слипались в точку (но не вдавливая друг друга в стены)
  for(const o of zombies){
    if(o===z||o.dead) continue;
    const d = dist(z.x,z.y,o.x,o.y);
    if(d>0.001 && d<0.55){
      const push = (0.55-d)*0.5;
      const px = z.x + (z.x-o.x)/d*push, py = z.y + (z.y-o.y)/d*push;
      if(!solid(tAt(px|0, z.y|0))) z.x = px;
      if(!solid(tAt(z.x|0, py|0))) z.y = py;
    }
  }
  z.bob += dt*5;

  if(z.state==='hunt' && dist(z.x,z.y,z.tx,z.ty) < 1.2){
    z.state = 'idle'; z.wander = 1 + Math.random()*2; z.tx = null;
  }
}

function zombieHit(z){
  const part = pickPart();
  // сколько зомби прижали игрока — тем выше шанс укуса
  let near = 0;
  for(const o of zombies) if(!o.dead && dist(o.x,o.y,player.x,player.y) < 1.3) near++;
  const biteChance = 0.09 + Math.max(0, near-1)*0.07;
  const r = Math.random();
  if(r < biteChance) wound(part,'bite');
  else if(r < biteChance + 0.30) wound(part,'deep');
  else wound(part,'scratch');
  const p = PARTS.find(q=>q.id===part);
  if((p.arm||p.leg) && Math.random()<0.07) wound(part,'fx');
  player.stam = Math.max(0, player.stam-8);
  makeNoise(player.x, player.y, 6, '#c03a3a', 'z');
}

/* =====================  ИГРОК: ДЕЙСТВИЯ  ===================== */

function frontTile(){
  const fx = player.x + Math.cos(player.face)*0.85;
  const fy = player.y + Math.sin(player.face)*0.85;
  return { x: fx|0, y: fy|0 };
}

function interact(){
  if(player.dead || player.actT>0 || player.climb) return;
  const f = frontTile();
  const i = idx(f.x,f.y), t = tAt(f.x,f.y);

  // машина — финал
  if(t===CAR && f.x===exitPos.x && f.y===exitPos.y){
    // ключи и канистра считаются по ВСЕЙ группе: один может нести ключи, второй бензин
    if(teamCount('keys')>0 && teamCount('fuel')>0){ endGame(true, isNet() ? 'Группа завела машину и уехала из квартала' : 'Ты завёл машину и уехал из квартала'); }
    else {
      const need = [];
      if(countItem('keys')<=0) need.push('🔑 ключи');
      if(countItem('fuel')<=0) need.push('⛽ бензин');
      logMsg('Машина есть, но нужны: '+need.join(' и '));
    }
    return;
  }
  if(t===DOOR){
    if(locked.has(i)){
      if(countItem('crowbar')>0){ player.actT = PRY_TIME; player.act = { kind:'pry', i, x:f.x, y:f.y }; logMsg('🪛 Отжимаешь замок ломом…'); }
      else logMsg('🔒 Заперто. Нужен лом — или выбивай (шумно!)');
    } else {
      tiles[i] = ODOOR; tileChanged(i); makeNoise(f.x+0.5,f.y+0.5,3.5,'#9fb0c0','player'); logMsg('🚪 Дверь открыта');
    }
    return;
  }
  if(t===ODOOR){
    // не закрываем дверь «внутри» зомби — иначе он окажется замурован в стене
    if(zombies.some(z=>!z.dead && dist(z.x,z.y,f.x+0.5,f.y+0.5)<0.75)){ logMsg('В проёме кто-то стоит…'); return; }
    tiles[i] = DOOR; makeNoise(f.x+0.5,f.y+0.5,3,'#9fb0c0','player'); logMsg('🚪 Дверь закрыта'); return;
  }
  if(t===SHELF){
    const c = containers.get(i);
    if(!c){ return; }
    if(c.searched){ logMsg('Тут уже пусто'); return; }
    player.actT = SEARCH_TIME; player.act = { kind:'search', i }; return;
  }
  if(t===FENCE || t===WIN || t===BWIN){ climb(f.x,f.y,t); return; }
  logMsg('Тут нечего делать');
}

function climb(tx,ty,t){
  const e = encum();
  if(e > 1.0){ logMsg('🎒 Перегруз ('+weight().toFixed(1)+' кг) — не перелезть. Выброси лишнее (I)'); return; }
  if(body.lleg.fx || body.rleg.fx){ logMsg('🦴 С переломом ноги не перелезть'); return; }
  if(player.stam < 18){ logMsg('😮‍💨 Нет сил перелезать'); return; }
  const dx = Math.round(Math.cos(player.face)), dy = Math.round(Math.sin(player.face));
  const ax = tx + (dx||0), ay = ty + (dy||0);
  if(solid(tAt(ax,ay))){ logMsg('За препятствием нет места'); return; }
  player.climb = { fx:player.x, fy:player.y, tx:ax+0.5, ty:ay+0.5, t:0 };
  player.stam -= 18;
  if(t===WIN){ tiles[idx(tx,ty)] = BWIN; tileChanged(idx(tx,ty)); makeNoise(tx+0.5,ty+0.5,12,'#ffd166','player'); logMsg('🪟 Разбил окно — звон на весь двор!'); }
  else makeNoise(tx+0.5,ty+0.5,5,'#cfd8e0','player');
  // неловкое приземление при усталости
  if(player.stam<12 && Math.random()<0.30) wound(Math.random()<0.5?'lleg':'rleg','fx');
}

function doSearch(i){
  const c = containers.get(i); if(!c) return;
  c.searched = true; searched++; contChanged(i);
  if(c.special){ addItem(c.special); logMsg((c.special==='keys'?'🔑 КЛЮЧИ ОТ МАШИНЫ!':'⛽ КАНИСТРА БЕНЗИНА (8 кг!)')); return; }
  let n = 1 + (Math.random()<0.35?1:0), got = [];
  for(let k=0;k<n;k++){
    let r = Math.random()*LOOT_TOTAL, a = 0, pick = '';
    for(const [id,w] of LOOT){ a += w; if(r<=a){ pick = id; break; } }
    if(!pick) continue;
    if(pick==='ammo'){ const cnt = 3+rnd(6); addItem('ammo',cnt); got.push('🔩×'+cnt); }
    else { addItem(pick); got.push(ITEMS[pick].ico); }
  }
  logMsg(got.length ? 'Найдено: '+got.join(' ') : 'Пусто…');
}

function attack(){
  if(player.dead || player.actT>0 || player.climb) return;
  if(player.atkCd>0) return;
  const w = WEAPONS[player.weapon];
  if(w.gun){ shoot(); return; }
  if(player.stam < w.stam*0.5){ logMsg('😮‍💨 Нет сил на удар'); return; }
  player.atkCd = w.cd / (0.7 + 0.3*armFactor());
  player.stam = Math.max(0, player.stam - w.stam*(1+Math.max(0,encum()-1)));
  player.swing = 0.22;

  // цель — ближайший зомби в дуге
  let target = null, bd = 1e9;
  for(const z of zombies){
    if(z.dead) continue;
    const d = dist(z.x,z.y,player.x,player.y);
    if(d > w.range+0.35) continue;
    const a = Math.atan2(z.y-player.y, z.x-player.x);
    const diff = Math.abs(((a-player.face+Math.PI*3)%(Math.PI*2))-Math.PI);
    if(diff > w.arc) continue;
    if(d<bd){ bd = d; target = z; }
  }

  if(!target){
    // может, бьём дверь/окно
    const f = frontTile(), t = tAt(f.x,f.y);
    if(t===DOOR || t===WIN){
      const i = idx(f.x,f.y);
      const base = t===WIN?WINDOW_HP:DOOR_HP;
      const dmg = w.breach ? 2 : 1;
      const hp = (doorHp.get(i)!=null ? doorHp.get(i) : base) - dmg;
      doorHp.set(i,hp);
      makeNoise(f.x+0.5,f.y+0.5,15,'#ff9f1c','player');
      if(hp<=0){ tiles[i] = (t===WIN)?BWIN:ODOOR; locked.delete(i); doorHp.delete(i);
        logMsg(t===WIN?'🪟 Окно выбито':'🚪 Дверь выбита — тебя слышал весь квартал'); }
      else logMsg('💥 БАМ! Слышно далеко…');
      return;
    }
    makeNoise(player.x,player.y,w.noise*0.7,'#8fa0b0','player');
    return;
  }

  // тихая добивка ножом со спины
  const back = Math.abs(((Math.atan2(player.y-target.y,player.x-target.x)-target.face+Math.PI*3)%(Math.PI*2))-Math.PI) > 1.6;
  if(w.stealth && target.state!=='chase' && back){
    killZombie(target);
    makeNoise(player.x,player.y,2,'#7fd6a0','player');
    logMsg('🔪 Тихо снял со спины');
    return;
  }
  const dmg = Math.max(1, Math.round(w.dmg * (0.5 + 0.5*armFactor())));
  target.hp -= dmg;
  target.stagger = w.breach?0.55:0.3;
  const a = Math.atan2(target.y-player.y, target.x-player.x);
  target.x += Math.cos(a)*0.25; target.y += Math.sin(a)*0.25;
  makeNoise(player.x,player.y,w.noise,'#d0d8e0','player');
  if(target.hp<=0) killZombie(target);
  else { target.state='chase'; target.tx=player.x; target.ty=player.y; target.repath=0; }
}

function shoot(){
  const w = WEAPONS[3];
  if(player.mag<=0){ logMsg('🔫 Пусто! R — перезарядка'); player.atkCd = 0.3; return; }
  player.mag--; player.atkCd = w.cd; player.swing = 0.16;
  // разброс: усталость, боль, повреждённые руки
  const spread = 0.03 + (1-armFactor())*0.20 + (player.stam<30?0.06:0) + Math.min(0.12, painLevel()/700);
  const a = player.face + (Math.random()-0.5)*spread*2;
  let hitAt = null, hitZ = null;
  const stepN = Math.ceil(w.range/0.15);
  let x = player.x, y = player.y;
  for(let s=0;s<stepN;s++){
    x += Math.cos(a)*0.15; y += Math.sin(a)*0.15;
    if(opaq(tAt(x|0,y|0))){ hitAt = {x,y}; break; }
    let found = null;
    for(const z of zombies){ if(!z.dead && dist(z.x,z.y,x,y) < 0.42){ found = z; break; } }
    if(found){ hitZ = found; hitAt = {x,y}; break; }
  }
  if(!hitAt) hitAt = { x, y };
  shots.push({ x0:player.x, y0:player.y, x1:hitAt.x, y1:hitAt.y, t:0 });
  makeNoise(player.x, player.y, w.noise, '#ffd166', 'player');
  logMsg('💥 ВЫСТРЕЛ — на звук идёт весь квартал');
  if(hitZ){ hitZ.hp -= w.dmg; if(hitZ.hp<=0) killZombie(hitZ); else { hitZ.state='chase'; hitZ.tx=player.x; hitZ.ty=player.y; hitZ.repath=0; } }
}

function reload(){
  if(player.weapon!==3 || countItem('pistol')<=0) return;
  const need = 7 - player.mag;
  if(need<=0){ logMsg('Магазин полон'); return; }
  const have = countItem('ammo');
  if(have<=0){ logMsg('Нет патронов'); return; }
  const take = Math.min(need, have);
  removeItem('ammo', take); player.mag += take;
  player.actT = 1.6; player.act = { kind:'reload' };
  makeNoise(player.x,player.y,3,'#b0b8c0','player');
  logMsg('🔩 Заряжено: '+player.mag+'/7');
}

function killZombie(z){
  z.dead = true; killCount++;
  corpses.push({ x:z.x, y:z.y, a:Math.random()*6.28 });
  for(let i=0;i<4;i++) bloodSpots.push({ x:z.x+(Math.random()-0.5)*0.8, y:z.y+(Math.random()-0.5)*0.8, r:2+Math.random()*4 });
}

function selectWeapon(k){
  if(k===0){ player.weapon = 0; return; }
  const w = WEAPONS[k];
  if(countItem(w.id)<=0){ logMsg('Нет: '+w.name); return; }
  player.weapon = k;
  logMsg(w.ico+' '+w.name);
}

function useItem(id){
  if(id==='food'){ if(!removeItem('food')) return; player.hunger = Math.min(100,player.hunger+45); player.actT=0.8; logMsg('🥫 Поел'); return; }
  if(id==='water'){ if(!removeItem('water')) return; player.thirst = Math.min(100,player.thirst+55); player.actT=0.6; logMsg('🚰 Попил'); return; }
  if(id==='pills'){ if(!removeItem('pills')) return; player.painkill = 95; player.actT=0.5; logMsg('💊 Боль отступает'); return; }
  if(id==='bandage'||id==='antiseptic'||id==='splint'||id==='antibio'){ setPanel('med'); logMsg('Выбери часть тела в медкарте'); return; }
  if(ITEMS[id].weapon!=null){ selectWeapon(ITEMS[id].weapon); return; }
  if(id==='keys'||id==='fuel'){ logMsg('Это для машины 🚗 — доберись до неё'); return; }
  if(id==='ammo'){ reload(); return; }
  logMsg('Просто вещь');
}

function dropItem(id){
  const it = inv.find(i=>i.id===id); if(!it) return;
  removeItem(id, it.n);
  logMsg('Выброшено: '+ITEMS[id].name);
  if(ITEMS[id].weapon!=null && player.weapon===ITEMS[id].weapon) player.weapon = 0;
}

/* =====================  ВИДИМОСТЬ  ===================== */

function ray(a, len){
  const dx = Math.cos(a)*0.22, dy = Math.sin(a)*0.22;
  let x = player.x, y = player.y;
  const n = Math.ceil(len/0.22);
  for(let s=0;s<n;s++){
    x += dx; y += dy;
    const tx = x|0, ty = y|0;
    if(!inb(tx,ty)) break;
    vis[idx(tx,ty)] = 2;
    if(opaq(tiles[idx(tx,ty)])) break;
  }
}
function computeVis(){
  for(let i=0;i<vis.length;i++) if(vis[i]===2) vis[i] = 1;
  const px = player.x|0, py = player.y|0;
  for(let y=py-1;y<=py+1;y++) for(let x=px-1;x<=px+1;x++) if(inb(x,y)) vis[idx(x,y)] = 2;
  for(let i=0;i<56;i++) ray(i/56*6.283, NEAR_R);
  const half = FOV_HALF * (crouch?1.05:1);
  for(let i=0;i<RAYS;i++) ray(player.face - half + 2*half*i/(RAYS-1), FOV_R);
}
function visible(x,y){ return inb(x,y) && vis[idx(x,y)]===2; }

/* =====================  ЖИЗНЕННЫЙ ЦИКЛ  ===================== */

function logMsg(t){
  log.unshift({ t, life:5.5 });
  if(log.length>4) log.pop();
}

/* --- панели (рюкзак/медкарта) и Esc в полном экране ---
   В полноэкранном режиме браузер сам съедает Esc, чтобы выйти. Пока открыта
   панель — просим отдавать Esc нам (Keyboard Lock): первый Esc закрывает
   панель, следующий уже выходит из полного экрана. */
function inFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
let escUnlockTimer = null;
function escLock(on, defer){
  try {
    const kb = navigator.keyboard;
    if(!kb || !kb.lock) return;                       // Firefox/Safari — такой возможности просто нет
    if(escUnlockTimer){ clearTimeout(escUnlockTimer); escUnlockTimer = null; }
    if(on && inFullscreen()){ const p = kb.lock(['Escape']); if(p && p.catch) p.catch(()=>{}); return; }
    const release = ()=>{ try { kb.unlock(); } catch(_){} };
    if(!defer){ release(); return; }
    // если снять захват прямо в обработчике Esc, браузер обработает ЭТО ЖЕ
    // нажатие как выход из полного экрана — ждём отпускания клавиши
    const onUp = ev=>{ if(ev.code==='Escape'){ document.removeEventListener('keyup', onUp, true); release(); } };
    document.addEventListener('keyup', onUp, true);
    escUnlockTimer = setTimeout(()=>{ document.removeEventListener('keyup', onUp, true); release(); }, 800);
  } catch(_){}
}
function setPanel(v, byEsc){
  panel = v || null;
  escLock(!!panel, !!byEsc);
}
function togglePanel(name){ setPanel(panel===name ? null : name); }
// вышли из полного экрана — снимаем захват и закрываем панель (в браузерах
// без Keyboard Lock она иначе осталась бы висеть открытой после Esc)
function onFsChange(){
  if(!inFullscreen()){ escLock(false); if(panel) setPanel(null); }
  else if(panel) escLock(true);
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

function reset(){
  let ok = false;
  for(let i=0;i<6 && !ok;i++) ok = genMap();
  vis = new Uint8Array(MAPW*MAPH);
  corpses = []; bloodSpots = []; rings = []; shots = []; log = [];
  survivors = [];
  for(let i=0;i<MAXP;i++){
    const sv = mkSurvivor(i !== 0);
    sv.player.x = spawnPos.x + ((i&1) ? 0.7 : -0.7) * (i ? 1 : 0);
    sv.player.y = spawnPos.y + (i > 1 ? 0.7 : 0);
    survivors.push(sv);
  }
  if(isNet() && net.isHost()) for(const sl of net.slots()) survivors[sl].gone = false;
  survivors[meSeat()].gone = false;
  // стартовый набор — каждому свой: рюкзак и вес тут личные
  for(const sv of survivors){ bindS(sv); addItem('bandage',2); addItem('water'); addItem('food'); }
  bindS(mySurv());
  zombies = [];
  for(let i=0;i<ZOMBIES;i++){
    let x,y,tries=0;
    do { x = 1+rnd(MAPW-2); y = 1+rnd(MAPH-2); tries++; }
    while(tries<200 && (solid(tAt(x,y)) || dist(x,y,player.x,player.y)<14));
    if(tries<200) zombies.push(makeZombie(x,y));
  }
  /* Ключи и канистра — в разных дальних шкафах, и обязательно в тех, до
     которых можно ДОЙТИ. Раньше годился любой, включая замурованный между
     стеной и соседними шкафами, — и такой квартал нельзя было выиграть с
     первого кадра. Достижимых genMap оставляет не меньше шестнадцати, так
     что выбирать всегда есть из чего. */
  const live = [...containers.values()].filter(c=>c.reach);
  const list = live.filter(c=>dist(c.x,c.y,player.x,player.y)>16);
  const pool = list.length>=2 ? list : live;
  const a = pool[rnd(pool.length)];
  const rest = pool.filter(c=>c!==a);
  const b = rest.length ? rest[rnd(rest.length)] : null;
  if(a) a.special = 'keys';
  if(b) b.special = 'fuel';

  time = 0; over = false; overT = 0; win = false; cause = ''; paused = false; setPanel(null);
  stepAcc = 0; noiseLevel = 0; killCount = 0; searched = 0; alerted = 0;
  crouch = false; runHeld = false;
  for(const k in held) held[k] = false;
  logMsg('Квартал заражён. Найди 🔑 и ⛽, дойди до 🚗');
  logMsg('Шум собирает зомби. Тише — дольше живёшь');
  computeVis();
  updateButtons();
}

function endGame(won, why){
  if(over) return;
  over = true; win = won; cause = why; overT = anim;   // anim идёт и после смерти, time — нет
  player.dead = !won;
  setPanel(null);
  if(won){
    const t = Math.floor(time);
    if(!best.esc || t < best.esc){ best.esc = t; }
  }
  if(Math.floor(time) > (best.time||0)) best.time = Math.floor(time);
  try { localStorage.setItem('zombie_best', JSON.stringify(best)); } catch(e){}
}


/* =====================  ВЫЖИВШИЕ  =====================
   Тело, раны и рюкзак у каждого свои — вес и медицина в этой игре личные.
   Чтобы не переписывать полторы тысячи строк под массив, расчёт идёт по
   очереди: глобальные player/body/inv/held на время шага указывают на того,
   кого считаем. Весь прежний код движения, ран, обыска и боя работает как был. */
function mkSurvivor(gone){
  const b = {}; for(const p of PARTS) b[p.id] = newPart();
  const iv = [];
  return {
    gone: !!gone, body: b, inv: iv, stepAcc: 0, crouch: false, runHeld: false,
    held: { up:false, down:false, left:false, right:false },
    player: { x:0, y:0, face:-1.57, stam:100, blood:BLOOD_MAX, hunger:100, thirst:100,
              painkill:0, weapon:0, mag:0, atkCd:0, swing:0, actT:0, act:null, climb:null,
              hurtT:0, dead:false, virusOn:false, virus:0, escaped:false }
  };
}
function bindS(s){
  player = s.player; body = s.body; inv = s.inv;
  held.up = s.held.up; held.down = s.held.down; held.left = s.held.left; held.right = s.held.right;
  crouch = s.crouch; runHeld = s.runHeld; stepAcc = s.stepAcc;
}
function unbindS(s){ s.stepAcc = stepAcc; }
function mySurv(){ return survivors[meSeat()]; }
function aliveSurvivors(){ return survivors.filter(s=>!s.gone && !s.player.dead && !s.player.escaped); }
// зомби гонится за ближайшим живым: перед его шагом подставляем именно это тело
function nearestSurv(x,y){
  let b = null, bd = 1e9;
  for(const s of aliveSurvivors()){ const d = dist(x,y,s.player.x,s.player.y); if(d<bd){ bd=d; b=s; } }
  return b;
}

function stepSurvivors(dt, wdt){
  syncMyInput();
  if(!amHost()) return;                 // гость мир не считает
  for(const s of survivors){
    if(s.gone || s.player.dead || s.player.escaped) continue;
    bindS(s); stepOne(dt, wdt); unbindS(s);
  }
  bindS(mySurv());                      // глобальные — обратно на своё тело
}
function stepOne(dt, wdt){
  // --- таймеры игрока ---
  if(player.atkCd>0) player.atkCd -= wdt;
  if(player.swing>0) player.swing -= wdt;
  if(player.hurtT>0) player.hurtT -= wdt;
  if(player.painkill>0) player.painkill = Math.max(0, player.painkill - wdt);

  if(player.actT>0){
    player.actT -= wdt;
    if(player.actT<=0 && player.act){
      if(player.act.kind==='search'){ doSearch(player.act.i); makeNoise(player.x,player.y,3,'#9fb0c0','player'); }
      if(player.act.kind==='pry'){
        const i = player.act.i;
        tiles[i] = ODOOR; locked.delete(i); tileChanged(i);
        makeNoise(player.act.x+0.5, player.act.y+0.5, 7, '#cfd8e0','player');
        logMsg('🪛 Замок отжат — почти тихо');
      }
      player.act = null;
    }
  }

  // --- перелезание ---
  if(player.climb){
    player.climb.t += wdt;
    const k = Math.min(1, player.climb.t/CLIMB_TIME);
    player.x = player.climb.fx + (player.climb.tx-player.climb.fx)*k;
    player.y = player.climb.fy + (player.climb.ty-player.climb.fy)*k;
    if(k>=1) player.climb = null;
  }

  // --- движение ---
  let mx = 0, my = 0;
  if(!panel && !player.climb && player.actT<=0 && !player.dead){
    if(held.left) mx -= 1; if(held.right) mx += 1;
    if(held.up) my -= 1; if(held.down) my += 1;
  }
  const moving = (mx||my) ? 1 : 0;
  const wantRun = runHeld && !crouch && player.stam>4;
  let spd = crouch ? SPD_SNEAK : (wantRun ? SPD_RUN : SPD_WALK);
  spd *= legFactor();
  const e = encum();
  if(e>1) spd /= (1 + (e-1)*1.6);
  spd *= 1 - Math.min(0.32, painLevel()/320);
  if(player.blood < 40) spd *= 0.85;
  if(player.stam < 8) spd *= 0.75;

  if(moving){
    const l = Math.hypot(mx,my); mx/=l; my/=l;
    // если мышь давно не двигали (клавиатура, D-pad, ноутбук без мыши) —
    // взгляд поворачивается туда, куда идём, иначе конус залипал бы навсегда
    if(anim - mouseT > 1.2) player.face = Math.atan2(my,mx);
    const ox = player.x, oy = player.y;
    const nx = player.x + mx*spd*wdt, ny = player.y + my*spd*wdt;
    const R = 0.28;
    if(!solidAt(nx+Math.sign(mx)*R, player.y)) player.x = nx;
    if(!solidAt(player.x, ny+Math.sign(my)*R)) player.y = ny;
    player.x = clamp(player.x, 1.3, MAPW-1.3); player.y = clamp(player.y, 1.3, MAPH-1.3);

    // шаги = шум, и считаем ФАКТИЧЕСКИ пройденное: упёршись в стену, шуметь незачем
    stepAcc += dist(ox,oy,player.x,player.y);
    const stepLen = crouch?1.6:(wantRun?0.85:1.15);
    if(stepAcc >= stepLen){
      stepAcc = 0;
      const nr = crouch ? 1.5 : (wantRun ? 9 : 3);
      makeNoise(player.x, player.y, nr, wantRun?'#ffb4a2':'#8d99ae', 'player');
    }
  } else stepAcc = Math.max(0, stepAcc - wdt);

  // --- выносливость ---
  if(moving && wantRun) player.stam -= (14*(1+Math.max(0,e-1)*1.4))*wdt;
  else {
    const regen = (crouch?7:(moving?4.5:9)) * (player.hunger>15&&player.thirst>15?1:0.45) * (1-Math.min(0.5,painLevel()/300));
    player.stam += regen*wdt;
  }
  player.stam = clamp(player.stam, 0, 100);

  // --- голод, жажда ---
  player.hunger = Math.max(0, player.hunger - 0.075*wdt*(moving?1.35:1));
  player.thirst = Math.max(0, player.thirst - 0.11*wdt*(moving&&wantRun?1.6:1));
  if(player.hunger<=0 || player.thirst<=0) body.torso.hp = Math.max(0, body.torso.hp - 1.1*wdt);

  // --- раны ---
  let bleedSum = 0;
  for(const p of PARTS){
    const b = body[p.id];
    if(b.band>0){
      b.band -= wdt;
      if(b.bleed>0) b.bleed = Math.max(0, b.bleed - 0.016*wdt);
      if(b.band<=0 && b.bleed>0) logMsg('🩸 Повязка промокла: '+p.name);
    } else if(b.bleed>0){
      bleedSum += b.bleed;
      b.hp = Math.max(0, b.hp - b.bleed*0.35*wdt);
    }
    if(b.bleed>0 && !b.disinf) b.inf = Math.min(100, b.inf + 0.30*b.bleed*wdt);
    if(b.bite) b.inf = Math.min(100, b.inf + 0.12*wdt);
    // медленное заживление
    if(b.bleed<=0 && b.inf<25 && b.hp<100) b.hp = Math.min(100, b.hp + 0.35*wdt);
    if(b.fx && b.splint) { b.fxT = (b.fxT||0) + wdt; if(b.fxT>150){ b.fx=false; b.splint=false; b.fxT=0; logMsg('🦴 Перелом сросся'); } }
    if(b.inf>0 && b.disinf && b.bleed<=0) b.inf = Math.max(0, b.inf - 0.5*wdt);
  }
  player.blood = clamp(player.blood - bleedSum*0.55*wdt, 0, BLOOD_MAX);
  if(bleedSum<=0 && player.blood<BLOOD_MAX) player.blood = Math.min(BLOOD_MAX, player.blood + 0.30*wdt);

  // --- заражение от укуса ---
  if(player.virusOn){
    player.virus = Math.min(100, player.virus + 100/VIRUS_TIME*wdt);
    if(player.virus>=100) endGame(false,'Ты обратился. Укус нельзя вылечить');
  }

  // смерть считаем для КАЖДОГО тела отдельно: в одиночку это конец забега,
  // в команде — выбывает один, а остальные продолжают
  const dcause = body.head.hp<=0 ? 'Смертельные раны головы'
    : body.torso.hp<=0 ? 'Тело не выдержало'
    : player.blood<=0 ? 'Кровопотеря — надо было перевязывать'
    : maxInf()>=100 ? 'Сепсис. Рану надо было обработать' : null;
  if(dcause && !player.dead){
    if(!isNet()){ endGame(false, dcause); return; }
    player.dead = true; logMsg('☠️ Выживший ' + (survivors.findIndex(v=>v.player===player)+1) + ': ' + dcause);
    if(survivors.every(v=>v.gone || v.player.dead)) endGame(false, 'Вся группа погибла');
  }
}

let pathBudget = 0;

function update(dt){
  anim += dt;
  if(over || paused) return;
  const wdt = panel ? dt*0.4 : dt;    // в панелях мир идёт медленно, но идёт
  time += wdt;

  stepSurvivors(dt, wdt);

  // гость мир не считает: зомби, шум и двери приходят от хозяина комнаты
  if(!amHost()){
    for(const r of rings){ r.t += dt; r.r = r.max * Math.min(1, r.t/r.life); }
    rings = rings.filter(r=>r.t < r.life);
    for(const sh of shots) sh.t += dt;
    shots = shots.filter(sh=>sh.t<0.12);
    for(const l of log) l.life -= dt;
    computeVis();
    return;
  }

  // --- шум затухает ---
  noiseLevel = Math.max(0, noiseLevel - 14*wdt);

  // --- звуковые кольца ---
  for(const r of rings){ r.t += dt; r.r = r.max * Math.min(1, r.t/r.life); }
  rings = rings.filter(r=>r.t < r.life);
  for(const s of shots) s.t += dt;
  shots = shots.filter(s=>s.t<0.12);

  // --- зомби ---
  pathBudget = 7;
  alerted = 0;
  for(const z of zombies){
    const tgt = nearestSurv(z.x, z.y);
    if(tgt) bindS(tgt);                 // зомби видит и кусает ближайшего
    updateZombie(z, wdt);
    if(z.state!=='idle' && !z.dead) alerted++;
  }
  bindS(mySurv());

  for(const l of log) l.life -= dt;

  computeVis();
  if(isNet() && net.isHost()){ netAcc += dt; if(netAcc >= 1/15){ netAcc = 0; broadcast(); } }
}

function solidAt(x,y){ return solid(tAt(x|0, y|0)); }

/* =====================  ОТРИСОВКА  ===================== */

// битмап канваса подгоняется под реальный размер (с учётом DPI),
// а рисуем всегда в логических координатах CW x CH — картинка не мылится
function syncRes(){
  const r = canvas.getBoundingClientRect();
  if(!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width*dpr)), h = Math.max(1, Math.round(r.height*dpr));
  if(canvas.width!==w || canvas.height!==h){ canvas.width = w; canvas.height = h; }
  ctx.setTransform(w/CW, 0, 0, h/CH, 0, 0);
}

let camX = 0, camY = 0;
function worldToScreen(x,y){ return { x:x*T-camX, y:y*T-camY }; }

const TILE_COLOR = [];
TILE_COLOR[ROAD]='#3a3e45'; TILE_COLOR[GRASS]='#33452f'; TILE_COLOR[FLOOR]='#59493a';
TILE_COLOR[WALL]='#847a68'; TILE_COLOR[DOOR]='#966b39'; TILE_COLOR[ODOOR]='#463c30';
TILE_COLOR[WIN]='#5d7f8c'; TILE_COLOR[FENCE]='#6f6552'; TILE_COLOR[SHELF]='#7a5c34';
TILE_COLOR[TREE]='#2c4c30'; TILE_COLOR[CAR]='#8c3140'; TILE_COLOR[BWIN]='#3c4a50';

function drawTile(x,y,sx,sy,t,bright){
  ctx.fillStyle = (t===ROAD||t===GRASS||t===ODOOR||t===BWIN)
    ? (((x+y)&1) ? TILE_COLOR[t] : shade(TILE_COLOR[t], 0.93))
    : TILE_COLOR[t];
  ctx.fillRect(sx,sy,T,T);

  if(t===WALL){
    ctx.fillStyle = '#9a8f7b'; ctx.fillRect(sx,sy,T,4);
    ctx.strokeStyle = 'rgba(0,0,0,.30)'; ctx.lineWidth = 1; ctx.strokeRect(sx+0.5,sy+0.5,T-1,T-1);
  } else if(t===DOOR){
    ctx.fillStyle = '#6d4c26'; ctx.fillRect(sx+2,sy+2,T-4,T-4);
    ctx.fillStyle = '#d8c07a'; ctx.fillRect(sx+T-8,sy+T/2-2,4,4);
    if(locked.has(idx(x,y))){ ctx.fillStyle='#e0b24a'; ctx.font='9px Segoe UI'; ctx.textAlign='center'; ctx.fillText('🔒',sx+T/2,sy+T/2+3); }
    const hp = doorHp.get(idx(x,y));
    if(hp!=null && hp<DOOR_HP){ ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sx+3,sy+4); ctx.lineTo(sx+T-6,sy+T-5); ctx.stroke(); }
  } else if(t===ODOOR){
    ctx.fillStyle = '#6d4c26'; ctx.fillRect(sx,sy,4,T);
  } else if(t===WIN){
    ctx.fillStyle = '#6a6355'; ctx.fillRect(sx,sy,T,T);
    ctx.fillStyle = '#89b7c6'; ctx.fillRect(sx+2,sy+5,T-4,T-10);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(sx+T/2,sy+5); ctx.lineTo(sx+T/2,sy+T-5); ctx.stroke();
  } else if(t===BWIN){
    ctx.fillStyle = '#6a6355'; ctx.fillRect(sx,sy,T,3); ctx.fillRect(sx,sy+T-3,T,3);
    ctx.strokeStyle = '#9fc4d0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx+3,sy+4); ctx.lineTo(sx+9,sy+T-6); ctx.moveTo(sx+T-4,sy+5); ctx.lineTo(sx+T-11,sy+T-4); ctx.stroke();
  } else if(t===FENCE){
    ctx.fillStyle = '#2b3a2c'; ctx.fillRect(sx,sy,T,T);
    ctx.strokeStyle = '#7d7160'; ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=3;i<T;i+=6){ ctx.moveTo(sx+i,sy+3); ctx.lineTo(sx+i,sy+T-3); }
    ctx.moveTo(sx+1,sy+7); ctx.lineTo(sx+T-1,sy+7); ctx.moveTo(sx+1,sy+T-7); ctx.lineTo(sx+T-1,sy+T-7);
    ctx.stroke();
  } else if(t===SHELF){
    const c = containers.get(idx(x,y));
    ctx.fillStyle = '#493f35'; ctx.fillRect(sx,sy,T,T);
    ctx.fillStyle = c && c.searched ? '#4d3d28' : '#8a6a3c'; ctx.fillRect(sx+2,sy+4,T-4,T-8);
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx+2,sy+T/2); ctx.lineTo(sx+T-2,sy+T/2); ctx.stroke();
    if(c && !c.searched){ ctx.fillStyle = '#e8d9a0'; ctx.fillRect(sx+T/2-1,sy+T/2-1,2,2); }
  } else if(t===TREE){
    ctx.fillStyle = '#2b3a2c'; ctx.fillRect(sx,sy,T,T);
    ctx.fillStyle = '#1e3a22'; ctx.beginPath(); ctx.arc(sx+T/2,sy+T/2,T*0.46,0,6.3); ctx.fill();
    ctx.fillStyle = '#2e5c33'; ctx.beginPath(); ctx.arc(sx+T/2-2,sy+T/2-2,T*0.32,0,6.3); ctx.fill();
  } else if(t===CAR){
    const isExit = exitPos && x===exitPos.x && y===exitPos.y;
    ctx.fillStyle = '#31343a'; ctx.fillRect(sx,sy,T,T);
    ctx.fillStyle = isExit ? '#b23a48' : '#4a4f57'; ctx.fillRect(sx+2,sy+1,T-4,T-2);
    ctx.fillStyle = '#8fb8cc'; ctx.fillRect(sx+4,sy+4,T-8,6); ctx.fillRect(sx+4,sy+T-10,T-8,6);
    if(isExit){ ctx.fillStyle='#ffd166'; ctx.font='11px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('🚗',sx+T/2,sy+T/2); }
  } else if(t===FLOOR){
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.strokeRect(sx+0.5,sy+0.5,T-1,T-1);
  }

  if(bright < 1){
    ctx.fillStyle = 'rgba(4,6,9,'+(1-bright).toFixed(3)+')';
    ctx.fillRect(sx,sy,T,T);
  }
}
function shade(hex,k){
  const n = parseInt(hex.slice(1),16);
  const r = Math.round(((n>>16)&255)*k), g = Math.round(((n>>8)&255)*k), b = Math.round((n&255)*k);
  return 'rgb('+r+','+g+','+b+')';
}

function drawZombie(z){
  const p = worldToScreen(z.x,z.y);
  const wob = Math.sin(z.bob)*1.6;
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y+7, 8, 3.5, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = z.state==='chase' ? '#7fae52' : '#5f7a45';
  ctx.beginPath(); ctx.arc(p.x, p.y+wob*0.3, 8, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#3d4f2c';
  ctx.beginPath(); ctx.arc(p.x, p.y+wob*0.3, 8, 0, 6.3); ctx.stroke();
  // руки вперёд
  ctx.strokeStyle = '#6d8a4e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const a = z.face;
  ctx.beginPath();
  ctx.moveTo(p.x+Math.cos(a-0.5)*5, p.y+Math.sin(a-0.5)*5);
  ctx.lineTo(p.x+Math.cos(a-0.25)*13, p.y+Math.sin(a-0.25)*13);
  ctx.moveTo(p.x+Math.cos(a+0.5)*5, p.y+Math.sin(a+0.5)*5);
  ctx.lineTo(p.x+Math.cos(a+0.25)*13, p.y+Math.sin(a+0.25)*13);
  ctx.stroke();
  // взгляд
  ctx.fillStyle = z.state==='chase' ? '#ff5a4a' : '#c9d6a8';
  ctx.beginPath(); ctx.arc(p.x+Math.cos(a)*3.5, p.y+Math.sin(a)*3.5, 2, 0, 6.3); ctx.fill();
  if(z.climb){ ctx.strokeStyle='#e0d090'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(p.x,p.y,12,0,6.3); ctx.stroke(); }
}

function drawPlayer(){
  const p = worldToScreen(player.x, player.y);
  // конус обзора
  const g = ctx.createRadialGradient(p.x,p.y,4,p.x,p.y,FOV_R*T);
  g.addColorStop(0,'rgba(255,244,214,.13)'); g.addColorStop(1,'rgba(255,244,214,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(p.x,p.y);
  ctx.arc(p.x,p.y,FOV_R*T, player.face-FOV_HALF, player.face+FOV_HALF); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(p.x,p.y+7,8,3.5,0,0,6.3); ctx.fill();
  ctx.fillStyle = crouch ? '#8aa0c0' : '#cfd8e0';
  ctx.beginPath(); ctx.arc(p.x,p.y, crouch?7:8.5, 0, 6.3); ctx.fill();
  ctx.strokeStyle = '#2b3038'; ctx.lineWidth = 2; ctx.stroke();

  // оружие в руке
  const w = WEAPONS[player.weapon];
  const sw = player.swing>0 ? (0.22-player.swing)/0.22 : 0;
  const a = player.face + (player.swing>0 ? (1-sw)*0.8-0.4 : 0);
  ctx.strokeStyle = w.gun ? '#c9c9c9' : (player.weapon===0 ? '#cfd8e0' : '#d6c08a');
  ctx.lineWidth = 3; ctx.lineCap='round';
  const rl = w.gun?12:(player.weapon===2?16:11);
  ctx.beginPath(); ctx.moveTo(p.x+Math.cos(a)*5, p.y+Math.sin(a)*5);
  ctx.lineTo(p.x+Math.cos(a)*rl, p.y+Math.sin(a)*rl); ctx.stroke();

  // прогресс действия
  if(player.actT>0 || player.climb){
    const tot = player.act ? (player.act.kind==='search'?SEARCH_TIME:player.act.kind==='pry'?PRY_TIME:1.6) : CLIMB_TIME;
    const k = player.climb ? player.climb.t/CLIMB_TIME : 1 - player.actT/tot;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x-16, p.y-20, 32, 5);
    ctx.fillStyle = '#8ab547'; ctx.fillRect(p.x-15, p.y-19, 30*clamp(k,0,1), 3);
  }
}

function drawRings(){
  for(const r of rings){
    const p = worldToScreen(r.x,r.y);
    const alpha = (1 - r.t/r.life) * 0.55;
    ctx.strokeStyle = r.color; ctx.globalAlpha = alpha; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x,p.y,r.r*T,0,6.3); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function bar(x,y,w,h,v,max,col,bg){
  ctx.fillStyle = bg||'rgba(0,0,0,.5)'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = col; ctx.fillRect(x+1,y+1,Math.max(0,(w-2)*clamp(v/max,0,1)),h-2);
}

function partColor(b){
  if(b.hp<=0) return '#5a1e1e';
  if(b.bite) return '#a02020';
  if(b.bleed>0 && b.band<=0) return '#c8402f';
  if(b.fx) return '#c98a2a';
  if(b.inf>25) return '#a05fc0';
  if(b.hp<60) return '#c8a02f';
  return '#5f9a52';
}

// человечек-схема в HUD
function drawBody(x,y,s){
  const P = (id)=>body[id];
  const put=(bx,by,bw,bh,id)=>{
    ctx.fillStyle = partColor(P(id));
    ctx.fillRect(x+bx*s, y+by*s, bw*s, bh*s);
    const b = P(id);
    if(b.band>0){ ctx.strokeStyle='#eae0d0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+bx*s,y+(by+bh/2)*s); ctx.lineTo(x+(bx+bw)*s,y+(by+bh/2)*s); ctx.stroke(); }
    if(b.fx){ ctx.fillStyle='#ffd166'; ctx.fillRect(x+(bx+bw/2)*s-1, y+by*s, 2, bh*s); }
  };
  ctx.fillStyle = partColor(P('head'));
  ctx.beginPath(); ctx.arc(x+3*s, y+1.6*s, 1.5*s, 0, 6.3); ctx.fill();
  put(2, 3.2, 2, 3.4, 'torso');
  put(0.4, 3.4, 1.3, 3.0, 'larm');
  put(4.3, 3.4, 1.3, 3.0, 'rarm');
  put(2.0, 6.8, 0.9, 3.0, 'lleg');
  put(3.1, 6.8, 0.9, 3.0, 'rleg');
}

let uiHit = [];
function uiBtn(x,y,w,h,label,fn,col,small){
  uiHit.push({ x,y,w,h,fn });
  ctx.fillStyle = col || 'rgba(60,70,84,.92)';
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
  ctx.fillStyle = '#e6ebef'; ctx.font = (small?'10px':'11px')+' Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+w/2, y+h/2+0.5);
}

function drawMinimap(){
  const S = 1.9, MW = MAPW*S, MH = MAPH*S;
  const x0 = CW-MW-8, y0 = CH-MH-52;
  ctx.fillStyle = 'rgba(6,9,13,.82)'; ctx.fillRect(x0-3,y0-3,MW+6,MH+6);
  ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.strokeRect(x0-3.5,y0-3.5,MW+7,MH+7);
  for(let y=0;y<MAPH;y++) for(let x=0;x<MAPW;x++){
    const v = vis[idx(x,y)]; if(!v) continue;
    const t = tiles[idx(x,y)];
    let c = '#20262c';
    if(t===WALL||t===TREE) c = '#39404a';
    else if(t===ROAD) c = '#2c3138';
    else if(t===FLOOR||t===ODOOR) c = '#4a4033';
    else if(t===SHELF) c = (containers.get(idx(x,y))||{}).searched ? '#3d3428' : '#96702f';
    else if(t===DOOR) c = '#7a5a30';
    ctx.fillStyle = c; ctx.fillRect(x0+x*S, y0+y*S, S, S);
  }
  // машина всегда известна
  ctx.fillStyle = '#ff4d5e'; ctx.fillRect(x0+exitPos.x*S-1.5, y0+exitPos.y*S-1.5, S+3, S+3);
  // зомби только видимые
  ctx.fillStyle = '#9ec25a';
  for(const z of zombies) if(!z.dead && visible(z.x|0,z.y|0)) ctx.fillRect(x0+z.x*S-1, y0+z.y*S-1, 2.4, 2.4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0+player.x*S-1.5, y0+player.y*S-1.5, 3, 3);
}

function drawHUD(){
  // верхняя панель
  ctx.fillStyle = 'rgba(8,11,15,.78)'; ctx.fillRect(0,0,CW,58);
  drawBody(8, 5, 5.2);
  // шкалы
  const bx = 48;
  ctx.font = '10px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#c8ccd2';
  ctx.fillText('🩸 Кровь', bx, 14); bar(bx+52, 6, 78, 8, player.blood, BLOOD_MAX, player.blood<40?'#c8402f':'#b8353a');
  ctx.fillText('💪 Силы', bx, 28);  bar(bx+52, 20, 78, 8, player.stam, 100, player.stam<25?'#c98a2a':'#5f9a52');
  const w8 = weight();
  ctx.fillText('🎒 '+w8.toFixed(1)+'/'+CAP+'кг', bx, 42);
  bar(bx+52, 34, 78, 8, Math.min(w8,CAP*1.6), CAP*1.6, w8>CAP?'#c8402f':'#4b7fa8');
  ctx.strokeStyle = '#e6ebef'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx+52+78/1.6, 34); ctx.lineTo(bx+52+78/1.6, 42); ctx.stroke();

  // правая часть: время, шум, тревога
  ctx.textAlign = 'right'; ctx.fillStyle = '#dfe5ea';
  const mm = Math.floor(time/60), ss = Math.floor(time%60);
  ctx.font = 'bold 13px Segoe UI';
  ctx.fillText('⏱ '+mm+':'+(ss<10?'0':'')+ss, CW-10, 15);
  ctx.font = '10px Segoe UI'; ctx.fillStyle = '#aab3bb';
  ctx.fillText('🧟 в тревоге: '+alerted+'   ☠ убито: '+killCount, CW-10, 29);
  ctx.fillText((countItem('keys')>0?'🔑':'🔒')+' ключи   '+(countItem('fuel')>0?'⛽':'🚫')+' бензин', CW-10, 42);
  // индикатор шума
  ctx.fillStyle = '#aab3bb'; ctx.textAlign='left'; ctx.fillText('🔊', 186, 54);
  bar(202, 47, CW-202-104, 7, noiseLevel, 46, noiseLevel>20?'#ff8c42':'#6a9ec9');

  // статусы
  let sx = 8, sy = 66;
  ctx.font = '11px Segoe UI'; ctx.textAlign = 'left';
  const st = [];
  if(player.virusOn) st.push(['☣ ЗАРАЖЕНИЕ '+Math.floor(player.virus)+'%','#ff4d5e']);
  const mi = maxInf();
  if(mi>15) st.push(['🦠 Инфекция '+Math.floor(mi)+'%', mi>60?'#ff4d5e':'#c07fd0']);
  if(totalBleed()>0) st.push(['🩸 Кровотечение','#ff6b5e']);
  for(const p of PARTS) if(body[p.id].fx && !body[p.id].splint){ st.push(['🦴 Перелом: '+p.name,'#ffc14d']); break; }
  if(encum()>1) st.push(['⚓ Перегруз','#ffb04d']);
  if(painLevel()>45) st.push(['😖 Сильная боль','#ffa07a']);
  if(player.hunger<20) st.push(['🍽 Голод','#ffc14d']);
  if(player.thirst<20) st.push(['💧 Жажда','#7fd0ff']);
  for(const s of st){
    ctx.fillStyle = 'rgba(8,11,15,.7)';
    const w = ctx.measureText(s[0]).width + 10;
    ctx.fillRect(sx-4, sy-11, w, 15);
    ctx.fillStyle = s[1]; ctx.fillText(s[0], sx, sy);
    sy += 17;
  }

  // лог
  ctx.textAlign = 'left'; ctx.font = '11px Segoe UI';
  for(let i=0;i<log.length;i++){
    const l = log[i];
    ctx.globalAlpha = clamp(l.life/1.5,0,1)*0.95;
    ctx.fillStyle = 'rgba(6,9,13,.72)';
    const w = ctx.measureText(l.t).width+10;
    ctx.fillRect(6, CH-108-i*16, w, 14);
    ctx.fillStyle = i===0?'#e8eef5':'#a9b3bd';
    ctx.fillText(l.t, 11, CH-97-i*16);
    ctx.globalAlpha = 1;
  }

  drawMinimap();

  // нижняя панель
  ctx.fillStyle = 'rgba(8,11,15,.85)'; ctx.fillRect(0,CH-46,CW,46);
  uiHit = [];
  // оружие
  for(let k=0;k<4;k++){
    const w = WEAPONS[k], has = hasWeapon(k);
    const x = 8 + k*54, y = CH-40;
    ctx.fillStyle = player.weapon===k ? 'rgba(138,181,71,.30)' : 'rgba(40,47,56,.85)';
    ctx.fillRect(x,y,50,32);
    ctx.strokeStyle = player.weapon===k ? '#8ab547' : 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1; ctx.strokeRect(x+0.5,y+0.5,49,31);
    ctx.globalAlpha = has?1:0.32;
    ctx.font = '15px serif'; ctx.textAlign = 'center'; ctx.textBaseline='middle';
    ctx.fillStyle = '#e6ebef'; ctx.fillText(w.ico, x+25, y+13);
    ctx.font = '9px Segoe UI'; ctx.fillText(k+1, x+6, y+27);
    if(k===3 && has){ ctx.fillText(player.mag+'/'+countItem('ammo'), x+30, y+26); }
    ctx.globalAlpha = 1;
    uiHit.push({ x, y, w:50, h:32, fn:()=>selectWeapon(k) });
  }
  // режим передвижения
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const mode = crouch ? '🐈 крадусь' : (runHeld ? '🏃 бегу' : '🚶 иду');
  ctx.font = '11px Segoe UI'; ctx.fillStyle = crouch ? '#8ab547' : (runHeld ? '#ff9f6b' : '#c8ccd2');
  ctx.fillText(mode, 244, CH-30);
  ctx.fillStyle = '#8f98a1'; ctx.font='10px Segoe UI';
  ctx.fillText('E — действие · Q — перевязка', 244, CH-14);
  uiBtn(CW-118, CH-40, 52, 32, '🎒 I', ()=>togglePanel('inv'));
  uiBtn(CW-62,  CH-40, 52, 32, '🩹 H', ()=>togglePanel('med'));
}

function drawInvPanel(){
  const w = 420, h = 446, x = (CW-w)/2, y = (CH-h)/2 - 10;
  ctx.fillStyle = 'rgba(8,11,15,.95)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = '#8ab547'; ctx.lineWidth = 2; ctx.strokeRect(x+1,y+1,w-2,h-2);
  ctx.fillStyle = '#e6ebef'; ctx.font = 'bold 15px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText('🎒 РЮКЗАК', x+14, y+24);
  const w8 = weight();
  ctx.font = '12px Segoe UI'; ctx.fillStyle = w8>CAP ? '#ff6b5e' : '#a9b3bd';
  ctx.fillText(w8.toFixed(2)+' / '+CAP+' кг'+(w8>CAP?'  — ПЕРЕГРУЗ: медленно, не перелезть':''), x+14, y+42);
  ctx.fillStyle = '#7f8a94'; ctx.font='10px Segoe UI';
  ctx.fillText('мир вокруг движется медленно, но движется · Esc / I — закрыть', x+14, y+h-12);

  let ry = y+54;
  if(!inv.length){ ctx.fillStyle='#7f8a94'; ctx.font='12px Segoe UI'; ctx.fillText('Пусто. Обыскивай шкафы (E)', x+14, ry+14); }
  for(const it of inv){
    if(ry > y+h-40) break;
    const I = ITEMS[it.id];
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(x+10, ry, w-20, 22);
    ctx.font = '13px serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle='#e6ebef';
    ctx.fillText(I.ico, x+18, ry+11);
    ctx.font = '12px Segoe UI';
    ctx.fillText(I.name + (it.n>1?' ×'+it.n:''), x+40, ry+11);
    ctx.fillStyle = '#8f98a1'; ctx.font = '11px Segoe UI'; ctx.textAlign='right';
    ctx.fillText((I.w*it.n).toFixed(2)+' кг', x+w-136, ry+11);
    uiBtn(x+w-128, ry+2, 62, 18, 'Использовать', ()=>myAct('use', it.id), 'rgba(70,94,60,.9)', true);
    uiBtn(x+w-62,  ry+2, 52, 18, 'Выбросить',   ()=>myAct('drop', it.id), 'rgba(94,60,60,.9)', true);
    ry += 25;
  }
}

function drawMedPanel(){
  const w = 452, h = 400, x = (CW-w)/2, y = (CH-h)/2 - 10;
  ctx.fillStyle = 'rgba(8,11,15,.95)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = '#c8402f'; ctx.lineWidth = 2; ctx.strokeRect(x+1,y+1,w-2,h-2);
  ctx.fillStyle = '#e6ebef'; ctx.font = 'bold 15px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText('🩹 МЕДКАРТА', x+14, y+24);
  ctx.font = '11px Segoe UI'; ctx.fillStyle = '#a9b3bd'; ctx.textAlign = 'right';
  ctx.fillText('🩹'+countItem('bandage')+'   🧴'+countItem('antiseptic')+'   🦯'+countItem('splint')+'   💉'+countItem('antibio')+'   💊'+countItem('pills'), x+w-14, y+24);
  ctx.textAlign = 'left';
  ctx.fillText('Кровь '+Math.floor(player.blood)+'%   Боль '+Math.floor(painLevel()), x+14, y+41);
  if(player.virusOn){ ctx.fillStyle='#ff4d5e'; ctx.fillText('☣ ЗАРАЖЕНИЕ ОТ УКУСА '+Math.floor(player.virus)+'% — не лечится', x+180, y+41); }
  ctx.fillStyle = '#7f8a94'; ctx.font='10px Segoe UI';
  ctx.fillText('Esc / H — закрыть · мир вокруг движется медленно', x+14, y+h-12);

  let ry = y+54;
  for(const p of PARTS){
    const b = body[p.id];
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(x+10, ry, w-20, 46);
    ctx.fillStyle = partColor(b); ctx.fillRect(x+10, ry, 3, 46);
    ctx.font = '12px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle = '#e6ebef';
    ctx.fillText(p.name, x+20, ry+13);
    bar(x+110, ry+7, 70, 8, b.hp, 100, b.hp<40?'#c8402f':'#5f9a52');
    const tags = [];
    if(b.bleed>0) tags.push(b.band>0 ? '🩹перевязано' : (b.bleed>1.2?'🩸ГЛУБОКАЯ РАНА':'🩸кровит'));
    if(b.bite) tags.push('🦷укус');
    if(b.fx) tags.push(b.splint?'🦴шина':'🦴ПЕРЕЛОМ');
    if(b.inf>3) tags.push('🦠'+Math.floor(b.inf)+'%');
    if(b.disinf) tags.push('🧴чисто');
    ctx.font = '10px Segoe UI'; ctx.fillStyle = '#a9b3bd';
    ctx.fillText(tags.join('  ') || 'без повреждений', x+20, ry+31);

    const bx0 = x+w-198;
    uiBtn(bx0,     ry+13, 44, 20, '🩹 бинт',  ()=>myAct('treat',{part:p.id,item:'bandage'}),   countItem('bandage')>0?'rgba(70,90,60,.9)':'rgba(45,50,58,.8)', true);
    uiBtn(bx0+48,  ry+13, 50, 20, '🧴 антисп',()=>myAct('treat',{part:p.id,item:'antiseptic'}),countItem('antiseptic')>0?'rgba(70,90,60,.9)':'rgba(45,50,58,.8)', true);
    uiBtn(bx0+102, ry+13, 42, 20, '🦯 шина',  ()=>myAct('treat',{part:p.id,item:'splint'}),    countItem('splint')>0?'rgba(70,90,60,.9)':'rgba(45,50,58,.8)', true);
    uiBtn(bx0+148, ry+13, 46, 20, '💉 антиб', ()=>myAct('treat',{part:p.id,item:'antibio'}),   countItem('antibio')>0?'rgba(70,90,60,.9)':'rgba(45,50,58,.8)', true);
    ry += 50;
  }
}

function drawEnd(){
  ctx.fillStyle = win ? 'rgba(6,20,12,.86)' : 'rgba(16,6,8,.86)';
  ctx.fillRect(0,0,CW,CH);
  ctx.textAlign = 'center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle = win ? '#8ab547' : '#b23a48';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(win ? 'ВЫБРАЛСЯ' : 'ТЫ УМЕР', CW/2, CH/2-70);
  ctx.fillStyle = '#e6ebef'; ctx.font = '15px Segoe UI';
  ctx.fillText(cause, CW/2, CH/2-40);
  const mm = Math.floor(time/60), ss = Math.floor(time%60);
  let score = killCount*5 + searched*3 + Math.floor(time/10);
  for(const i of inv) if(ITEMS[i.id].score) score += ITEMS[i.id].score*i.n;
  if(win) score += 250;
  ctx.font = '13px Segoe UI'; ctx.fillStyle = '#c2cad2';
  ctx.fillText('Продержался '+mm+':'+(ss<10?'0':'')+ss+'   ·   обыскано '+searched+'   ·   упокоено '+killCount, CW/2, CH/2-12);
  ctx.fillText('Очки: '+score, CW/2, CH/2+10);
  if(best.esc) ctx.fillText('Лучший побег: '+Math.floor(best.esc/60)+':'+(best.esc%60<10?'0':'')+(best.esc%60), CW/2, CH/2+32);
  ctx.fillText('Дольше всего прожил: '+Math.floor((best.time||0)/60)+':'+(((best.time||0)%60)<10?'0':'')+((best.time||0)%60), CW/2, CH/2+52);
  ctx.fillStyle = '#8ab547'; ctx.font = '14px Segoe UI';
  ctx.fillText('Enter / тап — новый квартал', CW/2, CH/2+86);
}

function render(){
  syncRes();
  ctx.fillStyle = '#05070a'; ctx.fillRect(0,0,CW,CH);
  if(!tiles) return;

  // Math.max(0,...): на широком экране окно может стать шире самого
  // квартала, и тогда верхняя граница ушла бы в минус, а карта — вбок
  camX = clamp(player.x*T - CW/2, 0, Math.max(0, MAPW*T - CW));
  camY = clamp(player.y*T - CH/2, 0, Math.max(0, MAPH*T - CH));
  const c0 = Math.max(0, Math.floor(camX/T)), r0 = Math.max(0, Math.floor(camY/T));
  const c1 = Math.min(MAPW-1, Math.ceil((camX+CW)/T)), r1 = Math.min(MAPH-1, Math.ceil((camY+CH)/T));

  for(let y=r0;y<=r1;y++) for(let x=c0;x<=c1;x++){
    const v = vis[idx(x,y)]; if(!v) continue;
    const sx = x*T-camX, sy = y*T-camY;
    let bright;
    if(v===2){
      const d = dist(x+0.5,y+0.5,player.x,player.y);
      bright = clamp(1 - d/(FOV_R*1.9), 0.55, 1);   // что видно сейчас — заметно светлее
    } else bright = 0.17;                            // что помнишь — почти силуэт
    drawTile(x,y,sx,sy,tiles[idx(x,y)],bright);
  }

  // кровь и трупы — только на видимых/изученных клетках
  for(const b of bloodSpots){
    if(!vis[idx(b.x|0,b.y|0)]) continue;
    const p = worldToScreen(b.x,b.y);
    ctx.fillStyle = visible(b.x|0,b.y|0) ? 'rgba(120,20,24,.55)' : 'rgba(60,14,16,.35)';
    ctx.beginPath(); ctx.arc(p.x,p.y,b.r,0,6.3); ctx.fill();
  }
  for(const c of corpses){
    if(!vis[idx(c.x|0,c.y|0)]) continue;
    const p = worldToScreen(c.x,c.y);
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(c.a);
    ctx.fillStyle = visible(c.x|0,c.y|0) ? '#4a5a38' : '#2c3526';
    ctx.fillRect(-9,-4,18,8); ctx.beginPath(); ctx.arc(-9,0,4,0,6.3); ctx.fill();
    ctx.restore();
  }

  for(const z of zombies) if(!z.dead && visible(z.x|0,z.y|0)) drawZombie(z);

  for(const s of shots){
    const a = worldToScreen(s.x0,s.y0), b = worldToScreen(s.x1,s.y1);
    ctx.strokeStyle = 'rgba(255,230,150,.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }

  if(isNet()) for(let i=0;i<survivors.length;i++){
    const sv = survivors[i];
    if(sv.gone || sv === mySurv() || sv.player.escaped) continue;
    // напарника видно, только если он в поле зрения — иначе туман бесполезен
    if(!visible(sv.player.x|0, sv.player.y|0)) continue;
    const q = worldToScreen(sv.player.x, sv.player.y);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(q.x, q.y+7, 8, 3.5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = sv.player.dead ? '#6a5a5a' : ['#cfd8e0','#8ef0a0','#7fd0ff','#ffb0c0'][i%4];
    ctx.beginPath(); ctx.arc(q.x, q.y, sv.crouch?7:8.5, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#2b3038'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e7edf4'; ctx.font = '9px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(sv.player.dead ? '☠' : String(i+1), q.x, q.y-12);
  }
  drawPlayer();
  drawRings();

  // виньетка / кровопотеря
  const dark = 0.35 + (1-player.blood/BLOOD_MAX)*0.4;
  const vg = ctx.createRadialGradient(CW/2,CH/2,CH*0.16,CW/2,CH/2,CH*0.72);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,'+dark.toFixed(2)+')');
  ctx.fillStyle = vg; ctx.fillRect(0,0,CW,CH);
  if(player.hurtT>0){
    ctx.fillStyle = 'rgba(150,20,26,'+(player.hurtT*0.55).toFixed(2)+')'; ctx.fillRect(0,0,CW,CH);
  }
  if(player.virusOn){
    const pulse = 0.05+Math.abs(Math.sin(anim*1.3))*0.05*(player.virus/100+0.3);
    ctx.fillStyle = 'rgba(90,10,30,'+pulse.toFixed(3)+')'; ctx.fillRect(0,0,CW,CH);
  }

  drawHUD();
  if(panel==='inv') drawInvPanel();
  if(panel==='med') drawMedPanel();

  if(paused && !over){
    ctx.fillStyle = 'rgba(5,8,12,.72)'; ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center'; ctx.fillStyle='#e6ebef'; ctx.font='bold 28px Segoe UI';
    ctx.fillText('⏸ ПАУЗА', CW/2, CH/2-4);
    ctx.font='14px Segoe UI'; ctx.fillText('P / Esc — продолжить', CW/2, CH/2+22);
  }
  if(over) drawEnd();
}

function frame(now){
  if(lastFrame===null) lastFrame = now;
  let dt = (now-lastFrame)/1000; lastFrame = now;
  if(dt>0.05) dt = 0.05;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* =====================  ВВОД  ===================== */

function canvasPos(e){
  const r = canvas.getBoundingClientRect();
  return { x:(e.clientX-r.left)*(CW/r.width), y:(e.clientY-r.top)*(CH/r.height) };
}

canvas.addEventListener('pointermove', e=>{
  if(e.pointerType==='touch') return;
  const p = canvasPos(e);
  const sp = worldToScreen(player.x,player.y);
  player.face = Math.atan2(p.y-sp.y, p.x-sp.x);
  mouseT = anim;                                   // мышь жива — она и рулит взглядом
});
canvas.addEventListener('pointerdown', e=>{
  const p = canvasPos(e);
  // пауза после гибели: иначе последний клик боя мгновенно перезапускает забег
  if(over){ if(anim-overT > 0.8){ if(amHost()) reset(); else net.send({ t:'again' }); } return; }
  // сначала кнопки интерфейса
  for(let i=uiHit.length-1;i>=0;i--){
    const b = uiHit[i];
    if(p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h){ b.fn(); return; }
  }
  if(panel) return;
  if(paused) return;
  const sp = worldToScreen(player.x,player.y);
  player.face = Math.atan2(p.y-sp.y, p.x-sp.x);
  myAct('attack');
});
canvas.addEventListener('contextmenu', e=>e.preventDefault());

document.addEventListener('keydown', e=>{
  if(e.target && e.target.tagName==='INPUT') return;
  if(over){ if(e.code==='Enter'){ if(amHost()) reset(); else net.send({ t:'again' }); } return; }
  if(e.code==='Escape'){
    if(panel) setPanel(null, true);              // захват Esc снимем на keyup
    else { paused = !paused; updateButtons(); }
    e.preventDefault(); return;
  }
  if(e.code==='KeyP'){ paused = !paused; updateButtons(); e.preventDefault(); return; }
  if(paused) return;

  const M = { KeyW:'up', ArrowUp:'up', KeyS:'down', ArrowDown:'down', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right' };
  if(M[e.code]){ held[M[e.code]] = true; e.preventDefault(); return; }
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){ runHeld = true; return; }
  if(e.repeat) return;
  if(e.code==='KeyC'){ crouch = !crouch; return; }
  if(e.code==='KeyE'){ myAct('interact'); e.preventDefault(); return; }
  if(e.code==='Space'){ myAct('attack'); e.preventDefault(); return; }
  if(e.code==='KeyR'){ myAct('reload'); return; }
  if(e.code==='KeyQ'){ myAct('bandage'); return; }
  if(e.code==='KeyI'||e.code==='Tab'){ togglePanel('inv'); e.preventDefault(); return; }
  if(e.code==='KeyH'){ togglePanel('med'); return; }
  if(e.code.startsWith('Digit')){ const n = +e.code.slice(5); if(n>=1&&n<=4) myAct('weapon', n-1); return; }
});
document.addEventListener('keyup', e=>{
  const M = { KeyW:'up', ArrowUp:'up', KeyS:'down', ArrowDown:'down', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right' };
  if(M[e.code]) held[M[e.code]] = false;
  if(e.code==='ShiftLeft'||e.code==='ShiftRight') runHeld = false;
});
window.addEventListener('blur', ()=>{ for(const k in held) held[k]=false; runHeld=false; });

// экранный D-pad и кнопки для телефона
document.querySelectorAll('.pad button[data-dir]').forEach(b=>{
  const dir = b.getAttribute('data-dir');
  const on = e=>{ e.preventDefault(); held[dir]=true; faceFromKeys(); };
  const off = e=>{ e.preventDefault(); held[dir]=false; b.blur(); };
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off);
  b.addEventListener('pointerleave',off); b.addEventListener('pointercancel',off);
});
function faceFromKeys(){
  let mx=0,my=0;
  if(held.left) mx-=1; if(held.right) mx+=1; if(held.up) my-=1; if(held.down) my+=1;
  if(mx||my) player.face = Math.atan2(my,mx);
}
// клик по кнопке не должен оставлять на ней фокус: иначе следующий Space/Enter
// нажмёт эту же кнопку вместо удара по зомби
function onBtn(id, fn){
  const b = document.getElementById(id); if(!b) return;
  b.addEventListener('click', e=>{ b.blur(); fn(e); });
}
onBtn('actBtn', ()=>{ if(!over&&!paused) myAct('interact'); });
onBtn('hitBtn', ()=>{ if(!over&&!paused) myAct('attack'); });
onBtn('runBtn', ()=>{ runHeld = !runHeld; crouch = false; });
onBtn('crouchBtn', ()=>{ crouch = !crouch; runHeld = false; });
onBtn('bagBtn', ()=>togglePanel('inv'));
onBtn('medBtn', ()=>togglePanel('med'));
onBtn('pause', ()=>{ if(!over){ paused = !paused; updateButtons(); } });
onBtn('restart', ()=>reset());

function updateButtons(){
  const b = document.getElementById('pause');
  if(b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
}

// движение мыши поворачивает игрока даже когда курсор ушёл с канваса

/* =====================  ОНЛАЙН: ОДИН КВАРТАЛ НА ГРУППУ  =====================
   Карта, зомби, шум и обысканные шкафы общие. Тело, раны и рюкзак — личные:
   вес и медицина в этой игре и есть игра, делить их нельзя.
   Туман войны каждый считает у себя: хозяину не нужно знать, что видит
   напарник, — иначе конус обзора терял бы смысл. */
function myAct(a, v){
  if(amHost()){
    if(a==='interact') interact();
    else if(a==='attack') attack();
    else if(a==='reload') reload();
    else if(a==='bandage') quickBandage();
    else if(a==='weapon') selectWeapon(v);
    else if(a==='use') useItem(v);
    else if(a==='drop') dropItem(v);
    else if(a==='treat') treat(v.part, v.item);
    if(isNet()) broadcast();
  } else net.send({ t:'act', a:a, v:v });
}
let lastSig = -1, lastFace = 999;
function syncMyInput(){
  const sv = mySurv(); if(!sv) return;
  sv.held.up = held.up; sv.held.down = held.down; sv.held.left = held.left; sv.held.right = held.right;
  sv.crouch = crouch; sv.runHeld = runHeld;
  if(isNet() && !net.isHost()){
    // пакет уходит, только когда ввод изменился: держать W — это один пакет
    const sig = (held.up?1:0)|(held.down?2:0)|(held.left?4:0)|(held.right?8:0)|(crouch?16:0)|(runHeld?32:0);
    const f = Math.round(player.face*16);
    if(sig !== lastSig || f !== lastFace){ lastSig = sig; lastFace = f; net.send({ t:'in', h:sig, f:player.face }); }
  }
}
function packSurv(sv){
  const p = sv.player;
  return { g:sv.gone, cr:sv.crouch, x:p.x, y:p.y, fa:p.face, st:p.stam, bl:p.blood,
           hu:p.hunger, th:p.thirst, w:p.weapon, mg:p.mag, sw:p.swing, ht:p.hurtT,
           at:p.actT, dd:p.dead, es:p.escaped, vr:p.virus, vo:p.virusOn,
           body:sv.body, inv:sv.inv };
}
let dirtyTiles = [], dirtyCont = [];
function broadcast(){
  net.send({
    t:'st', tm:time, ov:over, wn:win, cs:cause, pa:paused, nl:noiseLevel, kc:killCount, al:alerted,
    p: survivors.map(packSurv),
    z: zombies.map(z=>({ x:z.x, y:z.y, f:z.face, hp:z.hp, d:z.dead, s:z.state })),
    ti: dirtyTiles.length ? dirtyTiles.map(i=>({ i:i, t:tiles[i] })) : null,
    co: dirtyCont.length ? dirtyCont : null
  });
  dirtyTiles = []; dirtyCont = [];
}
function tileChanged(i){ if(isNet() && net.isHost()) dirtyTiles.push(i); }
function contChanged(i){ if(isNet() && net.isHost()) dirtyCont.push(i); }
function sendWorld(slot){
  // квартал целиком — один раз при входе; дальше летят только изменения
  net.sendTo(slot, { t:'world', tiles: Array.from(tiles), ex: exitPos, sp: spawnPos,
    cont: [...containers.entries()].map(function(e){ return [e[0], e[1].searched?1:0, e[1].special||'']; }) });
  broadcast();
}

net = NET.create({
  prefix:'zomb', max:MAXP,
  onOpen: function(){ reset(); },
  onJoin: function(slot){
    if(survivors[slot]){
      const sv = mkSurvivor(false);
      sv.player.x = spawnPos.x; sv.player.y = spawnPos.y;
      survivors[slot] = sv;
      bindS(sv); addItem('bandage',2); addItem('water'); addItem('food'); bindS(mySurv());
    }
    logMsg('🧍 Выживший ' + (slot+1) + ' присоединился');
    sendWorld(slot);
  },
  onLeave: function(slot){ if(survivors[slot]) survivors[slot].gone = true; logMsg('Выживший ' + (slot+1) + ' отключился'); broadcast(); },
  onWelcome: function(){ bindS(mySurv()); logMsg('Ждём карту квартала…'); },
  onClose: function(){ logMsg('Хозяин комнаты вышел'); },
  onData: function(m, slot){
    if(net.isHost()){
      const sv = survivors[slot]; if(!sv) return;
      if(m.t==='in'){
        sv.held.up=!!(m.h&1); sv.held.down=!!(m.h&2); sv.held.left=!!(m.h&4); sv.held.right=!!(m.h&8);
        sv.crouch=!!(m.h&16); sv.runHeld=!!(m.h&32); sv.player.face=m.f;
      } else if(m.t==='act'){
        // действие выполняем ОТ ЛИЦА напарника: бой, обыск и лечение смотрят на player
        bindS(sv);
        if(m.a==='interact') interact(); else if(m.a==='attack') attack();
        else if(m.a==='reload') reload(); else if(m.a==='bandage') quickBandage();
        else if(m.a==='weapon') selectWeapon(m.v); else if(m.a==='use') useItem(m.v);
        else if(m.a==='drop') dropItem(m.v); else if(m.a==='treat') treat(m.v.part, m.v.item);
        unbindS(sv); bindS(mySurv()); broadcast();
      } else if(m.t==='again'){ reset(); for(const sl of net.slots()) sendWorld(sl); }
      return;
    }
    if(m.t==='world'){
      tiles = m.tiles; exitPos = m.ex; spawnPos = m.sp;
      containers = new Map();
      for(const c of m.cont) containers.set(c[0], { x:c[0]%MAPW, y:(c[0]/MAPW)|0, searched:!!c[1], special:c[2]||null, loot:[] });
      computeVis(); return;
    }
    if(m.t!=='st') return;
    time = m.tm; over = m.ov; win = m.wn; cause = m.cs; paused = m.pa;
    noiseLevel = m.nl; killCount = m.kc; alerted = m.al;
    if(m.ti) for(const c of m.ti) tiles[c.i] = c.t;
    if(m.co) for(const k of m.co){ const c = containers.get(k); if(c) c.searched = true; }
    for(let i=0;i<survivors.length;i++){
      const d = m.p[i], sv = survivors[i]; if(!d) continue;
      sv.gone = d.g; sv.crouch = d.cr; sv.body = d.body; sv.inv = d.inv;
      const q = sv.player;
      q.stam=d.st; q.blood=d.bl; q.hunger=d.hu; q.thirst=d.th; q.weapon=d.w; q.mag=d.mg;
      q.swing=d.sw; q.hurtT=d.ht; q.actT=d.at; q.dead=d.dd; q.escaped=d.es; q.virus=d.vr; q.virusOn=d.vo;
      q.x=d.x; q.y=d.y;
      if(i !== net.me) q.face = d.fa;      // своим взглядом рулим сами
    }
    /* Собираем зомби вручную, а НЕ через makeZombie: тот прибавляет полклетки
       к координатам (он ждёт номер клетки, а не готовую позицию) и заново
       бросает bob — покачивание дёргалось бы пятнадцать раз в секунду.
       Тела переиспользуем, чтобы не плодить мусор по пакету на кадр. */
    for(let i=0;i<m.z.length;i++){
      const d = m.z[i];
      let o = zombies[i];
      if(!o){ o = zombies[i] = { path:null, pi:0, repath:0, atk:0, lost:0, wander:0,
                                 groan:0, groanCd:0, climb:null, hitT:0, stagger:0,
                                 tx:null, ty:null, bob:Math.random()*6.28 }; }
      o.x = d.x; o.y = d.y; o.face = d.f; o.hp = d.hp; o.dead = d.d; o.state = d.s;
    }
    zombies.length = m.z.length;
    bindS(mySurv());
    computeVis();
  }
});
NET.lobby(document.getElementById('netbar'), net);

reset();
requestAnimationFrame(frame);

// хук для отладки/тестов
if(typeof globalThis!=='undefined') globalThis.__Z = {
  reset, update, render, interact, attack, shoot, reload, treat, wound, makeNoise, astar, computeVis, useItem, dropItem,
  addItem, removeItem, countItem, weight, encum, killZombie, quickBandage, selectWeapon, doSearch, endGame,
  getPlayer:()=>player, getBody:()=>body, getInv:()=>inv, getZombies:()=>zombies, getTiles:()=>tiles,
  getVis:()=>vis, getContainers:()=>containers, getExit:()=>exitPos, getOver:()=>over, getWin:()=>win,
  getCause:()=>cause, getRings:()=>rings, setCrouch:v=>{crouch=v;}, setRun:v=>{runHeld=v;}, getHeld:()=>held,
  getPanel:()=>panel, setPanel, togglePanel, getBest:()=>best, painLevel, loadBest, frontTile,
  ITEMS, WEAPONS, PARTS, CAP, T, MAPW, MAPH,
};
