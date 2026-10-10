// Background music player. The tracks themselves live in music-chill.js, music-tense.js
// and music-epic.js; each one registers here and is generated live with the Web Audio API.
window.FS = window.FS || {};

FS.Music = (function () {
  'use strict';

  const LOOKAHEAD = 1.2;          // seconds scheduled ahead, so a throttled tab keeps playing
  const FULL = 0.2;               // output gain at volume 100
  const DEFAULT_TRACK = 'tense';

  const tracks = {};
  let ac = null;
  let out = null;
  let playing = null;             // { bus, stepLength, schedule, dispose }
  let interval = null;
  let nextTime = 0;
  let step = 0;
  let enabled = true;
  let volume = 100;               // 0 to 100
  let trackName = DEFAULT_TRACK;
  try {
    const saved = localStorage.getItem('fs-music-volume');
    if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) volume = Number(saved);
    enabled = localStorage.getItem('fs-music') !== '0';
    trackName = localStorage.getItem('fs-track') || DEFAULT_TRACK;
  } catch (e) { /* storage unavailable */ }

  // A track is { label, bpm, create(ac, out) } where create returns
  // { schedule(stepNumber, time), dispose() }. Steps are sixteenth notes.
  function register(name, track) {
    tracks[name] = track;
  }

  function currentName() {
    return tracks[trackName] ? trackName : Object.keys(tracks)[0];
  }

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function tick() {
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      playing.schedule(step, nextTime);
      step++;
      nextTime += playing.stepLength;
    }
  }

  function begin() {
    const track = tracks[currentName()];
    const bus = ac.createGain();
    bus.gain.setValueAtTime(0, ac.currentTime);
    bus.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
    bus.connect(out);
    const voices = track.create(ac, bus);
    playing = { bus: bus, stepLength: 60 / track.bpm / 4, schedule: voices.schedule, dispose: voices.dispose };
    step = 0;
    nextTime = ac.currentTime + 0.1;
    tick();
    interval = setInterval(tick, 200);
  }

  // Fades the current track out, then releases it once its scheduled notes have passed.
  function end() {
    clearInterval(interval);
    interval = null;
    const old = playing;
    playing = null;
    old.bus.gain.cancelScheduledValues(ac.currentTime);
    old.bus.gain.setValueAtTime(old.bus.gain.value, ac.currentTime);
    old.bus.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
    setTimeout(function () {
      if (old.dispose) old.dispose();
      old.bus.disconnect();
    }, 3000);
  }

  // Starts the music if it is switched on. Must be called after a click or key press.
  function start() {
    if (!enabled || interval) return;
    ac = FS.Sound.context();
    if (!ac) return;
    if (!out) {
      out = ac.createGain();
      out.gain.value = FULL * volume / 100;
      out.connect(ac.destination);
    }
    begin();
  }

  function stop() {
    if (interval) end();
  }

  function toggle() {
    enabled = !enabled;
    save('fs-music', enabled ? '1' : '0');
    if (enabled) start();
    else stop();
    return enabled;
  }

  // Switches to the next registered track, restarting the music if it is playing.
  function nextTrack() {
    const names = Object.keys(tracks);
    trackName = names[(names.indexOf(currentName()) + 1) % names.length];
    save('fs-track', trackName);
    if (interval) {
      end();
      begin();
    }
    return trackName;
  }

  function setVolume(value) {
    volume = Math.max(0, Math.min(100, Math.round(value)));
    save('fs-music-volume', String(volume));
    if (out) out.gain.value = FULL * volume / 100;
  }

  function getVolume() {
    return volume;
  }

  function isEnabled() {
    return enabled;
  }

  function trackLabel() {
    return tracks[currentName()].label;
  }

  return {
    register: register,
    start: start,
    stop: stop,
    toggle: toggle,
    setVolume: setVolume,
    getVolume: getVolume,
    nextTrack: nextTrack,
    isEnabled: isEnabled,
    trackLabel: trackLabel
  };
})();
