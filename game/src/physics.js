// physics.js — an arcade flight model with real discipline in it: throttle
// and speed trade against each other, turns cost lift, slow flight stalls,
// fuel runs out, and landings are judged on speed, sink rate and alignment.
// Pure math over the plane state; no DOM.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;
  var T = FG.Terrain;
  var clamp = FG.clamp, lerp = FG.lerp, wrapAngle = FG.wrapAngle;

  var G = 9.81;
  var windRad = FG.deg2rad(CFG.wind.from + 180); // wind blows toward here
  var windX = Math.sin(windRad) * CFG.wind.speed;
  var windZ = -Math.cos(windRad) * CFG.wind.speed;

  function knots(ms) { return ms * 1.94384; }
  function feet(m) { return m * 3.28084; }

  function createPlane() {
    var st = CFG.strips[0];
    var h = FG.deg2rad(st.heading);
    return {
      x: st.x - Math.sin(h) * (st.len / 2 - 60),
      z: st.z + Math.cos(h) * (st.len / 2 - 60),
      y: T.heightAt(st.x, st.z) + CFG.gearHeight,
      heading: h, pitch: 0, roll: 0,
      speed: 0, throttle: 0, fuel: 100, damage: 0,
      vspeed: 0, onGround: true, airborne: false,
      crashed: false, landed: false, landedStrip: null,
      prevY: 0, prevRingD: null, time: 0
    };
  }

  // input: { pitch: -1..1 (up positive), roll: -1..1 (right positive),
  //          throttleUp, throttleDown } — all from the keyboard.
  function stepPlane(p, input, dt, events) {
    if (p.crashed || p.landed) return;
    p.time += dt;
    var prevY = p.y;

    // ---- throttle and fuel ----
    if (input.throttleUp) p.throttle = clamp(p.throttle + dt * 0.55, 0, 1);
    if (input.throttleDown) p.throttle = clamp(p.throttle - dt * 0.55, 0, 1);
    if (p.fuel <= 0) p.throttle = 0;
    else p.fuel = Math.max(0, p.fuel - lerp(CFG.fuelDrain, CFG.fuelDrainFull, p.throttle) * dt);
    if (p.fuel <= 0 && !p._fuelWarned) {
      p._fuelWarned = true;
      events.push({ type: 'warning', text: 'Fuel empty. Glide to a field.' });
    }

    var authority = clamp(p.speed / CFG.stallSpeed, 0.3, 1);

    if (p.onGround) {
      // ---- ground roll: accelerate, steer a little, rotate to lift off ----
      var thrust = p.throttle * CFG.thrustAccel;
      var drag = CFG.dragK * p.speed * p.speed + 0.15; // rolling resistance
      p.speed = Math.max(0, p.speed + (thrust - drag) * dt);
      p.y = T.heightAt(p.x, p.z) + CFG.gearHeight;
      p.pitch = 0; p.roll *= 0.8;
      var fwdX = Math.sin(p.heading), fwdZ = -Math.cos(p.heading);
      p.x += fwdX * p.speed * dt;
      p.z += fwdZ * p.speed * dt;
      if (p.speed >= CFG.stallSpeed && input.pitch > 0.2) {
        p.onGround = false; p.airborne = true;
        p.pitch = 0.10;
        events.push({ type: 'takeoff' });
      }
      // Running off the strip onto rough ground at speed wears the airframe.
      if (p.speed > 22 && !T.stripAt(p.x, p.z) && !T.isWater(p.x, p.z)) {
        p.damage = Math.min(100, p.damage + 4 * dt);
      }
      if (T.isWater(p.x, p.z)) {
        crash(p, events, 'Ditched in the river');
        return;
      }
      if (p.damage >= 100) { crash(p, events, 'Airframe broke up on the ground'); return; }
    } else {
      // ---- in the air ----
      var thrustA = p.throttle * CFG.thrustAccel;
      var dragA = CFG.dragK * p.speed * p.speed;
      var accel = thrustA - dragA - G * Math.sin(p.pitch);
      p.speed = Math.max(0, p.speed + accel * dt);

      // Roll: input rolls, damping returns it toward level.
      p.roll += input.roll * CFG.rollRate * authority * dt;
      if (Math.abs(input.roll) < 0.05) p.roll *= Math.exp(-1.1 * dt);
      p.roll = clamp(p.roll, -1.15, 1.15);
      // Pitch: input pitches, but a stalled wing will not hold the nose up.
      p.pitch += input.pitch * CFG.pitchRate * authority * dt;
      if (p.speed < CFG.stallSpeed) {
        p.pitch -= (CFG.stallSpeed - p.speed) * 0.012 * dt;
        if (!p._stallWarned) {
          p._stallWarned = true;
          events.push({ type: 'warning', text: 'Stall. Nose down, add power.' });
        }
      } else {
        p._stallWarned = false;
      }
      p.pitch = clamp(p.pitch, -0.55, 0.62);

      // Coordinated turn: bank makes the heading swing.
      var turnRate = G * Math.tan(p.roll) / Math.max(p.speed, 15);
      p.heading = wrapAngle(p.heading + turnRate * dt);

      // Move along the nose, plus the wind's drift.
      var cp = Math.cos(p.pitch);
      var nx = Math.sin(p.heading) * cp;
      var ny = Math.sin(p.pitch);
      var nz = -Math.cos(p.heading) * cp;
      p.x += (nx * p.speed + windX) * dt;
      p.y += ny * p.speed * dt;
      p.z += (nz * p.speed + windZ) * dt;

      // Extra sink when stalled.
      if (p.speed < CFG.stallSpeed) {
        p.y -= (CFG.stallSpeed - p.speed) * 0.35 * dt;
      }

      // Stay inside the valley: soft wall, with a warning.
      var B = T.HALF - 60;
      if (Math.abs(p.x) > B || Math.abs(p.z) > B) {
        p.x = clamp(p.x, -B, B);
        p.z = clamp(p.z, -B, B);
        if (!p._edgeWarned) {
          p._edgeWarned = true;
          events.push({ type: 'warning', text: 'Edge of the valley. Turn back.' });
        }
      } else {
        p._edgeWarned = false;
      }

      // ---- ground contact ----
      var groundH = T.heightAt(p.x, p.z);
      var agl = p.y - groundH;
      if (agl <= CFG.gearHeight) {
        p.y = groundH + CFG.gearHeight;
        var sink = -p.vspeed;
        var strip = T.stripAt(p.x, p.z);
        var aligned = false;
        if (strip) {
          var sh = FG.deg2rad(strip.heading);
          var dh = Math.abs(wrapAngle(p.heading - sh));
          aligned = dh < 0.28 || dh > Math.PI - 0.28;
        }
        if (T.isWater(p.x, p.z)) {
          crash(p, events, 'Ditched in the water');
          return;
        }
        if (strip && aligned && p.speed < 40 && sink < 6 && Math.abs(p.roll) < 0.3) {
          // A firm arrival (sink 3–6) still lands, but it costs the airframe.
          if (sink > 3) p.damage = Math.min(100, p.damage + 15);
          land(p, events, strip, sink);
          return;
        }
        if (sink < 3 && p.speed < 30 && Math.abs(p.roll) < 0.35) {
          // Bush landing, off the strip: allowed, but it costs the airframe.
          p.damage = Math.min(100, p.damage + 15);
          land(p, events, null, sink);
          return;
        }
        crash(p, events, sink > 6 ? 'Hit the ground hard' : 'Ran into the terrain');
        return;
      }
    }

    p.vspeed = (p.y - prevY) / Math.max(dt, 1e-6);
    p.prevY = p.y;
  }

  function land(p, events, strip, sink) {
    p.onGround = true;
    p.landed = true;
    p.landedStrip = strip ? strip.name : null;
    p.pitch = 0; p.roll = 0;
    if (sink > 2.5) p.damage = Math.min(100, p.damage + 10);
    events.push({ type: 'landed', strip: p.landedStrip, sink: sink });
  }

  function crash(p, events, why) {
    p.crashed = true;
    p.speed = 0;
    events.push({ type: 'crashed', why: why });
  }

  FG.Physics = {
    createPlane: createPlane,
    stepPlane: stepPlane,
    knots: knots,
    feet: feet
  };
})();
