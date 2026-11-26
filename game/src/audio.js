// audio.js — every sound is synthesised with WebAudio: no audio files, no
// network, nothing to load. The engine is a detuned sawtooth pair through a
// low-pass filter, the wind is looped filtered noise, and the chimes and
// thuds are short envelopes. Everything starts on the first user gesture,
// so browsers' autoplay rules never bite.
(function () {
  'use strict';
  var FG = window.FG;

  var ctx = null, master = null;
  var engineOsc1 = null, engineOsc2 = null, engineFilter = null, engineGain = null;
  var windSrc = null, windGain = null, windFilter = null;
  var enabled = true;
  var started = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function startEngine() {
    if (!ctx || engineOsc1) return;
    try {
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.detune.value = 9;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();

      // Wind: a looped noise buffer through a band-pass filter.
      var len = ctx.sampleRate * 2;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
    } catch (e) {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  // Call from the first click / keypress.
  function unlock() {
    if (!enabled) return;
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) {
      started = true;
      startEngine();
    }
  }

  // Per-frame: engine pitch follows throttle, wind follows airspeed.
  function update(throttle, speed01, airborne) {
    if (!ctx || !engineOsc1 || !enabled) return;
    var t = ctx.currentTime;
    var freq = 52 + throttle * 68;
    engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(freq * 1.5, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.09 : 0.03 + throttle * 0.06, t, 0.1);
    windGain.gain.setTargetAtTime(airborne ? speed01 * 0.11 : 0, t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speed01 * 900, t, 0.15);
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || !enabled) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.22, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  function chime() { blip(880, 0.35, 'sine', 0.25); setTimeout(function () { blip(1318, 0.5, 'sine', 0.22); }, 90); }
  function thud() { blip(70, 0.3, 'triangle', 0.5); }
  function crashSound() {
    if (!ctx || !enabled) return;
    try {
      var len = ctx.sampleRate * 0.6;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = ctx.createBufferSource();
      s.buffer = buf;
      var g = ctx.createGain();
      g.gain.value = 0.5;
      s.connect(g); g.connect(master);
      s.start();
    } catch (e) { /* ignore */ }
  }

  function setEnabled(v) { enabled = v; if (!v && ctx && engineGain) engineGain.gain.value = 0; }

  FG.Audio = {
    unlock: unlock,
    update: update,
    chime: chime,
    thud: thud,
    crashSound: crashSound,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; }
  };
})();
