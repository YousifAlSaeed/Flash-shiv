// Flash Shiv online server. No dependencies: run with `node server/server.js`.
// Serves the game files and runs each online match, so neither player's
// browser ever receives the other player's hand.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// The rules are the same files the browser uses.
global.window = global;
require('../js/cards.js');
require('../js/rules.js');
const C = global.FS.Cards;
const R = global.FS.Rules;

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const IDLE_MS = 10 * 60 * 1000;

const rooms = new Map();

// ---- Rooms ----

function newCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: newCode(),
    tokens: [crypto.randomBytes(16).toString('hex'), null],
    streams: [null, null],
    last: [null, null],
    rematch: [false, false],
    state: null,
    timer: null,
    cleanup: null
  };
  rooms.set(room.code, room);
  return room;
}

function seatOf(room, token) {
  const seat = room.tokens.indexOf(token);
  return token && seat >= 0 ? seat : -1;
}

function push(room, seat, payload) {
  const stream = room.streams[seat];
  if (stream) stream.write('data: ' + JSON.stringify(payload) + '\n\n');
}

// ---- What each player is allowed to see ----

function hidden(count) {
  return Array.from({ length: count }, function () { return { type: 'num', value: 0, hidden: true }; });
}

// The state from one seat's point of view: that seat is always player 0.
function viewFor(room, seat) {
  const st = room.state;
  const me = st.players[seat];
  const opp = st.players[R.other(seat)];
  const rel = function (p) { return p === null ? null : (p === seat ? 0 : 1); };
  return {
    players: [
      { hand: me.hand, deck: hidden(me.deck.length), pile: me.pile },
      { hand: hidden(opp.hand.length), deck: hidden(opp.deck.length), pile: opp.pile }
    ],
    phase: st.phase,
    turn: rel(st.turn),
    tied: st.tied,
    winner: rel(st.winner),
    reason: st.reason,
    picked: st.picks[seat] !== null
  };
}

function turnNote(room, seat) {
  if (room.state.phase !== 'attack') return '';
  return room.state.turn === seat ? ' · your turn' : ' · opponent\'s turn';
}

// Sends the current state to both seats. textFor(seat) gives each side's message.
function broadcast(room, textFor, extra) {
  [0, 1].forEach(function (seat) {
    const payload = { type: 'state', view: viewFor(room, seat), message: textFor(seat) + turnNote(room, seat) };
    room.last[seat] = payload;
    push(room, seat, Object.assign({}, payload, extra ? extra(seat) : null));
  });
}

// ---- Match flow ----

function schedule(room, fn, ms) {
  clearTimeout(room.timer);
  room.timer = setTimeout(fn, ms);
}

function startGame(room) {
  room.state = R.newGame();
  room.rematch = [false, false];
  broadcast(room, function () { return 'Shiv to open the round'; });
  schedule(room, function () { runShiv(room); }, 1200);
}

function runShiv(room) {
  const st = room.state;
  R.shiv(st);
  if (st.phase === 'shivPick') {
    return broadcast(room, function () { return 'Decks are empty · pick a card from your hand to shiv'; });
  }
  afterShiv(room);
}

function afterShiv(room) {
  const st = room.state;
  if (st.phase === 'over') return broadcast(room, function () { return 'No cards left'; });
  const score = function (seat) { return R.total(st, seat) + ' vs ' + R.total(st, R.other(seat)); };
  if (st.phase === 'shiv') {
    broadcast(room, function (seat) { return 'Shiv tied ' + score(seat) + ' · again'; }, effect('shiv'));
    return schedule(room, function () { runShiv(room); }, 1800);
  }
  broadcast(room, function (seat) { return 'Shiv · ' + score(seat); }, effect('shiv'));
}

// Tells both browsers which sound effect goes with this update.
function effect(name) {
  return function () { return { effect: name }; };
}

function who(seat, actor) {
  return seat === actor ? 'You ' : 'Opponent ';
}

function doPlay(room, seat, index) {
  const st = room.state;
  if (st.phase !== 'attack' || st.turn !== seat) return 'It is not your turn';
  if (!Number.isInteger(index) || index < 0 || index >= st.players[seat].hand.length) return 'No such card';

  const res = R.playCard(st, seat, index);
  if (st.phase === 'blastPick') {
    broadcast(room, function (s) { return s === seat ? 'Blast · pick a card to destroy' : 'Opponent played Blast'; }, effect('blast'));
    return null;
  }
  const tied = st.phase === 'shiv';
  broadcast(room, function (s) { return who(s, seat) + R.describe(res) + (tied ? ' · tied, field clears' : ''); }, effect(res.effect));
  if (tied) schedule(room, function () { runShiv(room); }, 1800);
  return null;
}

function doBlast(room, seat, position) {
  const st = room.state;
  if (st.phase !== 'blastPick' || st.turn !== seat) return 'It is not your Blast';
  if (!Number.isInteger(position) || position < 0 || position >= st.blastOrder.length) return 'No such card';

  const card = R.resolveBlast(st, position);
  broadcast(room, function (s) {
    return 'Blast destroyed ' + (s === seat ? 'their ' : 'your ') + C.name(card);
  }, function (s) {
    return { destroyed: card, byYou: s === seat, effect: 'destroy' };
  });
  return null;
}

function doShivPick(room, seat, index) {
  const st = room.state;
  if (st.phase !== 'shivPick' || st.picks[seat] !== null) return 'You cannot pick now';
  if (!Number.isInteger(index) || index < 0 || index >= st.players[seat].hand.length) return 'No such card';

  R.pickShiv(st, seat, index);
  if (st.phase === 'shivPick') {
    broadcast(room, function (s) { return s === seat ? 'Waiting for the opponent\'s pick' : 'Opponent has picked · your pick'; });
    return null;
  }
  afterShiv(room);
  return null;
}

function doRematch(room, seat) {
  if (!room.state || room.state.phase !== 'over') return 'The game is not over';
  room.rematch[seat] = true;
  if (room.rematch[0] && room.rematch[1]) startGame(room);
  else push(room, R.other(seat), { type: 'rematch' });
  return null;
}

// ---- HTTP ----

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req, done) {
  let raw = '';
  req.on('data', function (chunk) {
    raw += chunk;
    if (raw.length > 2000) req.destroy();
  });
  req.on('end', function () {
    try { done(raw ? JSON.parse(raw) : {}); } catch (e) { done(null); }
  });
}

function serveFile(urlPath, res) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(ROOT, rel));
  const allowed = file === path.join(ROOT, 'index.html') ||
    file.startsWith(path.join(ROOT, 'css') + path.sep) ||
    file.startsWith(path.join(ROOT, 'js') + path.sep) ||
    file.startsWith(path.join(ROOT, 'assets') + path.sep);
  const type = MIME[path.extname(file)];
  if (!allowed || !type) {
    res.writeHead(404);
    return res.end('Not found');
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function openStream(room, seat, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  if (room.streams[seat]) room.streams[seat].end();
  room.streams[seat] = res;
  clearTimeout(room.cleanup);

  const other = R.other(seat);
  if (room.last[seat]) push(room, seat, room.last[seat]);
  else push(room, seat, { type: 'waiting', room: room.code });
  if (room.last[other]) push(room, other, room.last[other]);

  const beat = setInterval(function () { res.write(': ping\n\n'); }, 20000);
  req.on('close', function () {
    clearInterval(beat);
    if (room.streams[seat] !== res) return;
    room.streams[seat] = null;
    push(room, other, { type: 'left' });
    if (!room.streams[other]) {
      room.cleanup = setTimeout(function () {
        clearTimeout(room.timer);
        rooms.delete(room.code);
      }, IDLE_MS);
    }
  });
}

const ACTIONS = { play: doPlay, blast: doBlast, shivPick: doShivPick, rematch: doRematch };

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const room = rooms.get(url.searchParams.get('room'));
    const seat = room ? seatOf(room, url.searchParams.get('token')) : -1;
    if (seat < 0) return sendJson(res, 404, { error: 'Room not found' });
    return openStream(room, seat, req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/create') {
    const room = createRoom();
    return sendJson(res, 200, { room: room.code, token: room.tokens[0] });
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {
    return readJson(req, function (body) {
      const room = body && rooms.get(String(body.room || '').toUpperCase());
      if (!room) return sendJson(res, 404, { error: 'Room not found' });
      if (room.tokens[1]) return sendJson(res, 409, { error: 'Room is full' });
      room.tokens[1] = crypto.randomBytes(16).toString('hex');
      sendJson(res, 200, { room: room.code, token: room.tokens[1] });
      startGame(room);
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    return readJson(req, function (body) {
      const room = body && rooms.get(body.room);
      const seat = room ? seatOf(room, body.token) : -1;
      const action = body && ACTIONS[body.type];
      if (seat < 0 || !action || !Object.prototype.hasOwnProperty.call(ACTIONS, body.type)) {
        return sendJson(res, 400, { error: 'Bad request' });
      }
      if (body.type !== 'rematch' && !room.state) return sendJson(res, 400, { error: 'The game has not started' });
      const error = action(room, seat, body.index);
      sendJson(res, error ? 400 : 200, error ? { error: error } : { ok: true });
    });
  }

  if (req.method === 'GET') return serveFile(url.pathname, res);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, function () {
  console.log('Flash Shiv server running.');
  console.log('  On this computer:  http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).forEach(function (list) {
    (list || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) console.log('  On your network:   http://' + net.address + ':' + PORT);
    });
  });
});
