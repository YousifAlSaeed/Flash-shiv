// Online game. The server runs the match; this file sends your picks
// and shows whatever the server reports back.
window.FS = window.FS || {};

FS.Online = (function () {
  'use strict';

  const UI = FS.UI;
  const Table = FS.Table;

  const YOU = 0;

  let room = null;
  let token = null;
  let stream = null;
  let timer = null;
  let onFail = null;
  let opponent = 'Opponent';

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      // A site with no game server (a static host) answers with a web page, not JSON.
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!data) throw new TypeError('No game server');
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  function send(type, index) {
    post('/api/action', { room: room, token: token, type: type, index: index }).catch(function (err) {
      UI.status(err.message);
    });
  }

  function stop() {
    clearTimeout(timer);
    if (stream) stream.close();
    stream = null;
    room = null;
    token = null;
  }

  function connect(data) {
    room = data.room;
    token = data.token;
    stream = new EventSource('/api/events?room=' + encodeURIComponent(room) + '&token=' + encodeURIComponent(token));
    stream.onmessage = function (e) { handle(JSON.parse(e.data)); };
  }

  function inviteLink() {
    return location.origin + location.pathname + '?room=' + room;
  }

  function handle(msg) {
    if (msg.type === 'waiting') {
      Table.reset('Waiting for an opponent');
      UI.showWaiting(room, inviteLink());
      return;
    }
    if (msg.type === 'left') {
      UI.status(opponent + ' disconnected · waiting for them to return');
      return;
    }
    if (msg.type === 'rematch') {
      UI.note(opponent + ' wants a rematch');
      return;
    }
    if (msg.type !== 'state') return;
    if (msg.effect) FS.Sound.effect(msg.effect);
    opponent = msg.view.names[1];
    UI.setNames(msg.view.names[0], opponent);

    // After your own Blast, show the destroyed card before moving on.
    if (msg.destroyed && msg.byYou) {
      Table.show(msg.view, true, msg.message);
      UI.revealBlast(msg.destroyed);
      clearTimeout(timer);
      timer = setTimeout(function () { showState(msg); }, 1500);
      return;
    }
    showState(msg);
  }

  function showState(msg) {
    const view = msg.view;
    if (view.phase === 'over') {
      UI.hideOverlay();
      Table.finish(view, function () {
        send('rematch');
        UI.note('Waiting for ' + opponent);
      });
      return;
    }
    if (view.phase === 'blastPick' && view.turn === YOU) {
      Table.show(view, true, msg.message);
      UI.showBlast(view.players[1].hand.length, function (position) {
        UI.hideOverlay();
        send('blast', position);
      });
      return;
    }

    UI.hideOverlay();
    if (view.phase === 'attack' && view.turn === YOU) {
      Table.show(view, false, msg.message, function (pick) { send('play', pick); });
    } else if (view.phase === 'shivPick' && !view.picked) {
      Table.show(view, false, msg.message, function (pick) { send('shivPick', pick); });
    } else {
      Table.show(view, true, msg.message);
    }
  }

  function begin(request, fail) {
    stop();
    onFail = fail;
    request.then(connect).catch(function (err) {
      const offline = err instanceof TypeError;
      onFail(offline ? 'Online play is not available at this address, because it has no game server. You can still play the computer.' : err.message);
    });
  }

  function create(name, fail) {
    begin(post('/api/create', { name: name }), fail);
  }

  function join(code, name, fail) {
    begin(post('/api/join', { room: code.trim().toUpperCase(), name: name }), fail);
  }

  return { create: create, join: join, stop: stop };
})();
