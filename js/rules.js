// Game rules. Pure state changes, no DOM, so the same code can serve
// a computer opponent now and an online opponent later.
window.FS = window.FS || {};

FS.Rules = (function () {
  'use strict';

  const C = FS.Cards;
  const DEAL = 16;
  const HAND = 10;

  // Phases: 'shiv' (face-off from decks is due), 'shivPick' (face-off from hands),
  // 'attack', 'blastPick', 'over'.
  function newGame() {
    const cards = C.shuffle(C.buildDeck()).slice(0, DEAL * 2);
    const seat = function (dealt) {
      return { hand: C.sortHand(dealt.slice(0, HAND)), deck: dealt.slice(HAND), pile: [] };
    };
    return {
      players: [seat(cards.slice(0, DEAL)), seat(cards.slice(DEAL))],
      phase: 'shiv',
      turn: null,
      tied: false,
      picks: [null, null],
      winner: null,
      reason: null
    };
  }

  function other(p) {
    return p === 0 ? 1 : 0;
  }

  function top(pile) {
    return pile[pile.length - 1];
  }

  function pileTotal(pile) {
    let t = 0;
    pile.forEach(function (item) {
      if (item.reversed) return;
      if (item.kind === 'double') t *= 2;
      else t += item.value;
    });
    return t;
  }

  function total(state, p) {
    return pileTotal(state.players[p].pile);
  }

  // A new card replaces a reversed card left on top of the pile.
  function place(player, card, kind, value) {
    const t = top(player.pile);
    if (t && t.reversed) player.pile.pop();
    player.pile.push({ card: card, kind: kind, value: value, reversed: false });
  }

  function end(state, winner, reason) {
    state.phase = 'over';
    state.winner = winner;
    state.reason = reason;
  }

  // Checks made when a player is about to attack.
  function beginTurn(state) {
    const p = state.turn;
    const hand = state.players[p].hand;
    if (hand.length === 0) return end(state, other(p), 'empty');
    if (hand.length === 1 && C.isSpecial(hand[0])) return end(state, other(p), 'foul');
    state.phase = 'attack';
  }

  function afterShiv(state) {
    const a = total(state, 0);
    const b = total(state, 1);
    if (a === b) {
      state.phase = 'shiv';
      state.tied = true;
      return;
    }
    state.turn = a < b ? 0 : 1;
    beginTurn(state);
  }

  // Clears the field and runs a face-off from the decks, or asks for
  // hand picks when the decks are empty.
  function shiv(state) {
    state.tied = false;
    state.players.forEach(function (pl) { pl.pile = []; });
    const a = state.players[0];
    const b = state.players[1];
    if (a.deck.length && b.deck.length) {
      state.players.forEach(function (pl) {
        const card = pl.deck.pop();
        place(pl, card, 'value', C.shivValue(card));
      });
      return afterShiv(state);
    }
    if (!a.hand.length || !b.hand.length) return end(state, null, 'draw');
    state.phase = 'shivPick';
    state.picks = [null, null];
  }

  function pickShiv(state, p, handIndex) {
    state.picks[p] = handIndex;
    if (state.picks[0] === null || state.picks[1] === null) return;
    state.players.forEach(function (pl, i) {
      const card = pl.hand.splice(state.picks[i], 1)[0];
      place(pl, card, 'value', C.shivValue(card));
    });
    afterShiv(state);
  }

  // Decides what happens once an attack has changed the totals.
  function settle(state, p) {
    const mine = total(state, p);
    const theirs = total(state, other(p));
    if (mine < theirs) return end(state, other(p), 'short');
    if (mine === theirs) {
      state.phase = 'shiv';
      state.tied = true;
      return;
    }
    state.turn = other(p);
    beginTurn(state);
  }

  // Plays a card from hand as an attack. Returns what the card did.
  function playCard(state, p, handIndex) {
    const me = state.players[p];
    const opp = state.players[other(p)];
    const card = me.hand.splice(handIndex, 1)[0];
    const result = { card: card, effect: 'add', target: null };

    if (card.type === 'num') {
      const t = top(me.pile);
      if (C.isShiv(card) && t && t.reversed) {
        t.reversed = false;
        result.effect = 'unreverse';
        result.target = t.card;
      } else {
        place(me, card, 'value', card.value);
      }
    } else if (card.type === 'strike') {
      const t = top(opp.pile);
      if (t && !t.reversed) {
        t.reversed = true;
        result.effect = 'strike';
        result.target = t.card;
      } else {
        place(me, card, 'value', 1);
        result.effect = 'one';
      }
    } else if (card.type === 'mirror') {
      const swap = me.pile;
      me.pile = opp.pile;
      opp.pile = swap;
      result.effect = 'mirror';
    } else if (card.type === 'blast') {
      if (opp.hand.length) {
        // The picker chooses a position in a hidden, shuffled order of the hand.
        state.blastOrder = C.shuffle(opp.hand.map(function (_, i) { return i; }));
        state.phase = 'blastPick';
        result.effect = 'blast';
        return result;
      }
      place(me, card, 'value', 1);
      result.effect = 'one';
    } else if (card.type === 'force') {
      if (pileTotal(me.pile) > 0) {
        place(me, card, 'double', 0);
        result.effect = 'double';
      } else {
        place(me, card, 'value', 1);
        result.effect = 'one';
      }
    }

    settle(state, p);
    return result;
  }

  // Finishes a Blast: discards the chosen card and lets the same player attack again.
  function resolveBlast(state, targetIndex) {
    const victim = state.players[other(state.turn)];
    const card = victim.hand.splice(state.blastOrder[targetIndex], 1)[0];
    state.blastOrder = null;
    beginTurn(state);
    return card;
  }

  // Short text for what a played card did, e.g. "played Strike · 5 reversed".
  function describe(res) {
    switch (res.effect) {
      case 'unreverse': return 'used a Shiv · ' + C.name(res.target) + ' restored';
      case 'strike': return 'played Strike · ' + C.name(res.target) + ' reversed';
      case 'mirror': return 'played Mirror · piles swapped';
      case 'double': return 'played Force · total doubled';
      case 'one': return 'played ' + C.name(res.card) + ' as a 1';
      default: return 'played ' + C.name(res.card);
    }
  }

  return {
    describe: describe,
    newGame: newGame,
    other: other,
    total: total,
    shiv: shiv,
    pickShiv: pickShiv,
    playCard: playCard,
    resolveBlast: resolveBlast
  };
})();
