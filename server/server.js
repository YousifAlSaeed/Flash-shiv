// Flash Shiv online server. No dependencies: run with `node server/server.js`.
// Serves the game files and runs each online match, so neither player's
// browser ever receives the other player's hand.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// The rules and the match flow are the same files the browser uses.
global.window = global;
require('../js/cards.js');
require('../js/rules.js');
require('../js/match.js');
const Match = global.FS.Match;

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

function push(room, seat, payload) {
  const stream = room.streams[seat];
  if (stream) stream.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function createRoom(name) {
  const room = {
    code: newCode(),
    names: [Match.cleanName(name, 'Player 1'), 'Player 2'],
    tokens: [crypto.randomBytes(16).toString('hex'), null],
    streams: [null, null],
    last: [null, null],
    match: null,
    cleanup: null
  };
  // The match hands back each seat's messages; the latest state is kept for reconnects.
  room.match = Match.create(room.names, function (seat, payload, extra, keep) {
    if (keep) room.last[seat] = payload;
    push(room, seat, Object.assign({}, payload, extra));
  });
  rooms.set(room.code, room);
  return room;
}

function seatOf(room, token) {
  const seat = room.tokens.indexOf(token);
  return token && seat >= 0 ? seat : -1;
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

  const other = seat === 0 ? 1 : 0;
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
        room.match.stop();
        rooms.delete(room.code);
      }, IDLE_MS);
    }
  });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const room = rooms.get(url.searchParams.get('room'));
    const seat = room ? seatOf(room, url.searchParams.get('token')) : -1;
    if (seat < 0) return sendJson(res, 404, { error: 'Room not found' });
    return openStream(room, seat, req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/create') {
    return readJson(req, function (body) {
      const room = createRoom(body && body.name);
      sendJson(res, 200, { room: room.code, token: room.tokens[0] });
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {
    return readJson(req, function (body) {
      const room = body && rooms.get(String(body.room || '').toUpperCase());
      if (!room) return sendJson(res, 404, { error: 'Room not found' });
      if (room.tokens[1]) return sendJson(res, 409, { error: 'Room is full' });
      room.tokens[1] = crypto.randomBytes(16).toString('hex');
      room.names[1] = Match.cleanName(body.name, 'Player 2');
      sendJson(res, 200, { room: room.code, token: room.tokens[1] });
      room.match.start();
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    return readJson(req, function (body) {
      const room = body && rooms.get(body.room);
      const seat = room ? seatOf(room, body.token) : -1;
      if (seat < 0) return sendJson(res, 400, { error: 'Bad request' });
      const error = room.match.action(seat, body.type, body.index);
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
