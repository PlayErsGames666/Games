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
  function fit(){
    var col=document.querySelector(".game-col"); if(!col) return;
    col.style.transform=""; col.style.transformOrigin="";
    if(CV){ CV.style.width=""; CV.style.height=""; }
    if(!isFs()) return;
    if(CV){
      /* канвас растягиваем ЕГО СОБСТВЕННЫМ css-размером, а не transform колонки:
         так композитор не размывает картинку, а игра может отрисоваться
         в реальном разрешении экрана */
      var lw=CV.__logW, lh=CV.__logH;
      var extra=col.getBoundingClientRect().height - CV.getBoundingClientRect().height;
      var availH=Math.max(140, window.innerHeight-extra-10), availW=window.innerWidth-10;
      var k=Math.min(availW/lw, availH/lh);
      if(k>1.01){ CV.style.width=Math.round(lw*k)+"px"; CV.style.height=Math.round(lh*k)+"px"; }
      return;
    }
    var r=col.getBoundingClientRect(), w=r.width, h=r.height;
    if(!w||!h) return;
    var k2=Math.min(window.innerWidth/w, window.innerHeight/h)*0.98;
    if(k2>1.01){ col.style.transformOrigin="center center"; col.style.transform="scale("+k2.toFixed(3)+")"; }
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
  if(btn){ btn.addEventListener("click",function(){ btn.blur(); toggle(); }); var nav=btn.closest&&btn.closest(".controls"); if(nav) nav.classList.add("fs-hide"); }
  document.addEventListener("fullscreenchange",upd);
  document.addEventListener("webkitfullscreenchange",upd);
  window.addEventListener("resize",function(){ if(isFs()) refit(); });
  if(window.visualViewport) window.visualViewport.addEventListener("resize",function(){ if(isFs()) refit(); });
  document.addEventListener("keydown",function(e){ if(e.target&&e.target.tagName==="INPUT")return; if(e.code==="KeyF"&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey){ toggle(); } });
  window.__toggleFullscreen=toggle; window.__fsFit=fit; upd();
})();
