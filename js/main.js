// Start-up: the menu and switching between computer and online games.
(function () {
  'use strict';

  const UI = FS.UI;
  const Table = FS.Table;
  const Local = FS.Local;
  const Online = FS.Online;

  function stopAll() {
    Local.stop();
    Online.stop();
  }

  // The player's name for online games, remembered between visits.
  function savedName() {
    try { return localStorage.getItem('fs-name') || ''; } catch (e) { return ''; }
  }

  function keepName(name) {
    const clean = name.trim().slice(0, 16);
    try { localStorage.setItem('fs-name', clean); } catch (e) { /* storage unavailable */ }
    return clean;
  }

  // Invite links ask for a name first, then join the room.
  function invite(code, error) {
    UI.showNamePrompt(code, savedName(), error, function (typed) {
      const name = keepName(typed);
      if (!name) return invite(code, 'Enter your name to join.');
      stopAll();
      Table.reset('Joining room');
      Online.join(code, name, menu);
    });
  }

  function menu(error) {
    UI.showMenu({
      error: error,
      name: savedName(),
      onComputer: function () {
        stopAll();
        Local.start();
      },
      onCreate: function (typed) {
        const name = keepName(typed);
        if (!name) return menu('Enter your name to play online.');
        stopAll();
        Table.reset('Creating a room');
        Online.create(name, menu);
      },
      onJoin: function (code, typed) {
        const name = keepName(typed);
        if (!name) return menu('Enter your name to play online.');
        if (!code.trim()) return menu('Enter a room code.');
        stopAll();
        Table.reset('Joining room');
        Online.join(code, name, menu);
      }
    });
  }

  // Settings: music and SFX volume meters (0 to 100 in steps of 1),
  // the music on/off toggle and the track toggle.
  const settings = document.getElementById('settings');
  const musicMeter = document.getElementById('vol-music');
  const sfxMeter = document.getElementById('vol-sfx');
  const musicButton = document.getElementById('btn-music');
  const trackButton = document.getElementById('btn-track');

  const showSettings = function () {
    musicMeter.value = FS.Music.getVolume();
    sfxMeter.value = FS.Sound.getVolume();
    document.getElementById('vol-music-value').textContent = FS.Music.getVolume();
    document.getElementById('vol-sfx-value').textContent = FS.Sound.getVolume();
    musicButton.textContent = 'MUSIC: ' + (FS.Music.isEnabled() ? 'ON' : 'OFF');
    trackButton.textContent = 'TRACK: ' + FS.Music.trackLabel();
  };

  musicMeter.addEventListener('input', function () {
    FS.Music.setVolume(Number(musicMeter.value));
    showSettings();
  });
  sfxMeter.addEventListener('input', function () {
    FS.Sound.setVolume(Number(sfxMeter.value));
    showSettings();
  });
  // A sample sound when the SFX meter is released, to hear the new level.
  sfxMeter.addEventListener('change', function () { FS.Sound.play('card'); });
  musicButton.addEventListener('click', function () {
    FS.Music.toggle();
    showSettings();
  });
  trackButton.addEventListener('click', function () {
    FS.Music.nextTrack();
    showSettings();
  });

  document.getElementById('btn-settings').addEventListener('click', function () {
    showSettings();
    settings.hidden = false;
  });
  document.getElementById('btn-settings-close').addEventListener('click', function () { settings.hidden = true; });
  settings.addEventListener('click', function (e) { if (e.target === settings) settings.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') settings.hidden = true; });

  // Browsers only allow audio after the first click, so the music starts then.
  document.addEventListener('pointerdown', function () { FS.Music.start(); }, { once: true });

  document.getElementById('btn-menu').addEventListener('click', function () { menu(); });
  document.getElementById('btn-rules').addEventListener('click', function () { UI.showRules(); });

  Table.reset('');

  // An invite link (?room=CODE) joins that room straight away.
  const invited = new URLSearchParams(location.search).get('room');
  if (invited) {
    history.replaceState(null, '', location.pathname);
    invite(invited.trim().toUpperCase().slice(0, 4));
  } else {
    menu();
  }
})();
