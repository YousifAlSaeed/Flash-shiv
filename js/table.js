// The table: shows a game state and handles card selection.
// Shared by the computer game (local.js) and the online game (online.js).
window.FS = window.FS || {};

FS.Table = (function () {
  'use strict';

  const C = FS.Cards;
  const R = FS.Rules;
  const UI = FS.UI;

  const YOU = 0;
  const OPP = 1;

  let state = emptyState();
  let selected = null;
  let busy = true;
  let playHandler = null;
  let timer = null;

  function emptyState() {
    const seat = function () { return { hand: [], deck: [], pile: [] }; };
    return { players: [seat(), seat()], phase: 'idle', turn: null };
  }

  function draw(message) {
    UI.render(state, { selected: selected, canPlay: !busy, onCard: onCard, onPlayCard: onPlayCard });
    if (message !== undefined) UI.status(message);
    UI.hint(hintText());
  }

  // Previews the selected card on a copy of the game.
  function hintText() {
    if (busy) return '';
    if (selected === null) return 'Select a card';
    const card = state.players[YOU].hand[selected];
    if (state.phase === 'shivPick') return 'Shivs as ' + C.shivValue(card);

    const sim = JSON.parse(JSON.stringify(state));
    const res = R.playCard(sim, YOU, selected);
    if (res.effect === 'blast') return 'Destroys one card in the opponent\'s hand · you attack again';

    const effects = {
      add: 'Adds ' + card.value,
      one: 'Counts as 1',
      unreverse: 'Brings back your cancelled ' + (res.target ? C.name(res.target) : 'card'),
      strike: 'Cancels their ' + (res.target ? C.name(res.target) : 'card'),
      mirror: 'Swaps the piles',
      double: 'Doubles your total'
    };
    const mine = R.total(sim, YOU);
    const theirs = R.total(sim, OPP);
    let text = effects[res.effect] + ' · ' + mine + ' vs ' + theirs;
    if (mine < theirs) text += ' · falls short, you lose';
    else if (mine === theirs) text += ' · tie, field clears';
    return text;
  }

  // Shows a state. When not busy the player may pick a card; the pick goes to onPlay.
  function show(next, isBusy, message, onPlay) {
    state = next;
    busy = isBusy;
    selected = null;
    playHandler = onPlay || null;
    draw(message);
  }

  function onCard(i) {
    if (busy) return;
    selected = selected === i ? null : i;
    draw();
  }

  function onPlayCard(i) {
    if (busy) return;
    selected = i;
    play();
  }

  function play() {
    if (busy || selected === null || !playHandler) return;
    const pick = selected;
    selected = null;
    busy = true;
    draw();
    playHandler(pick);
  }

  // Shows the result screen for a finished game (player 0 is "you").
  function finish(finalState, onAgain) {
    const won = finalState.winner === YOU;
    const reasons = {
      draw: 'No cards left to shiv with.',
      short: won ? 'The opponent\'s attack fell short.' : 'Your attack fell short.',
      empty: won ? 'The opponent ran out of cards.' : 'You ran out of cards.',
      foul: won ? 'Foul · the opponent\'s last card was a special.' : 'Foul · your last card was a special.'
    };
    const title = finalState.winner === null ? 'DRAW' : (won ? 'YOU WIN' : 'YOU LOSE');
    show(finalState, true, title);
    clearTimeout(timer);
    timer = setTimeout(function () {
      FS.Sound.play(finalState.winner === null ? 'tie' : (won ? 'win' : 'lose'));
      UI.showResult(title, reasons[finalState.reason], R.total(finalState, YOU), R.total(finalState, OPP), onAgain);
    }, 1200);
  }

  function reset(message) {
    clearTimeout(timer);
    show(emptyState(), true, message || '');
  }

  document.getElementById('btn-play').addEventListener('click', play);
  window.addEventListener('resize', function () { draw(); });

  return { show: show, finish: finish, reset: reset };
})();
