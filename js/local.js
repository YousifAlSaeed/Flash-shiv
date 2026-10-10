// Game against the computer, played entirely in the browser.
window.FS = window.FS || {};

FS.Local = (function () {
  'use strict';

  const C = FS.Cards;
  const R = FS.Rules;
  const AI = FS.AI;
  const UI = FS.UI;
  const Table = FS.Table;
  const Sound = FS.Sound;

  const YOU = 0;
  const OPP = 1;

  let state = null;
  let timer = null;

  function later(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  function wait(message) {
    Table.show(state, true, message);
  }

  function start() {
    stop();
    state = R.newGame();
    UI.setNames();
    UI.hideOverlay();
    wait('Shiv to open the round');
    later(doShiv, 900);
  }

  function stop() {
    clearTimeout(timer);
  }

  function doShiv() {
    R.shiv(state);
    afterShiv();
  }

  function afterShiv() {
    if (state.phase === 'over') return Table.finish(state, start);
    if (state.phase === 'shivPick') {
      Table.show(state, false, 'Decks are empty · pick a card from your hand to shiv', onPlay);
      return;
    }
    const score = R.total(state, YOU) + ' vs ' + R.total(state, OPP);
    Sound.effect('shiv');
    if (state.phase === 'shiv') {
      wait('Shiv tied ' + score + ' · again');
      later(doShiv, 1500);
      return;
    }
    wait('Shiv · ' + score);
    later(next, 1300);
  }

  function next() {
    if (state.phase === 'over') return Table.finish(state, start);
    if (state.phase === 'shiv') {
      Sound.effect('tie');
      wait('Totals tied · field cleared');
      later(doShiv, 1500);
      return;
    }
    if (state.turn === YOU) {
      const behind = R.total(state, OPP) - R.total(state, YOU);
      Table.show(state, false, 'Your turn · behind by ' + behind, onPlay);
    } else {
      wait('Opponent is choosing');
      later(aiMove, 1100);
    }
  }

  function aiMove() {
    const res = R.playCard(state, OPP, AI.chooseAttack(state, OPP));
    Sound.effect(res.effect);
    if (state.phase === 'blastPick') {
      wait('Opponent played Blast');
      later(function () {
        const card = R.resolveBlast(state, AI.chooseBlastTarget(state, OPP));
        Sound.effect('destroy');
        wait('Blast destroyed your ' + C.name(card));
        later(next, 1600);
      }, 1100);
      return;
    }
    wait('Opponent ' + R.describe(res));
    later(next, 1400);
  }

  function onPlay(pick) {
    if (state.phase === 'shivPick') {
      R.pickShiv(state, OPP, AI.chooseShiv(state, OPP));
      R.pickShiv(state, YOU, pick);
      afterShiv();
      return;
    }

    const res = R.playCard(state, YOU, pick);
    Sound.effect(res.effect);
    if (state.phase === 'blastPick') {
      wait('Blast · pick a card to destroy');
      UI.showBlast(state.players[OPP].hand.length, function (target) {
        const card = R.resolveBlast(state, target);
        Sound.effect('destroy');
        UI.revealBlast(card);
        wait('Blast destroyed their ' + C.name(card));
        later(function () {
          UI.hideOverlay();
          next();
        }, 1500);
      });
      return;
    }
    wait('You ' + R.describe(res));
    later(next, 1100);
  }

  return { start: start, stop: stop };
})();
