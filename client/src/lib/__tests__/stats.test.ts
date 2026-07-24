import { describe, it, expect } from 'vitest';
import { Hand } from '../types';
import { calculateStats } from '../stats';

// Minimal, self-consistent default hand. Position defaults to UTG (never a
// steal position) and the action defaults to a plain fold (non-voluntary,
// zero-investment) so tests only need to override what they're exercising.
let handSeq = 0;
function makeHand(overrides: Partial<Hand> = {}): Hand {
  handSeq += 1;
  return {
    id: `hand-${handSeq}`,
    timestamp: handSeq,
    position: 'UTG',
    card1: 'A',
    card2: 'K',
    handType: 'offsuit',
    preFlopAction: 'fold',
    flopAction: 'none',
    result: 'ns_loss',
    playerCount: 6,
    smallStackMode: false,
    ...overrides,
  };
}

describe('C3 - 3-Bet% denominator includes fold_to_raise', () => {
  it('90 fold_to_raise + 5 call_open + 5 3bet => threeBet 5.0 (bug made it 50)', () => {
    const hands: Hand[] = [
      ...Array.from({ length: 90 }, () => makeHand({ preFlopAction: 'fold_to_raise' })),
      ...Array.from({ length: 5 }, () => makeHand({ preFlopAction: 'call_open' })),
      ...Array.from({ length: 5 }, () => makeHand({ preFlopAction: '3bet' })),
    ];
    const stats = calculateStats(hands);
    expect(stats.threeBet).toBeCloseTo(5.0, 6);
  });
});

describe('C4 - Win Rate population is gated on isVoluntary', () => {
  it('5 BB-limp ns_win (non-voluntary) + 1 open ns_win + 1 open ns_loss => winRate 50', () => {
    const hands: Hand[] = [
      ...Array.from({ length: 5 }, () => makeHand({ position: 'BB', preFlopAction: 'limp', result: 'ns_win' })),
      makeHand({ position: 'BTN', preFlopAction: 'open', result: 'ns_win' }),
      makeHand({ position: 'BTN', preFlopAction: 'open', result: 'ns_loss' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.winRate).toBe(50);
    expect(stats.winRate).toBeLessThanOrEqual(100);
  });
});

describe('H1 - showdown implies seeing the board', () => {
  it('preflop all-in (open, flopAction none, sd_win) counts in sawFlop, flopSeen, wtsd and wsd', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'open', flopAction: 'none', result: 'sd_win' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.sawFlop).toBe(1);
    expect(stats.flopSeen).toBe(100);
    expect(stats.wtsd).toBe(100);
    expect(stats.wsd).toBe(100);
  });
});

describe('H8 - passive preflop calls imply seeing the flop', () => {
  it('call_open with flopAction none and ns result still counts in sawFlop and the WTSD denominator', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'call_open', flopAction: 'none', result: 'ns_loss' }),
      makeHand({ preFlopAction: 'call_3bet', flopAction: 'none', result: 'ns_win' }),
      makeHand({ preFlopAction: 'limp', flopAction: 'none', result: 'ns_loss' }),
      makeHand({ preFlopAction: 'call_open', flopAction: 'none', result: 'sd_win' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.sawFlop).toBe(4);
    expect(stats.flopSeen).toBe(100);
    expect(stats.wtsd).toBe(25); // 1 showdown / 4 flops seen
  });

  it('aggressor hands with no flop action stay out of sawFlop (open can win the blinds preflop)', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'open', flopAction: 'none', result: 'ns_win' }),
      makeHand({ preFlopAction: '3bet', flopAction: 'none', result: 'ns_win' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.sawFlop).toBe(0);
    expect(stats.wtsd).toBe(0);
  });
});

describe('H3 - steals include the small blind', () => {
  it('SB open counts as a steal attempt and opportunity at playerCount 6', () => {
    const hands: Hand[] = [
      makeHand({ position: 'SB', preFlopAction: 'open', playerCount: 6 }),
    ];
    const stats = calculateStats(hands);
    expect(stats.ats).toBe(100);
  });

  it('BTN and SB both count as steal positions at playerCount 3', () => {
    const hands: Hand[] = [
      makeHand({ position: 'BTN', preFlopAction: 'fold', playerCount: 3 }), // opportunity only
      makeHand({ position: 'SB', preFlopAction: 'open', playerCount: 3 }),  // opportunity + attempt
    ];
    const stats = calculateStats(hands);
    expect(stats.ats).toBe(50);
  });

  it('heads-up (2 players) has zero steal opportunities => ats 0', () => {
    const hands: Hand[] = [
      makeHand({ position: 'SB', preFlopAction: 'open', playerCount: 2 }),
      makeHand({ position: 'BTN', preFlopAction: 'open', playerCount: 2 }),
    ];
    const stats = calculateStats(hands);
    expect(stats.ats).toBe(0);
  });
});

describe('limp_fold', () => {
  it('is voluntary (raises VPIP) from SB and CO', () => {
    const hands: Hand[] = [
      makeHand({ position: 'SB', preFlopAction: 'limp_fold' }),
      makeHand({ position: 'CO', preFlopAction: 'limp_fold' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.voluntary).toBe(2);
    expect(stats.vpip).toBe(100);
  });

  it('is NOT voluntary from BB', () => {
    const hands: Hand[] = [
      makeHand({ position: 'BB', preFlopAction: 'limp_fold' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.voluntary).toBe(0);
    expect(stats.vpip).toBe(0);
  });

  it('is excluded from foldPf (real chips already went in, unlike a zero-investment fold)', () => {
    const hands: Hand[] = [
      makeHand({ position: 'CO', preFlopAction: 'limp_fold' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.foldPf).toBe(0);
  });

  it('counts as a declined steal opportunity but not an attempt on BTN/CO/SB', () => {
    const hands: Hand[] = [
      makeHand({ position: 'CO', preFlopAction: 'limp_fold', playerCount: 6 }),
      makeHand({ position: 'BTN', preFlopAction: 'open', playerCount: 6 }),
    ];
    const stats = calculateStats(hands);
    // If limp_fold didn't count as an opportunity, ats would be 100 (1/1) instead of 50 (1/2).
    expect(stats.ats).toBe(50);
  });

  it('is not counted in PFR', () => {
    const hands: Hand[] = [
      makeHand({ position: 'CO', preFlopAction: 'limp_fold' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.pfr).toBe(0);
  });
});

describe('call_cbet / foldVsCbet', () => {
  it('2 fold_to_cbet + 2 call_cbet => foldVsCbet 50; cBet is unaffected by the caller hands', () => {
    const aggressorHands: Hand[] = [
      makeHand({ preFlopAction: 'open', flopAction: 'cbet' }),
      makeHand({ preFlopAction: 'open', flopAction: 'cbet' }),
      makeHand({ preFlopAction: 'open', flopAction: 'no_cbet' }),
    ];
    const callerHands: Hand[] = [
      makeHand({ preFlopAction: 'call_open', flopAction: 'fold_to_cbet' }),
      makeHand({ preFlopAction: 'call_open', flopAction: 'fold_to_cbet' }),
      makeHand({ preFlopAction: 'call_open', flopAction: 'call_cbet' }),
      makeHand({ preFlopAction: 'call_open', flopAction: 'call_cbet' }),
    ];
    const statsAggressorOnly = calculateStats(aggressorHands);
    const statsWithCallers = calculateStats([...aggressorHands, ...callerHands]);

    expect(statsWithCallers.foldVsCbet).toBe(50);
    expect(statsAggressorOnly.cBet).toBeCloseTo(200 / 3, 6);
    expect(statsWithCallers.cBet).toBe(statsAggressorOnly.cBet);
  });
});

describe('preserved behaviors', () => {
  it('VPIP counts fold_to_3bet and fold_to_4bet_plus', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'fold_to_3bet' }),
      makeHand({ preFlopAction: 'fold_to_4bet_plus' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.voluntary).toBe(2);
    expect(stats.vpip).toBe(100);
  });

  it('PFR = open + 3bet + 4bet_plus + fold_to_3bet + fold_to_4bet_plus', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'open' }),
      makeHand({ preFlopAction: '3bet' }),
      makeHand({ preFlopAction: '4bet_plus' }),
      makeHand({ preFlopAction: 'fold_to_3bet' }),
      makeHand({ preFlopAction: 'fold_to_4bet_plus' }),
      ...Array.from({ length: 5 }, () => makeHand({ preFlopAction: 'fold' })),
    ];
    const stats = calculateStats(hands);
    expect(stats.pfr).toBe(50);
  });

  it('foldTo3Bet formula is unchanged: fold / (fold + call + 4bet) facing a 3-bet', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'fold_to_3bet' }),
      makeHand({ preFlopAction: 'call_3bet' }),
      makeHand({ preFlopAction: '4bet_plus' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.foldTo3Bet).toBeCloseTo(100 / 3, 6);
  });

  it('BB plain limp is excluded from VPIP', () => {
    const hands: Hand[] = [
      makeHand({ position: 'BB', preFlopAction: 'limp' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.voluntary).toBe(0);
    expect(stats.vpip).toBe(0);
  });

  it('every returned numeric stat is finite (never NaN) for an empty hand list', () => {
    const stats = calculateStats([]);
    const numericStats = Object.entries(stats).filter(([, v]) => typeof v === 'number');
    expect(numericStats.length).toBeGreaterThan(0);
    const nonFinite = numericStats.filter(([, v]) => !Number.isFinite(v));
    expect(nonFinite).toEqual([]);
  });

  it('every returned numeric stat is finite (never NaN) for an all-fold hand list', () => {
    const hands: Hand[] = Array.from({ length: 8 }, () => makeHand({ preFlopAction: 'fold' }));
    const stats = calculateStats(hands);
    const numericStats = Object.entries(stats).filter(([, v]) => typeof v === 'number');
    expect(numericStats.length).toBeGreaterThan(0);
    const nonFinite = numericStats.filter(([, v]) => !Number.isFinite(v));
    expect(nonFinite).toEqual([]);
  });
});

describe('AUD-1 - foldVsCbet is caller-only', () => {
  it('an aggressor folding to a donk-bet does not enter foldVsCbet', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'open', flopAction: 'fold_to_cbet', result: 'ns_loss' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.foldVsCbet).toBe(0);
    expect(stats.cBet).toBe(0);
  });

  it('caller-side fold_to_cbet/call_cbet still drive the stat', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'call_open', flopAction: 'fold_to_cbet', result: 'ns_loss' }),
      makeHand({ preFlopAction: 'call_open', flopAction: 'call_cbet', result: 'sd_loss' }),
    ];
    expect(calculateStats(hands).foldVsCbet).toBeCloseTo(50, 6);
  });
});

describe('AUD-2 - fold-type hands can never see a flop or showdown', () => {
  it('a corrupted fold hand carrying flopAction=cbet and result=sd_win stays out of sawFlop/WTSD/W$SD', () => {
    const hands: Hand[] = [
      makeHand({ preFlopAction: 'fold', flopAction: 'cbet', result: 'sd_win' }),
    ];
    const stats = calculateStats(hands);
    expect(stats.sawFlop).toBe(0);
    expect(stats.flopSeen).toBe(0);
    expect(stats.wtsd).toBe(0);
    expect(stats.wsd).toBe(0);
    expect(stats.cBet).toBe(0);
  });
});
