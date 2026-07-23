// ============================================================
// TYPES
// ============================================================
export type CardRank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type HandType = 'pair' | 'suited' | 'offsuit';
export type PokerPosition = 'BB' | 'SB' | 'BTN' | 'CO' | 'HJ' | 'LJ' | 'UTG+2' | 'UTG+1' | 'UTG';
export type PreFlopAction =
  | 'fold' | 'limp' | 'open' | 'call_open'
  | '3bet' | 'call_3bet' | '4bet_plus'
  | 'fold_to_3bet' | 'fold_to_4bet_plus' | 'fold_to_raise' | 'fold_to_allin';
export type FlopAction = 'cbet' | 'fold_to_cbet' | 'no_cbet' | 'none';
export type HandResult = 'sd_win' | 'sd_loss' | 'ns_win' | 'ns_loss';
export type HandRange = '3%' | '5%' | '8%' | '10%' | '12-15%' | '18-20%' | '25%' | '30-35%' | '40-45%' | '50%' | '60-70%';

export interface Hand {
  id: string;
  timestamp: number;
  position: PokerPosition;
  card1: CardRank;
  card2: CardRank;
  handType: HandType;
  preFlopAction: PreFlopAction;
  flopAction: FlopAction;
  result: HandResult;
  range: HandRange;
  playerCount: number;
  smallStackMode: boolean;
  notes?: string;
}

export interface SessionState {
  hands: Hand[];
  playerCount: number;
  currentPositionIndex: number;
}

export const CARD_RANKS: CardRank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export const POSITIONS_BY_COUNT: Record<number, PokerPosition[]> = {
  2: ['BB', 'SB'],
  3: ['BB', 'SB', 'BTN'],
  4: ['BB', 'SB', 'BTN', 'UTG'],
  5: ['BB', 'SB', 'BTN', 'CO', 'UTG'],
  6: ['BB', 'SB', 'BTN', 'CO', 'MP', 'UTG'],
  7: ['BB', 'SB', 'BTN', 'CO', 'MP', 'UTG+1', 'UTG'],
  8: ['BB', 'SB', 'BTN', 'CO', 'MP', 'UTG+2', 'UTG+1', 'UTG'],
  9: ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1', 'UTG'],
};

export const STORAGE_KEY = 'poker_session_v1';

export const RANK_ORDER: Record<CardRank, number> = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

export const ACTION_LABEL: Record<PreFlopAction | FlopAction, string> = {
  fold: 'Fold', limp: 'Limp', open: 'Open', call_open: 'Call Open',
  '3bet': '3-Bet', call_3bet: 'Call 3B', '4bet_plus': '4-Bet+',
  fold_to_3bet: 'Fold 3B', fold_to_4bet_plus: 'Fold 4B+', fold_to_raise: 'Fold Raise', fold_to_allin: 'Fold All-in',
  cbet: 'C-Bet', fold_to_cbet: 'Fold C-Bet', no_cbet: 'Check', none: '—',
};

export function getPositions(playerCount: number): PokerPosition[] {
  return POSITIONS_BY_COUNT[playerCount] || POSITIONS_BY_COUNT[6];
}

export function advancePosition(currentIndex: number, playerCount: number): number {
  const positions = getPositions(playerCount);
  const bbIndex = positions.length - 1;
  const sbIndex = positions.length - 2;
  if (currentIndex === sbIndex) return bbIndex;
  return (currentIndex + 1) % positions.length;
}
