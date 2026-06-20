'use strict';
const assert = require('assert');
const { resolveDamage } = require('../js/core.js');

// TP.dmg is the per-damage RP rate in globals.js (0.5). core.js doesn't export it, so the
// caller (combat.js) injects it as hit.tpDmg. Mirror the live value here.
const TP_DMG = 0.5;

function st(over) { return Object.assign({ hp: 100, maxHp: 100, type: 'fighter', playerDmg: 0 }, over); }

// ---- plain hit: hp drops by amt, no crit, RP awarded ----
{
  const r = resolveDamage(st(), { amt: 30, byPlayer: true, rand: 0.99, tpDmg: TP_DMG });
  assert.strictEqual(r.amt, 30, 'no multipliers -> amt unchanged');
  assert.strictEqual(r.hp, 70, 'hp = 100 - 30');
  assert.strictEqual(r.hpDelta, 30, 'hpDelta = amt');
  assert.strictEqual(r.crit, false, 'no crit when rand >= critChance (none here)');
  assert.strictEqual(r.died, false, '70 hp is alive');
  assert.strictEqual(r.executed, false, 'no execThresh -> no execute');
  assert.strictEqual(r.playerDmg, 30, 'player-dealt damage accumulates');
  assert.strictEqual(r.rp, 30 * TP_DMG, 'RP = amt * tpDmg * rpMul(default 1)');
}

// ---- byPlayer false: no RP, no playerDmg, no multipliers ----
{
  const r = resolveDamage(st({ playerDmg: 5 }), { amt: 40, byPlayer: false, rand: 0.0, tpDmg: TP_DMG, critChance: 1, critMul: 9, alphaMul: 9 });
  assert.strictEqual(r.amt, 40, 'non-player hit ignores crit/alpha/combo multipliers');
  assert.strictEqual(r.crit, false, 'non-player hit never crits');
  assert.strictEqual(r.hp, 60, 'hp = 100 - 40');
  assert.strictEqual(r.rp, 0, 'non-player hit awards no RP');
  assert.strictEqual(r.playerDmg, 5, 'non-player hit does not accumulate playerDmg');
}

// ---- RP scales with rpMul ----
{
  const r = resolveDamage(st(), { amt: 20, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, rpMul: 2 });
  assert.strictEqual(r.rp, 20 * TP_DMG * 2, 'rpMul multiplies the RP award');
}

// ---- crit: rand below critChance multiplies by critMul and flags crit ----
{
  const hit = resolveDamage(st(), { amt: 10, byPlayer: true, rand: 0.1, tpDmg: TP_DMG, critChance: 0.5, critMul: 3 });
  assert.strictEqual(hit.crit, true, 'rand(0.1) < critChance(0.5) -> crit');
  assert.strictEqual(hit.amt, 30, 'crit triples amt');
  assert.strictEqual(hit.hp, 70, 'hp reflects the critted amt');
  assert.strictEqual(hit.rp, 30 * TP_DMG, 'RP uses the critted amt');
  const miss = resolveDamage(st(), { amt: 10, byPlayer: true, rand: 0.6, tpDmg: TP_DMG, critChance: 0.5, critMul: 3 });
  assert.strictEqual(miss.crit, false, 'rand(0.6) >= critChance(0.5) -> no crit');
  assert.strictEqual(miss.amt, 10, 'no crit -> amt unchanged');
}

// ---- MARKSMAN alphaMul: only on a healthy target (hp >= maxHp - 0.5) ----
{
  const full = resolveDamage(st({ hp: 100 }), { amt: 10, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, alphaMul: 2 });
  assert.strictEqual(full.amt, 20, 'alphaMul applies at full HP');
  const hurt = resolveDamage(st({ hp: 50 }), { amt: 10, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, alphaMul: 2 });
  assert.strictEqual(hurt.amt, 10, 'alphaMul does NOT apply to an already-damaged target');
}

// ---- RHYTHM OF WAR comboDmg: scales with combo, capped at +30% ----
{
  const small = resolveDamage(st(), { amt: 100, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, comboDmg: 0.02, combo: 5 });
  assert.strictEqual(small.amt, 100 * (1 + 0.10), 'combo 5 * 0.02 = +10%');
  const capped = resolveDamage(st(), { amt: 100, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, comboDmg: 0.02, combo: 100 });
  assert.strictEqual(capped.amt, 130, 'combo bonus caps at +30%');
}

// ---- death boundary: hp <= 0 -> died ----
{
  const exact = resolveDamage(st({ hp: 30 }), { amt: 30, byPlayer: true, rand: 0.99, tpDmg: TP_DMG });
  assert.strictEqual(exact.hp, 0, 'exactly lethal -> hp 0');
  assert.strictEqual(exact.died, true, 'hp == 0 counts as died');
  const over = resolveDamage(st({ hp: 30 }), { amt: 50, byPlayer: true, rand: 0.99, tpDmg: TP_DMG });
  assert.ok(over.hp < 0, 'overkill leaves hp negative');
  assert.strictEqual(over.died, true, 'overkill -> died');
  const alive = resolveDamage(st({ hp: 30 }), { amt: 29, byPlayer: true, rand: 0.99, tpDmg: TP_DMG });
  assert.strictEqual(alive.died, false, '1 hp left -> alive');
}

// ---- EXECUTIONER: a wounded non-boss is finished outright; boss is immune ----
{
  // hp after hit = 60 - 20 = 40, maxHp 100, execThresh 0.5 -> 40 <= 50 -> execute
  const ex = resolveDamage(st({ hp: 60 }), { amt: 20, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, execThresh: 0.5 });
  assert.strictEqual(ex.executed, true, 'post-hit HP under the execute threshold -> executed');
  assert.strictEqual(ex.hp, 0, 'execute clamps hp to 0');
  assert.strictEqual(ex.died, true, 'executed target is dead');
  assert.strictEqual(ex.hpDelta, 60, 'hpDelta spans the full remaining HP on execute');
  assert.strictEqual(ex.rp, 20 * TP_DMG, 'RP still tied to the dealt amt, not the execute clamp');
  // boss never executes
  const boss = resolveDamage(st({ hp: 60, type: 'boss' }), { amt: 20, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, execThresh: 0.5 });
  assert.strictEqual(boss.executed, false, 'bosses are immune to EXECUTIONER');
  assert.strictEqual(boss.hp, 40, 'boss takes normal damage, no clamp');
  // not wounded enough -> no execute
  const safe = resolveDamage(st({ hp: 100 }), { amt: 20, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, execThresh: 0.5 });
  assert.strictEqual(safe.executed, false, 'above the threshold -> no execute');
  assert.strictEqual(safe.hp, 80, 'normal hp drop when not executed');
  // a hit that already kills is not an "execute" (guard requires hp > 0 after the hit)
  const lethal = resolveDamage(st({ hp: 10 }), { amt: 20, byPlayer: true, rand: 0.99, tpDmg: TP_DMG, execThresh: 0.5 });
  assert.strictEqual(lethal.executed, false, 'an outright kill is not flagged executed (hp already <= 0)');
  assert.strictEqual(lethal.died, true, 'but it is dead');
}

// ---- input immutability: resolveDamage must not mutate state or hit ----
{
  const s = st({ hp: 80 });
  const sCopy = Object.assign({}, s);
  const h = { amt: 25, byPlayer: true, rand: 0.99, tpDmg: TP_DMG };
  const hCopy = Object.assign({}, h);
  resolveDamage(s, h);
  assert.deepStrictEqual(s, sCopy, 'state object is not mutated');
  assert.deepStrictEqual(h, hCopy, 'hit object is not mutated');
}

console.log('ok - damage-resolve: all assertions passed');
