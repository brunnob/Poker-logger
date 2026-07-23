#!/usr/bin/env node
// ============================================================
// gen-hand-rankings.mjs
//
// Generates the HAND_RANGE_MAP literal used by client/src/lib/ranges.ts.
//
// Pipeline:
//   1. A best-5-of-7 hand evaluator (category + kickers), verified by a
//      self-test block of canonical comparisons.
//   2. A seeded Monte Carlo simulation estimating each of the 169 starting
//      hands' equity vs a uniformly random opponent hand on a random board.
//   3. Sanity assertions against well-known reference equities.
//   4. Bucketing of the 169 hands into the app's existing HandRange buckets
//      by walking cumulative combo counts (pair=6, suited=4, offsuit=12)
//      in equity-descending order.
//   5. Printing a ready-to-paste TypeScript literal plus a per-bucket
//      summary table.
//
// Usage: node scripts/gen-hand-rankings.mjs
// Deterministic: uses mulberry32(42) as the PRNG seed, so reruns reproduce
// the same equities (modulo floating point summation order, which is fixed
// here since iteration order is fixed).
// ============================================================

'use strict';

// ------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
// Card encoding: card = (rank-2)*4 + suit, rank in [2,14], suit in [0,3]
// ------------------------------------------------------------
const RANK_CHARS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
const SUIT_CHARS = ['s', 'h', 'd', 'c'];

function makeCard(rank, suit) {
  return (rank - 2) * 4 + suit;
}

// ------------------------------------------------------------
// 7-card hand evaluator (best 5 of 7): category + kickers, encoded as a
// single comparable integer (higher = better).
//
// Categories (high to low): 8 straight flush, 7 quads, 6 full house,
// 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair, 0 high card.
//
// Score = category*15^5 + k0*15^4 + k1*15^3 + k2*15^2 + k3*15 + k4
// Kickers are ranks (0..14, 0 = unused slot). Base 15 comfortably holds
// rank values 0..14 per digit, and max total kicker contribution
// (14 * (15^4+15^3+15^2+15+1) = 759374) is less than one category step
// (15^5 = 759375), so category always dominates kickers.
// ------------------------------------------------------------

// Scratch buffers reused across calls (script is single-threaded/synchronous).
const _rankCounts = new Int8Array(13); // index = rank-2
const _suitCounts = new Int8Array(4);
const _suitRankBits = new Int32Array(4);
const _quads = new Int8Array(13);
const _trips = new Int8Array(13);
const _pairs = new Int8Array(13);
const _singles = new Int8Array(13);

function encode(category, k0, k1, k2, k3, k4) {
  return category * 759375 + k0 * 50625 + k1 * 3375 + k2 * 225 + k3 * 15 + k4;
}

function straightHighFromBits(bits) {
  for (let top = 14; top >= 6; top--) {
    const hi = top - 2;
    const mask = 0b11111 << (hi - 4);
    if ((bits & mask) === mask) return top;
  }
  // wheel: A-2-3-4-5 (bit indices 12, 0, 1, 2, 3)
  const wheelMask = (1 << 12) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
  if ((bits & wheelMask) === wheelMask) return 5;
  return -1;
}

function evaluate7(cards) {
  _rankCounts.fill(0);
  _suitCounts.fill(0);
  _suitRankBits.fill(0);
  let allRankBits = 0;

  for (let i = 0; i < 7; i++) {
    const c = cards[i];
    const r = c >> 2; // 0..12 (rank-2)
    const s = c & 3;
    _rankCounts[r]++;
    _suitCounts[s]++;
    _suitRankBits[s] |= 1 << r;
    allRankBits |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (_suitCounts[s] >= 5) {
      flushSuit = s;
      break;
    }
  }

  if (flushSuit !== -1) {
    const sfHigh = straightHighFromBits(_suitRankBits[flushSuit]);
    if (sfHigh !== -1) return encode(8, sfHigh, 0, 0, 0, 0);
  }

  let nq = 0, nt = 0, np = 0, ns = 0;
  for (let r = 12; r >= 0; r--) {
    const c = _rankCounts[r];
    const rank = r + 2;
    if (c === 4) _quads[nq++] = rank;
    else if (c === 3) _trips[nt++] = rank;
    else if (c === 2) _pairs[np++] = rank;
    else if (c === 1) _singles[ns++] = rank;
  }

  if (nq > 0) {
    const quad = _quads[0];
    let kicker = 0;
    if (nt > 0) kicker = Math.max(kicker, _trips[0]);
    if (np > 0) kicker = Math.max(kicker, _pairs[0]);
    if (ns > 0) kicker = Math.max(kicker, _singles[0]);
    return encode(7, quad, kicker, 0, 0, 0);
  }

  if (nt > 0) {
    let pairRank = 0;
    if (nt > 1) pairRank = _trips[1];
    if (np > 0) pairRank = Math.max(pairRank, _pairs[0]);
    if (pairRank > 0) return encode(6, _trips[0], pairRank, 0, 0, 0);
  }

  if (flushSuit !== -1) {
    const bits = _suitRankBits[flushSuit];
    let idx = 0;
    const top5 = [0, 0, 0, 0, 0];
    for (let r = 12; r >= 0 && idx < 5; r--) {
      if (bits & (1 << r)) top5[idx++] = r + 2;
    }
    return encode(5, top5[0], top5[1], top5[2], top5[3], top5[4]);
  }

  const straightHigh = straightHighFromBits(allRankBits);
  if (straightHigh !== -1) return encode(4, straightHigh, 0, 0, 0, 0);

  if (nt > 0) {
    // Reachable only with nt===1 and np===0 here (nt>1 or np>0 would have
    // returned full house above), so remaining kickers come from singles.
    const k1 = ns > 0 ? _singles[0] : 0;
    const k2 = ns > 1 ? _singles[1] : 0;
    return encode(3, _trips[0], k1, k2, 0, 0);
  }

  if (np > 0) {
    if (np >= 2) {
      let kicker = 0;
      if (np > 2) kicker = _pairs[2];
      if (ns > 0) kicker = Math.max(kicker, _singles[0]);
      return encode(2, _pairs[0], _pairs[1], kicker, 0, 0);
    }
    const k1 = ns > 0 ? _singles[0] : 0;
    const k2 = ns > 1 ? _singles[1] : 0;
    const k3 = ns > 2 ? _singles[2] : 0;
    return encode(1, _pairs[0], k1, k2, k3, 0);
  }

  const h1 = ns > 0 ? _singles[0] : 0;
  const h2 = ns > 1 ? _singles[1] : 0;
  const h3 = ns > 2 ? _singles[2] : 0;
  const h4 = ns > 3 ? _singles[3] : 0;
  const h5 = ns > 4 ? _singles[4] : 0;
  return encode(0, h1, h2, h3, h4, h5);
}

// ------------------------------------------------------------
// Self-tests
// ------------------------------------------------------------
function parseCard(str) {
  const rank = RANK_VALUE[str[0]];
  const suit = SUIT_CHARS.indexOf(str[1]);
  if (rank === undefined || suit === -1) throw new Error(`Bad card literal: ${str}`);
  return makeCard(rank, suit);
}

function parseHand(str) {
  const cards = str.trim().split(/\s+/).map(parseCard);
  if (cards.length !== 7) throw new Error(`Expected 7 cards, got ${cards.length}: ${str}`);
  return cards;
}

function runSelfTests() {
  let n = 0;
  function assertGreater(a, b, msg) {
    n++;
    const sa = evaluate7(parseHand(a));
    const sb = evaluate7(parseHand(b));
    if (!(sa > sb)) {
      throw new Error(`Self-test FAILED (${msg}): expected [${a}] score(${sa}) > [${b}] score(${sb})`);
    }
  }
  function assertEqual(a, b, msg) {
    n++;
    const sa = evaluate7(parseHand(a));
    const sb = evaluate7(parseHand(b));
    if (sa !== sb) {
      throw new Error(`Self-test FAILED (${msg}): expected [${a}] score(${sa}) === [${b}] score(${sb})`);
    }
  }

  // 1. Straight flush beats quads
  assertGreater('9h 8h 7h 6h 5h 2c 2d', 'As Ad Ac Ah Kh Kd 2c', 'straight flush > quads');
  // 2. Quads beats full house
  assertGreater('7h 7d 7c 7s Ah Kd 2c', 'Kh Kd Kc Qh Qd 2c 3d', 'quads > full house');
  // 3. Full house beats flush
  assertGreater('Kh Kd Kc Qh Qd 2c 3d', 'Ah 9h 7h 4h 2h Kd 3c', 'full house > flush');
  // 4. Flush beats straight
  assertGreater('Ah 9h 7h 4h 2h Kd 3c', '9h 8d 7c 6h 5s Ad 2c', 'flush > straight');
  // 5. Straight beats trips
  assertGreater('9h 8d 7c 6h 5s Ad 2c', '7h 7d 7c Ah Kd 4c 2s', 'straight > trips');
  // 6. Trips beats two pair
  assertGreater('7h 7d 7c Ah Kd 4c 2s', 'Ah Ad Kh Kd 9c 4d 2s', 'trips > two pair');
  // 7. Two pair beats one pair
  assertGreater('Ah Ad Kh Kd 9c 4d 2s', 'Ah Ad Kh Qd Jc 4s 2h', 'two pair > one pair');
  // 8. One pair beats high card
  assertGreater('Ah Ad Kh Qd Jc 4s 2h', 'Ah Kd Qc Js 9h 4d 2s', 'one pair > high card');
  // 9. Wheel straight (A-2-3-4-5) recognized, but 6-high straight beats it
  assertGreater('6h 5d 4c 3s 2h Ad Kc', 'Ah 2d 3c 4s 5h Kd Qc', '6-high straight > wheel (A-2-3-4-5)');
  // 10. Kicker decision within same category (pair of aces, K-Q-J vs K-Q-T kickers)
  assertGreater('Ah Ad Kc Qd Js 4s 2h', 'Ah Ad Kc Qd Ts 4s 2h', 'higher kicker wins with same pair');
  // 11. Split pot: both hands play the board (royal flush on board)
  assertEqual('Ah Kh Qh Jh Th 2c 3d', 'Ah Kh Qh Jh Th 4s 5c', 'identical board-plays hands split equally');

  console.log(`Self-tests: ${n}/${n} passed.`);
}

// ------------------------------------------------------------
// Monte Carlo equity vs a uniformly random opponent hand + random board
// ------------------------------------------------------------
function buildDeckExcluding(excluded) {
  const deck = [];
  for (let c = 0; c < 52; c++) {
    if (!excluded.includes(c)) deck.push(c);
  }
  return deck;
}

function partialShuffle(deck, k, rng) {
  const n = deck.length;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}

function simulateEquity(c1, c2, iterations, rng) {
  const deck = buildDeckExcluding([c1, c2]);
  const heroCards = [c1, c2, 0, 0, 0, 0, 0];
  const villCards = [0, 0, 0, 0, 0, 0, 0];
  let wins = 0;
  let ties = 0;

  for (let it = 0; it < iterations; it++) {
    partialShuffle(deck, 7, rng);
    villCards[0] = deck[0];
    villCards[1] = deck[1];
    for (let k = 0; k < 5; k++) {
      const cd = deck[2 + k];
      heroCards[2 + k] = cd;
      villCards[2 + k] = cd;
    }
    const hs = evaluate7(heroCards);
    const vs = evaluate7(villCards);
    if (hs > vs) wins++;
    else if (hs === vs) ties++;
  }

  return (wins + ties * 0.5) / iterations;
}

// ------------------------------------------------------------
// Bucketing
// ------------------------------------------------------------
const BUCKET_ORDER = ['3%', '5%', '8%', '10%', '12-15%', '18-20%', '25%', '30-35%', '40-45%', '50%', '60-70%'];
const BUCKET_TARGETS = {
  '3%': 28, '5%': 58, '8%': 104, '10%': 130, '12-15%': 188, '18-20%': 264,
  '25%': 330, '30-35%': 462, '40-45%': 594, '50%': 654, '60-70%': 1326,
};

function comboWeight(type) {
  return type === 'pair' ? 6 : type === 'suited' ? 4 : 12;
}

function bucketForMidpoint(mid) {
  let lower = 0;
  for (const b of BUCKET_ORDER) {
    const upper = BUCKET_TARGETS[b];
    if (mid >= lower && mid < upper) return b;
    lower = upper;
  }
  return BUCKET_ORDER[BUCKET_ORDER.length - 1];
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
function main() {
  runSelfTests();

  const ITERATIONS = 300000;
  const rng = mulberry32(42);

  const results = [];
  for (let i = 0; i < RANK_CHARS.length; i++) {
    for (let j = i; j < RANK_CHARS.length; j++) {
      const rHigh = RANK_VALUE[RANK_CHARS[i]];
      const rLow = RANK_VALUE[RANK_CHARS[j]];
      if (i === j) {
        const c1 = makeCard(rHigh, 0);
        const c2 = makeCard(rHigh, 1);
        const eq = simulateEquity(c1, c2, ITERATIONS, rng);
        results.push({ notation: `${RANK_CHARS[i]}${RANK_CHARS[j]}`, type: 'pair', equity: eq });
      } else {
        const cs1 = makeCard(rHigh, 0);
        const cs2 = makeCard(rLow, 0);
        const eqS = simulateEquity(cs1, cs2, ITERATIONS, rng);
        results.push({ notation: `${RANK_CHARS[i]}${RANK_CHARS[j]}s`, type: 'suited', equity: eqS });

        const co1 = makeCard(rHigh, 0);
        const co2 = makeCard(rLow, 1);
        const eqO = simulateEquity(co1, co2, ITERATIONS, rng);
        results.push({ notation: `${RANK_CHARS[i]}${RANK_CHARS[j]}o`, type: 'offsuit', equity: eqO });
      }
    }
  }

  if (results.length !== 169) throw new Error(`Expected 169 starting hands, got ${results.length}`);

  results.sort((a, b) => b.equity - a.equity);

  // ---- Sanity assertions ----
  const byNotation = Object.fromEntries(results.map((r) => [r.notation, r]));

  const top = results[0];
  if (top.notation !== 'AA') throw new Error(`Sanity FAILED: expected AA ranked #1, got ${top.notation}`);
  if (!(top.equity >= 0.84 && top.equity <= 0.86)) {
    throw new Error(`Sanity FAILED: AA equity ${(top.equity * 100).toFixed(2)}% outside [84,86]`);
  }

  const rankIndex = Object.fromEntries(results.map((r, idx) => [r.notation, idx]));
  if (rankIndex['32o'] < results.length - 3) {
    throw new Error(`Sanity FAILED: 32o expected in bottom 3, rank index ${rankIndex['32o']} of ${results.length - 1}`);
  }
  const eq32o = byNotation['32o'].equity;
  if (!(eq32o >= 0.305 && eq32o <= 0.34)) {
    throw new Error(`Sanity FAILED: 32o equity ${(eq32o * 100).toFixed(2)}% outside [30.5,34]`);
  }

  const eq72o = byNotation['72o'].equity;
  if (!(eq72o >= 0.33 && eq72o <= 0.365)) {
    throw new Error(`Sanity FAILED: 72o equity ${(eq72o * 100).toFixed(2)}% outside [33,36.5]`);
  }

  if (!(byNotation['AKs'].equity > byNotation['AKo'].equity)) {
    throw new Error(
      `Sanity FAILED: AKs equity ${(byNotation['AKs'].equity * 100).toFixed(2)}% not > AKo equity ${(byNotation['AKo'].equity * 100).toFixed(2)}%`
    );
  }

  console.log('Sanity assertions: all passed.');
  console.log(`  AA equity: ${(top.equity * 100).toFixed(2)}% (rank #1)`);
  console.log(`  32o equity: ${(eq32o * 100).toFixed(2)}% (rank index ${rankIndex['32o']} of ${results.length - 1})`);
  console.log(`  72o equity: ${(eq72o * 100).toFixed(2)}% (rank index ${rankIndex['72o']} of ${results.length - 1})`);
  console.log(`  AKs ${(byNotation['AKs'].equity * 100).toFixed(2)}% > AKo ${(byNotation['AKo'].equity * 100).toFixed(2)}%`);

  // ---- Bucket assignment ----
  let cum = 0;
  const buckets = {}; // bucket -> array of results (in equity-descending order)
  for (const b of BUCKET_ORDER) buckets[b] = [];

  for (const r of results) {
    const combos = comboWeight(r.type);
    const cumBefore = cum;
    const mid = cumBefore + combos / 2;
    r.bucket = bucketForMidpoint(mid);
    r.cumBefore = cumBefore;
    cum += combos;
    r.cumAfter = cum;
    buckets[r.bucket].push(r);
  }

  if (cum !== 1326) throw new Error(`Combo total mismatch: expected 1326, got ${cum}`);

  // ---- Print TypeScript literal ----
  console.log('');
  console.log('// ---- Generated HAND_RANGE_MAP literal (paste into lib/ranges.ts) ----');
  console.log('export const HAND_RANGE_MAP: Record<string, HandRange> = {');
  for (const b of BUCKET_ORDER) {
    const line = buckets[b].map((r) => `'${r.notation}':'${b}'`).join(',');
    console.log(`  ${line},`);
  }
  console.log('};');

  // ---- Print per-bucket summary ----
  console.log('');
  console.log('// ---- Per-bucket summary ----');
  console.log('bucket        hands  combos  cumCombos  cumPct   target  targetPct');
  let cumCombos = 0;
  for (const b of BUCKET_ORDER) {
    const arr = buckets[b];
    const combos = arr.reduce((s, r) => s + comboWeight(r.type), 0);
    cumCombos += combos;
    const cumPct = ((cumCombos / 1326) * 100).toFixed(2);
    const targetPct = ((BUCKET_TARGETS[b] / 1326) * 100).toFixed(2);
    console.log(
      `${b.padEnd(12)}  ${String(arr.length).padStart(4)}  ${String(combos).padStart(6)}  ${String(cumCombos).padStart(9)}  ${cumPct.padStart(6)}%  ${String(BUCKET_TARGETS[b]).padStart(6)}  ${targetPct.padStart(6)}%`
    );
  }
}

main();
