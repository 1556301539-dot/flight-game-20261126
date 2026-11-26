// input.js — keyboard and mouse, plus the ?shot= staging the screenshots
// use. The game is flown on the keyboard (arrows + throttle); the mouse
// works the menus and the HUD buttons. Shot mode freezes the simulation at
// a staged state so a screenshot is the same frame every time — the same
// pattern the kit's starter uses with its shots.json.
(function () {
  'use strict';
  var FG = window.FG;

  var keys = {};
  var clicks = [];      // queued {x, y} canvas clicks
  var pressed = {};     // keys pressed since last poll (edge-triggered)

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  function attach(canvas) {
    window.addEventListener('keydown', function (e) {
      var k = keyName(e);
      if (!keys[k]) pressed[k] = true;
      keys[k] = true;
      // Keep the page from scrolling on game keys.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      keys[keyName(e)] = false;
    });
    window.addEventListener('blur', function () { keys = {}; });
    canvas.addEventListener('mousedown', function (e) {
      var r = canvas.getBoundingClientRect();
      clicks.push({ x: e.clientX - r.left, y: e.clientY - r.top });
    });
  }

  function isDown() {
    for (var i = 0; i < arguments.length; i++) {
      if (keys[arguments[i]]) return true;
    }
    return false;
  }

  // Continuous flight input, -1..1 on each axis.
  function flightInput() {
    var pitch = 0, roll = 0;
    if (isDown('ArrowUp', 'w')) pitch += 1;
    if (isDown('ArrowDown', 's')) pitch -= 1;
    if (isDown('ArrowLeft', 'a')) roll -= 1;
    if (isDown('ArrowRight', 'd')) roll += 1;
    return {
      pitch: pitch,
      roll: roll,
      throttleUp: isDown('Shift', 'r'),
      throttleDown: isDown('Control', 'f')
    };
  }

  // Edge-triggered key: true once per physical press.
  function wasPressed() {
    for (var i = 0; i < arguments.length; i++) {
      if (pressed[arguments[i]]) return true;
    }
    return false;
  }

  function endFrame() {
    pressed = {};
    clicks.length = 0;
  }

  function takeClicks() {
    var out = clicks.slice();
    clicks.length = 0;
    return out;
  }

  function getShot() {
    try {
      var q = new URLSearchParams(window.location.search);
      return q.get('shot');
    } catch (e) {
      return null;
    }
  }

  FG.Input = {
    attach: attach,
    flightInput: flightInput,
    wasPressed: wasPressed,
    endFrame: endFrame,
    takeClicks: takeClicks,
    getShot: getShot
  };
})();
