/* =========================================================================
   ПОЛНЫЙ ЭКРАН — общий для всех игр
   Раньше этот скрипт лежал копией в каждой из 24 игр и успел разойтись:
   где-то чинили одно, где-то другое. Теперь он один.

   Что делает: кнопка ⛶ и клавиша F, а в полном экране растягивает игру
   под размер экрана, сохраняя пропорции.

   Игра на канвасе растягивается СВОИМ css-размером, а не transform-ом
   колонки: так композитор не мылит картинку, а игра может отрисоваться
   в реальном разрешении экрана. Игры без канваса (карточные, сапёр)
   масштабируются transform-ом — вёрстка при этом не меняется, а
   getBoundingClientRect отдаёт уже масштабированный прямоугольник,
   поэтому попадания мыши остаются точными.

   Если игра объявит window.__fsFail(причина), туда придёт текст отказа:
   браузер отвечает промисом, мимо try/catch, и без этого кнопка просто
   молча не работала бы.
   ========================================================================= */
(function(){
  var btn=document.getElementById("fsBtn"), root=document.documentElement;
  function isFs(){ return document.fullscreenElement||document.webkitFullscreenElement||null; }
  /* в полный экран растягиваем игровой блок под размер экрана, сохраняя пропорции.
     transform не меняет вёрстку, а getBoundingClientRect отдаёт УЖЕ масштабированный
     прямоугольник — поэтому попадания мыши/тача остаются точными */
  var CV=document.querySelector(".game-col canvas");     // логический размер — ДО любых правок
  if(CV){ CV.__logW=CV.width; CV.__logH=CV.height; }
  /* Подгоняем ИТЕРАЦИЕЙ ПО ФАКТУ, а не разовым расчётом.
     Каждый проход меряет то, что реально нарисовано ПРЯМО СЕЙЧАС, и правит
     размер. Поэтому неважно, в какой момент нас позвали: успел браузер
     применить полный экран или ещё нет, отдал он новый innerHeight или
     старый — следующий проход всё равно сойдётся к правильному.

     Два старых бага, оба воспроизведены:
      · один неудачный замер (обвязка ещё занимала место) давал масштаб
        около единицы, и игра НАВСЕГДА оставалась крошечной — поправить
        было нечем, повторный вызов считал ровно то же самое;
      · условие «масштабируем, только если k > 1.01» запрещало УМЕНЬШАТЬ.
        Колонка выше экрана так и оставалась выше экрана: верх игры
        уезжал под край, и это выглядело как обрезка. */
  function fit(){
    var col=document.querySelector(".game-col"); if(!col) return;
    if(!isFs()){
      col.style.transform=""; col.style.transformOrigin="";
      if(CV){ CV.style.width=""; CV.style.height=""; }
      if(window.__fsRestore) window.__fsRestore();      // вернуть оконный размер игре
      return;
    }
    if(CV){
      /* Игра может уметь перестраиваться под ЛЮБЫЕ пропорции — тогда она
         объявляет window.__fsResize(ширина, высота). Такой отдаём весь экран
         целиком: она сама решит, что показать в освободившемся месте.
         Остальным по-прежнему бережём пропорции — растянуть тетрис на
         широкий монитор можно только исказив его. */
      if(window.__fsResize){
        var eh=col.getBoundingClientRect().height - CV.getBoundingClientRect().height;
        var fw=Math.max(240, window.innerWidth), fh=Math.max(200, window.innerHeight-Math.max(0,eh));
        window.__fsResize(fw, fh);
        CV.style.width=fw+"px"; CV.style.height=fh+"px";
        return;
      }
      /* канвас растягиваем ЕГО СОБСТВЕННЫМ css-размером, а не transform колонки:
         так композитор не размывает картинку, а игра может отрисоваться
         в реальном разрешении экрана */
      var lw=CV.__logW, lh=CV.__logH;
      for(var pass=0; pass<4; pass++){
        var cvH=CV.getBoundingClientRect().height||lh;
        var extra=Math.max(0, col.getBoundingClientRect().height-cvH);   // всё, что не канвас
        var availH=Math.max(120, window.innerHeight-extra-4);
        var availW=Math.max(120, window.innerWidth-4);
        var k=Math.min(availW/lw, availH/lh);
        var h=Math.round(lh*k);
        if(Math.abs(h-cvH)<2) break;                                     // уже впору
        CV.style.width=Math.round(lw*k)+"px"; CV.style.height=h+"px";
      }
      return;
    }
    /* Игры без канваса (карточные, сапёр) — transform колонки. Здесь замер
       точный с первого раза, но сбрасывать transform надо ДО замера, иначе
       померим уже растянутое и разгоним масштаб. */
    col.style.transform=""; col.style.transformOrigin="";
    var r=col.getBoundingClientRect(), w=r.width, h2=r.height;
    if(!w||!h2) return;
    var k2=Math.min(window.innerWidth/w, window.innerHeight/h2)*0.98;
    if(Math.abs(k2-1)>0.01){ col.style.transformOrigin="center center"; col.style.transform="scale("+k2.toFixed(3)+")"; }
  }
  /* Скрываем обвязку САМИ, не дожидаясь, пока браузер применит :fullscreen.
     Иначе подгонка меряет колонку вместе с заголовком и подсказками, ловит
     лишние двести пикселей высоты — и масштаб выходит меньше единицы, то
     есть игра остаётся крошечной, а вокруг чёрные поля. */
  function markFs(){ root.classList.toggle("fs-on", !!isFs()); }
  /* Размер окна после входа в полный экран меняется НЕ сразу и не всегда
     присылает resize вовремя. Одного замера мало: повторяем, пока всё
     не устаканится. Лишние вызовы бесплатны — fit() идемпотентен. */
  function refit(){
    markFs();
    requestAnimationFrame(fit);
    setTimeout(fit, 60); setTimeout(fit, 200); setTimeout(fit, 500);
    setTimeout(fit, 1000); setTimeout(fit, 2000);
  }
  /* Последняя страховка: пока мы в полном экране, следим за колонкой.
     Изменилась её высота (появилась строка сети, браузер убрал свою плашку
     «нажмите Esc», сменилась ориентация) — подгоняем заново. Зациклиться
     не может: fit() ничего не пишет, когда размер уже правильный. */
  if(window.ResizeObserver){
    var roT=0;
    var ro=new ResizeObserver(function(){
      if(!isFs()) return;
      /* Наблюдатель видит и НАШИ собственные правки. Обычно на этом всё и
         кончается (fit молчит, когда размер уже верный), но если вёрстка
         игры пляшет от ширины — например, ряд кнопок переносится на вторую
         строку, — можно закружиться. Ограничиваем: не чаще раза в четверть
         секунды. */
      var now=+new Date();
      if(now-roT<250) return;
      roT=now; fit();
    });
    var colEl=document.querySelector(".game-col");
    if(colEl) ro.observe(colEl);
  }
  function upd(){ if(btn){ var on=!!isFs(); btn.textContent=on?"⛶ Выйти":"⛶ Во весь экран"; btn.classList.toggle("on",on); } refit(); }
  function fail(w){ if(window.__fsFail) window.__fsFail(w); }
  function toggle(){
    try{
      if(!isFs()){
        var req = root.requestFullscreen||root.webkitRequestFullscreen;
        if(!req){ fail('браузер не умеет полный экран'); return; }
        var p = req.call(root);
        /* отказ приходит промисом и в try/catch не попадает — ловим отдельно,
           иначе кнопка молча ничего не делает и непонятно почему */
        if(p && p.catch) p.catch(function(e){ fail(e && e.message ? e.message : 'отказано'); });
      }
      else { (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
    }catch(e){ fail(e && e.message ? e.message : 'ошибка'); }
  }
  /* Ряд с кнопкой ⛶ помечаем fs-bar: в полном экране он не исчезает, а
     уезжает в угол экрана (см. base.css). Иначе там не остаётся ни паузы,
     ни «заново», ни выхода — только клавиши, которых игрок может не знать. */
  if(btn){
    btn.addEventListener("click",function(){ btn.blur(); toggle(); });
    var nav=btn.closest&&btn.closest(".controls");
    if(nav){ nav.classList.add("fs-bar"); nav.classList.remove("fs-hide"); }
  }
  document.addEventListener("fullscreenchange",upd);
  document.addEventListener("webkitfullscreenchange",upd);
  window.addEventListener("resize",function(){ if(isFs()) refit(); });
  if(window.visualViewport) window.visualViewport.addEventListener("resize",function(){ if(isFs()) refit(); });
  document.addEventListener("keydown",function(e){ if(e.target&&e.target.tagName==="INPUT")return; if(e.code==="KeyF"&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey){ toggle(); } });
  window.__toggleFullscreen=toggle; window.__fsFit=fit; upd();
})();
