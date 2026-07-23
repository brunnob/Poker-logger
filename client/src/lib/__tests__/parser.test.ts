import { describe, it, expect } from 'vitest';
import { Hand, PreFlopAction, FlopAction, HandResult } from '../types';
import { parseLine, parseImport, POSITIONS_SET } from '../parser';
import { buildExportText } from '../export';

// Parses a single line and fails the test (instead of returning a
// `{ error }` shape) when the line doesn't parse, so call sites can assert
// directly on the returned hand fields.
function expectParsed(line: string): Omit<Hand, 'id' | 'timestamp'> {
  const r = parseLine(line);
  if ('error' in r) throw new Error(`expected "${line}" to parse, got error: ${r.error}`);
  return r;
}

describe('C2: MP position', () => {
  it('POSITIONS_SET includes MP', () => {
    expect(POSITIONS_SET.has('MP')).toBe(true);
  });
});

// ============================================================
// C1 — legacy human-readable labels (bigram matching)
// ============================================================
describe('legacy labels re-import correctly (C1 bigram fix)', () => {
  it("'#1 12:34:56 | AKs CO | Call Open | SD WIN' => call_open / sd_win", () => {
    const r = expectParsed('#1 12:34:56 | AKs CO | Call Open | SD WIN');
    expect(r).toMatchObject({ position: 'CO', card1: 'A', card2: 'K', handType: 'suited', preFlopAction: 'call_open', result: 'sd_win' });
  });

  it("'QQ BTN | Call 3B → Check | SD LOSS' => call_3bet / no_cbet / sd_loss", () => {
    const r = expectParsed('QQ BTN | Call 3B → Check | SD LOSS');
    expect(r).toMatchObject({ position: 'BTN', card1: 'Q', card2: 'Q', handType: 'pair', preFlopAction: 'call_3bet', flopAction: 'no_cbet', result: 'sd_loss' });
  });

  it("'AQo HJ | Fold 3B | NS LOSS' => fold_to_3bet", () => {
    const r = expectParsed('AQo HJ | Fold 3B | NS LOSS');
    expect(r).toMatchObject({ position: 'HJ', card1: 'A', card2: 'Q', handType: 'offsuit', preFlopAction: 'fold_to_3bet', flopAction: 'none', result: 'ns_loss' });
  });

  it("'T9s SB | Fold Raise | NS LOSS' => fold_to_raise", () => {
    const r = expectParsed('T9s SB | Fold Raise | NS LOSS');
    expect(r).toMatchObject({ position: 'SB', card1: 'T', card2: '9', handType: 'suited', preFlopAction: 'fold_to_raise', flopAction: 'none', result: 'ns_loss' });
  });

  it("'JTs BB | Call Open → Fold C-Bet | NS LOSS' => call_open + fold_to_cbet", () => {
    const r = expectParsed('JTs BB | Call Open → Fold C-Bet | NS LOSS');
    expect(r).toMatchObject({ position: 'BB', card1: 'J', card2: 'T', handType: 'suited', preFlopAction: 'call_open', flopAction: 'fold_to_cbet', result: 'ns_loss' });
  });

  it("'A5s BTN | Fold 4B+ | NS LOSS' => fold_to_4bet_plus", () => {
    const r = expectParsed('A5s BTN | Fold 4B+ | NS LOSS');
    expect(r).toMatchObject({ position: 'BTN', card1: 'A', card2: '5', handType: 'suited', preFlopAction: 'fold_to_4bet_plus', flopAction: 'none', result: 'ns_loss' });
  });

  it("'72o UTG | Fold All-in | NS LOSS' => fold_to_allin", () => {
    const r = expectParsed('72o UTG | Fold All-in | NS LOSS');
    expect(r).toMatchObject({ position: 'UTG', card1: '7', card2: '2', handType: 'offsuit', preFlopAction: 'fold_to_allin', flopAction: 'none', result: 'ns_loss' });
  });

  it("'88 MP | Open → C-Bet | NS WIN' => position MP parses", () => {
    const r = expectParsed('88 MP | Open → C-Bet | NS WIN');
    expect(r).toMatchObject({ position: 'MP', card1: '8', card2: '8', handType: 'pair', preFlopAction: 'open', flopAction: 'cbet', result: 'ns_win' });
  });

  it('a bigram cannot mis-consume a position followed by an action ("CO open" does not normalize to any alias)', () => {
    const r = expectParsed('AKs CO open cbet ns_win');
    expect(r).toMatchObject({ position: 'CO', preFlopAction: 'open', flopAction: 'cbet', result: 'ns_win' });
  });
});

// ============================================================
// fold-type preflop actions force flopAction='none'/result='ns_loss'
// (by design — see parseImport spec note, not a defect)
// ============================================================
describe('fold-type preflop actions force flopAction=none / result=ns_loss', () => {
  it('overrides trailing flop/result tokens for an existing fold-type action (fold_to_3bet)', () => {
    const r = expectParsed('AA BB fold_to_3bet cbet sd_win');
    expect(r.preFlopAction).toBe('fold_to_3bet');
    expect(r.flopAction).toBe('none');
    expect(r.result).toBe('ns_loss');
  });

  it('also applies to the new limp_fold action', () => {
    const r = expectParsed('72o SB limp_fold cbet sd_win');
    expect(r.preFlopAction).toBe('limp_fold');
    expect(r.flopAction).toBe('none');
    expect(r.result).toBe('ns_loss');
  });
});

// ============================================================
// C5 — chronology detection on import
// ============================================================
describe('legacy order detection (C5 fix)', () => {
  it('a legacy export numbered #3,#2,#1 (newest-first) is returned reversed, oldest-first', () => {
    const legacyText = [
      '#3 10:00:00 | AA BTN | open → cbet | sd_win',
      '#2 10:01:00 | KK CO | 3bet → no_cbet | ns_loss',
      '#1 10:02:00 | QQ MP | call_open | ns_win',
    ].join('\n');
    const { hands, errors } = parseImport(legacyText);
    expect(errors).toEqual([]);
    expect(hands.map(h => h.card1)).toEqual(['Q', 'K', 'A']); // oldest (#1) first, newest (#3) last
  });

  it('an unnumbered free-format list keeps file order', () => {
    const text = [
      'AKs CO open cbet ns_win',
      'QQ BTN 3bet cbet sd_win',
      '72o UTG fold',
    ].join('\n');
    const { hands, errors } = parseImport(text);
    expect(errors).toEqual([]);
    expect(hands.map(h => h.card1)).toEqual(['A', 'Q', '7']);
  });
});

// ============================================================
// Free format (README examples + short aliases)
// ============================================================
describe('free format (README examples)', () => {
  it('parses each README example line', () => {
    expect(expectParsed('AKs CO open cbet ns_win')).toMatchObject({
      position: 'CO', card1: 'A', card2: 'K', handType: 'suited', preFlopAction: 'open', flopAction: 'cbet', result: 'ns_win',
    });
    expect(expectParsed('QQ BTN 3bet cbet sd_win')).toMatchObject({
      position: 'BTN', card1: 'Q', card2: 'Q', handType: 'pair', preFlopAction: '3bet', flopAction: 'cbet', result: 'sd_win',
    });
    expect(expectParsed('72o UTG fold')).toMatchObject({
      position: 'UTG', card1: '7', card2: '2', handType: 'offsuit', preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss',
    });
    expect(expectParsed('JTs BB call_open no_cbet ns_loss')).toMatchObject({
      position: 'BB', card1: 'J', card2: 'T', handType: 'suited', preFlopAction: 'call_open', flopAction: 'no_cbet', result: 'ns_loss',
    });
  });

  it('accepts short aliases: 3b, 4b+, cb, sdw, nsl, won, lost', () => {
    expect(expectParsed('KK BTN 3b sdw')).toMatchObject({ preFlopAction: '3bet', result: 'sd_win' });
    expect(expectParsed('AA CO 4b+ nsl')).toMatchObject({ preFlopAction: '4bet_plus', result: 'ns_loss' });
    expect(expectParsed('QQ HJ open cb won')).toMatchObject({ preFlopAction: 'open', flopAction: 'cbet', result: 'ns_win' });
    expect(expectParsed('TT BTN open cb lost')).toMatchObject({ preFlopAction: 'open', flopAction: 'cbet', result: 'ns_loss' });
  });
});

// ============================================================
// Legacy + canonical headers, and the M5 "Jogadores:" playerCount fix
// ============================================================
describe('headers', () => {
  it('skips legacy bare-header lines (no "Data:"/"Total:" label) with zero phantom errors', () => {
    const text = [
      '=== POKER HAND LOGGER ===',
      '23/07/2026, 14:30:00',
      '42 mãos',
      '',
      'AKs CO open cbet ns_win',
    ].join('\n');
    const { hands, errors } = parseImport(text);
    expect(errors).toEqual([]);
    expect(hands.length).toBe(1);
  });

  it('"Jogadores: 9" sets playerCount 9 on every parsed hand of the import', () => {
    const text = [
      '=== POKER HAND LOGGER ===',
      'Data: 23/07/2026, 14:30:00',
      'Total: 2 mãos',
      'Jogadores: 9',
      '',
      '#1 10:00:00 | AKs CO | open → cbet | ns_win',
      '#2 10:01:00 | QQ BTN | 3bet → cbet | sd_win',
    ].join('\n');
    const { hands, errors } = parseImport(text);
    expect(errors).toEqual([]);
    expect(hands.length).toBe(2);
    for (const h of hands) expect(h.playerCount).toBe(9);
  });

  it('without a "Jogadores:" header, falls back to the caller-supplied fallbackPlayerCount', () => {
    const { hands, errors } = parseImport('AKs CO open cbet ns_win', 7);
    expect(errors).toEqual([]);
    expect(hands[0].playerCount).toBe(7);
  });
});

// ============================================================
// New canonical export/import round trip (C1 + C5 + M5)
// ============================================================
const ALL_PREFLOP_ACTIONS: PreFlopAction[] = [
  'fold', 'limp', 'open', 'call_open', '3bet', 'call_3bet', '4bet_plus',
  'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_raise', 'fold_to_allin', 'limp_fold',
];
const ALL_FLOP_ACTIONS: FlopAction[] = ['cbet', 'fold_to_cbet', 'no_cbet', 'none', 'call_cbet'];
const ALL_RESULTS: HandResult[] = ['sd_win', 'sd_loss', 'ns_win', 'ns_loss'];

// One fixture per PreFlopAction, oldest (index 0) to newest (last index).
// Fold-type actions (fold, fold_to_3bet, fold_to_4bet_plus, fold_to_raise,
// fold_to_allin, limp_fold) are given flopAction 'none' / result 'ns_loss'
// up front, matching what the app itself records and what the parser always
// forces on import — see the "fold-type ... force" describe block above.
const T = (n: number) => Date.UTC(2026, 6, 23, 10, 0, 0) + n * 60_000;
const oldestFirstFixtures: Hand[] = [
  { id: 'f0', timestamp: T(0), position: 'UTG', card1: '7', card2: '2', handType: 'offsuit', preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
  { id: 'f1', timestamp: T(1), position: 'SB', card1: '6', card2: '6', handType: 'pair', preFlopAction: 'limp', flopAction: 'no_cbet', result: 'ns_win', playerCount: 6, smallStackMode: false },
  { id: 'f2', timestamp: T(2), position: 'CO', card1: 'A', card2: 'K', handType: 'suited', preFlopAction: 'open', flopAction: 'cbet', result: 'sd_win', playerCount: 6, smallStackMode: true },
  { id: 'f3', timestamp: T(3), position: 'LJ', card1: 'A', card2: 'Q', handType: 'offsuit', preFlopAction: 'fold_to_3bet', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false, notes: '3-bet muito agressivo, sem pot odds' },
  { id: 'f4', timestamp: T(4), position: 'BB', card1: 'J', card2: 'T', handType: 'suited', preFlopAction: 'call_open', flopAction: 'call_cbet', result: 'sd_loss', playerCount: 6, smallStackMode: false, notes: 'raise grande, decisão difícil no rio' },
  { id: 'f5', timestamp: T(5), position: 'BTN', card1: 'Q', card2: 'Q', handType: 'pair', preFlopAction: '3bet', flopAction: 'fold_to_cbet', result: 'ns_loss', playerCount: 6, smallStackMode: false },
  { id: 'f6', timestamp: T(6), position: 'CO', card1: 'A', card2: '5', handType: 'suited', preFlopAction: 'fold_to_4bet_plus', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
  { id: 'f7', timestamp: T(7), position: 'MP', card1: 'K', card2: 'Q', handType: 'offsuit', preFlopAction: 'call_3bet', flopAction: 'none', result: 'ns_win', playerCount: 6, smallStackMode: false },
  { id: 'f8', timestamp: T(8), position: 'SB', card1: 'T', card2: '9', handType: 'suited', preFlopAction: 'fold_to_raise', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
  { id: 'f9', timestamp: T(9), position: 'HJ', card1: 'A', card2: 'A', handType: 'pair', preFlopAction: '4bet_plus', flopAction: 'cbet', result: 'sd_win', playerCount: 6, smallStackMode: false },
  { id: 'f10', timestamp: T(10), position: 'BB', card1: 'K', card2: 'J', handType: 'offsuit', preFlopAction: 'fold_to_allin', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
  { id: 'f11', timestamp: T(11), position: 'BTN', card1: '9', card2: '9', handType: 'pair', preFlopAction: 'limp_fold', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
];

describe('new-format export/import round trip', () => {
  it('the fixture set itself covers every PreFlopAction, FlopAction, and HandResult', () => {
    expect(new Set(oldestFirstFixtures.map(h => h.preFlopAction))).toEqual(new Set(ALL_PREFLOP_ACTIONS));
    expect(new Set(oldestFirstFixtures.map(h => h.flopAction))).toEqual(new Set(ALL_FLOP_ACTIONS));
    expect(new Set(oldestFirstFixtures.map(h => h.result))).toEqual(new Set(ALL_RESULTS));
  });

  it('round-trips every field with zero errors and preserves chronological (oldest-first) order, playerCount 6', () => {
    // The in-memory session array is newest-first; buildExportText must
    // reverse it to emit oldest-first, and parseImport (ascending #n, not
    // decreasing) must hand the original oldest-first order straight back.
    const newestFirstInput = [...oldestFirstFixtures].reverse();
    const text = buildExportText(newestFirstInput, 6);
    const { hands, errors } = parseImport(text);

    expect(errors).toEqual([]);
    expect(hands.length).toBe(oldestFirstFixtures.length);

    hands.forEach((parsed, i) => {
      const expected = oldestFirstFixtures[i];
      expect(parsed.position).toBe(expected.position);
      expect(parsed.card1).toBe(expected.card1);
      expect(parsed.card2).toBe(expected.card2);
      expect(parsed.handType).toBe(expected.handType);
      expect(parsed.preFlopAction).toBe(expected.preFlopAction);
      expect(parsed.flopAction).toBe(expected.flopAction);
      expect(parsed.result).toBe(expected.result);
      expect(parsed.smallStackMode).toBe(expected.smallStackMode);
      expect(parsed.notes).toBe(expected.notes);
      expect(parsed.playerCount).toBe(6);
    });
  });

  it('hands stamped at playerCount 9 come back with playerCount 9 from the header', () => {
    // The header derives from the hands' own (modal) table size, not from the
    // fallback argument — a live session setting must never re-stamp history
    // (audit finding EXPORT-PLAYERCOUNT-SESSION-LEVEL).
    const newestFirstInput = [...oldestFirstFixtures].reverse().map(h => ({ ...h, playerCount: 9 }));
    const text = buildExportText(newestFirstInput, 6);
    expect(text).toContain('Jogadores: 9');
    const { hands, errors } = parseImport(text);

    expect(errors).toEqual([]);
    expect(hands.length).toBe(oldestFirstFixtures.length);
    for (const h of hands) expect(h.playerCount).toBe(9);
    // spot-check chronology and identity still hold under the 9-max header
    expect(hands[0].preFlopAction).toBe(oldestFirstFixtures[0].preFlopAction);
    expect(hands[hands.length - 1].preFlopAction).toBe(oldestFirstFixtures[oldestFirstFixtures.length - 1].preFlopAction);
  });
});

describe('PARSER-BIGRAM-FOLDCBET - fold + cbet are two fields, not the Fold C-Bet label', () => {
  it('free-format "72o UTG fold cbet" parses as a preflop fold, not a parse error', () => {
    const h = expectParsed('72o UTG fold cbet');
    expect(h.preFlopAction).toBe('fold');
    expect(h.flopAction).toBe('none');
    expect(h.result).toBe('ns_loss');
  });

  it('legacy "Call Open → Fold C-Bet" still resolves the flop-label bigram', () => {
    const h = expectParsed('JTs BB | Call Open → Fold C-Bet | NS LOSS');
    expect(h.preFlopAction).toBe('call_open');
    expect(h.flopAction).toBe('fold_to_cbet');
  });
});

describe('EXPORT-PLAYERCOUNT - mixed table sizes round-trip per hand', () => {
  const mk = (playerCount: number, n: number): Hand => ({
    id: `pc-${n}`, timestamp: 1000 + n, position: 'BTN', card1: 'A', card2: 'K',
    handType: 'suited', preFlopAction: 'open', flopAction: 'cbet', result: 'ns_win',
    playerCount, smallStackMode: false,
  });

  it('header carries the modal size and minority hands carry an explicit Nmax marker', () => {
    // newest-first in memory: one 6-max hand on top of two 9-max hands
    const hands = [mk(6, 3), mk(9, 2), mk(9, 1)];
    const txt = buildExportText(hands, 6);
    expect(txt).toContain('Jogadores: 9');
    expect(txt).toContain('| 6max');
    const back = parseImport(txt, 2);
    expect(back.errors).toHaveLength(0);
    expect(back.hands.map(h => h.playerCount)).toEqual([9, 9, 6]);
  });

  it('a hand logged at another size does not get re-stamped by the header', () => {
    const hands = [mk(9, 2), mk(6, 1)];
    const back = parseImport(buildExportText(hands, 9), 4);
    expect(back.errors).toHaveLength(0);
    expect(back.hands.map(h => h.playerCount).sort()).toEqual([6, 9]);
  });

  it('free-format "7max" marker overrides the fallback player count', () => {
    const r = parseImport('AKs CO open cbet ns_win 7max', 6);
    expect(r.errors).toHaveLength(0);
    expect(r.hands[0].playerCount).toBe(7);
  });
});
