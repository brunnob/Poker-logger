import { PreFlopAction, Hand } from './types';
import { getHandRange } from './ranges';

export const FOLD_PREFLOP_ACTIONS: PreFlopAction[] = ['fold', 'fold_to_raise', 'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_allin'];
export const isFoldPreflop = (a: PreFlopAction) => FOLD_PREFLOP_ACTIONS.includes(a);

export const VOLUNTARY_ACTIONS: PreFlopAction[] = [
  'limp', 'open', 'call_open', '3bet', 'call_3bet', '4bet_plus',
  'fold_to_3bet', 'fold_to_4bet_plus',
];
export const isVoluntary = (h: Pick<Hand, 'preFlopAction' | 'position'>) => {
  // BB limping = checking the option for free, not voluntary
  if (h.preFlopAction === 'limp' && h.position === 'BB') return false;
  return VOLUNTARY_ACTIONS.includes(h.preFlopAction);
};

export function calculateStats(hands: Hand[]) {
  const ac = { fold: 0, limp: 0, open: 0, callOpen: 0, threeBet: 0, callThreeBet: 0, fourBetPlus: 0, foldTo3Bet: 0, foldTo4BetPlus: 0, foldToRaise: 0, foldToAllin: 0 };
  const rc = { sdWin: 0, sdLoss: 0, nsWin: 0, nsLoss: 0 };
  let cBetMade = 0, cBetMissed = 0, sawFlop = 0, wentToShowdown = 0, sdWinReal = 0;
  const byPos: Record<string, { hands: number; wins: number }> = {};
  const byPosVpip: Record<string, { total: number; voluntary: number }> = {};
  const byRange: Record<string, number> = {};
  let stealOpps = 0, steals = 0;

  const STEAL_OPP_ACTIONS: PreFlopAction[] = ['open', 'fold', 'limp', 'fold_to_3bet'];
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
    }
    const stealPositions = h.playerCount === 2 ? [] : h.playerCount === 3 ? ['BTN'] : ['BTN', 'CO'];
    if (stealPositions.includes(h.position)) {
      if (STEAL_OPP_ACTIONS.includes(h.preFlopAction)) stealOpps++;
      if (STEAL_ATTEMPT_ACTIONS.includes(h.preFlopAction)) steals++;
    }
    const wasAggressor = ['open', '3bet', '4bet_plus'].includes(h.preFlopAction);
    const sawFlopThisHand = h.flopAction !== 'none';
    if (wasAggressor && sawFlopThisHand) {
      if (h.flopAction === 'cbet') cBetMade++;
      else if (h.flopAction === 'no_cbet') cBetMissed++;
    }
    if (sawFlopThisHand) sawFlop++;
    switch (h.result) {
      case 'sd_win': rc.sdWin++; break;
      case 'sd_loss': rc.sdLoss++; break;
      case 'ns_win': rc.nsWin++; break;
      case 'ns_loss': rc.nsLoss++; break;
    }
    if (sawFlopThisHand && (h.result === 'sd_win' || h.result === 'sd_loss')) {
      wentToShowdown++;
      if (h.result === 'sd_win') sdWinReal++;
    }
    if (isVoluntary(h)) {
      if (!byPos[h.position]) byPos[h.position] = { hands: 0, wins: 0 };
      byPos[h.position].hands++;
      if (h.result === 'sd_win' || h.result === 'ns_win') byPos[h.position].wins++;
    }
    if (!byPosVpip[h.position]) byPosVpip[h.position] = { total: 0, voluntary: 0 };
    byPosVpip[h.position].total++;
    if (isVoluntary(h)) byPosVpip[h.position].voluntary++;
    byRange[getHandRange(h.card1, h.card2, h.handType)] = (byRange[getHandRange(h.card1, h.card2, h.handType)] || 0) + 1;
  }

  const total = hands.length;
  const voluntary = hands.filter(isVoluntary).length;
  const pfrHands = ac.open + ac.threeBet + ac.fourBetPlus + ac.foldTo3Bet + ac.foldTo4BetPlus;
  const threeBetOpps = ac.callOpen + ac.threeBet + ac.foldTo4BetPlus;
  const threeBetCount = ac.threeBet + ac.foldTo4BetPlus;
  const foldTo3BDenom = ac.foldTo3Bet + ac.callThreeBet + ac.fourBetPlus;
  const cBetOpps = cBetMade + cBetMissed;
  const wins = rc.sdWin + rc.nsWin;

  const pct = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;
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
    winRate: pct(wins, voluntary),
    wtsd: pct(wentToShowdown, sawFlop),
    wsd: pct(sdWinReal, wentToShowdown),
    ats: pct(steals, stealOpps),
    actions: ac, results: rc, byPos, byPosVpip, byRange, sawFlop,
  };
}
