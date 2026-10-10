// Tense track: a low drone, trembling pad chords, a driving bass pulse, a heartbeat drum,
// an echoing arpeggio and a bell melody, with a riser into each new section.
(function () {
  'use strict';

  const BPM = 100;
  const STEP = 60 / BPM / 4;
  const STEPS_PER_BAR = 16;
  const BAR = STEP * STEPS_PER_BAR;
  const DRONE = 33;               // low A held under everything

  // Am, Bb, Dm, E: the flattened second (Bb) and the major fifth chord (E) give the unease.
  // root = bass note, tones = pad and arpeggio notes, bells = [step, note] melody (MIDI numbers).
  const CHORDS = [
    { root: 45, tones: [57, 60, 64], bells: [[0, 76], [6, 77], [8, 76], [12, 72]] },
    { root: 46, tones: [58, 62, 65], bells: [[0, 74], [8, 77], [12, 70]] },
    { root: 38, tones: [57, 62, 65], bells: [[0, 69], [4, 74], [8, 77], [12, 81]] },
    { root: 40, tones: [56, 59, 64], bells: [[0, 80], [6, 77], [8, 76], [12, 68]] }
  ];
  const ARP_A = [0, 2, 1, 2, 3, 2, 1, 2];
  const ARP_B = [3, 2, 4, 2, 3, 1, 4, 0];

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function create(ac, out) {
    // Long echo for the arpeggio and bells
    const echo = ac.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const feedback = ac.createGain();
    feedback.gain.value = 0.45;
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(out);

    // The pad passes through a tremolo so the chords shiver like tense strings.
    const padBus = ac.createGain();
    padBus.gain.value = 0.7;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 6.5;
    const depth = ac.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth);
    depth.connect(padBus.gain);
    lfo.start();
    padBus.connect(out);

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
      return osc;
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

    function drone(t) {
      const dur = BAR * 1.2;
      voice('sine', freq(DRONE), t, dur, 0.2, 1.0, 200);
      voice('sawtooth', freq(DRONE + 12), t, dur, 0.035, 1.2, 260).detune.value = 9;
      voice('sine', freq(DRONE + 19), t, dur, 0.04, 1.2, 400);
    }

    function pad(chord, t) {
      const dur = BAR * 1.15;
      chord.tones.forEach(function (note) {
        voice('sawtooth', freq(note), t, dur, 0.05, 0.7, 1100, padBus).detune.value = -9;
        voice('sawtooth', freq(note), t, dur, 0.05, 0.7, 1100, padBus).detune.value = 9;
      });
    }

    function bass(chord, t, accent) {
      const note = chord.root + (accent ? 12 : 0);
      voice('sawtooth', freq(note), t, STEP * 1.7, accent ? 0.13 : 0.16, 0.006, accent ? 620 : 360);
      voice('sine', freq(chord.root - 12), t, STEP * 1.7, 0.16, 0.006, 200);
    }

    function arp(chord, index, t, bright) {
      // Index 3 and 4 reach into the next octave.
      const tones = chord.tones;
      const note = (index < 3 ? tones[index] : tones[index - 3] + 12) + 12;
      const cutoff = bright ? 3400 : 1700;
      voice('triangle', freq(note), t, STEP * 2, 0.08, 0.006, cutoff, echo);
      voice('triangle', freq(note), t, STEP * 2, 0.06, 0.006, cutoff);
    }

    // Bell: a pure tone with out-of-tune overtones, ringing into the echo.
    function bell(note, t) {
      const f = freq(note);
      voice('sine', f, t, 1.8, 0.11, 0.004, 8000, echo);
      voice('sine', f, t, 1.8, 0.09, 0.004, 8000);
      voice('sine', f * 2.76, t, 0.9, 0.035, 0.004, 9000);
      voice('sine', f * 5.4, t, 0.35, 0.015, 0.004, 12000);
    }

    function kick(t, peak) {
      const osc = ac.createOscillator();
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.14);
      const g = ac.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.35);
    }

    function hat(t, peak) {
      noise('highpass', 7500, 7500, t, 0.05, 0.002, peak);
    }

    // Rising rush of air through the last bar of a section.
    function riser(t) {
      noise('bandpass', 350, 6500, t, BAR, BAR * 0.96, 0.16, 4);
      voice('sawtooth', freq(69), t, BAR, 0.03, BAR * 0.95, 2500).frequency.exponentialRampToValueAtTime(freq(81), t + BAR);
    }

    // Deep hit that opens a section.
    function boom(t) {
      const osc = voice('sine', 70, t, 2.2, 0.5, 0.01, 300);
      osc.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      noise('lowpass', 900, 90, t, 1.6, 0.01, 0.2);
    }

    function schedule(n, t) {
      const bar = Math.floor(n / STEPS_PER_BAR);
      const pos = n % STEPS_PER_BAR;
      const chord = CHORDS[bar % CHORDS.length];
      const section = Math.floor(bar / 4) % 4;   // 16-bar cycle in four 4-bar sections

      if (pos === 0) {
        drone(t);
        pad(chord, t);
        if (bar % 4 === 0 && n > 0) boom(t);
        if (bar % 4 === 3) riser(t);
      }

      // Heartbeat: two close beats, doubled once the music is in full flow.
      if (pos === 0 || pos === 3) kick(t, pos === 0 ? 0.5 : 0.34);
      if (section >= 2 && (pos === 8 || pos === 11)) kick(t, pos === 8 ? 0.42 : 0.3);

      // Section 0 is the opening: drone, pad, heartbeat and a few bells.
      if (section === 0) {
        if (pos === 0) bell(chord.bells[0][1], t);
        return;
      }

      if (pos % 2 === 0) {
        bass(chord, t, pos === 6 || pos === 14);
        const pattern = section === 3 ? ARP_B : ARP_A;
        arp(chord, pattern[pos / 2], t, section === 3);
      }
      hat(t, pos % 4 === 2 ? 0.06 : 0.022);

      if (section >= 2) {
        chord.bells.forEach(function (b) {
          if (b[0] === pos) bell(b[1] + (section === 3 ? 12 : 0), t);
        });
      }
    }

    function dispose() {
      lfo.stop();
      echo.disconnect();
      padBus.disconnect();
    }

    return { schedule: schedule, dispose: dispose };
  }

  FS.Music.register('tense', { label: 'TENSE', bpm: BPM, create: create });
})();
