// Card definitions and deck building.
window.FS = window.FS || {};

FS.Cards = (function () {
  'use strict';

  // 34 cards in the full deck; each game deals 32 of them.
  const NUMBER_COUNTS = { 1: 2, 2: 5, 3: 5, 4: 5, 5: 4, 6: 3, 7: 2 };
  const SPECIALS = ['strike', 'mirror', 'blast', 'force'];
  const SPECIAL_COUNT = 2;
  const NAMES = { strike: 'Strike', mirror: 'Mirror', blast: 'Blast', force: 'Force' };

  function buildDeck() {
    const deck = [];
    let id = 0;
    Object.keys(NUMBER_COUNTS).forEach(function (v) {
      for (let i = 0; i < NUMBER_COUNTS[v]; i++) deck.push({ id: id++, type: 'num', value: Number(v) });
    });
    SPECIALS.forEach(function (type) {
      for (let i = 0; i < SPECIAL_COUNT; i++) deck.push({ id: id++, type: type, value: 1 });
    });
    return deck;
  }

  function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = cards[i];
      cards[i] = cards[j];
      cards[j] = t;
    }
    return cards;
  }

  function isSpecial(card) {
    return card.type !== 'num';
  }

  function isShiv(card) {
    return card.type === 'num' && card.value === 1;
  }

  // Value of a card when it is played in a shiv (face-off).
  function shivValue(card) {
    return isSpecial(card) ? 1 : card.value;
  }

  function name(card) {
    if (isShiv(card)) return 'Shiv';
    return isSpecial(card) ? NAMES[card.type] : String(card.value);
  }

  // Numbers ascending, then specials grouped by type.
  function sortHand(hand) {
    const order = function (c) {
      return isSpecial(c) ? 10 + SPECIALS.indexOf(c.type) : c.value;
    };
    return hand.sort(function (a, b) { return order(a) - order(b); });
  }

  return {
    buildDeck: buildDeck,
    shuffle: shuffle,
    isSpecial: isSpecial,
    isShiv: isShiv,
    shivValue: shivValue,
    name: name,
    sortHand: sortHand
  };
})();
