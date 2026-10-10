// Epic track: built with the techniques modern film scores are known for.
// One simple four-chord loop repeats while layers stack on top of it: a ticking clock,
// an organ-like pad, sparse piano, a driving string ostinato with a 3+3+2 accent,
// low cello, big drums, deep brass blasts and a slow horn melody. It builds for
// 28 bars to a climax, then drops back to piano and clock before starting again.
(function () {
  'use strict';

  const BPM = 96;
  const STEP = 60 / BPM / 4;
  const STEPS_PER_BAR = 16;
  const BAR = STEP * STEPS_PER_BAR;
  const SECTIONS = 8;             // 32-bar cycle in eight 4-bar sections

  // D minor: Dm, Bb, F, C. root = bass note, tones = chord notes,
  // horn = the melody's two long notes for that bar (MIDI numbers).
  const CHORDS = [
    { root: 38, tones: [62, 65, 69], horn: [74, 77] },
    { root: 34, tones: [62, 65, 70], horn: [77, 74] },
    { root: 41, tones: [60, 65, 69], horn: [72, 69] },
    { root: 36, tones: [60, 64, 67], horn: [67, 76] }
  ];
  const OSTINATO = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2];
  const ACCENTS = [0, 3, 6, 8, 11, 14];        // 3+3+2, twice per bar
  const PIANO_STEPS = [0, 6, 12];

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function create(ac, out) {
    // Hall-like echo for piano and horns
    const echo = ac.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const feedback = ac.createGain();
    feedback.gain.value = 0.42;
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(out);

    const hiss = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    function voice(type, f, t, dur, peak, attack, cutoff, dest) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(filter);
      filter.connect(g);
      g.connect(dest || out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      return { osc: osc, filter: filter };
    }

    function noise(filterType, f0, f1, t, dur, peakAt, peak, q) {
      const src = ac.createBufferSource();
      src.buffer = hiss;
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = filterType;
      filter.Q.value = q || 0.7;
      filter.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + peakAt);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(out);
      src.start(t);
      src.stop(t + dur + 0.05);
    }

    // Clock: tick on the beat, a lower tock between.
    function tick(t, high) {
      noise('bandpass', high ? 4200 : 2600, high ? 4200 : 2600, t, 0.04, 0.002, 0.12, 6);
    }

    // Organ-like pad holding the chord.
    function pad(chord, t, level) {
      const dur = BAR * 1.15;
      chord.tones.forEach(function (note) {
        voice('sawtooth', freq(note - 12), t, dur, 0.035 * level, 0.8, 700).osc.detune.value = -6;
        voice('sawtooth', freq(note - 12), t, dur, 0.035 * level, 0.8, 700).osc.detune.value = 6;
        voice('sine', freq(note), t, dur, 0.03 * level, 0.8, 2000);
      });
      voice('sine', freq(chord.root), t, dur, 0.16 * level, 0.6, 300);
    }

    function piano(note, t) {
      const f = freq(note);
      voice('triangle', f, t, 1.6, 0.13, 0.005, 2600, echo);
      voice('triangle', f, t, 1.6, 0.1, 0.005, 2600);
      voice('sine', f * 2, t, 0.8, 0.03, 0.005, 5000);
    }

    // Short, bowed string note for the ostinato.
    function string(note, t, accent, level) {
      const peak = (accent ? 0.085 : 0.045) * level;
      const cutoff = accent ? 2600 : 1700;
      voice('sawtooth', freq(note), t, STEP * 1.25, peak, 0.012, cutoff).osc.detune.value = -8;
      voice('sawtooth', freq(note), t, STEP * 1.25, peak, 0.012, cutoff).osc.detune.value = 8;
    }

    function cello(chord, t) {
      voice('sawtooth', freq(chord.root + 12), t, BAR * 1.05, 0.07, 0.35, 520);
      voice('sawtooth', freq(chord.root + 19), t, BAR * 1.05, 0.035, 0.35, 520);
    }

    // Big low drum.
    function drum(t, peak) {
      const v = voice('sine', 95, t, 0.7, peak, 0.004, 400);
      v.osc.frequency.setValueAtTime(95, t);
      v.osc.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      noise('lowpass', 700, 120, t, 0.35, 0.004, peak * 0.5);
    }

    // Deep brass blast: stacked detuned saws whose filter swells open and closes.
    function brass(chord, t) {
      const dur = BAR * 1.6;
      [chord.root - 12, chord.root, chord.root + 7, chord.root + 12].forEach(function (note, i) {
        [-14, 0, 14].forEach(function (cents) {
          const v = voice('sawtooth', freq(note), t, dur, i === 3 ? 0.03 : 0.05, 0.12, 180);
          v.osc.detune.value = cents;
          v.filter.frequency.setValueAtTime(180, t);
          v.filter.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
          v.filter.frequency.exponentialRampToValueAtTime(220, t + dur);
        });
      });
    }

    // Slow horn melody: two long notes per bar.
    function horn(note, t, level) {
      const dur = BAR * 0.56;
      [-5, 5].forEach(function (cents) {
        voice('sawtooth', freq(note), t, dur, 0.05 * level, 0.25, 1000, echo).osc.detune.value = cents;
        voice('sawtooth', freq(note), t, dur, 0.05 * level, 0.25, 1000).osc.detune.value = cents;
      });
      voice('sine', freq(note), t, dur, 0.05 * level, 0.25, 3000);
    }

    // Rising rush through the last bar before the climax ends.
    function riser(t) {
      noise('bandpass', 300, 7000, t, BAR, BAR * 0.96, 0.18, 4);
      const v = voice('sawtooth', freq(62), t, BAR, 0.04, BAR * 0.95, 2400);
      v.osc.frequency.exponentialRampToValueAtTime(freq(74), t + BAR);
    }

    function schedule(n, t) {
      const bar = Math.floor(n / STEPS_PER_BAR);
      const pos = n % STEPS_PER_BAR;
      const chord = CHORDS[bar % CHORDS.length];
      const section = Math.floor(bar / 4) % SECTIONS;
      const release = section === 7;           // the quiet section after the climax

      // Clock runs through everything.
      if (pos % 4 === 0) tick(t, true);
      else if (pos % 4 === 2) tick(t, false);

      if (pos === 0) {
        pad(chord, t, release ? 0.7 : Math.min(1.3, 0.6 + section * 0.12));
        if (section >= 2 && !release) cello(chord, t);
        if (section >= 4 && !release && bar % 2 === 0) brass(chord, t);
        if (section === 6 && bar % 4 === 3) riser(t);
      }

      // Piano: from the second section, and alone again in the release.
      if ((section >= 1 && section <= 3) || release) {
        const at = PIANO_STEPS.indexOf(pos);
        if (at >= 0) piano(chord.tones[at] + 12, t);
      }
      if (release) return;

      // String ostinato: eighth notes first, then sixteenths with the 3+3+2 accent.
      if (section >= 2) {
        const sixteenths = section >= 3;
        if (sixteenths || pos % 2 === 0) {
          const index = OSTINATO[pos];
          const note = index < 3 ? chord.tones[index] : chord.tones[0] + 12;
          const level = Math.min(1.4, 0.7 + (section - 2) * 0.18);
          string(note, t, ACCENTS.indexOf(pos) >= 0, level);
          if (section >= 5) string(note + 12, t, ACCENTS.indexOf(pos) >= 0, level * 0.5);
        }
      }

      // Drums grow from one hit a bar to the full accent pattern.
      if (section === 3 && pos === 0) drum(t, 0.4);
      if (section === 4 && (pos === 0 || pos === 8 || pos === 14)) drum(t, pos === 0 ? 0.5 : 0.3);
      if (section >= 5 && ACCENTS.indexOf(pos) >= 0) drum(t, pos === 0 ? 0.55 : 0.3);

      // Horn melody over the top, doubled an octave higher at the climax.
      if (section >= 4 && (pos === 0 || pos === 8)) {
        const note = chord.horn[pos / 8];
        horn(note, t, 1);
        if (section === 6) horn(note + 12, t, 0.6);
      }
    }

    return { schedule: schedule, dispose: function () { echo.disconnect(); } };
  }

  FS.Music.register('epic', { label: 'EPIC', bpm: BPM, create: create });
})();
