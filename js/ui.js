// Rendering. Reads game state and draws it; holds no game logic.
window.FS = window.FS || {};

FS.UI = (function () {
  'use strict';

  const C = FS.Cards;
  const R = FS.Rules;

  const $ = function (id) { return document.getElementById(id); };

  function cardEl(card, tag) {
    const el = document.createElement(tag || 'div');
    el.className = 'card ' + card.type + (C.isSpecial(card) ? '' : ' n' + card.value);
    el.innerHTML = FS.CardArt.svg(card);
    el.setAttribute('aria-label', C.name(card));
    return el;
  }

  function backEl(small) {
    const el = document.createElement('div');
    el.className = 'card back' + (small ? ' small' : '');
    return el;
  }

  function pileItemEl(item) {
    const el = cardEl(item.card);
    if (item.reversed) el.classList.add('reversed');
    let badge = '';
    if (item.kind === 'double') badge = '×2';
    else if (C.isSpecial(item.card)) badge = '+1';
    if (badge) el.insertAdjacentHTML('beforeend', '<span class="badge">' + badge + '</span>');
    return el;
  }

  // Overlaps the cards once a pile is too long for its half of the field.
  function fitPile(pileEl, reverse) {
    const cards = pileEl.children;
    if (!cards.length) return;
    const width = cards[0].offsetWidth;
    const gap = 6;
    let step = width + gap;
    if (cards.length > 1) step = Math.min(step, (pileEl.clientWidth - width) / (cards.length - 1));
    for (let i = 1; i < cards.length; i++) {
      cards[i].style[reverse ? 'marginRight' : 'marginLeft'] = (step - width) + 'px';
    }
  }

  function renderPile(pileEl, pile, reverse) {
    pileEl.innerHTML = '';
    pile.forEach(function (item) { pileEl.appendChild(pileItemEl(item)); });
    fitPile(pileEl, reverse);
  }

  // opts: { selected, canPlay, onCard, onPlayCard }
  function render(state, opts) {
    const you = state.players[0];
    const opp = state.players[1];

    const oppHand = $('opp-hand');
    oppHand.innerHTML = '';
    opp.hand.forEach(function () { oppHand.appendChild(backEl(true)); });

    $('opp-deck-count').textContent = 'DECK ' + opp.deck.length;
    $('you-deck-count').textContent = 'DECK ' + you.deck.length;
    $('opp-deck').classList.toggle('empty', opp.deck.length === 0);
    $('you-deck').classList.toggle('empty', you.deck.length === 0);

    renderPile($('opp-pile'), opp.pile, true);
    renderPile($('you-pile'), you.pile, false);

    const a = R.total(state, 0);
    const b = R.total(state, 1);
    $('you-total').textContent = a;
    $('opp-total').textContent = b;
    $('you-total').parentElement.classList.toggle('leading', a > b);
    $('opp-total').parentElement.classList.toggle('leading', b > a);

    const hand = $('you-hand');
    hand.innerHTML = '';
    you.hand.forEach(function (card, i) {
      const el = cardEl(card, 'button');
      el.type = 'button';
      el.disabled = !opts.canPlay;
      if (opts.selected === i) el.classList.add('selected');
      el.addEventListener('click', function () { opts.onCard(i); });
      el.addEventListener('dblclick', function () { opts.onPlayCard(i); });
      hand.appendChild(el);
    });

    $('btn-play').disabled = !opts.canPlay || opts.selected === null;
  }

  function status(text) {
    $('status').textContent = text;
  }

  function hint(text) {
    $('hint').textContent = text;
  }

  function showOverlay(html) {
    $('overlay-box').innerHTML = html;
    $('overlay').hidden = false;
  }

  function hideOverlay() {
    $('overlay').hidden = true;
  }

  // Shows the opponent's shuffled hand face-down and reports which card was picked.
  function showBlast(count, onPick) {
    showOverlay('<h2>BLAST</h2><p>Pick one of the opponent\'s cards to destroy</p><div class="row" id="blast-row"></div>');
    const row = $('blast-row');
    for (let i = 0; i < count; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'card back';
      el.setAttribute('aria-label', 'Hidden card ' + (i + 1));
      el.addEventListener('click', function () { onPick(i); });
      row.appendChild(el);
    }
  }

  function revealBlast(card) {
    showOverlay('<h2>DESTROYED</h2><p>The opponent loses this card</p><div class="row" id="blast-row"></div>');
    $('blast-row').appendChild(cardEl(card));
  }

  function showResult(title, reason, youTotal, oppTotal, onAgain) {
    showOverlay(
      '<h2>' + title + '</h2><p>' + reason + '</p>' +
      '<div class="score"><div>' + youTotal + '<span>YOU</span></div><div>' + oppTotal + '<span>OPPONENT</span></div></div>' +
      '<button id="btn-again" class="primary" type="button">PLAY AGAIN</button>' +
      '<p id="overlay-note" class="note"></p>'
    );
    $('btn-again').addEventListener('click', onAgain);
  }

  // Small line of text under the buttons of the open overlay.
  function note(text) {
    const el = $('overlay-note');
    if (el) el.textContent = text;
  }

  // opts: { error, onComputer, onCreate, onJoin(code) }
  function showMenu(opts) {
    showOverlay(
      '<img class="menu-logo" src="assets/badge.svg" alt="">' +
      '<h2>FLASH<span class="hot">//</span>SHIV</h2><p>Choose how to play</p>' +
      '<div class="menu">' +
      '<button id="menu-computer" class="primary" type="button">VS COMPUTER</button>' +
      '<button id="menu-create" class="primary" type="button">CREATE ONLINE ROOM</button>' +
      '<form id="menu-join" class="join">' +
      '<input id="menu-code" type="text" maxlength="4" placeholder="CODE" autocomplete="off" aria-label="Room code">' +
      '<button class="primary" type="submit">JOIN ROOM</button>' +
      '</form></div>' +
      '<p id="overlay-note" class="note"></p>'
    );
    note(opts.error || '');
    $('menu-computer').addEventListener('click', opts.onComputer);
    $('menu-create').addEventListener('click', opts.onCreate);
    $('menu-join').addEventListener('submit', function (e) {
      e.preventDefault();
      opts.onJoin($('menu-code').value);
    });
  }

  function showWaiting(code, link) {
    showOverlay(
      '<h2>ROOM <span class="hot">' + code + '</span></h2>' +
      '<p>Waiting for an opponent. Give them this code, or send them the link.</p>' +
      '<div class="menu"><input id="invite-link" type="text" readonly aria-label="Invite link">' +
      '<button id="invite-copy" class="primary" type="button">COPY LINK</button></div>' +
      '<p id="overlay-note" class="note"></p>'
    );
    $('invite-link').value = link;
    $('invite-copy').addEventListener('click', function () {
      $('invite-link').select();
      const done = function () { note('Link copied'); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
  }

  function showRules() {
    showOverlay(
      '<div class="rules"><h2>HOW TO PLAY</h2><ul>' +
      '<li>Each round opens with a <b>shiv</b>: both players flip a card from their deck. Special cards count as 1 in a shiv.</li>' +
      '<li>The player with the <b>lower total</b> attacks by playing a card from their hand. The attack must push their total above the opponent\'s.</li>' +
      '<li>If the totals become <b>equal</b>, the field is cleared and both players shiv again.</li>' +
      '<li>If your attack leaves you <b>below</b> the opponent, you lose. If you have no cards on your turn, you lose.</li>' +
      '<li><b>Foul:</b> you lose if your last card is a Strike, Mirror, Blast, or Force.</li>' +
      '<li><b>Strike</b> cancels the last card your opponent played. The card stays on the table, but its value is no longer counted.</li>' +
      '<li><b>Shiv (1)</b> brings back your cancelled card, so its value counts again. If you have no cancelled card, it adds 1 to your total.</li>' +
      '<li>If you play any other card while your card is cancelled, the new card takes its place.</li>' +
      '<li><b>Mirror</b> swaps the two piles.</li>' +
      '<li><b>Blast</b> destroys one hidden card from the opponent\'s hand, then you attack again.</li>' +
      '<li><b>Force</b> doubles your total. A Strike can cancel it.</li>' +
      '</ul><div class="center"><button id="btn-close" class="primary" type="button">CLOSE</button></div></div>'
    );
    $('btn-close').addEventListener('click', hideOverlay);
  }

  return {
    render: render,
    status: status,
    hint: hint,
    hideOverlay: hideOverlay,
    showBlast: showBlast,
    revealBlast: revealBlast,
    showResult: showResult,
    showMenu: showMenu,
    showWaiting: showWaiting,
    note: note,
    showRules: showRules
  };
})();
