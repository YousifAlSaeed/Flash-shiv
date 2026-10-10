// Computer opponent. Looks one play ahead and spends the cheapest card that takes the lead.
window.FS = window.FS || {};

FS.AI = (function () {
  'use strict';

  const C = FS.Cards;
  const R = FS.Rules;

  const SPECIAL_COST = { strike: 6, force: 7, mirror: 8 };

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function onlySpecials(hand) {
    return hand.length > 0 && hand.every(C.isSpecial);
  }

  function chooseAttack(state, p) {
    const hand = state.players[p].hand;
    const oppHand = state.players[R.other(p)].hand;
    const wins = [];
    const ties = [];
    const losses = [];
    let blast = -1;

    hand.forEach(function (card, i) {
      if (card.type === 'blast' && oppHand.length) {
        blast = i;
        return;
      }
      const sim = clone(state);
      const res = R.playCard(sim, p, i);
      const mine = R.total(sim, p);
      const theirs = R.total(sim, R.other(p));
      const left = sim.players[p].hand;

      let cost = C.isSpecial(card) ? (SPECIAL_COST[card.type] || 5) : card.value;
      if (res.effect === 'unreverse') cost = 2;
      cost += Math.max(0, mine - theirs) * 0.25;
      // Ending up with only specials risks a foul; an empty hand cannot answer back.
      if (onlySpecials(left)) cost += 30;
      if (left.length === 0) cost += 15;

      const option = { index: i, cost: cost };
      if (mine > theirs) wins.push(option);
      else if (mine === theirs) ties.push(option);
      else losses.push(option);
    });

    const cheapest = function (list) {
      return list.sort(function (a, b) { return a.cost - b.cost; })[0].index;
    };

    if (blast >= 0 && (hand.length > 2 || !wins.length)) return blast;
    if (wins.length) return cheapest(wins);
    if (ties.length) return cheapest(ties);
    if (losses.length) return cheapest(losses);
    return blast;
  }

  function chooseBlastTarget(state, p) {
    const count = state.players[R.other(p)].hand.length;
    return Math.floor(Math.random() * count);
  }

  // Face-off from hand: shed a special when holding many, otherwise the lowest number.
  function chooseShiv(state, p) {
    const hand = state.players[p].hand;
    const specials = hand.filter(C.isSpecial).length;
    if (specials > hand.length - specials) return hand.findIndex(C.isSpecial);
    let best = -1;
    hand.forEach(function (card, i) {
      if (C.isSpecial(card)) return;
      if (best < 0 || card.value < hand[best].value) best = i;
    });
    return best < 0 ? 0 : best;
  }

  return {
    chooseAttack: chooseAttack,
    chooseBlastTarget: chooseBlastTarget,
    chooseShiv: chooseShiv
  };
})();
