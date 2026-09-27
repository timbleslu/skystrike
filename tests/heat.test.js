'use strict';
// Gun-overheat thermal model (F1). Firing builds heat 0->1; at 1.0 the cannon LOCKS OUT and stays
const assert = require('assert');
const { HEAT, heatStep } = require('../js/core.js');

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); n++; }
function close(a, b, msg) { assert.ok(Math.abs(a - b) < 1e-9, msg + ` (got ${a}, want ${b})`); n++; }

const DT = 1 / 60;

{
  eq(HEAT.rearm, 0.35, 'HEAT.rearm is the spec re-arm threshold 0.35');
  ok(HEAT.rise > 0 && HEAT.decay > 0, 'rise and decay rates are positive');
  ok(HEAT.rise < 0.25, 'rise < 0.25/s so >=4s continuous fire is possible before lock');
}

{
  let s = { heat: 0, locked: false };
  for (let i = 0; i < 30; i++) s = heatStep(s, true, DT);
  close(s.heat, HEAT.rise * 0.5, 'firing accrues heat at HEAT.rise/s');
  eq(s.locked, false, 'half a second of fire does not lock');
  eq(s.justLocked, false, 'no lock crossing yet');
}

{
  let s = { heat: 0.6, locked: false };
  for (let i = 0; i < 30; i++) s = heatStep(s, false, DT);
  close(s.heat, 0.6 - HEAT.decay * 0.5, 'idle decays heat at HEAT.decay/s');
  ok(s.heat < 0.6, 'idle heat strictly decreases');
}

{
  let s = { heat: 0.3, locked: false };
  for (let i = 0; i < 600; i++) s = heatStep(s, false, DT);
  eq(s.heat, 0, 'sustained idle drives heat to exactly 0');
}

{
  let s = { heat: 0, locked: false };
  let lockCount = 0;
  while (!s.locked) { s = heatStep(s, true, DT); if (s.justLocked) lockCount++; }
  eq(lockCount, 1, 'justLocked fires exactly once on the <1 -> >=1 crossing');
  eq(s.locked, true, 'gun is locked after the crossing');
  ok(s.heat >= 1 - 1e-9 && s.heat <= 1, 'locked exactly at heat 1 (clamped)');
  let extra = 0;
  for (let i = 0; i < 24; i++) { s = heatStep(s, true, DT); if (s.justLocked) extra++; }
  eq(extra, 0, 'justLocked does not re-fire while the gun stays locked');
  ok(s.locked && s.heat < 1, 'a locked gun cools even with the trigger held (heat drops below 1)');
}

{
  let s = { heat: 0, locked: false };
  while (!s.locked) s = heatStep(s, true, DT);
  ok(s.heat >= 1 - 1e-9, 'locks at heat 1');
  let armCount = 0, heatAtArm = null, violated = false;
  for (let i = 0; i < 60 * 5; i++) {
    s = heatStep(s, false, DT);
    if (s.locked && s.heat < HEAT.rearm) violated = true;
    if (s.justArmed) { armCount++; heatAtArm = s.heat; }
  }
  eq(violated, false, 'locked stays engaged only while heat >= rearm (hysteresis holds)');
  eq(armCount, 1, 'justArmed fires exactly once');
  ok(heatAtArm < HEAT.rearm, 're-arm happens the frame heat cools below 0.35');
  eq(s.locked, false, 'gun re-armed and stays armed while idle');
}

{
  let s = { heat: 0, locked: false };
  while (!s.locked) s = heatStep(s, true, DT);
  let rearmed = false;
  for (let i = 0; i < 60 * 3 && !rearmed; i++) {
    s = heatStep(s, true, DT);
    if (s.justArmed) rearmed = true;
  }
  ok(rearmed, 'a locked gun bleeds off + re-arms even while the trigger is held');
}

{
  const r1 = heatStep({ heat: 0.9, locked: false }, true, 100);
  eq(r1.heat, 1, 'heat clamps at 1 with a huge firing dt');
  eq(r1.locked, true, 'reaching 1 locks');
  eq(r1.justLocked, true, 'the clamp-to-1 frame reports justLocked');
  const r2 = heatStep({ heat: 0.2, locked: false }, false, 100);
  eq(r2.heat, 0, 'heat clamps at 0 with a huge idle dt');
  eq(r2.locked, false, 'cold gun is not locked');
}

{
  let s = { heat: 0, locked: false };
  const frames = Math.round(4 / DT);
  for (let i = 0; i < frames; i++) s = heatStep(s, true, DT);
  eq(s.locked, false, 'balance guard: 4s continuous fire from cold does NOT lock');
  ok(s.heat < 1, 'balance guard: heat still below 1 after 4s');
  close(s.heat, HEAT.rise * 4, 'balance guard: heat reflects 4s of accumulation');
}

{
  const r = heatStep(undefined, false, DT);
  eq(r.heat, 0, 'undefined state -> heat 0');
  eq(r.locked, false, 'undefined state -> not locked');
}

console.log(`ok - heat: ${n} assertions — accumulation, decay, lock crossing (once), re-arm hysteresis (<0.35, once), clamp 0..1, >=4s balance guard`);
