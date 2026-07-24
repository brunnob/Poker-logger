import { PreFlopAction, Hand } from './types';
import { getHandRange } from './ranges';

export const FOLD_PREFLOP_ACTIONS: PreFlopAction[] = ['fold', 'fold_to_raise', 'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_allin', 'limp_fold'];
export const isFoldPreflop = (a: PreFlopAction) => FOLD_PREFLOP_ACTIONS.includes(a);

// Passive actions that close the preflop betting: a raise arriving behind
// would have been logged as call_3bet / fold_to_raise / fold_to_3bet /
// limp_fold instead, so a hand saved with one of these necessarily reached
// the flop even when no flop action was recorded.
export const FLOP_IMPLIED_ACTIONS: PreFlopAction[] = ['limp', 'call_open', 'call_3bet'];

export const VOLUNTARY_ACTIONS: PreFlopAction[] = [
  'limp', 'open', 'call_open', '3bet', 'call_3bet', '4bet_plus',
  'fold_to_3bet', 'fold_to_4bet_plus', 'limp_fold',
];
export const isVoluntary = (h: Pick<Hand, 'preFlopAction' | 'position'>) => {
  // BB limping = checking the option for free, not voluntary (limp-folding from BB is the same free option)
  if ((h.preFlopAction === 'limp' || h.preFlopAction === 'limp_fold') && h.position === 'BB') return false;
  return VOLUNTARY_ACTIONS.includes(h.preFlopAction);
};

export function calculateStats(hands: Hand[]) {
  const ac = {
    fold: 0, limp: 0, open: 0, callOpen: 0, threeBet: 0, callThreeBet: 0, fourBetPlus: 0,
    foldTo3Bet: 0, foldTo4BetPlus: 0, foldToRaise: 0, foldToAllin: 0, limpFold: 0,
  };
  const rc = { sdWin: 0, sdLoss: 0, nsWin: 0, nsLoss: 0 };
  let cBetMade = 0, cBetMissed = 0, sawFlop = 0, wentToShowdown = 0, sdWinReal = 0;
  let foldToCbetCount = 0, callCbetCount = 0;
  const byPos: Record<string, { hands: number; wins: number }> = {};
  const byPosVpip: Record<string, { total: number; voluntary: number }> = {};
  const byRange: Record<string, number> = {};
  let stealOpps = 0, steals = 0, voluntaryWins = 0;

  const STEAL_OPP_ACTIONS: PreFlopAction[] = ['open', 'fold', 'limp', 'fold_to_3bet', 'limp_fold'];
  const STEAL_ATTEMPT_ACTIONS: PreFlopAction[] = ['open', 'fold_to_3bet'];

  for (const h of hands) {
    switch (h.preFlopAction) {
      case 'fold': ac.fold++; break;
      case 'limp': ac.limp++; break;
      case 'open': ac.open++; break;
      case 'call_open': ac.callOpen++; break;
      case '3bet': ac.threeBet++; break;
      case 'call_3bet': ac.callThreeBet++; break;
      case '4bet_plus': ac.fourBetPlus++; break;
      case 'fold_to_3bet': ac.foldTo3Bet++; break;
      case 'fold_to_4bet_plus': ac.foldTo4BetPlus++; break;
      case 'fold_to_raise': ac.foldToRaise++; break;
      case 'fold_to_allin': ac.foldToAllin++; break;
      case 'limp_fold': ac.limpFold++; break;
    }
    const stealPositions = h.playerCount === 2 ? [] : h.playerCount === 3 ? ['BTN', 'SB'] : ['BTN', 'CO', 'SB'];
    if (stealPositions.includes(h.position)) {
      if (STEAL_OPP_ACTIONS.includes(h.preFlopAction)) stealOpps++;
      if (STEAL_ATTEMPT_ACTIONS.includes(h.preFlopAction)) steals++;
    }
    const wasAggressor = ['open', '3bet', '4bet_plus'].includes(h.preFlopAction);
    // A hand folded preflop can never see a flop or reach showdown, whatever a
    // corrupted record claims. Otherwise, a showdown always means the board was
    // seen, even on a preflop all-in with no flop action recorded.
    const foldedPreflop = isFoldPreflop(h.preFlopAction);
    const sawShowdown = !foldedPreflop && (h.result === 'sd_win' || h.result === 'sd_loss');
    const sawFlopThisHand = !foldedPreflop
      && (h.flopAction !== 'none' || sawShowdown || FLOP_IMPLIED_ACTIONS.includes(h.preFlopAction));
    if (wasAggressor && sawFlopThisHand) {
      if (h.flopAction === 'cbet') cBetMade++;
      else if (h.flopAction === 'no_cbet') cBetMissed++;
    }
    // Fold vs C-Bet describes calling-range behavior: the preflop aggressor
    // cannot face a c-bet (a donk-bet faced is not one), so aggressor hands
    // stay out of both counters.
    if (!wasAggressor && h.flopAction === 'fold_to_cbet') foldToCbetCount++;
    else if (!wasAggressor && h.flopAction === 'call_cbet') callCbetCount++;
    if (sawFlopThisHand) sawFlop++;
    switch (h.result) {
      case 'sd_win': rc.sdWin++; break;
      case 'sd_loss': rc.sdLoss++; break;
      case 'ns_win': rc.nsWin++; break;
      case 'ns_loss': rc.nsLoss++; break;
    }
    if (sawShowdown) {
      wentToShowdown++;
      if (h.result === 'sd_win') sdWinReal++;
    }
    if (isVoluntary(h)) {
      if (!byPos[h.position]) byPos[h.position] = { hands: 0, wins: 0 };
      byPos[h.position].hands++;
      if (h.result === 'sd_win' || h.result === 'ns_win') {
        byPos[h.position].wins++;
        voluntaryWins++;
      }
    }
    if (!byPosVpip[h.position]) byPosVpip[h.position] = { total: 0, voluntary: 0 };
    byPosVpip[h.position].total++;
    if (isVoluntary(h)) byPosVpip[h.position].voluntary++;
    byRange[getHandRange(h.card1, h.card2, h.handType)] = (byRange[getHandRange(h.card1, h.card2, h.handType)] || 0) + 1;
  }

  const total = hands.length;
  const voluntary = hands.filter(isVoluntary).length;
  const pfrHands = ac.open + ac.threeBet + ac.fourBetPlus + ac.foldTo3Bet + ac.foldTo4BetPlus;
  // foldToAllin stays excluded here by design: facing an open-shove isn't a standard 3-bet spot.
  const threeBetOpps = ac.foldToRaise + ac.callOpen + ac.threeBet + ac.foldTo4BetPlus;
  const threeBetCount = ac.threeBet + ac.foldTo4BetPlus;
  const foldTo3BDenom = ac.foldTo3Bet + ac.callThreeBet + ac.fourBetPlus;
  const cBetOpps = cBetMade + cBetMissed;

  const pct = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;
  // Zero-investment folds only; limp_fold already put chips in, so it stays out of this bucket.
  const foldPfCount = ac.fold + ac.foldToRaise + ac.foldToAllin;
  const foldPfPct = pct(foldPfCount, total);

  return {
    total, voluntary,
    vpip: pct(voluntary, total),
    pfr: pct(pfrHands, total),
    threeBet: pct(threeBetCount, threeBetOpps),
    foldTo3Bet: pct(ac.foldTo3Bet, foldTo3BDenom),
    foldPf: foldPfPct,
    cBet: pct(cBetMade, cBetOpps),
    foldVsCbet: pct(foldToCbetCount, foldToCbetCount + callCbetCount),
    winRate: pct(voluntaryWins, voluntary),
    wtsd: pct(wentToShowdown, sawFlop),
    wsd: pct(sdWinReal, wentToShowdown),
    ats: pct(steals, stealOpps),
    flopSeen: pct(sawFlop, total),
    actions: ac, results: rc, byPos, byPosVpip, byRange, sawFlop,
  };
}
