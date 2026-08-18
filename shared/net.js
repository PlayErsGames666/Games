/* =========================================================================
   ОБЩИЙ СЕТЕВОЙ СЛОЙ ИГРОТЕКИ
   Один файл на все онлайн-игры. Модель везде одна и та же:

     ХОЗЯИН КОМНАТЫ СЧИТАЕТ, ОСТАЛЬНЫЕ СМОТРЯТ И ШЛЮТ ВВОД.

   Хост держит настоящее состояние игры и рассылает его всем. Гость ничего
   не решает сам: он шлёт «я нажал», получает состояние и рисует его. Так
   не бывает расхождений между экранами, и жулить сложнее.

   Почему так, а не «все считают одинаково»: детерминированная симуляция на
   разных браузерах разъезжается на первой же дробной секунде, а сверять её
   дороже, чем просто прислать готовое состояние 15 раз в секунду.

   ПОДКЛЮЧЕНИЕ (в игре):
     <script src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"></script>
     <link rel="stylesheet" href="../../shared/net.css">
     <script src="../../shared/net.js"></script>

     const net = NET.create({ prefix:'ttt', max:2, onJoin, onData, ... });
     NET.lobby(document.getElementById('netbar'), net);
   ========================================================================= */
(function (global) {
  'use strict';

  /* Свой брокер сигналинга вместо общего 0.peerjs.com: тот перегружен, режет
     по лимитам и теряет комнаты при перезапуске.
     TURN прописан руками: дефолтные адреса самой PeerJS (eu-0/us-0.turn.peerjs.com)
     больше не существуют — домены не резолвятся. Без ретранслятора пары за
     symmetric NAT (мобильный интернет, корпоративная сеть) не соединяются
     в принципе, поэтому STUN-ов мало. */
  const PEER_OPTS = {
    host: 'peer.fast16.net', port: 443, path: '/', secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    }
  };

  // без похожих букв: 0/O и 1/I по телефону не продиктуешь
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randCode(n) {
    let s = '';
    for (let i = 0; i < (n || 4); i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return s;
  }

  function errMsg(type) {
    return ({
      'peer-unavailable': 'Комната не найдена — проверь код',
      'unavailable-id': 'Код занят, беру другой…',
      'network': 'Нет связи с сервером — попробуй ещё раз',
      'server-error': 'Сервер сигналинга недоступен — попробуй позже',
      'socket-error': 'Обрыв связи с сервером',
      'socket-closed': 'Сервер закрыл соединение',
      'browser-incompatible': 'Браузер не умеет WebRTC',
      'webrtc': 'Сбой WebRTC (слишком строгий NAT?)',
      'disconnected': 'Отключено от сервера'
    })[type] || ('Ошибка связи: ' + type);
  }

  function create(opt) {
    const o = Object.assign({
      prefix: 'game',      // префикс кода комнаты: у каждой игры свой, чтобы коды не пересекались
      max: 2,              // сколько игроков всего, включая хоста
      onOpen: function () { },     // хост: комната зарегистрирована (code)
      onJoin: function () { },     // хост: игрок сел на место (slot)
      onLeave: function () { },    // хост: игрок ушёл (slot)
      onWelcome: function () { },  // гость: нам выдали место (slot)
      onData: function () { },     // оба: пришёл пакет (msg, slotОтправителя)
      onClose: function () { },    // гость: хост пропал
      onFull: function () { },     // гость: мест нет
      onStatus: function () { }    // текст для строки состояния
    }, opt);

    const S = {
      role: 'solo',        // solo | host | join
      me: 0,               // мой номер места: у хоста всегда 0
      code: '',
      peer: null,
      conn: null,          // у гостя — соединение с хостом
      conns: [],           // у хоста — соединения гостей, у каждого .slot
      online: false,
      tries: 0,
      ui: null             // панель комнаты, если игра её создала
    };

    // строка состояния сама доходит до панели: игре не надо это прокидывать
    function status(t) { if (S.ui) S.ui.say(t); try { o.onStatus(t); } catch (e) { } }

    /* Полная уборка перед новой попыткой. Без неё повторный «Войти» после
       неудачи создавал ЕЩЁ один Peer, старый висел живым, и следующие
       попытки уже не проходили никогда. */
    function reset() {
      try { if (S.conn) S.conn.close(); } catch (e) { }
      for (const c of S.conns) { try { c.close(); } catch (e) { } }
      try { if (S.peer) S.peer.destroy(); } catch (e) { }
      S.conn = null; S.peer = null; S.conns = []; S.online = false;
    }

    function freeSlot() {
      const busy = new Set(S.conns.map(c => c.slot));
      for (let i = 1; i < o.max; i++) if (!busy.has(i)) return i;
      return 0;                                  // 0 = мест нет
    }
    function count() { return S.role === 'host' ? 1 + S.conns.length : (S.online ? 2 : 1); }
    function slots() { return S.conns.map(c => c.slot); }

    function sendTo(target, msg) {
      try {
        const c = typeof target === 'number' ? S.conns.find(x => x.slot === target) : target;
        if (c && c.open) c.send(msg);
      } catch (e) { }
    }
    // хост шлёт всем гостям, гость — только хосту
    function send(msg) {
      try {
        if (S.role === 'host') { for (const c of S.conns) { try { if (c.open) c.send(msg); } catch (e) { } } }
        else if (S.conn && S.online) S.conn.send(msg);
      } catch (e) { }
    }

    function host() {
      if (typeof global.Peer === 'undefined') { status('PeerJS не загрузился — нужен интернет'); return; }
      reset();
      const code = randCode();
      S.code = code; S.role = 'host'; S.me = 0;
      status('Регистрирую комнату…');
      S.peer = new global.Peer(o.prefix + '-' + code, PEER_OPTS);

      S.peer.on('open', () => {
        if (S.ui) S.ui.asHost(code);                 // показать код, спрятать «Войти»
        status('Готово! Код: ' + code + ' — жду друзей');
        try { o.onOpen(code); } catch (e) { }
      });
      S.peer.on('error', e => {
        // код занят — молча берём следующий, а не показываем ошибку игроку
        if (e.type === 'unavailable-id' && S.tries < 5) { S.tries++; try { S.peer.destroy(); } catch (_) { } host(); return; }
        status(errMsg(e.type));
      });
      S.peer.on('connection', c => {
        // Место выдаётся в обработчике 'open', а 'data' может сработать раньше.
        // Пакет без места молча роняем: иначе он засчитается хосту как СВОЙ
        // (slot 0) — чужой ввод начнёт двигать тело хозяина комнаты.
        c.on('data', d => { if (!c.slot) return; try { o.onData(d, c.slot); } catch (e) { } });
        c.on('open', () => {
          const slot = freeSlot();
          if (!slot) {                                  // комната полная
            sendTo(c, { t: '__full' });
            setTimeout(() => { try { c.close(); } catch (e) { } }, 400);
            return;
          }
          c.slot = slot; S.conns.push(c); S.online = true;
          sendTo(c, { t: '__welcome', slot: slot, max: o.max });
          try { o.onJoin(slot, c); } catch (e) { }
          status('✅ Игроков: ' + count() + '/' + o.max + ' · код ' + code);
        });
        const drop = () => {
          const i = S.conns.indexOf(c);
          if (i < 0) return;                            // close и error приходят оба — убираем один раз
          S.conns.splice(i, 1);
          S.online = S.conns.length > 0;
          if (c.slot) { try { o.onLeave(c.slot); } catch (e) { } }
          status(count() > 1 ? ('✅ Игроков: ' + count() + '/' + o.max + ' · код ' + code)
            : ('Все вышли. Код: ' + code + ' — жду друзей'));
        };
        c.on('close', drop);
        c.on('error', drop);
      });
    }

    /* Не вышло войти — возвращаем панель в исходный вид. Без этого совет
       «проверь код» выполнить нечем: поле кода уже отключено, кнопка
       «Создать комнату» спрятана, и остаётся только перезагрузить страницу. */
    function giveUp() {
      if (S.online) return;                     // успели войти, ошибка опоздала
      S.role = 'solo'; S.me = 0;
      if (S.ui && S.ui.asIdle) S.ui.asIdle();
    }

    /* Отвечает, взялся ли за подключение: панель запирается ТОЛЬКО после
       этого «да». Раньше она запиралась до проверки — и пустой код или
       незагрузившийся PeerJS запирали её насовсем. */
    function join(code) {
      code = (code || '').trim().toUpperCase();
      if (!code) { status('Введи код комнаты'); return false; }
      if (typeof global.Peer === 'undefined') { status('PeerJS не загрузился — нужен интернет'); return false; }
      reset();
      S.code = code; S.role = 'join'; S.me = 1;
      status('Подключаюсь к ' + code + '…');
      S.peer = new global.Peer(undefined, PEER_OPTS);
      S.peer.on('error', e => { status(errMsg(e.type)); giveUp(); });
      S.peer.on('open', () => {
        S.conn = S.peer.connect(o.prefix + '-' + code, { reliable: true });
        S.conn.on('data', d => {
          if (d && d.t === '__welcome') { S.me = d.slot; status('✅ Ты игрок №' + (d.slot + 1) + ' из ' + (d.max || o.max)); try { o.onWelcome(d.slot); } catch (e) { } return; }
          if (d && d.t === '__full') { status('Комната полная'); try { o.onFull(); } catch (e) { } return; }
          try { o.onData(d, 0); } catch (e) { }
        });
        S.conn.on('open', () => { S.online = true; status('✅ Подключено к ' + code); });
        S.conn.on('close', () => { S.online = false; status('Хост отключился'); try { o.onClose(); } catch (e) { } });
        S.conn.on('error', () => { S.online = false; status('Обрыв связи'); });
        setTimeout(() => {
          if (!S.online) { status('Не удалось подключиться к ' + code + ' — код, хост или NAT'); giveUp(); }
        }, 15000);
      });
      return true;
    }

    function leave() { reset(); S.role = 'solo'; S.me = 0; S.code = ''; status('оффлайн (одиночная игра)'); }

    return {
      host: host, join: join, send: send, sendTo: sendTo, leave: leave, reset: reset,
      count: count, slots: slots, freeSlot: freeSlot, status: status,
      attachUI: function (ui) { S.ui = ui; },
      get role() { return S.role; },
      get me() { return S.me; },
      get code() { return S.code; },
      get online() { return S.online; },
      get max() { return o.max; },
      isHost: function () { return S.role === 'host'; },
      isGuest: function () { return S.role === 'join'; },
      isOnline: function () { return S.role !== 'solo' && S.online; }
    };
  }

  /* Стандартная панель комнаты: одинаковая во всех играх, чтобы не
     переучиваться. Возвращает { status(t) } — но обычно он и не нужен:
     net сам пишет туда через onStatus. */
  function lobby(box, net, opt) {
    opt = opt || {};
    box.classList.add('netbar');
    box.innerHTML =
      '<button class="net-host">🌐 Создать комнату</button>' +
      '<input class="net-join-code code" placeholder="КОД" maxlength="6" autocomplete="off">' +
      '<button class="net-join">Войти</button>' +
      '<input class="net-code code" readonly hidden title="Код комнаты — кликни, чтобы выделить">' +
      '<button class="net-copy" hidden>📋 Копировать</button>' +
      '<span class="net-status">' + (opt.idle || 'оффлайн (одиночная игра)') + '</span>';

    const bHost = box.querySelector('.net-host'), bJoin = box.querySelector('.net-join'),
      iJoin = box.querySelector('.net-join-code'), iCode = box.querySelector('.net-code'),
      bCopy = box.querySelector('.net-copy'), sEl = box.querySelector('.net-status');

    function say(t) { sEl.textContent = t; }
    // как только выбрана роль, чужие кнопки убираем: они уже ни к чему
    function asHost(code) {
      iCode.value = code; iCode.hidden = false; bCopy.hidden = false;
      bHost.disabled = true; iJoin.hidden = true; bJoin.hidden = true;
    }
    function asGuest() { bHost.hidden = true; iJoin.disabled = true; bJoin.disabled = true; }
    // обратно в «ещё ничего не выбрано»: сюда возвращает неудачный вход
    function asIdle() {
      bHost.hidden = false; bHost.disabled = false;
      iJoin.hidden = false; iJoin.disabled = false;
      bJoin.hidden = false; bJoin.disabled = false;
      iCode.hidden = true; bCopy.hidden = true;
    }

    bHost.addEventListener('click', () => { bHost.blur(); net.host(); });
    const tryJoin = () => { if (net.join(iJoin.value)) asGuest(); };
    bJoin.addEventListener('click', () => { bJoin.blur(); tryJoin(); });
    iJoin.addEventListener('keydown', e => { if (e.code === 'Enter') tryJoin(); });
    bCopy.addEventListener('click', async () => {
      bCopy.blur();
      const code = iCode.value; if (!code) return;
      try { await navigator.clipboard.writeText(code); say('✅ Код скопирован: ' + code + ' — отправь другу'); }
      catch (e) { iCode.focus(); iCode.select(); try { document.execCommand('copy'); say('✅ Код скопирован: ' + code); } catch (_) { say('Выдели код вручную: ' + code); } }
    });
    iCode.addEventListener('click', () => { iCode.focus(); iCode.select(); });

    const api = { say: say, asHost: asHost, asGuest: asGuest, asIdle: asIdle, el: sEl };
    if (net && net.attachUI) net.attachUI(api);
    return api;
  }

  global.NET = { create: create, lobby: lobby, randCode: randCode, errMsg: errMsg, PEER_OPTS: PEER_OPTS };
})(window);
