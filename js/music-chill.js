// Chill track: a slow, dark synth loop with pad chords, a pulsing bass,
// an echoing arpeggio and light drums.
(function () {
  'use strict';

  const BPM = 92;
  const STEP = 60 / BPM / 4;
  const STEPS_PER_BAR = 16;

  // A minor: Am, F, Dm, Em. root = bass note, tones = pad and arpeggio notes (MIDI numbers).
  const CHORDS = [
    { root: 45, tones: [57, 60, 64] },
    { root: 41, tones: [57, 60, 65] },
    { root: 38, tones: [57, 62, 65] },
    { root: 40, tones: [55, 59, 64] }
  ];
  const ARP_A = [0, 2, 1, 2, 3, 2, 1, 2];
  const ARP_B = [3, 2, 4, 2, 3, 1, 2, 0];
  const BASS_STEPS = [0, 6, 8, 11, 14];

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function create(ac, out) {
    // Echo for the arpeggio
    const echo = ac.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const feedback = ac.createGain();
    feedback.gain.value = 0.38;
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(out);

    const hiss = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
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
      return osc;
    }

    function pad(chord, t) {
      const dur = STEP * STEPS_PER_BAR * 1.15;
      chord.tones.forEach(function (note) {
        voice('sawtooth', freq(note), t, dur, 0.05, 0.9, 900).detune.value = -7;
        voice('sawtooth', freq(note), t, dur, 0.05, 0.9, 900).detune.value = 7;
      });
      voice('sine', freq(chord.root + 12), t, dur, 0.1, 0.9, 600);
    }

    function bass(chord, t) {
      voice('sawtooth', freq(chord.root), t, STEP * 2.6, 0.2, 0.01, 320);
      voice('sine', freq(chord.root - 12), t, STEP * 2.6, 0.22, 0.01, 200);
    }

    function arp(chord, index, t, bright) {
      // Index 3 and 4 reach into the next octave.
      const tones = chord.tones;
      const note = (index < 3 ? tones[index] : tones[index - 3] + 12) + 12;
      voice('triangle', freq(note), t, STEP * 2.2, 0.11, 0.008, bright ? 3200 : 1800, echo);
      voice('triangle', freq(note), t, STEP * 2.2, 0.08, 0.008, bright ? 3200 : 1800);
    }

    function kick(t) {
      const osc = ac.createOscillator();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.35);
    }

    function hat(t, peak) {
      const src = ac.createBufferSource();
      src.buffer = hiss;
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      src.connect(filter);
      filter.connect(g);
      g.connect(out);
      src.start(t);
      src.stop(t + 0.08);
    }

    function schedule(n, t) {
      const bar = Math.floor(n / STEPS_PER_BAR);
      const pos = n % STEPS_PER_BAR;
      const chord = CHORDS[bar % CHORDS.length];
      const section = Math.floor(bar / 4) % 4;   // 16-bar cycle in four 4-bar sections

      if (pos === 0) pad(chord, t);
      // Section 0 is a quiet intro: pad and arpeggio only.
      if (section > 0 && BASS_STEPS.indexOf(pos) >= 0) bass(chord, t);
      if (pos % 2 === 0) {
        const pattern = section === 3 ? ARP_B : ARP_A;
        arp(chord, pattern[pos / 2], t, section >= 2);
      }
      if (section > 0) {
        if (pos === 0 || pos === 8 || (section === 3 && pos === 11)) kick(t);
        if (pos % 4 === 2) hat(t, 0.07);
        else if (section >= 2 && pos % 2 === 1) hat(t, 0.03);
      }
    }

    return { schedule: schedule, dispose: function () { echo.disconnect(); } };
  }

  FS.Music.register('chill', { label: 'CHILL', bpm: BPM, create: create });
})();
