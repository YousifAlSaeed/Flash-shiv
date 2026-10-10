// Runs one online match between two seats: deals, applies each player's actions,
// and tells each seat what it is allowed to see. It does not know how messages travel.
// The Node server uses it for server-hosted rooms, and the room creator's browser
// uses it for direct browser-to-browser rooms.
window.FS = window.FS || {};

FS.Match = (function () {
  'use strict';

  const C = FS.Cards;
  const R = FS.Rules;

  // Player names are shown to the other player, so keep them short and plain.
  function cleanName(value, fallback) {
    const name = String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
    return name || fallback;
  }

  function hidden(count) {
    return Array.from({ length: count }, function () { return { type: 'num', value: 0, hidden: true }; });
  }

  // names: [seat 0, seat 1]. deliver(seat, payload, extra, keep) sends one seat a message:
  // extra holds one-off details (sound, a destroyed card), and keep marks a payload
  // worth re-sending to a player who reconnects.
  function create(names, deliver) {
    let state = null;
    let timer = null;
    let rematch = [false, false];

    // The state from one seat's point of view: that seat is always player 0.
    function viewFor(seat) {
      const me = state.players[seat];
      const opp = state.players[R.other(seat)];
      const rel = function (p) { return p === null ? null : (p === seat ? 0 : 1); };
      return {
        players: [
          { hand: me.hand, deck: hidden(me.deck.length), pile: me.pile },
          { hand: hidden(opp.hand.length), deck: hidden(opp.deck.length), pile: opp.pile }
        ],
        phase: state.phase,
        turn: rel(state.turn),
        tied: state.tied,
        winner: rel(state.winner),
        reason: state.reason,
        picked: state.picks[seat] !== null,
        names: [names[seat], names[R.other(seat)]]
      };
    }

    function turnNote(seat) {
      if (state.phase !== 'attack') return '';
      return state.turn === seat ? ' · your turn' : ' · ' + names[state.turn] + '\'s turn';
    }

    // Sends the current state to both seats. textFor(seat) gives each side's message.
    function broadcast(textFor, extra) {
      [0, 1].forEach(function (seat) {
        // A copy, so a payload kept for later does not change as the game moves on.
        const view = JSON.parse(JSON.stringify(viewFor(seat)));
        const payload = { type: 'state', view: view, message: textFor(seat) + turnNote(seat) };
        deliver(seat, payload, extra ? extra(seat) : null, true);
      });
    }

    // Tells both browsers which sound effect goes with this update.
    function effect(name) {
      return function () { return { effect: name }; };
    }

    function schedule(fn, ms) {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    }

    function start() {
      state = R.newGame();
      rematch = [false, false];
      broadcast(function () { return 'Shiv to open the round'; });
      schedule(runShiv, 1200);
    }

    function runShiv() {
      R.shiv(state);
      if (state.phase === 'shivPick') {
        return broadcast(function () { return 'Decks are empty · pick a card from your hand to shiv'; });
      }
      afterShiv();
    }

    function afterShiv() {
      if (state.phase === 'over') return broadcast(function () { return 'No cards left'; });
      const score = function (seat) { return R.total(state, seat) + ' vs ' + R.total(state, R.other(seat)); };
      if (state.phase === 'shiv') {
        broadcast(function (seat) { return 'Shiv tied ' + score(seat) + ' · again'; }, effect('shiv'));
        return schedule(runShiv, 1800);
      }
      broadcast(function (seat) { return 'Shiv · ' + score(seat); }, effect('shiv'));
    }

    function who(seat, actor) {
      return seat === actor ? 'You ' : names[actor] + ' ';
    }

    function validIndex(index, length) {
      return Number.isInteger(index) && index >= 0 && index < length;
    }

    function play(seat, index) {
      if (state.phase !== 'attack' || state.turn !== seat) return 'It is not your turn';
      if (!validIndex(index, state.players[seat].hand.length)) return 'No such card';

      const res = R.playCard(state, seat, index);
      if (state.phase === 'blastPick') {
        broadcast(function (s) {
          return s === seat ? 'Blast · pick a card to destroy' : names[seat] + ' played Blast';
        }, effect('blast'));
        return null;
      }
      const tied = state.phase === 'shiv';
      broadcast(function (s) {
        return who(s, seat) + R.describe(res) + (tied ? ' · tied, field clears' : '');
      }, effect(res.effect));
      if (tied) schedule(runShiv, 1800);
      return null;
    }

    function blast(seat, position) {
      if (state.phase !== 'blastPick' || state.turn !== seat) return 'It is not your Blast';
      if (!validIndex(position, state.blastOrder.length)) return 'No such card';

      const card = R.resolveBlast(state, position);
      broadcast(function (s) {
        return 'Blast destroyed ' + (s === seat ? 'their ' : 'your ') + C.name(card);
      }, function (s) {
        return { destroyed: card, byYou: s === seat, effect: 'destroy' };
      });
      return null;
    }

    function shivPick(seat, index) {
      if (state.phase !== 'shivPick' || state.picks[seat] !== null) return 'You cannot pick now';
      if (!validIndex(index, state.players[seat].hand.length)) return 'No such card';

      R.pickShiv(state, seat, index);
      if (state.phase === 'shivPick') {
        broadcast(function (s) {
          return s === seat ? 'Waiting for ' + names[R.other(seat)] + '\'s pick' : names[seat] + ' has picked · your pick';
        });
        return null;
      }
      afterShiv();
      return null;
    }

    function askRematch(seat) {
      if (state.phase !== 'over') return 'The game is not over';
      rematch[seat] = true;
      if (rematch[0] && rematch[1]) start();
      else deliver(R.other(seat), { type: 'rematch' }, null, false);
      return null;
    }

    const ACTIONS = { play: play, blast: blast, shivPick: shivPick, rematch: askRematch };

    // Applies one player's action. Returns an error message, or null when it was accepted.
    function action(seat, type, index) {
      if (!Object.prototype.hasOwnProperty.call(ACTIONS, type)) return 'Bad request';
      if (!state) return 'The game has not started';
      return ACTIONS[type](seat, index);
    }

    function stop() {
      clearTimeout(timer);
    }

    return { start: start, action: action, stop: stop };
  }

  return { create: create, cleanName: cleanName };
})();
