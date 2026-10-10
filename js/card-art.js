// Card artwork. Every card face is one SVG drawn on a 58 x 84 grid, so it scales
// with the card. Colours come from the card's own glow colour (currentColor).
window.FS = window.FS || {};

FS.CardArt = (function () {
  'use strict';

  const C = FS.Cards;
  const CX = 29;                  // centre of the artwork
  const CY = 42;

  // Points of a regular polygon or star. skip > 1 joins every skip-th corner (a star).
  function polygon(sides, radius, skip) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i * (skip || 1)) / sides;
      points.push((CX + radius * Math.cos(a)).toFixed(1) + ',' + (CY + radius * Math.sin(a)).toFixed(1));
    }
    return points.join(' ');
  }

  // Four-point sparkle centred on x, y.
  function sparkle(x, y, r) {
    const n = r * 0.22;
    return '<path class="spark" d="M' + x + ' ' + (y - r) + ' L' + (x + n) + ' ' + (y - n) + ' L' + (x + r) + ' ' + y +
      ' L' + (x + n) + ' ' + (y + n) + ' L' + x + ' ' + (y + r) + ' L' + (x - n) + ' ' + (y + n) +
      ' L' + (x - r) + ' ' + y + ' L' + (x - n) + ' ' + (y - n) + ' Z"/>';
  }

  // The shape behind each number has as many sides or points as the card's value.
  const NUMBER_SHAPES = {
    2: '<circle class="tint" cx="22" cy="' + CY + '" r="14"/><circle class="tint" cx="36" cy="' + CY + '" r="14"/>',
    3: '<polygon class="tint" points="' + polygon(3, 24) + '" transform="translate(0 5)"/>',
    4: '<polygon class="tint" points="' + polygon(4, 22) + '"/><polygon points="' + polygon(4, 15) + '" opacity=".5"/>',
    5: '<polygon class="tint" points="' + polygon(5, 21) + '"/><polygon points="' + polygon(5, 21, 2) + '" opacity=".3"/>',
    6: '<polygon class="tint" points="' + polygon(6, 21) + '"/><polygon points="' + polygon(6, 21, 2) + '" opacity=".3"/>' +
       '<polygon points="' + polygon(6, 21, 2) + '" opacity=".3" transform="rotate(60 ' + CX + ' ' + CY + ')"/>',
    7: '<polygon class="tint" points="' + polygon(7, 23, 2) + '"/><circle cx="' + CX + '" cy="' + CY + '" r="23" opacity=".35"/>'
  };

  function corners(value) {
    return '<text class="index" x="9" y="16">' + value + '</text>' +
      '<text class="index" x="49" y="77">' + value + '</text>';
  }

  function label(text) {
    return '<text class="name" x="' + CX + '" y="77">' + text + '</text>';
  }

  function number(card) {
    return NUMBER_SHAPES[card.value] + corners(card.value) +
      '<text class="val" x="' + CX + '" y="' + (CY + 1) + '">' + card.value + '</text>';
  }

  // One feathered wing, rising from the dagger's guard to a tip at the upper left.
  const WING = '<path class="steel" d="M23 46 C17 44 9 34 6 20 C8 25 10 28 13 30 L7 29 C9 33 12 35 15 37 ' +
    'L9 36.5 C12 40 15 42 18 43 L13 43 C16 45 19 46.5 23 47 Z"/>' +
    '<path d="M21 44 C16 41 11 35 8.5 26" opacity=".6"/>';

  // The Shiv: a winged dagger catching the light.
  function shiv() {
    return WING + '<g transform="translate(58 0) scale(-1 1)">' + WING + '</g>' +
      '<polygon class="steel" points="29,7 34.5,24 33.5,47 24.5,47 23.5,24"/>' +
      '<line x1="29" y1="13" x2="29" y2="45" opacity=".7"/>' +
      '<path class="solid" d="M15 46 Q29 52 43 46 L43 50 Q29 56 15 50 Z"/>' +
      '<rect class="tint" x="26" y="53" width="6" height="11" rx="1"/>' +
      '<path d="M26 56.5 L32 55 M26 60 L32 58.5" opacity=".8"/>' +
      '<circle class="solid" cx="29" cy="67" r="3"/>' +
      sparkle(40, 11, 7) + sparkle(20, 15, 3.5) +
      '<text class="index" x="9" y="16">1</text>' +
      label('SHIV');
  }

  // Strike: a lightning bolt breaking through a ring.
  function strike() {
    return '<circle cx="' + CX + '" cy="38" r="23" opacity=".4" stroke-dasharray="5 4"/>' +
      '<path d="M8 30 L13 33 L10 37 M50 44 L45 41 L48 37" opacity=".7"/>' +
      '<polygon class="solid" points="33,11 14,40 27,40 23,63 44,31 31,31"/>' +
      label('STRIKE');
  }

  // Mirror: an oval glass with one side red and the other blue.
  function mirror() {
    return '<ellipse class="tint" cx="' + CX + '" cy="37" rx="17" ry="24"/>' +
      '<ellipse cx="' + CX + '" cy="37" rx="21" ry="28" opacity=".3"/>' +
      '<line x1="' + CX + '" y1="13" x2="' + CX + '" y2="61" stroke-dasharray="3 3" opacity=".8"/>' +
      '<polygon class="side-red" points="25,37 16,28 16,46"/>' +
      '<polygon class="side-blue" points="33,37 42,28 42,46"/>' +
      '<path d="M20 21 L24 17 M38 57 L34 53" opacity=".6"/>' +
      label('MIRROR');
  }

  // Blast: a round bomb with a lit fuse.
  function blast() {
    return '<circle class="tint" cx="26" cy="43" r="15"/>' +
      '<path d="M17 38 A11 11 0 0 1 24 32" opacity=".7"/>' +
      '<rect class="solid" x="31" y="25" width="8" height="6" rx="1" transform="rotate(35 35 28)"/>' +
      '<path d="M38 24 Q43 14 48 20"/>' +
      '<polygon class="spark" points="48,11 49.6,16.2 54.5,14 51.8,18.6 56,21.5 50.8,21.8 51,27 48,23 45,27 45.2,21.8 40,21.5 44.2,18.6 41.5,14 46.4,16.2"/>' +
      label('BLAST');
  }

  // Force: rings of power pushing outward, with a rising double chevron.
  function force() {
    return '<circle cx="' + CX + '" cy="38" r="24" opacity=".3"/>' +
      '<circle cx="' + CX + '" cy="38" r="18" opacity=".55"/>' +
      '<circle class="tint" cx="' + CX + '" cy="38" r="12"/>' +
      '<path class="bold" d="M21 38 L29 30 L37 38 M21 46 L29 38 L37 46"/>' +
      '<path d="M29 9 L29 13 M29 63 L29 67 M2 38 L6 38 M52 38 L56 38" opacity=".7"/>' +
      label('FORCE');
  }

  const SPECIALS = { strike: strike, mirror: mirror, blast: blast, force: force };

  function svg(card) {
    let art;
    if (C.isSpecial(card)) art = SPECIALS[card.type]();
    else if (C.isShiv(card)) art = shiv();
    else art = number(card);
    return '<svg class="art" viewBox="0 0 58 84" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + art + '</svg>';
  }

  return { svg: svg };
})();
