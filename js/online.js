// Online game. Sends your picks and shows whatever the match reports back.
// There are two ways to connect, chosen automatically:
//  - through the game server (server/server.js), when the site has one;
//  - directly between the two browsers, when it does not (for example GitHub Pages).
//    The room creator's browser then runs the match.
window.FS = window.FS || {};

FS.Online = (function () {
  'use strict';

  const UI = FS.UI;
  const Table = FS.Table;
  const Match = FS.Match;

  const YOU = 0;
  const PEER_LIB = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PEER_PREFIX = 'flash-shiv-room-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const JOIN_TIMEOUT = 15000;
  const PING_EVERY = 4000;        // direct connections: how often each side says "still here"
  const SILENCE_LIMIT = 15000;    // ...and how long a silence counts as a lost connection

  let room = null;
  let link = null;                // { send(type, index), close() } for the current game
  let session = 0;                // goes up on every stop, so stale connections are ignored
  let timer = null;
  let opponent = 'Opponent';
  let peerLib = null;

  function stop() {
    session++;
    clearTimeout(timer);
    if (link) link.close();
    link = null;
    room = null;
  }

  function send(type, index) {
    if (link) link.send(type, index);
  }

  function inviteLink() {
    return location.origin + location.pathname + '?room=' + room;
  }

  // ---- Showing what the match reports ----

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

  // ---- Connecting through the game server ----

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

  function serverLink(data) {
    room = data.room;
    const stream = new EventSource('/api/events?room=' + encodeURIComponent(room) + '&token=' + encodeURIComponent(data.token));
    stream.onmessage = function (e) { handle(JSON.parse(e.data)); };
    return {
      send: function (type, index) {
        post('/api/action', { room: data.room, token: data.token, type: type, index: index }).catch(function (err) {
          UI.status(err.message);
        });
      },
      close: function () { stream.close(); }
    };
  }

  // ---- Connecting the two browsers directly ----

  function loadPeerLib() {
    if (window.Peer) return Promise.resolve();
    if (!peerLib) {
      peerLib = new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = PEER_LIB;
        script.onload = resolve;
        script.onerror = function () {
          peerLib = null;
          reject(new Error('Could not load the connection library. Check your internet connection.'));
        };
        document.head.appendChild(script);
      });
    }
    return peerLib;
  }

  function peerProblem(err) {
    if (err.type === 'peer-unavailable') return 'Room not found. Check the code, and ask the host to keep their tab open.';
    if (err.type === 'browser-incompatible') return 'This browser cannot connect directly to another player.';
    return 'Could not reach the connection service. Try again in a moment.';
  }

  function newCode() {
    const picks = new Uint32Array(4);
    crypto.getRandomValues(picks);
    return Array.from(picks, function (n) { return CODE_CHARS[n % CODE_CHARS.length]; }).join('');
  }

  // Opens a peer under a fresh room code, trying another code if one is taken.
  function openHostPeer(attempt) {
    const code = newCode();
    const peer = new window.Peer(PEER_PREFIX + code, { debug: 0 });
    return new Promise(function (resolve, reject) {
      peer.on('open', function () { resolve({ peer: peer, code: code }); });
      peer.on('error', function (err) {
        if (err.type === 'unavailable-id' && attempt < 5) {
          peer.destroy();
          resolve(openHostPeer(attempt + 1));
        } else {
          reject(new Error(peerProblem(err)));
        }
      });
    });
  }

  // The room creator: this browser runs the match and passes the guest their view.
  function hostLink(peer, code, name) {
    room = code;
    const names = [Match.cleanName(name, 'Player 1'), 'Player 2'];
    const mine = session;
    let match = null;
    let guest = null;
    let lastForGuest = null;
    let lastForHost = null;
    let lastHeard = 0;
    let away = false;

    function guestAway() {
      if (away || !match || session !== mine) return;
      away = true;
      handle({ type: 'left' });
    }

    function guestBack() {
      if (!away) return;
      away = false;
      if (lastForHost && session === mine) handle(lastForHost);
    }

    const beat = setInterval(function () {
      if (!guest || !guest.open) return;
      guest.send({ type: 'ping' });
      if (Date.now() - lastHeard > SILENCE_LIMIT) guestAway();
    }, PING_EVERY);
    const sayBye = function () { if (guest && guest.open) guest.send({ type: 'bye' }); };
    window.addEventListener('pagehide', sayBye);

    function deliver(seat, payload, extra, keep) {
      const msg = Object.assign({}, payload, extra);
      if (seat === 0) {
        if (keep) lastForHost = payload;
        setTimeout(function () { if (session === mine) handle(msg); }, 0);
      } else {
        if (keep) lastForGuest = payload;
        if (guest && guest.open) guest.send(msg);
      }
    }

    peer.on('connection', function (conn) {
      conn.on('open', function () {
        if (guest && guest.open && !away) {
          conn.send({ type: 'full' });
          setTimeout(function () { conn.close(); }, 500);
          return;
        }
        guest = conn;
      });
      conn.on('data', function (data) {
        if (conn !== guest || session !== mine || !data || typeof data !== 'object') return;
        lastHeard = Date.now();
        if (data.type === 'bye') return guestAway();
        guestBack();
        if (data.type === 'ping') return;
        if (data.type === 'hello') {
          if (!match) {
            names[1] = Match.cleanName(data.name, 'Player 2');
            match = Match.create(names, deliver);
            match.start();
          } else {
            // The guest came back after losing the connection.
            if (lastForGuest) conn.send(lastForGuest);
          }
          return;
        }
        if (match) match.action(1, data.type, data.index);
      });
      conn.on('close', function () {
        if (conn !== guest) return;
        guest = null;
        guestAway();
      });
    });

    handle({ type: 'waiting' });
    UI.note('Keep this tab open · the game runs in your browser');

    return {
      send: function (type, index) {
        if (!match) return;
        const error = match.action(0, type, index);
        if (error) UI.status(error);
      },
      close: function () {
        clearInterval(beat);
        window.removeEventListener('pagehide', sayBye);
        sayBye();
        if (match) match.stop();
        peer.destroy();
      }
    };
  }

  // The joining player: everything shown comes from the host's browser, so it is
  // checked first (see sanitize below).
  function guestLink(peer, code, name, fail) {
    room = code;
    const mine = session;
    let joined = false;
    let lastHeard = Date.now();
    let lost = false;
    let lastMsg = null;
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });

    const hostGone = function (ended) {
      if (lost || !joined || session !== mine) return;
      lost = true;
      UI.status(opponent + (ended ? ' left · the game has ended' : ' is not responding · waiting for them to return'));
    };
    const beat = setInterval(function () {
      if (conn.open) conn.send({ type: 'ping' });
      if (Date.now() - lastHeard > SILENCE_LIMIT) hostGone(false);
    }, PING_EVERY);
    const sayBye = function () { if (conn.open) conn.send({ type: 'bye' }); };
    window.addEventListener('pagehide', sayBye);

    const giveUp = function (message) {
      if (session !== mine) return;
      stop();
      fail(message);
    };

    conn.on('open', function () { conn.send({ type: 'hello', name: name }); });
    conn.on('data', function (data) {
      if (session !== mine) return;
      const msg = sanitize(data);
      if (!msg) return;
      lastHeard = Date.now();
      if (msg.type === 'full') return giveUp('Room is full');
      if (msg.type === 'bye') return hostGone(true);
      if (lost) {
        // The host is back: show the latest state again in place of the warning.
        lost = false;
        if (msg.type === 'ping' && lastMsg) handle(lastMsg);
      }
      if (msg.type === 'ping') return;
      joined = true;
      if (msg.type === 'state') lastMsg = { type: 'state', view: msg.view, message: msg.message };
      handle(msg);
    });
    conn.on('close', function () {
      if (session !== mine) return;
      if (!joined) return giveUp('Could not join that room.');
      hostGone(true);
    });
    peer.on('error', function (err) { if (!joined) giveUp(peerProblem(err)); });
    timer = setTimeout(function () {
      if (!joined) giveUp('Could not connect to that room. The host may have left, or a network is blocking direct connections.');
    }, JOIN_TIMEOUT);

    return {
      send: function (type, index) { if (conn.open) conn.send({ type: type, index: index }); },
      close: function () {
        clearInterval(beat);
        window.removeEventListener('pagehide', sayBye);
        sayBye();
        peer.destroy();
      }
    };
  }

  // ---- Checking messages from another browser ----

  const CARD_TYPES = ['num', 'strike', 'mirror', 'blast', 'force'];
  const PHASES = ['shiv', 'shivPick', 'attack', 'blastPick', 'over'];
  const REASONS = ['draw', 'short', 'empty', 'foul'];
  const MESSAGE_TYPES = ['state', 'left', 'rematch', 'full', 'ping', 'bye'];

  function whole(value, max) {
    const n = Math.floor(Number(value));
    return n >= 0 && n <= max ? n : 0;
  }

  function seatOrNull(value) {
    return value === 0 || value === 1 ? value : null;
  }

  function cleanCard(card) {
    const c = card || {};
    return { type: CARD_TYPES.indexOf(c.type) >= 0 ? c.type : 'num', value: whole(c.value, 7), hidden: !!c.hidden };
  }

  function cleanSeat(seat) {
    const s = seat || {};
    const list = function (cards, max) { return Array.isArray(cards) ? cards.slice(0, max) : []; };
    return {
      hand: list(s.hand, 20).map(cleanCard),
      deck: list(s.deck, 20).map(cleanCard),
      pile: list(s.pile, 40).map(function (item) {
        const it = item || {};
        return { card: cleanCard(it.card), kind: it.kind === 'double' ? 'double' : 'value', value: whole(it.value, 7), reversed: !!it.reversed };
      })
    };
  }

  // Rebuilds a message from the host using only the fields and values the game expects.
  function sanitize(data) {
    if (!data || typeof data !== 'object' || MESSAGE_TYPES.indexOf(data.type) < 0) return null;
    if (data.type !== 'state') return { type: data.type };
    const v = data.view || {};
    const players = Array.isArray(v.players) ? v.players : [];
    const names = Array.isArray(v.names) ? v.names : [];
    const msg = {
      type: 'state',
      message: String(data.message || '').slice(0, 200),
      view: {
        players: [cleanSeat(players[0]), cleanSeat(players[1])],
        phase: PHASES.indexOf(v.phase) >= 0 ? v.phase : 'shiv',
        turn: seatOrNull(v.turn),
        tied: !!v.tied,
        winner: seatOrNull(v.winner),
        reason: REASONS.indexOf(v.reason) >= 0 ? v.reason : null,
        picked: !!v.picked,
        names: [Match.cleanName(names[0], 'You'), Match.cleanName(names[1], 'Opponent')]
      }
    };
    if (typeof data.effect === 'string' && /^[a-z]{1,12}$/i.test(data.effect)) msg.effect = data.effect;
    if (data.destroyed) {
      msg.destroyed = cleanCard(data.destroyed);
      msg.byYou = !!data.byYou;
    }
    return msg;
  }

  // ---- Starting a game ----

  function noServer(err) {
    return err instanceof TypeError;
  }

  function create(name, fail) {
    stop();
    const mine = session;
    post('/api/create', { name: name }).then(function (data) {
      if (session === mine) link = serverLink(data);
    }).catch(function (err) {
      if (session !== mine) return;
      if (!noServer(err)) return fail(err.message);
      // No game server here: host the room in this browser instead.
      loadPeerLib().then(function () { return openHostPeer(0); }).then(function (opened) {
        if (session !== mine) return opened.peer.destroy();
        link = hostLink(opened.peer, opened.code, name);
      }).catch(function (problem) {
        if (session === mine) fail(problem.message);
      });
    });
  }

  function join(code, name, fail) {
    stop();
    const mine = session;
    const wanted = code.trim().toUpperCase();
    post('/api/join', { room: wanted, name: name }).then(function (data) {
      if (session === mine) link = serverLink(data);
    }).catch(function (err) {
      if (session !== mine) return;
      if (!noServer(err)) return fail(err.message);
      // No game server here: connect straight to the host's browser.
      loadPeerLib().then(function () {
        if (session !== mine) return;
        const peer = new window.Peer({ debug: 0 });
        peer.on('open', function () {
          if (session !== mine) return peer.destroy();
          link = guestLink(peer, wanted, name, fail);
        });
        peer.on('error', function (problem) {
          if (session === mine && !link) fail(peerProblem(problem));
        });
      }).catch(function (problem) {
        if (session === mine) fail(problem.message);
      });
    });
  }

  return { create: create, join: join, stop: stop };
})();
