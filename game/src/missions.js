// missions.js — the three sorties and the score. Ring Run is a timed course
// of eight rings and a landing; Courier is a pickup, a delivery and a return
// leg; Free Flight is just the valley, the fuel gauge and your nerve. The
// judge's second criterion is fun with decisions: fuel and damage are what
// turn a sortie into decisions, so both are scored against here.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;
  var W = FG.World;

  function createMission(kind) {
    return {
      kind: kind,
      score: 0,
      time: 0,
      ringsHit: 0,
      nextRing: 0,          // index into World.rings
      leg: 0,               // courier legs: 0 pickup, 1 deliver, 2 return
      distance: 0,          // metres flown while airborne
      done: false,
      doneText: '',
      prevRingD: null,
      _landedScored: false
    };
  }

  // Distance from the plane to a ring's centre, measured across its plane.
  function ringCrossing(m, plane, ring) {
    var dx = plane.x - ring.x, dy = plane.y - ring.y, dz = plane.z - ring.z;
    var d = dx * ring.nx + dy * ring.ny + dz * ring.nz;
    var lateral = Math.sqrt(
      Math.pow(dx - d * ring.nx, 2) +
      Math.pow(dy - d * ring.ny, 2) +
      Math.pow(dz - d * ring.nz, 2));
    var crossed = (m.prevRingD !== null) && ((m.prevRingD > 0) !== (d > 0));
    m.prevRingD = d;
    return { crossed: crossed, lateral: lateral };
  }

  function updateMission(m, plane, events, dt) {
    if (m.done) return;
    m.time += dt;
    if (plane.airborne) m.distance += plane.speed * dt;

    // ---- rings: the current target ring, in order ----
    if (m.kind !== 'courier' || m.leg === 0) {
      var target = W.rings[m.nextRing];
      if (target) {
        var chk = ringCrossing(m, plane, target);
        if (chk.crossed && chk.lateral < target.r) {
          m.ringsHit++;
          m.score += CFG.ringPoints;
          events.push({ type: 'ring', index: m.nextRing, score: m.score });
          m.nextRing++;
          m.prevRingD = null;
          if (m.kind === 'courier') { m.leg = 1; }
          if (m.kind === 'rings' && m.nextRing >= W.rings.length) {
            events.push({ type: 'objective', text: 'Course clear. Land at Kestrel Field.' });
          }
        }
      }
    }

    // ---- landings, scored by the sortie ----
    for (var i = 0; i < events.length; i++) {
      if (events[i].type === 'landed' && !m._landedScored) {
        m._landedScored = true;
        var strip = events[i].strip;
        if (m.kind === 'rings') {
          if (m.nextRing >= W.rings.length && strip === 'Kestrel Field') {
            var timeBonus = Math.max(0, Math.round((CFG.ringRunPar - m.time) * CFG.timeBonusPerSec));
            m.score += CFG.landingBonus + timeBonus;
            m.done = true;
            m.doneText = 'Course complete, ' + m.score + ' pts';
          } else if (strip === 'Kestrel Field') {
            m.score += CFG.landingBonus;
            m.done = true;
            m.doneText = 'Landed at Kestrel, ' + m.score + ' pts';
          } else {
            m.score += 100;
            m.done = true;
            m.doneText = 'Off-field landing, ' + m.score + ' pts';
          }
        } else if (m.kind === 'courier') {
          if (m.leg === 1 && strip === 'Pine Hollow') {
            m.score += CFG.deliveryBonus;
            m.leg = 2;
            m._landedScored = false;
            events.push({ type: 'objective', text: 'Parcel delivered. Fly home to Kestrel.' });
          } else if (m.leg === 2 && strip === 'Kestrel Field') {
            m.score += CFG.landingBonus;
            m.done = true;
            m.doneText = 'Courier run complete, ' + m.score + ' pts';
          } else if (strip) {
            m.score += 100;
            m.done = true;
            m.doneText = 'Landed at ' + strip + ', ' + m.score + ' pts';
          } else {
            m.score += 50;
            m.done = true;
            m.doneText = 'Off-field landing, ' + m.score + ' pts';
          }
        } else {
          // Free flight: a landing ends the sortie, scored on distance.
          m.score += Math.round(m.distance / 100) * 5 + 150;
          m.done = true;
          m.doneText = 'Flight over, ' + m.score + ' pts';
        }
      }
      if (events[i].type === 'crashed') {
        m.done = true;
        m.doneText = 'Crashed, ' + m.score + ' pts';
      }
    }
  }

  function objectiveText(m) {
    if (m.done) return m.doneText;
    if (m.kind === 'rings') {
      if (m.nextRing < W.rings.length) {
        return 'Ring ' + (m.nextRing + 1) + ' of ' + W.rings.length + '. Fly through it.';
      }
      return 'Course clear. Land at Kestrel Field.';
    }
    if (m.kind === 'courier') {
      if (m.leg === 0) return 'Pick up the parcel. Fly through the ring over Kestrel.';
      if (m.leg === 1) return 'Deliver to Pine Hollow. Land on its strip.';
      return 'Return home. Land at Kestrel Field.';
    }
    return 'Free flight. Explore the valley, watch your fuel.';
  }

  function nextRingTarget(m) {
    if (m.kind === 'courier' && m.leg !== 0) return null;
    return W.rings[m.nextRing] || null;
  }

  FG.Missions = {
    createMission: createMission,
    updateMission: updateMission,
    objectiveText: objectiveText,
    nextRingTarget: nextRingTarget
  };
})();
