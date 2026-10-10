// Sound effects, generated in the browser with the Web Audio API (no audio files).
window.FS = window.FS || {};

FS.Sound = (function () {
  'use strict';

  let ac = null;
  let master = null;
  const FULL = 0.6;               // master gain at volume 100
  let volume = 100;               // 0 to 100
  try {
    const saved = localStorage.getItem('fs-sfx-volume');
    if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) volume = Number(saved);
  } catch (e) { /* storage unavailable */ }

  function context() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = FULL * volume / 100;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  // Volume envelope: quick rise to peak, then fade out by the end.
  function envelope(t, dur, peak, attack) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    return g;
  }

  // A pitched tone gliding from f0 to f1.
  function tone(type, f0, f1, t, dur, peak, attack) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    osc.connect(envelope(t, dur, peak, attack));
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  // Filtered noise, with the filter sweeping from f0 to f1.
  function noise(filterType, f0, f1, t, dur, peak, attack, q) {
    const length = Math.ceil(ac.sampleRate * (dur + 0.05));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q || 0.7;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(filter);
    filter.connect(envelope(t, dur, peak, attack));
    src.start(t);
    src.stop(t + dur + 0.05);
    return filter;
  }

  const SOUNDS = {
    // Soft tap of a card landing.
    card: function (t) {
      noise('lowpass', 2400, 600, t, 0.07, 0.5);
      tone('sine', 320, 180, t, 0.09, 0.25);
    },

    // Blade ring for the opening face-off and the Shiv card.
    shiv: function (t) {
      noise('bandpass', 5200, 7800, t, 0.3, 0.45, 0.004, 9);
      tone('sine', 2500, 3400, t, 0.35, 0.16);
      tone('triangle', 3760, 5100, t + 0.02, 0.28, 0.08);
    },

    // Lightning: sharp crack, crackle, a falling zap and rolling thunder.
    strike: function (t) {
      noise('highpass', 1800, 1800, t, 0.2, 0.9, 0.002);
      tone('sawtooth', 2400, 60, t, 0.24, 0.22, 0.002);
      for (let i = 0; i < 6; i++) {
        const at = t + 0.03 + Math.random() * 0.36;
        noise('bandpass', 2500 + Math.random() * 4500, 3000, at, 0.04 + Math.random() * 0.05, 0.5, 0.002, 2);
      }
      noise('lowpass', 260, 55, t + 0.06, 1.4, 0.75, 0.04);
    },

    // Magic: a rising shimmer of chimes with a falling echo.
    mirror: function (t) {
      const notes = [880, 1108.7, 1318.5, 1760, 2217.5, 2637];
      notes.forEach(function (f, i) {
        tone('sine', f, f * 1.004, t + i * 0.065, 0.7, 0.2, 0.01);
        tone('triangle', f * 2, f * 2.01, t + i * 0.065, 0.35, 0.05, 0.01);
      });
      notes.slice().reverse().forEach(function (f, i) {
        tone('sine', f, f, t + 0.5 + i * 0.07, 0.6, 0.07, 0.02);
      });
      noise('bandpass', 5000, 9500, t, 1.0, 0.08, 0.3, 5);
    },

    // Bomb: click, deep thump, roar and falling debris.
    blast: function (t) {
      noise('highpass', 2500, 2500, t, 0.05, 0.6, 0.001);
      tone('sine', 170, 28, t, 1.0, 1.0, 0.004);
      tone('triangle', 90, 30, t, 0.6, 0.5, 0.004);
      noise('lowpass', 1400, 70, t, 1.1, 0.85, 0.006);
      for (let i = 0; i < 4; i++) {
        noise('bandpass', 500 + Math.random() * 900, 300, t + 0.25 + Math.random() * 0.5, 0.12, 0.14, 0.005, 3);
      }
    },

    // Force: a deep, swelling push of air with a trembling hum beneath it.
    force: function (t) {
      const dur = 1.9;
      const wind = noise('bandpass', 140, 700, t, dur, 0.6, 0.7, 1.3);
      wind.frequency.cancelScheduledValues(t);
      wind.frequency.setValueAtTime(140, t);
      wind.frequency.exponentialRampToValueAtTime(720, t + 0.75);
      wind.frequency.exponentialRampToValueAtTime(110, t + dur);

      // Hum with tremolo
      const hum = ac.createOscillator();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(46, t);
      hum.frequency.exponentialRampToValueAtTime(74, t + 0.8);
      hum.frequency.exponentialRampToValueAtTime(40, t + dur);
      const tremolo = ac.createGain();
      tremolo.gain.value = 0.7;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 8;
      const depth = ac.createGain();
      depth.gain.value = 0.3;
      lfo.connect(depth);
      depth.connect(tremolo.gain);
      hum.connect(tremolo);
      tremolo.connect(envelope(t, dur, 0.9, 0.6));
      hum.start(t);
      lfo.start(t);
      hum.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);

      tone('sawtooth', 92, 61, t, dur, 0.07, 0.7);
      tone('sine', 184, 122, t + 0.1, dur - 0.2, 0.12, 0.7);
    },

    tie: function (t) {
      tone('triangle', 660, 660, t, 0.25, 0.2, 0.01);
      tone('triangle', 495, 495, t + 0.16, 0.4, 0.2, 0.01);
    },

    win: function (t) {
      [523.3, 659.3, 784, 1046.5].forEach(function (f, i) {
        tone('triangle', f, f, t + i * 0.12, 0.5, 0.25, 0.01);
        tone('sine', f * 2, f * 2, t + i * 0.12, 0.4, 0.08, 0.01);
      });
    },

    lose: function (t) {
      [392, 349.2, 311.1, 233.1].forEach(function (f, i) {
        tone('triangle', f, f * 0.98, t + i * 0.18, 0.6, 0.22, 0.02);
      });
    }
  };

  // Which sound goes with each thing a played card can do.
  const EFFECT_SOUND = {
    add: 'card', one: 'card', blast: 'card',
    unreverse: 'shiv', shiv: 'shiv',
    strike: 'strike', mirror: 'mirror', double: 'force',
    destroy: 'blast', tie: 'tie'
  };

  function play(name) {
    if (volume === 0 || !SOUNDS[name]) return;
    const c = context();
    if (c) SOUNDS[name](c.currentTime + 0.02);
  }

  function effect(name) {
    play(EFFECT_SOUND[name]);
  }

  function setVolume(value) {
    volume = Math.max(0, Math.min(100, Math.round(value)));
    try { localStorage.setItem('fs-sfx-volume', String(volume)); } catch (e) { /* storage unavailable */ }
    if (master) master.gain.value = FULL * volume / 100;
  }

  function getVolume() {
    return volume;
  }

  return { play: play, effect: effect, setVolume: setVolume, getVolume: getVolume, context: context };
})();
