'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// === MIRROR START (globals.js tutorial step machine) ===
// First-run tutorial step machine. Steps gate on player actions, in order:
//   0 = pitch, 1 = throttle (>0.6), 2 = guns fired, 3 = missile (lock + fire), 4 = DONE.
// Each step's REQUIRED event advances it by one; the 'skip' event jumps straight to DONE
// from any step. Pure + monotonic: an event that does not match the current step is ignored,
// the step index never decreases, and DONE (4) is a terminal absorbing state.
const TUTORIAL_STEPS = ['pitch', 'throttle', 'guns', 'missile'];
const TUTORIAL_DONE = TUTORIAL_STEPS.length;   // 4
// the event that satisfies each step, by step index
const TUTORIAL_EVENT_FOR_STEP = ['pitched', 'throttled', 'fired', 'missile'];
// PURE — given the current step and an input event, return the next step (0..TUTORIAL_DONE).
// Never regresses; only the current step's matching event (or 'skip') advances it.
function tutorialNext(step, event) {
  if (step >= TUTORIAL_DONE) return TUTORIAL_DONE;        // terminal: stay done
  if (event === 'skip') return TUTORIAL_DONE;             // skip finishes from anywhere
  if (event === TUTORIAL_EVENT_FOR_STEP[step]) return step + 1;   // matching action advances one
  return step;                                           // anything else: no change
}
// === MIRROR END ===

/* ===== step machine advances on the right event, in order ===== */
assert.strictEqual(tutorialNext(0, 'pitched'), 1, 'pitch advances step 0 -> 1');
assert.strictEqual(tutorialNext(1, 'throttled'), 2, 'throttle advances step 1 -> 2');
assert.strictEqual(tutorialNext(2, 'fired'), 3, 'guns advance step 2 -> 3');
assert.strictEqual(tutorialNext(3, 'missile'), 4, 'missile advances step 3 -> DONE');
assert.strictEqual(tutorialNext(3, 'missile'), TUTORIAL_DONE, 'final step lands on DONE');

/* ===== wrong / out-of-order events do not advance (and never regress) ===== */
assert.strictEqual(tutorialNext(0, 'throttled'), 0, 'future-step event ignored at step 0');
assert.strictEqual(tutorialNext(0, 'fired'), 0, 'guns ignored before pitch');
assert.strictEqual(tutorialNext(0, 'missile'), 0, 'missile ignored before pitch');
assert.strictEqual(tutorialNext(2, 'pitched'), 2, 'past-step event does not regress (stays 2)');
assert.strictEqual(tutorialNext(2, 'throttled'), 2, 'past-step event does not regress (stays 2)');
assert.strictEqual(tutorialNext(1, 'fired'), 1, 'skipping ahead not allowed (stays 1)');
assert.strictEqual(tutorialNext(0, 'bogus'), 0, 'unknown event is a no-op');

/* ===== skip jumps to DONE from any step ===== */
for (let s = 0; s <= TUTORIAL_DONE; s++) {
  assert.strictEqual(tutorialNext(s, 'skip'), TUTORIAL_DONE, 'skip finishes from step ' + s);
}

/* ===== DONE is terminal / absorbing ===== */
assert.strictEqual(tutorialNext(TUTORIAL_DONE, 'pitched'), TUTORIAL_DONE, 'done stays done (pitched)');
assert.strictEqual(tutorialNext(TUTORIAL_DONE, 'missile'), TUTORIAL_DONE, 'done stays done (missile)');
assert.strictEqual(tutorialNext(TUTORIAL_DONE, 'skip'), TUTORIAL_DONE, 'done stays done (skip)');
assert.strictEqual(tutorialNext(5, 'pitched'), TUTORIAL_DONE, 'over-range step clamps to DONE');

/* ===== monotonicity: across ANY event sequence, step never decreases ===== */
const events = ['pitched', 'throttled', 'fired', 'missile', 'bogus', 'throttled', 'pitched'];
function fuzz(seed) {
  // tiny deterministic LCG so the property check is reproducible
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return events[x % events.length]; };
}
for (let seed = 1; seed <= 50; seed++) {
  const rng = fuzz(seed);
  let step = 0;
  for (let i = 0; i < 40; i++) {
    const next = tutorialNext(step, rng());
    assert.ok(next >= step, 'monotonic: step never decreases (seed ' + seed + ')');
    assert.ok(next >= 0 && next <= TUTORIAL_DONE, 'step stays in [0,DONE]');
    step = next;
  }
}

/* ===== the canonical happy path terminates exactly at DONE in 4 steps ===== */
(function () {
  let step = 0;
  const path = ['pitched', 'throttled', 'fired', 'missile'];
  for (let i = 0; i < path.length; i++) step = tutorialNext(step, path[i]);
  assert.strictEqual(step, TUTORIAL_DONE, 'happy path reaches DONE');
  // and the four ordered events were each required (each consumed exactly one step)
  assert.strictEqual(path.length, TUTORIAL_STEPS.length, 'one action per tutorial step');
})();

console.log('ok - tutorialNext: ordered advance, no-regress, skip->done, terminal done, monotone');

/* ===== byte-identity guard: the mirror must match js/globals.js verbatim =====
   (project convention: test-mirrored pure logic stays byte-identical with its source,
   here delimited by the matching MIRROR markers in both files) */
function mirrorBlock(text, tag) {
  const startMark = '// === MIRROR START (' + tag + ') ===';
  const endMark = '// === MIRROR END ===';
  const s = text.indexOf(startMark);
  assert.ok(s !== -1, 'MIRROR START present for tag: ' + tag);
  const e = text.indexOf(endMark, s);
  assert.ok(e !== -1, 'MIRROR END present after START for tag: ' + tag);
  return text.slice(s, e + endMark.length);
}
const TAG = 'globals.js tutorial step machine';
const thisFile = fs.readFileSync(__filename, 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
const mineBlock = mirrorBlock(thisFile, TAG);
const srcBlock = mirrorBlock(src, TAG);
assert.strictEqual(srcBlock, mineBlock, 'tutorial step machine in globals.js must be byte-identical to the test mirror');

console.log('ok - tutorial step machine mirror matches js/globals.js byte-for-byte');
