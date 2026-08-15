/* =======================================================================
   ДРЕЙФУЮЩИЙ АСТЕРОИД — ньютоновская 2D-физика + разрушаемая сетка
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
const T = 14, GW = 74, GH = 74;                       // тайл и сетка астероида
const WCX = GW*T/2, WCY = GH*T/2;                     // центр астероида в пикселях

// --- типы породы ---
const EMPTY=0, ROCK=1, ICE=2, IRON=3, TITAN=4, CRYST=5, GAS=6, HARD=7, PAD=8;
const HARDNESS = [0, 0.50, 0.42, 0.72, 1.00, 1.25, 0.30, 1.90, 999];   // секунд бурения
const ORE_OF   = [null,'rego','ice','iron','titan','cryst',null,'rego',null];
const REGO_CHANCE = 0.35;              // не каждый камень даёт щебень — иначе рюкзак забит всегда

// --- баланс ---
const TOTAL_TIME = 420;                 // реальных секунд на забег = 60 «условных минут»
const FUEL_MAX = 100, BURN = 7.5, BURN_FINE = 3.2, FINE_K = 0.42;
const ACC = 150;                        // ускорение ранца при пустом рюкзаке, px/с²
const MASS_BASE = 100, MASS_PER = 9, MASS_REGO = 4, CARGO_CAP = 14;
const R_SURF = 25*T, R_GRAV = 58*T, R_LOST = 92*T;    // поверхность / край притяжения / потерян
// у поверхности притяжение сильнее тяги ранца — короткий подскок всегда вернёт.
// Уйти насовсем можно только осознанным долгим разгоном «от камня»
const G_SURF = 46, STAR_A = 26;
const PR = 5;                           // радиус скафандра, px
const HIT_SPEED = 74, HIT_DMG = 0.42, BOUNCE = 0.28;
const DRILL_REACH = 2.7*T, RECOIL = 13;
// расщепитель: во что превращается ресурс. В доке установка выжимает вдвое
// больше, чем горелка ранца в поле — за это и стоит возвращаться
const DOCK_FUEL  = { rego:5,   ice:22, iron:9, titan:14, cryst:45 };
const FIELD_FUEL = { rego:2.5, ice:11, iron:4, titan:6,  cryst:20 };
const BURN_ORDER = ['rego','ice','iron','titan','cryst'];   // жжём от бесполезного к ценному
const RESERVE_MAX = 220;
const DOCK_R = 2.4*T, REFUEL_RATE = 26, REPAIR_RATE = 9;
const NEED = { iron:9, titan:5, cryst:2 }, NEED_FUEL = 50;

const ORE = {
  rego:  { ico:'🪨', name:'Щебень',   col:'#8f8f99' },
  ice:   { ico:'🧊', name:'Лёд',      col:'#7fc7e8' },
  iron:  { ico:'⚙️', name:'Железо',   col:'#c08050' },
  titan: { ico:'🔩', name:'Титан',    col:'#c3ccd6' },
  cryst: { ico:'💎', name:'Кристалл', col:'#c07fe8' },
};

// --- состояние ---
let tiles, player, players, cargo, built, reserve, timeLeft, over, win, cause, paused;
const MAXP = 4;                       // хозяин экспедиции + трое напарников
var net = null, netAcc = 0;
function isNet(){ return net && net.isOnline(); }
function meSeat(){ return isNet() ? net.me : 0; }
function amHost(){ return !isNet() || net.isHost(); }
function mkMiner(gone){
  return { x:0, y:0, vx:0, vy:0, fuel:FUEL_MAX, hull:100, hurt:0, thr:{x:0,y:0},
           aimA:-1.57, drillT:0, fine:false, drilling:false,
           held:{up:false,down:false,left:false,right:false}, gone:!!gone };
}
let padX, padY, drillT, drillTile, aimA, parts, stars, shake, msg, msgT;
let lostT, launching, launchT, dug, best;
let lastFrame = null, anim = 0;

const held = { up:false, down:false, left:false, right:false };
let fine = false, drilling = false, mouseAim = false;

const gi = (x,y) => y*GW + x;
const inb = (x,y) => x>=0 && y>=0 && x<GW && y<GH;
const tAt = (x,y) => inb(x,y) ? tiles[gi(x,y)] : EMPTY;
const solidT = t => t!==EMPTY;
const rnd = n => Math.floor(Math.random()*n);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const len = (x,y) => Math.hypot(x,y);

try { best = JSON.parse(localStorage.getItem('asteroid_best') || '{}'); } catch(e){ best = {}; }
best = { wins:+best.wins||0, bestLeft:+best.bestLeft||0, bestOre:+best.bestOre||0 };

/* =====================  ГЕНЕРАЦИЯ АСТЕРОИДА  ===================== */

function genAsteroid(){
  tiles = new Uint8Array(GW*GH);
  // неровный круг: радиус гуляет по нескольким гармоникам
  const ph = [Math.random()*6.28, Math.random()*6.28, Math.random()*6.28];
  const rad = a => R_SURF * (1 + 0.13*Math.sin(a*2+ph[0]) + 0.09*Math.sin(a*3+ph[1]) + 0.06*Math.sin(a*5+ph[2]));
  for(let y=0;y<GH;y++) for(let x=0;x<GW;x++){
    const dx = (x+0.5)*T - WCX, dy = (y+0.5)*T - WCY;
    const d = len(dx,dy), a = Math.atan2(dy,dx);
    if(d <= rad(a)) tiles[gi(x,y)] = ROCK;
  }
  // твёрдое ядро
  for(let y=0;y<GH;y++) for(let x=0;x<GW;x++){
    if(tiles[gi(x,y)]!==ROCK) continue;
    const d = len((x+0.5)*T-WCX, (y+0.5)*T-WCY);
    if(d < R_SURF*0.22 && Math.random()<0.65) tiles[gi(x,y)] = HARD;
    else if(d < R_SURF*0.55 && Math.random()<0.08) tiles[gi(x,y)] = HARD;
  }
  // жилы: случайное блуждание, состав зависит от глубины
  const vein = (type, n, minD, maxD, thick) => {
    for(let k=0;k<n;k++){
      let a = Math.random()*6.28, d = minD + Math.random()*(maxD-minD);
      let x = WCX + Math.cos(a)*d, y = WCY + Math.sin(a)*d;
      let dir = Math.random()*6.28;
      const steps = 8 + rnd(16);
      for(let s=0;s<steps;s++){
        dir += (Math.random()-0.5)*1.1;
        x += Math.cos(dir)*T*0.9; y += Math.sin(dir)*T*0.9;
        const dd = len(x-WCX, y-WCY);
        if(dd < minD*0.6 || dd > maxD*1.25) break;
        for(let oy=-thick;oy<=thick;oy++) for(let ox=-thick;ox<=thick;ox++){
          const tx = (x/T|0)+ox, ty = (y/T|0)+oy;
          if(!inb(tx,ty)) continue;
          const cur = tiles[gi(tx,ty)];
          if(cur!==ROCK && cur!==HARD) continue;
          if(Math.random()<0.55) tiles[gi(tx,ty)] = type;
        }
      }
    }
  };
  // руды немного: астероид — это в первую очередь порода, жила должна быть находкой
  vein(ICE,   6, R_SURF*0.25, R_SURF*0.92, 1);
  vein(IRON,  5, R_SURF*0.35, R_SURF*0.90, 1);
  vein(TITAN, 4, R_SURF*0.22, R_SURF*0.66, 1);
  vein(CRYST, 5, R_SURF*0.12, R_SURF*0.52, 0);
  vein(GAS,   5, R_SURF*0.28, R_SURF*0.80, 0);
  // каверны
  for(let k=0;k<5;k++){
    const a = Math.random()*6.28, d = R_SURF*(0.3+Math.random()*0.5);
    const cx = WCX+Math.cos(a)*d, cy = WCY+Math.sin(a)*d, r = T*(1.5+Math.random()*2.2);
    for(let y=0;y<GH;y++) for(let x=0;x<GW;x++)
      if(len((x+0.5)*T-cx,(y+0.5)*T-cy) < r) tiles[gi(x,y)] = EMPTY;
  }

  // площадка: самая верхняя точка поверхности по центру
  let px = GW>>1, py = 0;
  while(py<GH && tAt(px,py)===EMPTY) py++;
  if(py>=GH){ px = GW>>1; py = GH>>1; }
  for(let x=px-2;x<=px+2;x++){
    for(let y=py-3;y<py;y++) if(inb(x,y)) tiles[gi(x,y)] = EMPTY;   // расчищаем место под модуль
    if(inb(x,py)) tiles[gi(x,py)] = PAD;
    if(inb(x,py+1) && tAt(x,py+1)!==EMPTY) tiles[gi(x,py+1)] = ROCK;
  }
  padX = (px+0.5)*T; padY = (py-1.1)*T;
}

/* =====================  МАССА, ТОПЛИВО, ГРУЗ  ===================== */

function cargoCount(){ let n=0; for(const k in cargo) n += cargo[k]; return n; }
function mass(){
  let m = MASS_BASE;
  for(const k in cargo) m += (k==='rego' ? MASS_REGO : MASS_PER) * cargo[k];
  return m;
}
function accel(){ return ACC * (MASS_BASE/mass()); }
function docked(){ return len(player.x-padX, player.y-padY) < DOCK_R; }

function addOre(kind){
  // щебень не выгребает место под руду: берём его, только пока рюкзак свободен
  if(kind==='rego' && cargoCount() >= CARGO_CAP*0.7) return false;
  if(cargoCount() >= CARGO_CAP){ message('Рюкзак полон — руда потеряна'); return false; }
  cargo[kind] = (cargo[kind]||0) + 1;
  return true;
}
function message(t){ msg = t; msgT = 3.4; }

/* =====================  ФИЗИКА  ===================== */

function gravityAt(x,y){
  const dx = WCX-x, dy = WCY-y, d = Math.max(1, len(dx,dy));
  if(d <= R_GRAV){
    // у поверхности G_SURF, дальше падает как 1/r²; внутри тела слабеет к центру
    const k = d < R_SURF ? (d/R_SURF) : Math.pow(R_SURF/d, 2);
    return { x: dx/d*G_SURF*k, y: dy/d*G_SURF*k };
  }
  // за границей притяжения астероид уходит из-под ног: сносит наружу
  const over = Math.min(1, (d-R_GRAV)/(R_LOST-R_GRAV));
  return { x: -dx/d*STAR_A*(0.35+over), y: -dy/d*STAR_A*(0.35+over) };
}

function solidPx(x,y){ return solidT(tAt((x/T)|0, (y/T)|0)); }
function blockedAt(x,y){
  const r = PR, k = r*0.72;
  return solidPx(x-r,y) || solidPx(x+r,y) || solidPx(x,y-r) || solidPx(x,y+r) ||
         solidPx(x-k,y-k) || solidPx(x+k,y-k) || solidPx(x-k,y+k) || solidPx(x+k,y+k);
}

function impact(v){
  const s = Math.abs(v);
  if(s < HIT_SPEED) return;
  const dmg = (s-HIT_SPEED)*HIT_DMG;
  player.hull = Math.max(0, player.hull - dmg);
  player.hurt = 0.35; shake = Math.min(9, shake + dmg*0.5);
  for(let i=0;i<6;i++) sparks(player.x, player.y, '#ffb454');
  if(dmg > 6) message('💥 Удар о породу! Скафандр −'+Math.round(dmg));
}

/* =====================  БУРЕНИЕ  ===================== */

function aimTarget(){
  const dx = Math.cos(aimA), dy = Math.sin(aimA);
  for(let s=PR; s<=DRILL_REACH; s+=2){
    const x = player.x + dx*s, y = player.y + dy*s;
    const tx = (x/T)|0, ty = (y/T)|0;
    if(!inb(tx,ty)) return null;
    if(solidT(tiles[gi(tx,ty)])) return { x:tx, y:ty };
  }
  return null;
}

function breakTile(tx,ty){
  const t = tiles[gi(tx,ty)];
  tiles[gi(tx,ty)] = EMPTY; dug++;
  tileChanged(gi(tx,ty));
  const cx = (tx+0.5)*T, cy = (ty+0.5)*T;
  if(t===GAS){
    // карман под давлением: рвёт породу вокруг и швыряет бурильщика
    const a = Math.atan2(player.y-cy, player.x-cx), d = Math.max(6, len(player.x-cx, player.y-cy));
    const push = 210 * Math.min(1, (T*3)/d);
    player.vx += Math.cos(a)*push; player.vy += Math.sin(a)*push;
    player.hull = Math.max(0, player.hull - 22); player.hurt = 0.5; shake = 12;
    for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){
      const nx=tx+ox, ny=ty+oy;
      if(inb(nx,ny) && tiles[gi(nx,ny)]!==PAD && tiles[gi(nx,ny)]!==HARD && Math.random()<0.7){ tiles[gi(nx,ny)] = EMPTY; tileChanged(gi(nx,ny)); }
    }
    for(let i=0;i<26;i++) sparks(cx, cy, '#8ef0a0');
    message('💥 ГАЗОВЫЙ КАРМАН! Скафандр −22');
    return;
  }
  const ore = ORE_OF[t];
  if(ore==='rego'){ if(Math.random()<REGO_CHANCE) addOre('rego'); }   // тихо, без сообщения
  else if(ore){ if(addOre(ore)) message(ORE[ore].ico+' +1 '+ORE[ore].name); }
  for(let i=0;i<7;i++) sparks(cx, cy, t===ICE?'#bfe8ff':'#c9a37a');
}

/* =====================  ДОК И МОДУЛЬ  ===================== */

function moduleReady(){
  return built.iron>=NEED.iron && built.titan>=NEED.titan && built.cryst>=NEED.cryst && reserve>=NEED_FUEL;
}
function doDock(){
  if(over) return;
  if(!docked()){ message('Док далеко — вернись на площадку'); return; }
  if(moduleReady() && cargoCount()===0){ launching = true; launchT = 0; launchWho = players.indexOf(player); message('🚀 ЗАПУСК!'); return; }
  let any = 0, fuelGot = 0;
  // лёд и щебень целиком уходят в топливо
  for(const k of ['ice','rego']){
    if(!cargo[k]) continue;
    const add = cargo[k]*DOCK_FUEL[k];
    reserve = Math.min(RESERVE_MAX, reserve + add);
    fuelGot += add; any += cargo[k]; cargo[k] = 0;
  }
  // руда — сначала в модуль до нормы, ИЗЛИШКИ расщепитель пускает на газ
  for(const k of ['iron','titan','cryst']){
    if(!cargo[k]) continue;
    const need = Math.max(0, NEED[k]-built[k]);
    const toModule = Math.min(need, cargo[k]);
    built[k] += toModule;
    const extra = cargo[k]-toModule;
    if(extra){
      const add = extra*DOCK_FUEL[k];
      reserve = Math.min(RESERVE_MAX, reserve + add);
      fuelGot += add;
    }
    any += cargo[k]; cargo[k] = 0;
  }
  if(any) message('📦 Сдано '+any+' ед.'+(fuelGot?' · расщепитель дал +'+Math.round(fuelGot)+' газа':''));
  else if(moduleReady()) message('🚀 Модуль готов. Жми E ещё раз — старт!');
  else message('Нужно ещё: '+needStr());
}
function needStr(){
  const p = [];
  if(built.iron<NEED.iron) p.push('⚙️'+(NEED.iron-built.iron));
  if(built.titan<NEED.titan) p.push('🔩'+(NEED.titan-built.titan));
  if(built.cryst<NEED.cryst) p.push('💎'+(NEED.cryst-built.cryst));
  if(reserve<NEED_FUEL) p.push('⛽'+Math.ceil(NEED_FUEL-reserve));
  return p.join(' ');
}
// сжечь ресурс в ранце. Порядок — от бесполезного к ценному; на руду,
// нужную модулю, спрашиваем подтверждение вторым нажатием
let burnAsk = 0, burnAskKind = null;
function burnFuel(){
  const table = docked() ? DOCK_FUEL : FIELD_FUEL;
  let kind = null;
  for(const k of BURN_ORDER) if(cargo[k]>0){ kind = k; break; }
  if(!kind){ message('Жечь нечего — рюкзак пуст'); return; }

  const forModule = (kind==='iron'||kind==='titan'||kind==='cryst') && built[kind] < NEED[kind];
  if(forModule && !(burnAsk>0 && burnAskKind===kind)){
    burnAsk = 2.5; burnAskKind = kind;
    message('⚠️ '+ORE[kind].ico+' '+ORE[kind].name+' нужен модулю! Жать ещё раз — сжечь');
    return;
  }
  burnAsk = 0; burnAskKind = null;
  cargo[kind]--;
  const got = table[kind];
  if(docked()){
    reserve = Math.min(RESERVE_MAX, reserve + got);
    message('🔥 '+ORE[kind].ico+' → +'+got+' на склад (установка дока)');
  } else {
    player.fuel = Math.min(FUEL_MAX, player.fuel + got);
    message('🔥 '+ORE[kind].ico+' сожжён в ранце: +'+got+' газа (в доке было бы '+DOCK_FUEL[kind]+')');
  }
  for(let i=0;i<10;i++) sparks(player.x, player.y, ORE[kind].col);
}
function dumpCargo(){
  const n = cargoCount();
  if(!n){ message('Рюкзак и так пуст'); return; }
  cargo = { rego:0, ice:0, iron:0, titan:0, cryst:0 };
  message('🗑 Сброшено '+n+' ед. — стал легче, но руда потеряна');
  for(let i=0;i<14;i++) sparks(player.x, player.y, '#8f98a1');
}

/* =====================  ЧАСТИЦЫ  ===================== */

function sparks(x,y,col){
  const a = Math.random()*6.28, s = 18+Math.random()*54;
  parts.push({ x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:0.35+Math.random()*0.5, t:0, col });
}

/* =====================  ЖИЗНЕННЫЙ ЦИКЛ  ===================== */

function reset(){
  genAsteroid();
  bakeAll();                                          // новый астероид — новая печёная карта
  cargo = { rego:0, ice:0, iron:0, titan:0, cryst:0 };
  built = { iron:0, titan:0, cryst:0 };
  reserve = 34; timeLeft = TOTAL_TIME;
  players = [];
  for(let i=0;i<MAXP;i++){ const m = mkMiner(i!==0); m.x = padX + (i-1.5)*10; m.y = padY; players.push(m); }
  if(isNet() && net.isHost()) for(const sl of net.slots()) players[sl].gone = false;
  player = players[meSeat()]; player.gone = false;
  parts = []; drillT = 0; drillTile = null; aimA = -1.57; shake = 0;
  burnAsk = 0; burnAskKind = null;
  over = false; win = false; cause = ''; paused = false; lostT = 0; dug = 0;
  launching = false; launchT = 0; mouseAim = false;
  for(const k in held) held[k] = false;
  fine = false; drilling = false;
  stars = [];
  for(let i=0;i<220;i++) stars.push({ x:Math.random()*2600-800, y:Math.random()*2600-800, r:Math.random()*1.3+0.3, a:0.25+Math.random()*0.7 });
  message('Добудь ⚙️🔩💎, собери модуль на площадке и стартуй (E)');
  updateButtons();
}

function endGame(won, why){
  if(over) return;
  over = true; win = won; cause = why;
  if(won){
    best.wins++;
    const left = Math.round(timeLeft);
    if(left > best.bestLeft) best.bestLeft = left;
  }
  if(dug > best.bestOre) best.bestOre = dug;
  try { localStorage.setItem('asteroid_best', JSON.stringify(best)); } catch(e){}
}

function update(dt){
  anim += dt;
  if(shake>0) shake = Math.max(0, shake - dt*14);
  for(const p of parts){ p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; }
  parts = parts.filter(p=>p.t < p.life);
  if(msgT>0) msgT -= dt;
  if(burnAsk>0){ burnAsk -= dt; if(burnAsk<=0) burnAskKind = null; }   // окно подтверждения на сжигание руды

  if(launching){
    launchT += dt;
    // взлетает ТОТ, кто нажал старт: раньше на экране хозяина вверх уезжало
    // его собственное тело, даже если модуль запустил напарник
    const lp = players[launchWho] || player;
    lp.y -= (40 + launchT*220)*dt;
    for(let i=0;i<3;i++) sparks(lp.x+(Math.random()-0.5)*8, lp.y+10, '#ffb454');
    if(launchT > 1.6) endGame(true, 'Модуль ушёл с астероида. Ты выжил');
    return;
  }
  if(over || paused) return;

  // --- часы: 420 реальных секунд = 60 «условных минут» ---
  timeLeft -= dt;
  if(timeLeft <= 0){ timeLeft = 0; endGame(false, 'Астероид вошёл в корону звезды'); return; }

  // ввод: свой пишем в своё тело; гость дополнительно шлёт его хозяину
  syncMyInput();
  if(!amHost()) return;                 // гость мир не считает — он его получает

  /* Симуляция по очереди для каждого шахтёра. Глобальные player/held/aimA
     на время расчёта указывают на того, кого считаем: так весь прежний код
     бурения, дока и ударов работает без переписывания. */
  for(const m of players){
    if(m.gone) continue;
    bind(m); simulateOne(dt); unbind(m);
  }
  bind(players[meSeat()]);              // глобальные — обратно на своё тело
  drillTile = players[meSeat()].drillTile;
  if(isNet()){ netAcc += dt; if(netAcc >= 1/15){ netAcc = 0; broadcast(); } }
}

function bind(m){
  player = m;
  held.up = m.held.up; held.down = m.held.down; held.left = m.held.left; held.right = m.held.right;
  fine = m.fine; drilling = m.drilling; aimA = m.aimA; drillT = m.drillT;
}
function unbind(m){ m.drillT = drillT; m.aimA = aimA; m.drillTile = drillTile; }

let launchWho = 0;
let lastSig = -1, lastAim = 999;
function syncMyInput(){
  const m = players[meSeat()]; if(!m) return;
  m.held.up = held.up; m.held.down = held.down; m.held.left = held.left; m.held.right = held.right;
  m.fine = fine; m.drilling = drilling; m.aimA = aimA;
  if(isNet() && !net.isHost()){
    // шлём только когда ввод ИЗМЕНИЛСЯ: держать W — это один пакет, а не 60 в секунду
    const sig = (held.up?1:0)|(held.down?2:0)|(held.left?4:0)|(held.right?8:0)|(fine?16:0)|(drilling?64:0);
    const ai = Math.round(aimA*20);
    if(sig !== lastSig || ai !== lastAim){ lastSig = sig; lastAim = ai; net.send({ t:'in', h:sig, a:aimA }); }
  }
}

/* В одиночку порванный скафандр и уход в пустоту — конец забега. В команде
   это было бы наказанием для всех за чужую ошибку, поэтому напарника
   возвращает на площадку, а платит за это общий склад газа. */
function suitTorn(){
  if(!isNet()){ endGame(false, 'Скафандр разорван'); return; }
  respawn('🩹 Скафандр порван — аварийная эвакуация на площадку (−25 газа со склада)');
}
function lostForever(){
  if(!isNet()){ endGame(false, 'Потерян в пустоте — астероид ушёл без тебя'); return; }
  respawn('🛰 Унесло в пустоту — трос дотянул до площадки (−25 газа со склада)');
}
function respawn(why){
  player.x = padX; player.y = padY; player.vx = 0; player.vy = 0;
  player.hull = 55; player.fuel = Math.max(player.fuel, 25); player.hurt = 0.5;
  reserve = Math.max(0, reserve - 25);
  shake = 10; message(why);
}

function simulateOne(dt){
  // --- тяга ранца ---
  let tx = 0, ty = 0;
  if(held.left) tx -= 1; if(held.right) tx += 1;
  if(held.up) ty -= 1; if(held.down) ty += 1;
  player.thr.x = 0; player.thr.y = 0;
  if((tx||ty) && player.fuel > 0){
    const l = len(tx,ty); tx/=l; ty/=l;
    const k = fine ? FINE_K : 1;
    const a = accel()*k;
    player.vx += tx*a*dt; player.vy += ty*a*dt;
    player.fuel = Math.max(0, player.fuel - (fine?BURN_FINE:BURN)*dt);
    player.thr.x = tx; player.thr.y = ty;
    for(let i=0;i<2;i++) if(Math.random()<0.6)
      parts.push({ x:player.x-tx*7, y:player.y-ty*7, vx:-tx*90+(Math.random()-0.5)*30, vy:-ty*90+(Math.random()-0.5)*30,
                   life:0.16+Math.random()*0.2, t:0, col: fine?'#7fd0ff':'#ffb454' });
    if(player.fuel<=0) message('⛽ ГАЗ КОНЧИЛСЯ! R — расщепить что есть в рюкзаке');
  }

  // --- гравитация ---
  const g = gravityAt(player.x, player.y);
  player.vx += g.x*dt; player.vy += g.y*dt;

  // --- перемещение с раздельной проверкой по осям ---
  // если уже оказался внутри породы (взрыв газа впечатал) — не запираем намертво,
  // иначе бурильщик залипает в камне до конца забега
  const stuck = blockedAt(player.x, player.y);
  const nx = player.x + player.vx*dt;
  if(stuck || !blockedAt(nx, player.y)) player.x = nx;
  else { impact(player.vx); player.vx = -player.vx*BOUNCE; }
  const ny = player.y + player.vy*dt;
  if(stuck || !blockedAt(player.x, ny)) player.y = ny;
  else { impact(player.vy); player.vy = -player.vy*BOUNCE; }

  // --- бурение ---
  const tgt = aimTarget();
  drillTile = tgt;
  if(drilling && tgt){
    const t = tiles[gi(tgt.x,tgt.y)];
    if(t===PAD){ drillT = 0; message('Площадку бурить нельзя'); }
    else {
      drillT += dt;
      // отдача бура отталкивает — приходится подрабатывать ранцем
      const a = Math.atan2((tgt.y+0.5)*T-player.y, (tgt.x+0.5)*T-player.x);
      player.vx -= Math.cos(a)*RECOIL*dt; player.vy -= Math.sin(a)*RECOIL*dt;
      if(Math.random()<0.4) sparks((tgt.x+0.5)*T, (tgt.y+0.5)*T, '#ffd08a');
      if(drillT >= HARDNESS[t]){ drillT = 0; breakTile(tgt.x, tgt.y); }
    }
  } else drillT = 0;

  // --- гибель проверяем ДО ремонта в доке: разорванный скафандр не чинится ---
  if(player.hull <= 0){ suitTorn(); return; }

  // --- док: дозаправка и ремонт ---
  if(docked()){
    if(player.fuel < FUEL_MAX && reserve > 0){
      const take = Math.min(REFUEL_RATE*dt, FUEL_MAX-player.fuel, reserve);
      player.fuel += take; reserve -= take;
    }
    if(player.hull < 100) player.hull = Math.min(100, player.hull + REPAIR_RATE*dt);
  }

  // --- унесло в пустоту ---
  const d = len(player.x-WCX, player.y-WCY);
  if(d > R_GRAV){ lostT += dt; if(lostT>0.9 && Math.random()<0.02) message('⚠️ Тебя сносит от астероида!'); }
  else lostT = 0;
  if(d > R_LOST) lostForever();
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

let camX = 0, camY = 0;
const TCOL = [];
TCOL[ROCK]='#4b4a52'; TCOL[ICE]='#6fb6da'; TCOL[IRON]='#a9713f';
TCOL[TITAN]='#aab6c2'; TCOL[CRYST]='#a86fd8'; TCOL[GAS]='#5fbf78'; TCOL[HARD]='#6d7280'; TCOL[PAD]='#2f6f8f';

/* Плитка рисуется в ЛЮБОЙ холст: тот же код печёт карту заранее и
   подрисовывает живьём то, что мигает. */
function drawTile(g,x,y,sx,sy,t){
  g.fillStyle = TCOL[t];
  g.fillRect(sx,sy,T,T);
  if(t===ROCK || t===HARD){
    g.fillStyle = ((x+y)&1) ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.10)';
    g.fillRect(sx,sy,T,T);
    if(t===HARD){ g.fillStyle='rgba(255,255,255,.13)'; g.fillRect(sx+3,sy+3,2,2); g.fillRect(sx+8,sy+9,2,2); }
  } else if(t===PAD){
    g.fillStyle = '#3f8fb4'; g.fillRect(sx,sy,T,3);
    g.fillStyle = ((anim*3|0)%2) ? '#ffd166' : '#8a6a2a'; g.fillRect(sx+T/2-1, sy+5, 2, 2);
  } else {
    // руда: порода с вкраплениями — не пёстрый леденец, но заметно
    g.fillStyle = '#44434b'; g.fillRect(sx,sy,T,T);
    g.fillStyle = TCOL[t];
    g.beginPath(); g.arc(sx+T*0.37, sy+T*0.38, T*0.19, 0, 6.3); g.fill();
    g.beginPath(); g.arc(sx+T*0.69, sy+T*0.67, T*0.13, 0, 6.3); g.fill();
    if(t===GAS){ g.globalAlpha = 0.35+0.25*Math.sin(anim*4+x+y); g.fillRect(sx,sy,T,T); g.globalAlpha = 1; }
  }
  // тонкая огранка, чтобы читалась сетка
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1; g.strokeRect(sx+0.5,sy+0.5,T-1,T-1);
}

/* =====  ПЕЧЁНАЯ ПОРОДА  =====
   Каждый кадр рисовалось около полутора тысяч плиток, и у каждой своя
   обводка. Замер показал: 3.4 миллисекунды из 4.4 — то есть 78% кадра
   уходило на камни, которые почти всегда одни и те же.

   Теперь весь астероид печётся один раз в отдельный холст 1036x1036, а
   в кадре кладётся одним куском. Пробурил клетку — перепекается ровно
   она. Живьём поверх дорисовываются только мигающие: площадка и газ. */
let bakeCv = null, bakeG = null;      // порода в натуральную величину
let miniCv = null, miniG = null;      // она же для миникарты: клетка = пиксель
function miniColor(t){ return (t===ROCK||t===HARD) ? '#3a3a42' : TCOL[t]; }
function bakeAll(){
  if(!bakeCv){ bakeCv = document.createElement('canvas'); bakeCv.width = GW*T; bakeCv.height = GH*T; bakeG = bakeCv.getContext('2d'); }
  if(!miniCv){ miniCv = document.createElement('canvas'); miniCv.width = GW; miniCv.height = GH; miniG = miniCv.getContext('2d'); }
  bakeG.clearRect(0,0,bakeCv.width,bakeCv.height);
  miniG.clearRect(0,0,GW,GH);
  if(!tiles) return;
  for(let y=0;y<GH;y++) for(let x=0;x<GW;x++){
    const t = tiles[gi(x,y)]; if(t===EMPTY) continue;
    drawTile(bakeG, x,y, x*T, y*T, t);
    miniG.fillStyle = miniColor(t); miniG.fillRect(x,y,1,1);
  }
}
function bakeOne(x,y){
  if(!bakeG || !inb(x,y)) return;
  bakeG.clearRect(x*T, y*T, T, T);
  miniG.clearRect(x, y, 1, 1);
  const t = tiles[gi(x,y)];
  if(t!==EMPTY){ drawTile(bakeG, x,y, x*T, y*T, t); miniG.fillStyle = miniColor(t); miniG.fillRect(x,y,1,1); }
}
function bakeIndex(i){ bakeOne(i % GW, (i / GW) | 0); }

function bar(x,y,w,h,v,max,col){
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = col; ctx.fillRect(x+1,y+1,Math.max(0,(w-2)*clamp(v/max,0,1)),h-2);
}

function drawModule(){
  const p = { x:padX-camX, y:padY-camY };
  const prog = (built.iron/NEED.iron + built.titan/NEED.titan + built.cryst/NEED.cryst + Math.min(1,reserve/NEED_FUEL)) / 4;
  const h = 10 + prog*34;
  ctx.fillStyle = '#39424e'; ctx.fillRect(p.x-9, p.y+8-h, 18, h);
  ctx.fillStyle = '#4c5a6b'; ctx.fillRect(p.x-9, p.y+8-h, 18, 4);
  if(prog >= 1){
    ctx.fillStyle = '#c9d4e0';
    ctx.beginPath(); ctx.moveTo(p.x-9,p.y+8-h); ctx.lineTo(p.x,p.y-6-h); ctx.lineTo(p.x+9,p.y+8-h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ((anim*4|0)%2) ? '#8ef0a0' : '#2f6f4f';
    ctx.fillRect(p.x-3, p.y+2, 6, 4);
  }
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(p.x-13, p.y+9, 26, 2);
}

const SUITS = ['#e7ecf3', '#7fd0ff', '#8ef0a0', '#ffb0c0'];   // свой белый, напарники цветные
function drawPlayer(m, mine){
  m = m || player; if(m.gone) return;
  const p = { x:m.x-camX, y:m.y-camY };
  // факел ранца
  if(m.thr.x || m.thr.y){
    const f = 10+Math.random()*7;
    ctx.fillStyle = m.fine ? 'rgba(127,208,255,.85)' : 'rgba(255,180,84,.9)';
    ctx.beginPath();
    ctx.moveTo(p.x - m.thr.x*4 - m.thr.y*3, p.y - m.thr.y*4 + m.thr.x*3);
    ctx.lineTo(p.x - m.thr.x*4 + m.thr.y*3, p.y - m.thr.y*4 - m.thr.x*3);
    ctx.lineTo(p.x - m.thr.x*f, p.y - m.thr.y*f);
    ctx.closePath(); ctx.fill();
  }
  // скафандр
  ctx.fillStyle = SUITS[(players ? players.indexOf(m) : 0) % SUITS.length] || '#e7ecf3';
  ctx.beginPath(); ctx.arc(p.x, p.y, PR+1, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#2b3a4a';
  ctx.beginPath(); ctx.arc(p.x+Math.cos(m.aimA)*1.6, p.y+Math.sin(m.aimA)*1.6, PR-2, 0, 6.3); ctx.fill();
  // ранец-груз: чем больше руды, тем толще
  const c = cargoCount();
  if(c){ ctx.fillStyle='#8a6a3a'; ctx.fillRect(p.x-4, p.y+PR-1, 8, 1.5+Math.min(4, c*0.32)); }
  // бур
  if(drillTile){
    const tx = (drillTile.x+0.5)*T-camX, ty = (drillTile.y+0.5)*T-camY;
    if(drilling){
      ctx.strokeStyle = 'rgba(255,209,102,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(tx,ty); ctx.stroke();
      const t = tiles[gi(drillTile.x,drillTile.y)];
      const k = HARDNESS[t] ? clamp(drillT/HARDNESS[t],0,1) : 0;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(tx-T/2, ty-T/2-5, T, 3);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(tx-T/2, ty-T/2-5, T*k, 3);
    }
    ctx.strokeStyle = 'rgba(255,209,102,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(tx-T/2+0.5, ty-T/2+0.5, T-1, T-1);
  }
  // вектор скорости — без него инерцию не почувствовать
  const sp = len(player.vx, player.vy);
  if(sp > 6){
    const k = Math.min(46, sp*0.42);
    ctx.strokeStyle = sp>HIT_SPEED ? 'rgba(255,90,74,.9)' : 'rgba(127,208,255,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x,p.y);
    ctx.lineTo(p.x+player.vx/sp*k, p.y+player.vy/sp*k); ctx.stroke();
    const a = Math.atan2(player.vy, player.vx);
    ctx.beginPath();
    ctx.moveTo(p.x+player.vx/sp*k, p.y+player.vy/sp*k);
    ctx.lineTo(p.x+player.vx/sp*k-Math.cos(a-0.4)*6, p.y+player.vy/sp*k-Math.sin(a-0.4)*6);
    ctx.moveTo(p.x+player.vx/sp*k, p.y+player.vy/sp*k);
    ctx.lineTo(p.x+player.vx/sp*k-Math.cos(a+0.4)*6, p.y+player.vy/sp*k-Math.sin(a+0.4)*6);
    ctx.stroke();
  }
}

function drawHUD(){
  // верхняя панель
  ctx.fillStyle = 'rgba(8,11,18,.80)'; ctx.fillRect(0,0,CW,52);
  // таймер: 420 реальных секунд показываем как 60:00 условных
  const gm = timeLeft/TOTAL_TIME*3600;
  const mm = Math.floor(gm/60), ss = Math.floor(gm%60);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.font = 'bold 20px Consolas, monospace';
  ctx.fillStyle = timeLeft < TOTAL_TIME*0.17 ? (((anim*3)|0)%2 ? '#ff5a4a' : '#ff9a8a') : '#e7ecf3';
  ctx.fillText('T−'+mm+':'+(ss<10?'0':'')+ss, 10, 24);
  ctx.font = '10px Segoe UI'; ctx.fillStyle = '#8f98a1';
  ctx.fillText('до входа в звезду', 10, 38);

  ctx.font = '10px Segoe UI'; ctx.fillStyle = '#c8ccd2';
  ctx.fillText('⛽ ГАЗ', 108, 15);  bar(150, 7, 92, 9, player.fuel, FUEL_MAX, player.fuel<25?'#ff5a4a':'#ffb454');
  ctx.fillText('🧑‍🚀 СКАФ', 108, 30); bar(150, 22, 92, 9, player.hull, 100, player.hull<35?'#ff5a4a':'#7fd0ff');
  const c = cargoCount();
  ctx.fillText('📦 ГРУЗ '+c+'/'+CARGO_CAP+'  ·  '+Math.round(mass())+' кг', 108, 45);
  bar(150+92+6, 7, 0, 0, 0, 1, '#000');   // выравниватель, ничего не рисует

  // сборка модуля
  ctx.textAlign='right';
  const need = [['iron',NEED.iron],['titan',NEED.titan],['cryst',NEED.cryst]];
  let ry = 15;
  for(const [k,n] of need){
    const done = built[k]>=n;
    ctx.fillStyle = done ? '#8ef0a0' : '#c8ccd2';
    ctx.fillText(ORE[k].ico+' '+built[k]+'/'+n, CW-10, ry); ry += 14;
  }
  ctx.fillStyle = reserve>=NEED_FUEL ? '#8ef0a0' : '#c8ccd2';
  ctx.fillText('⛽ склад '+Math.round(reserve)+'/'+NEED_FUEL, CW-10, ry);

  // груз по видам
  ctx.textAlign='left'; ctx.font='11px Segoe UI';
  let bx = 8, by = 66;
  for(const k of ['rego','ice','iron','titan','cryst']){
    if(!cargo[k]) continue;
    ctx.fillStyle = 'rgba(8,11,18,.7)'; ctx.fillRect(bx-4, by-11, 42, 15);
    ctx.fillStyle = ORE[k].col; ctx.fillText(ORE[k].ico+' '+cargo[k], bx, by);
    bx += 46;
  }

  // предупреждения
  ctx.textAlign='center'; ctx.font='bold 13px Segoe UI';
  if(lostT > 0.35){
    ctx.fillStyle = ((anim*4)|0)%2 ? '#ff5a4a' : '#ffb0a0';
    ctx.fillText('⚠️ ЗА ГРАНИЦЕЙ ПРИТЯЖЕНИЯ — ТЯГУ К АСТЕРОИДУ!', CW/2, 76);
  } else if(player.fuel<=0){
    ctx.fillStyle = '#ff5a4a'; ctx.fillText('⛽ ГАЗ НА НУЛЕ', CW/2, 76);
  } else if(moduleReady()){
    ctx.fillStyle = '#8ef0a0'; ctx.fillText('🚀 МОДУЛЬ ГОТОВ — СДАЙ ГРУЗ И ЖМИ E НА ПЛОЩАДКЕ', CW/2, 76);
  }

  // сообщение
  if(msgT>0){
    ctx.globalAlpha = clamp(msgT,0,1);
    ctx.fillStyle = 'rgba(8,11,18,.78)';
    ctx.font = '12px Segoe UI';
    const w = ctx.measureText(msg).width+16;
    ctx.fillRect(CW/2-w/2, CH-118, w, 19);
    ctx.fillStyle = '#e7ecf3'; ctx.fillText(msg, CW/2, CH-105);
    ctx.globalAlpha = 1;
  }

  drawMinimap();

  // нижняя панель-подсказка
  ctx.fillStyle = 'rgba(8,11,18,.85)'; ctx.fillRect(0,CH-40,CW,40);
  ctx.textAlign='left'; ctx.font='11px Segoe UI'; ctx.fillStyle='#9aa4ae';
  ctx.fillText('WASD — импульс · Shift — точный · ЛКМ/Space — бур · E — док', 10, CH-24);
  ctx.fillText('R — расщепить ресурс в газ · Q — сбросить груз · P — пауза', 10, CH-9);
  ctx.textAlign='right'; ctx.fillStyle = docked() ? '#8ef0a0' : '#6d7681';
  ctx.font='bold 12px Segoe UI';
  ctx.fillText(docked()?'🛰 В ДОКЕ':'в поле', CW-10, CH-24);
  ctx.font='11px Segoe UI'; ctx.fillStyle='#9aa4ae';
  ctx.fillText('скорость '+Math.round(len(player.vx,player.vy)), CW-10, CH-9);
}

function drawMinimap(){
  const S = 1.35, MW = GW*S, MH = GH*S;
  const x0 = CW-MW-8, y0 = CH-MH-48;
  ctx.fillStyle = 'rgba(6,9,14,.8)'; ctx.fillRect(x0-3,y0-3,MW+6,MH+6);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth=1; ctx.strokeRect(x0-3.5,y0-3.5,MW+7,MH+7);
  /* Раньше здесь каждый кадр перебиралась ВСЯ сетка 74x74 — до пяти с
     половиной тысяч заливок, и после ускорения породы именно миникарта
     стала главным едоком времени (1.75 мс из 2.0). Теперь она печётся
     вместе с породой, клетка в пиксель, и кладётся одним куском. */
  if(!miniCv) bakeAll();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(miniCv, 0,0, GW,GH, x0,y0, MW,MH);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle='#ffd166'; ctx.fillRect(x0+padX/T*S-2, y0+padY/T*S-2, 4, 4);
  ctx.fillStyle='#ffffff'; ctx.fillRect(x0+player.x/T*S-1.5, y0+player.y/T*S-1.5, 3, 3);
}

// указатель на площадку, когда её не видно
function drawPadArrow(){
  const sx = padX-camX, sy = padY-camY;
  if(sx>10 && sx<CW-10 && sy>60 && sy<CH-50) return;
  const cx = CW/2, cy = CH/2;
  const a = Math.atan2(sy-cy, sx-cx);
  const r = Math.min(CW,CH)*0.36;
  const x = cx+Math.cos(a)*r, y = cy+Math.sin(a)*r;
  ctx.save(); ctx.translate(x,y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(255,209,102,.9)';
  ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-7,6); ctx.lineTo(-7,-6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,209,102,.9)'; ctx.font='10px Segoe UI'; ctx.textAlign='center';
  ctx.fillText('док '+Math.round(len(padX-player.x, padY-player.y)/T)+'кл', x, y+20);
}

function render(){
  syncRes();
  ctx.fillStyle = '#05060c'; ctx.fillRect(0,0,CW,CH);
  if(!tiles) return;

  camX = player.x - CW/2 + (shake?(Math.random()-0.5)*shake:0);
  camY = player.y - CH/2 + (shake?(Math.random()-0.5)*shake:0);

  // звёзды (параллакс)
  for(const s of stars){
    const x = s.x - camX*0.25, y = s.y - camY*0.25;
    const sx = ((x % 2600)+2600)%2600 - 800, sy = ((y % 2600)+2600)%2600 - 800;
    if(sx<-10||sx>CW+10||sy<-10||sy>CH+10) continue;
    ctx.globalAlpha = s.a; ctx.fillStyle='#cfe0ff';
    ctx.fillRect(sx, sy, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // звезда, к которой всё летит: разгорается по мере таймера
  const heat = 1 - timeLeft/TOTAL_TIME;
  const starX = WCX - camX, starY = WCY + R_LOST*1.5 - camY;
  const sr = 260 + heat*520;
  const sg = ctx.createRadialGradient(starX, starY, 10, starX, starY, sr);
  sg.addColorStop(0, 'rgba(255,220,150,'+(0.40+heat*0.45).toFixed(2)+')');
  sg.addColorStop(0.30, 'rgba(255,140,60,'+(0.09+heat*0.26).toFixed(2)+')');
  sg.addColorStop(1, 'rgba(255,80,30,0)');
  ctx.fillStyle = sg; ctx.fillRect(0,0,CW,CH);

  // граница притяжения
  ctx.strokeStyle = 'rgba(255,120,90,.30)'; ctx.setLineDash([6,8]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(WCX-camX, WCY-camY, R_GRAV, 0, 6.3); ctx.stroke();
  ctx.setLineDash([]);

  /* порода — одним куском из печёной карты. Кладём только ту часть, что
     реально попала в окно, и в масштабе 1:1, иначе поедет привязка. */
  if(!bakeCv) bakeAll();
  const bx0 = Math.max(0, camX), by0 = Math.max(0, camY);
  const bx1 = Math.min(GW*T, camX+CW), by1 = Math.min(GH*T, camY+CH);
  if(bx1 > bx0 && by1 > by0)
    ctx.drawImage(bakeCv, bx0, by0, bx1-bx0, by1-by0, bx0-camX, by0-camY, bx1-bx0, by1-by0);

  // а мигающее (площадка и газ) — живьём поверх, их считанные штуки
  const c0 = Math.max(0, Math.floor(camX/T)), r0 = Math.max(0, Math.floor(camY/T));
  const c1 = Math.min(GW-1, Math.ceil((camX+CW)/T)), r1 = Math.min(GH-1, Math.ceil((camY+CH)/T));
  for(let y=r0;y<=r1;y++) for(let x=c0;x<=c1;x++){
    const t = tiles[gi(x,y)];
    if(t===PAD || t===GAS) drawTile(ctx, x,y, x*T-camX, y*T-camY, t);
  }

  drawModule();

  for(const p of parts){
    ctx.globalAlpha = clamp(1-p.t/p.life,0,1);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x-camX-1, p.y-camY-1, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;

  // сначала напарники, своё тело — поверх, чтобы не потерять себя в куче
  if(players) for(const m of players) if(m !== player) drawPlayer(m, false);
  drawPlayer(player, true);
  drawPadArrow();

  // краснота от удара
  if(player.hurt>0){
    player.hurt -= 0.02;
    ctx.fillStyle = 'rgba(180,30,30,'+(player.hurt*0.5).toFixed(2)+')'; ctx.fillRect(0,0,CW,CH);
  }

  drawHUD();

  if(paused && !over){
    ctx.fillStyle='rgba(5,8,14,.72)'; ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center'; ctx.fillStyle='#e7ecf3'; ctx.font='bold 28px Segoe UI';
    ctx.fillText('⏸ ПАУЗА', CW/2, CH/2-4);
    ctx.font='14px Segoe UI'; ctx.fillText('P / Esc — продолжить', CW/2, CH/2+22);
  }
  if(over) drawEnd();
}

function drawEnd(){
  ctx.fillStyle = win ? 'rgba(6,18,14,.86)' : 'rgba(20,8,6,.88)';
  ctx.fillRect(0,0,CW,CH);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle = win ? '#8ef0a0' : '#ff6a4a';
  ctx.font = 'bold 32px Georgia, serif';
  ctx.fillText(win ? 'ЭВАКУИРОВАН' : 'КОНЕЦ СМЕНЫ', CW/2, CH/2-72);
  ctx.fillStyle = '#e7ecf3'; ctx.font='15px Segoe UI';
  ctx.fillText(cause, CW/2, CH/2-44);
  const gm = timeLeft/TOTAL_TIME*3600;
  const mm = Math.floor(gm/60), ss = Math.floor(gm%60);
  ctx.font='13px Segoe UI'; ctx.fillStyle='#c2cad2';
  ctx.fillText('Осталось до звезды: '+mm+':'+(ss<10?'0':'')+ss+'   ·   выбурено блоков: '+dug, CW/2, CH/2-14);
  ctx.fillText('Модуль: ⚙️'+built.iron+'/'+NEED.iron+'  🔩'+built.titan+'/'+NEED.titan+'  💎'+built.cryst+'/'+NEED.cryst+'  ⛽'+Math.round(reserve)+'/'+NEED_FUEL, CW/2, CH/2+10);
  const bl = best.bestLeft, bm = Math.floor(bl/TOTAL_TIME*3600/60), bs = Math.floor((bl/TOTAL_TIME*3600)%60);
  ctx.fillText('Успешных эвакуаций: '+best.wins+(best.wins?('   ·   лучший запас времени '+bm+':'+(bs<10?'0':'')+bs):''), CW/2, CH/2+34);
  ctx.fillStyle = '#ffb454'; ctx.font='14px Segoe UI';
  ctx.fillText('Enter / тап — новый астероид', CW/2, CH/2+72);
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
function aimAt(p){
  const sx = player.x-camX, sy = player.y-camY;
  aimA = Math.atan2(p.y-sy, p.x-sx);
  mouseAim = true;
}
canvas.addEventListener('pointermove', e=>{ if(e.pointerType!=='touch') aimAt(canvasPos(e)); });
canvas.addEventListener('pointerdown', e=>{
  if(over){ reset(); return; }
  if(paused) return;
  aimAt(canvasPos(e)); drilling = true;
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', ()=>{ drilling = false; });
canvas.addEventListener('pointercancel', ()=>{ drilling = false; });
canvas.addEventListener('contextmenu', e=>e.preventDefault());

const KEYDIR = { KeyW:'up', ArrowUp:'up', KeyS:'down', ArrowDown:'down', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right' };
document.addEventListener('keydown', e=>{
  if(e.target && e.target.tagName==='INPUT') return;
  if(over){ if(e.code==='Enter'){ if(amHost()) reset(); else net.send({ t:'again' }); } return; }
  if(e.code==='Escape' && document.fullscreenElement) return;   // в полном экране Esc только выходит
  if(e.code==='KeyP' || e.code==='Escape'){ myPause(); e.preventDefault(); return; }
  if(paused) return;
  if(KEYDIR[e.code]){
    held[KEYDIR[e.code]] = true;
    // без мыши целимся туда же, куда толкаемся — иначе бурить нечем
    if(!mouseAim) aimFromKeys();
    e.preventDefault(); return;
  }
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){ fine = true; return; }
  if(e.code==='Space'){ drilling = true; e.preventDefault(); return; }
  if(e.repeat) return;
  if(e.code==='KeyE'){ myAct('dock'); return; }
  if(e.code==='KeyR'){ myAct('burn'); return; }
  if(e.code==='KeyQ'){ myAct('dump'); return; }
});
document.addEventListener('keyup', e=>{
  if(KEYDIR[e.code]) held[KEYDIR[e.code]] = false;
  if(e.code==='ShiftLeft'||e.code==='ShiftRight') fine = false;
  if(e.code==='Space') drilling = false;
});
window.addEventListener('blur', ()=>{ for(const k in held) held[k]=false; fine=false; drilling=false; });

function aimFromKeys(){
  let x=0,y=0;
  if(held.left) x-=1; if(held.right) x+=1; if(held.up) y-=1; if(held.down) y+=1;
  if(x||y) aimA = Math.atan2(y,x);
}

// экранный D-pad и кнопки
document.querySelectorAll('.pad button[data-dir]').forEach(b=>{
  const dir = b.getAttribute('data-dir');
  const on = e=>{ e.preventDefault(); held[dir]=true; mouseAim=false; aimFromKeys(); };
  const off = e=>{ e.preventDefault(); held[dir]=false; b.blur(); };
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off);
  b.addEventListener('pointerleave',off); b.addEventListener('pointercancel',off);
});
(function(){
  const d = document.getElementById('drillBtn');
  const on = e=>{ e.preventDefault(); drilling = true; };
  const off = e=>{ e.preventDefault(); drilling = false; d.blur(); };
  d.addEventListener('pointerdown',on); d.addEventListener('pointerup',off);
  d.addEventListener('pointerleave',off); d.addEventListener('pointercancel',off);
})();
function onBtn(id, fn){
  const b = document.getElementById(id); if(!b) return;
  b.addEventListener('click', ()=>{ b.blur(); fn(); });
}
onBtn('dockBtn', ()=>{ if(!over&&!paused) myAct('dock'); });
onBtn('fineBtn', ()=>{ fine = !fine; });
onBtn('subBtn', ()=>{ if(!over&&!paused) myAct('burn'); });
onBtn('dumpBtn', ()=>{ if(!over&&!paused) myAct('dump'); });
onBtn('pause', ()=>{ if(!over) myPause(); });
onBtn('restart', ()=>{ if(amHost()) reset(); else net.send({ t:'again' }); });

function updateButtons(){
  const b = document.getElementById('pause');
  if(b) b.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
}


/* =====================  ОНЛАЙН: ОДНА ЭКСПЕДИЦИЯ  =====================
   Астероид, часы, склад газа и собираемый модуль — общие: это одна
   команда, спасающаяся на одном челноке. Личное у каждого только тело,
   ранец, скафандр и бур.

   Астероид — это 4000+ клеток, слать их 15 раз в секунду бессмысленно.
   Поэтому породу шлём ЦЕЛИКОМ один раз при входе, а дальше — только
   номера клеток, которые выбурили. */
function myAct(a){
  if(amHost()){
    if(a==='dock') doDock(); else if(a==='burn') burnFuel(); else if(a==='dump') dumpCargo();
  } else net.send({ t:'act', a:a });
}
function myPause(){
  if(amHost()){ paused = !paused; updateButtons(); if(isNet()) broadcast(); }
  else net.send({ t:'pause' });
}
let dirtyTiles = [];
function tileChanged(i){ bakeIndex(i); if(isNet() && net.isHost()) dirtyTiles.push(i); }

function broadcast(){
  const pack = {
    t:'st', tl:timeLeft, cg:cargo, bt:built, rs:reserve,
    ov:over, wn:win, cs:cause, pa:paused, lg:launching, lw:launchWho, dg:dug,
    p: players.map(m=>({ x:m.x, y:m.y, vx:m.vx, vy:m.vy, f:m.fuel, hl:m.hull,
                         tx:m.thr.x, ty:m.thr.y, a:m.aimA, fn:m.fine, g:m.gone }))
  };
  if(dirtyTiles.length){ pack.dt = dirtyTiles; dirtyTiles = []; }
  net.send(pack);
}
function sendWorld(slot){
  // порода целиком — обычный массив, чтобы прошёл через JSON без сюрпризов
  net.sendTo(slot, { t:'world', tiles: Array.from(tiles), px:padX, py:padY });
  broadcast();
}

net = NET.create({
  prefix:'asteroid', max:MAXP,
  onOpen: ()=>{ reset(); },
  onJoin: (slot)=>{ if(players[slot]){ const m = mkMiner(false); m.x = padX; m.y = padY; players[slot] = m; } message('👨‍🚀 Напарник ' + (slot+1) + ' на астероиде'); sendWorld(slot); },
  onLeave: (slot)=>{ if(players[slot]) players[slot].gone = true; message('Напарник ' + (slot+1) + ' отключился'); broadcast(); },
  onWelcome: ()=>{ player = players[net.me]; message('Ждём карту астероида…'); },
  onClose: ()=>{ message('Хозяин экспедиции вышел'); },
  onData: (m, slot)=>{
    if(net.isHost()){
      const mm = players[slot]; if(!mm) return;
      if(m.t==='in'){
        mm.held.up = !!(m.h&1); mm.held.down = !!(m.h&2); mm.held.left = !!(m.h&4); mm.held.right = !!(m.h&8);
        mm.fine = !!(m.h&16); mm.drilling = !!(m.h&64); mm.aimA = m.a;
      } else if(m.t==='act'){
        // действие выполняем ОТ ЛИЦА напарника: док, горелка и сброс смотрят на player
        const save = player; player = mm;
        if(m.a==='dock') doDock(); else if(m.a==='burn') burnFuel(); else if(m.a==='dump') dumpCargo();
        player = save; broadcast();
      } else if(m.t==='pause'){ paused = !paused; updateButtons(); broadcast(); }
      else if(m.t==='again'){ reset(); for(const sl of net.slots()) sendWorld(sl); }
      return;
    }
    if(m.t==='world'){ tiles = m.tiles; padX = m.px; padY = m.py; bakeAll(); return; }
    if(m.t!=='st') return;
    timeLeft = m.tl; cargo = m.cg; built = m.bt; reserve = m.rs;
    over = m.ov; win = m.wn; cause = m.cs; paused = m.pa; launching = m.lg; launchWho = m.lw|0; dug = m.dg;
    if(m.dt) for(const i of m.dt){ tiles[i] = EMPTY; bakeIndex(i); }
    for(let i=0;i<players.length;i++){
      const s = m.p[i]; if(!s) continue;
      const q = players[i];
      q.gone = s.g; q.fuel = s.f; q.hull = s.hl; q.thr.x = s.tx; q.thr.y = s.ty; q.fine = s.fn;
      // своё тело не дёргаем чужими координатами каждый пакет — только чужие
      if(i !== net.me){ q.x = s.x; q.y = s.y; q.vx = s.vx; q.vy = s.vy; q.aimA = s.a; }
      else { q.x = s.x; q.y = s.y; q.vx = s.vx; q.vy = s.vy; }
    }
    player = players[net.me];
    updateButtons();
  }
});
NET.lobby(document.getElementById('netbar'), net);

reset();
requestAnimationFrame(frame);

// хук для отладки/тестов
if(typeof globalThis!=='undefined') globalThis.__A = {
  reset, update, render, doDock, burnFuel, dumpCargo, breakTile, aimTarget, gravityAt, blockedAt, endGame, addOre,
  getPlayer:()=>player, getCargo:()=>cargo, getBuilt:()=>built, getTiles:()=>tiles, getReserve:()=>reserve,
  setReserve:v=>{reserve=v;}, getTime:()=>timeLeft, setTime:v=>{timeLeft=v;}, getOver:()=>over, getWin:()=>win,
  getCause:()=>cause, getHeld:()=>held, setFine:v=>{fine=v;}, setDrill:v=>{drilling=v;}, setAim:v=>{aimA=v;},
  getPad:()=>({x:padX,y:padY}), docked, mass, accel, cargoCount, moduleReady, getBest:()=>best, getDug:()=>dug,
  isLaunching:()=>launching, T, GW, GH, WCX, WCY, R_SURF, R_GRAV, R_LOST, NEED, NEED_FUEL, CARGO_CAP, FUEL_MAX,
  EMPTY, ROCK, ICE, IRON, TITAN, CRYST, GAS, HARD, PAD, HARDNESS,
};
