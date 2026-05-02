import { useState, useEffect, useRef, useMemo } from 'react';
import { Trash2, Undo2, BarChart3, History as HistoryIcon, ClipboardList, RotateCcw } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================
type CardRank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
type HandType = 'pair' | 'suited' | 'offsuit';
type PokerPosition = 'BB' | 'SB' | 'BTN' | 'CO' | 'HJ' | 'LJ' | 'UTG+2' | 'UTG+1' | 'UTG';
type PreFlopAction =
  | 'fold' | 'limp' | 'open' | 'call_open'
  | '3bet' | 'call_3bet' | '4bet_plus'
  | 'fold_to_3bet' | 'fold_to_4bet_plus' | 'fold_to_raise';
type FlopAction = 'cbet' | 'fold_to_cbet' | 'no_cbet' | 'none';
type HandResult = 'sd_win' | 'sd_loss' | 'ns_win' | 'ns_loss';
type HandRange = '3%' | '5%' | '8%' | '10%' | '12-15%' | '18-20%' | '25%' | '30-35%' | '40-45%' | '50%' | '60-70%';

interface Hand {
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
}

interface SessionState {
  hands: Hand[];
  playerCount: number;
  currentPositionIndex: number;
}

const CARD_RANKS: CardRank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const POSITIONS_BY_COUNT: Record<number, PokerPosition[]> = {
  2: ['BB', 'SB'],
  3: ['BB', 'SB', 'BTN'],
  4: ['BB', 'SB', 'BTN', 'CO'],
  5: ['BB', 'SB', 'BTN', 'CO', 'HJ'],
  6: ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ'],
  7: ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2'],
  8: ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1'],
  9: ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1', 'UTG'],
};

const STORAGE_KEY = 'poker_session_v1';

function getHandRange(card1: CardRank, card2: CardRank, handType: HandType): HandRange {
  const rankOrder: Record<CardRank, number> = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  const r1 = rankOrder[card1], r2 = rankOrder[card2];
  const higher = r1 >= r2 ? card1 : card2;
  const lower = r1 >= r2 ? card2 : card1;

  if (handType === 'pair') {
    if (['A', 'K', 'Q'].includes(higher)) return '3%';
    if (['J', 'T'].includes(higher)) return '5%';
    if (['9', '8'].includes(higher)) return '8%';
    if (['7', '6'].includes(higher)) return '10%';
    if (['5', '4'].includes(higher)) return '12-15%';
    return '18-20%';
  }

  if (handType === 'suited') {
    if (higher === 'A' && lower === 'K') return '3%';
    if ((higher === 'A' && lower === 'Q') || (higher === 'K' && lower === 'Q')) return '5%';
    if ((higher === 'A' && lower === 'T') || (higher === 'K' && ['J', 'T'].includes(lower)) || (higher === 'Q' && lower === 'J')) return '8%';
    if ((higher === 'A' && lower === '9') || (higher === 'K' && lower === '9') || (higher === 'Q' && lower === 'T') || (higher === 'J' && lower === 'T')) return '10%';
    if ((higher === 'A' && lower === '8') || (higher === 'K' && lower === '8') || (higher === 'Q' && lower === '9') || (higher === 'J' && lower === '9') || (higher === 'T' && lower === '9') || (higher === '9' && lower === '8')) return '12-15%';
    if ((higher === 'K' && lower === '7') || (higher === 'Q' && lower === '8') || (higher === 'J' && lower === '8') || (higher === 'T' && lower === '8') || (higher === '9' && lower === '7') || (higher === '8' && lower === '7')) return '18-20%';
    if ((higher === 'K' && lower === '6') || (higher === 'Q' && lower === '7') || (higher === 'J' && lower === '7') || (higher === 'T' && lower === '7') || (higher === '9' && lower === '6') || (higher === '8' && lower === '6') || (higher === '7' && lower === '6')) return '25%';
    if ((higher === 'K' && ['4', '5'].includes(lower)) || (higher === 'Q' && lower === '6') || (higher === 'J' && lower === '6') || (higher === 'T' && lower === '6') || (higher === '9' && lower === '5') || (higher === '8' && lower === '5') || (higher === '7' && lower === '5') || (higher === '6' && lower === '5')) return '30-35%';
    return '40-45%';
  }

  if (handType === 'offsuit') {
    if (higher === 'A' && lower === 'K') return '3%';
    if (higher === 'A' && lower === 'Q') return '5%';
    if ((higher === 'A' && lower === 'J') || (higher === 'K' && lower === 'Q')) return '8%';
    if ((higher === 'A' && lower === 'T') || (higher === 'K' && lower === 'J')) return '10%';
    if ((higher === 'A' && lower === '9') || (higher === 'K' && lower === 'T')) return '12-15%';
    if ((higher === 'A' && lower === '8') || (higher === 'K' && lower === '9') || (higher === 'Q' && lower === 'T')) return '18-20%';
    if ((higher === 'A' && lower === '7') || (higher === 'K' && lower === '8') || (higher === 'Q' && lower === '9') || (higher === 'J' && lower === 'T')) return '25%';
    if ((higher === 'A' && lower === '5') || (higher === 'K' && lower === '7') || (higher === 'Q' && lower === '8') || (higher === 'J' && lower === '9')) return '30-35%';
    if ((higher === 'A' && lower === '4') || (higher === 'K' && lower === '6') || (higher === 'Q' && lower === '7') || (higher === 'J' && lower === '8') || (higher === 'T' && lower === '8')) return '40-45%';
    if ((higher === 'A' && lower === '3') || (higher === 'K' && lower === '5') || (higher === 'Q' && lower === '6') || (higher === 'J' && lower === '7') || (higher === 'T' && lower === '7') || (higher === '9' && lower === '8')) return '50%';
    return '60-70%';
  }
  return '60-70%';
}

function calculateStats(hands: Hand[]) {
  const ac = { fold: 0, limp: 0, open: 0, callOpen: 0, threeBet: 0, callThreeBet: 0, fourBetPlus: 0, foldTo3Bet: 0, foldTo4BetPlus: 0 };
  const rc = { sdWin: 0, sdLoss: 0, nsWin: 0, nsLoss: 0 };
  let cBetMade = 0, cBetMissed = 0, sawFlop = 0;
  const byPos: Record<string, { hands: number; wins: number }> = {};
  const byPosVpip: Record<string, { total: number; voluntary: number }> = {};
  const byRange: Record<string, number> = {};

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
    }
    const wasAggressor = ['open', '3bet', '4bet_plus'].includes(h.preFlopAction);
    if (wasAggressor) {
      if (h.flopAction === 'cbet') cBetMade++;
      else if (h.flopAction === 'no_cbet') cBetMissed++;
    }
    if (h.flopAction !== 'none') sawFlop++;
    switch (h.result) {
      case 'sd_win': rc.sdWin++; break;
      case 'sd_loss': rc.sdLoss++; break;
      case 'ns_win': rc.nsWin++; break;
      case 'ns_loss': rc.nsLoss++; break;
    }
    if (h.preFlopAction !== 'fold') {
      if (!byPos[h.position]) byPos[h.position] = { hands: 0, wins: 0 };
      byPos[h.position].hands++;
      if (h.result === 'sd_win' || h.result === 'ns_win') byPos[h.position].wins++;
    }
    if (!byPosVpip[h.position]) byPosVpip[h.position] = { total: 0, voluntary: 0 };
    byPosVpip[h.position].total++;
    if (h.preFlopAction !== 'fold') byPosVpip[h.position].voluntary++;
    byRange[h.range] = (byRange[h.range] || 0) + 1;
  }

  const total = hands.length;
  const voluntary = ac.limp + ac.open + ac.callOpen + ac.threeBet + ac.callThreeBet + ac.fourBetPlus + ac.foldTo3Bet + ac.foldTo4BetPlus;
  const pfrHands = ac.open + ac.threeBet + ac.fourBetPlus + ac.foldTo3Bet + ac.foldTo4BetPlus;
  const threeBetOpps = ac.callOpen + ac.threeBet + ac.foldTo4BetPlus;
  const threeBetCount = ac.threeBet + ac.foldTo4BetPlus;
  const foldTo3BDenom = ac.foldTo3Bet + ac.callThreeBet + ac.fourBetPlus;
  const cBetOpps = cBetMade + cBetMissed;
  const wins = rc.sdWin + rc.nsWin;
  const sdTotal = rc.sdWin + rc.sdLoss;

  const pct = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;

  return {
    total, voluntary,
    vpip: pct(voluntary, total),
    pfr: pct(pfrHands, total),
    threeBet: pct(threeBetCount, threeBetOpps),
    foldTo3Bet: pct(ac.foldTo3Bet, foldTo3BDenom),
    cBet: pct(cBetMade, cBetOpps),
    winRate: pct(wins, voluntary),
    wtsd: pct(sdTotal, sawFlop),
    wsd: pct(rc.sdWin, sdTotal),
    actions: ac, results: rc, byPos, byPosVpip, byRange, sawFlop,
  };
}

function getPositions(playerCount: number): PokerPosition[] {
  return POSITIONS_BY_COUNT[playerCount] || POSITIONS_BY_COUNT[6];
}

function advancePosition(currentIndex: number, playerCount: number): number {
  const positions = getPositions(playerCount);
  const bbIndex = positions.length - 1;
  const sbIndex = positions.length - 2;
  if (currentIndex === bbIndex) return sbIndex;
  return (currentIndex + 1) % positions.length;
}

function handNotation(card1: CardRank, card2: CardRank, handType: HandType): string {
  const suffix = handType === 'pair' ? '' : handType === 'suited' ? 's' : 'o';
  return `${card1}${card2}${suffix}`;
}

const ACTION_LABEL: Record<PreFlopAction | FlopAction, string> = {
  fold: 'Fold', limp: 'Limp', open: 'Open', call_open: 'Call Open',
  '3bet': '3-Bet', call_3bet: 'Call 3B', '4bet_plus': '4-Bet+',
  fold_to_3bet: 'Fold 3B', fold_to_4bet_plus: 'Fold 4B+', fold_to_raise: 'Fold Raise',
  cbet: 'C-Bet', fold_to_cbet: 'Fold C-Bet', no_cbet: 'Check', none: '—',
};

// ============================================================
// PARSER
// ============================================================
interface ParseResult {
  hands: Omit<Hand, 'id' | 'timestamp'>[];
  errors: { line: number; text: string; reason: string }[];
}

const POSITIONS_SET = new Set(['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG', 'UTG+1', 'UTG+2']);

function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[\s\-_]/g, '');
}

const PREFLOP_ALIASES: Record<string, PreFlopAction> = {
  'fold': 'fold', 'limp': 'limp', 'open': 'open', 'callopen': 'call_open',
  '3bet': '3bet', '3b': '3bet',
  'call3bet': 'call_3bet', 'call3b': 'call_3bet',
  '4bet': '4bet_plus', '4bet+': '4bet_plus', '4betplus': '4bet_plus', '4b+': '4bet_plus', '4b': '4bet_plus',
  'foldto3bet': 'fold_to_3bet', 'foldto3b': 'fold_to_3bet', 'fold3b': 'fold_to_3bet', 'fold3bet': 'fold_to_3bet',
  'foldto4bet': 'fold_to_4bet_plus', 'foldto4bet+': 'fold_to_4bet_plus', 'foldto4betplus': 'fold_to_4bet_plus',
  'fold4b+': 'fold_to_4bet_plus', 'fold4b': 'fold_to_4bet_plus', 'fold4bet': 'fold_to_4bet_plus',
  'foldtoraise': 'fold_to_raise', 'foldraise': 'fold_to_raise',
};

const FLOP_ALIASES: Record<string, FlopAction> = {
  'cbet': 'cbet', 'cb': 'cbet',
  'nocbet': 'no_cbet', 'check': 'no_cbet',
  'foldtocbet': 'fold_to_cbet', 'foldcbet': 'fold_to_cbet',
};

const RESULT_ALIASES: Record<string, HandResult> = {
  'sdwin': 'sd_win', 'sdw': 'sd_win',
  'sdloss': 'sd_loss', 'sdlose': 'sd_loss', 'sdl': 'sd_loss',
  'nswin': 'ns_win', 'nsw': 'ns_win',
  'nsloss': 'ns_loss', 'nslose': 'ns_loss', 'nsl': 'ns_loss',
  'win': 'ns_win', 'won': 'ns_win',
  'loss': 'ns_loss', 'lost': 'ns_loss', 'lose': 'ns_loss',
};

const VALID_RANKS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);

function parseCompactHand(token: string): { card1: CardRank; card2: CardRank; handType: HandType } | null {
  const t = token.toUpperCase();
  if (t.length === 2 && VALID_RANKS.has(t[0]) && t[0] === t[1]) {
    return { card1: t[0] as CardRank, card2: t[1] as CardRank, handType: 'pair' };
  }
  if (t.length === 3 && VALID_RANKS.has(t[0]) && VALID_RANKS.has(t[1]) && (t[2] === 'S' || t[2] === 'O')) {
    if (t[0] === t[1]) return null;
    return {
      card1: t[0] as CardRank,
      card2: t[1] as CardRank,
      handType: t[2] === 'S' ? 'suited' : 'offsuit',
    };
  }
  return null;
}

function parseLine(line: string): Omit<Hand, 'id' | 'timestamp'> | { error: string } {
  let cleaned = line.replace(/^#\d+\s+\d{1,2}:\d{2}(:\d{2})?\s*\|?/, '');
  cleaned = cleaned.replace(/[|→·,]/g, ' ');
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: 'linha vazia' };

  let hand: Partial<{ card1: CardRank; card2: CardRank; handType: HandType }> = {};
  let position: PokerPosition | null = null;
  let preFlopAction: PreFlopAction | null = null;
  let flopAction: FlopAction = 'none';
  let result: HandResult | null = null;
  let pendingCards: CardRank[] = [];

  for (const raw of tokens) {
    const upper = raw.toUpperCase();
    const norm = normalizeToken(raw);

    if (POSITIONS_SET.has(upper)) { position = upper as PokerPosition; continue; }

    const compact = parseCompactHand(raw);
    if (compact && !hand.card1) { hand = compact; pendingCards = []; continue; }

    if (VALID_RANKS.has(upper) && pendingCards.length < 2 && !hand.card1) {
      pendingCards.push(upper as CardRank);
      if (pendingCards.length === 2 && pendingCards[0] === pendingCards[1]) {
        hand = { card1: pendingCards[0], card2: pendingCards[1], handType: 'pair' };
        pendingCards = [];
      }
      continue;
    }

    if ((upper === 'S' || upper === 'O') && pendingCards.length === 2) {
      hand = {
        card1: pendingCards[0],
        card2: pendingCards[1],
        handType: upper === 'S' ? 'suited' : 'offsuit',
      };
      pendingCards = [];
      continue;
    }

    if (PREFLOP_ALIASES[norm] && !preFlopAction) { preFlopAction = PREFLOP_ALIASES[norm]; continue; }
    if (FLOP_ALIASES[norm] && flopAction === 'none') { flopAction = FLOP_ALIASES[norm]; continue; }
    if (RESULT_ALIASES[norm] && !result) { result = RESULT_ALIASES[norm]; continue; }
  }

  if (!hand.card1 || !hand.card2 || !hand.handType) return { error: 'cartas não reconhecidas' };
  if (!position) return { error: 'posição não reconhecida' };
  if (!preFlopAction) return { error: 'ação pré-flop não reconhecida' };

  const isFold = ['fold', 'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_raise'].includes(preFlopAction);
  if (isFold) {
    return {
      position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
      preFlopAction, flopAction: 'none', result: 'ns_loss',
      range: getHandRange(hand.card1, hand.card2, hand.handType), playerCount: 6, smallStackMode: false,
    };
  }
  if (!result) return { error: 'resultado faltando (sd_win/sd_loss/ns_win/ns_loss)' };

  return {
    position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
    preFlopAction, flopAction, result,
    range: getHandRange(hand.card1, hand.card2, hand.handType), playerCount: 6, smallStackMode: false,
  };
}

function parseImport(text: string, defaultPlayerCount: number = 6): ParseResult {
  const result: ParseResult = { hands: [], errors: [] };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith('===') || raw.startsWith('---')) continue;
    if (/^(data|date|total|jogadores|players)\s*:/i.test(raw)) continue;
    const parsed = parseLine(raw);
    if ('error' in parsed) {
      result.errors.push({ line: i + 1, text: raw, reason: parsed.error });
    } else {
      parsed.playerCount = defaultPlayerCount;
      result.hands.push(parsed);
    }
  }
  return result;
}

// ============================================================
// MAIN APP
// ============================================================
export default function PokerLogger() {
  const [tab, setTab] = useState<'logger' | 'stats' | 'history'>('logger');
  const [session, setSession] = useState<SessionState>({
    hands: [], playerCount: 6, currentPositionIndex: 0,
  });
  const [loaded, setLoaded] = useState(false);

  const [card1, setCard1] = useState<CardRank | null>(null);
  const [card2, setCard2] = useState<CardRank | null>(null);
  const [handType, setHandType] = useState<HandType | null>(null);
  const [preFlopAction, setPreFlopAction] = useState<PreFlopAction | null>(null);
  const [flopAction, setFlopAction] = useState<FlopAction>('none');
  const [result, setResult] = useState<HandResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [smallStackMode, setSmallStackMode] = useState(false);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSession(JSON.parse(stored));
    } catch {}
    setLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
  }, [session, loaded]);

  useEffect(() => {
    if (card1 && card2 && card1 === card2) setHandType('pair');
  }, [card1, card2]);

  const positions = getPositions(session.playerCount);
  const currentPos = positions[session.currentPositionIndex];
  const stats = useMemo(() => calculateStats(session.hands), [session.hands]);

  const scrollTo = (id: string) => {
    setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const resetForm = () => {
    setCard1(null); setCard2(null); setHandType(null);
    setPreFlopAction(null); setFlopAction('none'); setResult(null);
  };

  const saveHand = (overrideResult?: HandResult, overrideAction?: PreFlopAction) => {
    const finalAction = overrideAction || preFlopAction;
    const finalResult = overrideResult || result;
    if (!card1 || !card2 || !handType || !finalAction || !finalResult) return;

    const newHand: Hand = {
      id: Math.random().toString(36).slice(2, 11),
      timestamp: Date.now(),
      position: currentPos, card1, card2, handType,
      preFlopAction: finalAction,
      flopAction: ['fold', 'fold_to_3bet', 'fold_to_4bet_plus'].includes(finalAction) ? 'none' : flopAction,
      result: finalResult,
      range: getHandRange(card1, card2, handType),
      playerCount: session.playerCount,
      smallStackMode,
    };

    setSession(prev => ({
      ...prev,
      hands: [newHand, ...prev.hands],
      currentPositionIndex: advancePosition(prev.currentPositionIndex, prev.playerCount),
    }));
    resetForm();
    showToast(`${handNotation(card1, card2, handType)} salva`);
    scrollTo('cards');
  };

  const handlePreFlopAction = (action: PreFlopAction) => {
    setPreFlopAction(action);
    if (['fold', 'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_raise'].includes(action)) {
      setTimeout(() => {
        if (card1 && card2 && handType) saveHand('ns_loss', action);
      }, 30);
    } else {
      scrollTo('flop');
    }
  };

  const undoLast = () => {
    if (session.hands.length === 0) return;
    setSession(prev => ({
      ...prev,
      hands: prev.hands.slice(1),
      currentPositionIndex: prev.currentPositionIndex === 0
        ? getPositions(prev.playerCount).length - 1
        : prev.currentPositionIndex - 1,
    }));
    showToast('Última mão desfeita');
  };

  const deleteHand = (id: string) => {
    setSession(prev => ({ ...prev, hands: prev.hands.filter(h => h.id !== id) }));
  };

  const setPlayerCount = (n: number) => {
    setSession(prev => ({ ...prev, playerCount: n, currentPositionIndex: Math.min(prev.currentPositionIndex, n - 1) }));
  };

  const setPositionIndex = (i: number) => {
    setSession(prev => ({ ...prev, currentPositionIndex: i }));
  };

  const resetSession = () => {
    setSession({ hands: [], playerCount: 6, currentPositionIndex: 0 });
    resetForm();
    setConfirmReset(false);
    showToast('Sessão zerada');
  };

  const importHands = (parsedHands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => {
    const baseTime = Date.now();
    const newHands: Hand[] = parsedHands.map((h, i) => ({
      ...h, playerCount: session.playerCount,
      id: Math.random().toString(36).slice(2, 11),
      timestamp: baseTime - (parsedHands.length - i) * 1000,
    }));
    newHands.reverse();
    setSession(prev => ({
      ...prev,
      hands: mode === 'replace' ? newHands : [...newHands, ...prev.hands],
    }));
    showToast(`${parsedHands.length} mãos importadas`);
    setTab('stats');
  };

  const canSave = card1 && card2 && handType && preFlopAction && result !== null;
  const isFoldPreFlop = preFlopAction && ['fold', 'fold_to_3bet', 'fold_to_4bet_plus'].includes(preFlopAction);

  if (!loaded) return <div className="p-8 font-mono text-sm text-stone-500">Carregando…</div>;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
      `}</style>

      <header className="sticky top-0 z-30 bg-stone-50/95 backdrop-blur border-b border-stone-300">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-stone-900 rotate-45" />
            <h1 className="mono text-xs font-bold tracking-[0.2em] uppercase">Hand Logger</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undoLast} disabled={session.hands.length === 0}
              className="p-2 text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Desfazer última mão"><Undo2 className="w-4 h-4" /></button>
            <button onClick={() => setConfirmReset(true)}
              className="p-2 text-stone-700 hover:bg-stone-200 transition-colors"
              title="Zerar sessão"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 flex">
          {([
            ['logger', 'Logger', ClipboardList],
            ['stats', 'Stats', BarChart3],
            ['history', 'Histórico', HistoryIcon],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center justify-center gap-2 ${
                tab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-stone-50 px-4 py-2 mono text-xs font-bold tracking-wider uppercase">
          {toast}
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4" onClick={() => setConfirmReset(false)}>
          <div className="bg-stone-50 border border-stone-900 max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mono text-xs font-bold tracking-wider uppercase mb-2">Zerar sessão</h3>
            <p className="text-sm text-stone-700 mb-6">Apaga todas as {session.hands.length} mãos. Não dá pra desfazer.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="flex-1 py-3 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Cancelar</button>
              <button onClick={resetSession} className="flex-1 py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800">Zerar</button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {tab === 'logger' && (
          <div className="space-y-8">
            <div className="flex items-baseline justify-between border-b border-stone-300 pb-3">
              <div>
                <span className="mono text-[10px] font-bold tracking-widest uppercase text-stone-500">Mesa</span>
                <span className="num ml-2 text-sm font-bold">{session.playerCount}-max</span>
                <span className="mono text-stone-400 mx-2">·</span>
                <span className="mono text-[10px] font-bold tracking-widest uppercase text-stone-500">Pos</span>
                <span className="num ml-2 text-sm font-bold">{currentPos}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSmallStackMode(!smallStackMode)}
                  className={`px-2 py-1 border mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    smallStackMode
                      ? "bg-stone-900 text-stone-50 border-stone-900"
                      : "bg-stone-50 text-stone-900 border-stone-300 hover:border-stone-900"
                  }`}>
                  {smallStackMode ? "✓ SS" : "SS"}
                </button>
                <span className="num text-xs text-stone-500">{session.hands.length} mãos</span>
              </div>
            </div>

            <Section title="Jogadores na mesa" step="01">
              <div className="grid grid-cols-8 gap-1">
                {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => { setPlayerCount(n); scrollTo('position'); }}
                    className={`num h-10 text-sm font-bold border transition-colors ${
                      session.playerCount === n
                        ? 'bg-stone-900 text-stone-50 border-stone-900'
                        : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                    }`}>{n}</button>
                ))}
              </div>
            </Section>

            <div ref={el => { sectionRefs.current['position'] = el; }} className="scroll-mt-20">
              <Section title="Sua posição" step="02">
                <div className="grid grid-cols-3 gap-1">
                  {positions.map((p, i) => (
                    <button key={p} onClick={() => { setPositionIndex(i); scrollTo('cards'); }}
                      className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        session.currentPositionIndex === i
                          ? 'bg-stone-900 text-stone-50 border-stone-900'
                          : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                      }`}>{p}</button>
                  ))}
                </div>
              </Section>
            </div>

            <div ref={el => { sectionRefs.current['cards'] = el; }} className="scroll-mt-20">
              <Section title="Suas cartas" step="03">
                <div className="space-y-4">
                  <CardGrid label="Carta 1" rank={CARD_RANKS} selected={card1}
                    onSelect={c => { setCard1(c); setCard2(null); setHandType(null); scrollTo('card2'); }} />
                  {card1 && (
                    <div ref={el => { sectionRefs.current['card2'] = el; }} className="scroll-mt-20">
                      <CardGrid label="Carta 2" rank={CARD_RANKS} selected={card2}
                        onSelect={c => {
                          setCard2(c);
                          if (c !== card1) { setHandType(null); scrollTo('handType'); }
                          else scrollTo('preflop');
                        }} />
                    </div>
                  )}
                  {card1 && card2 && card1 !== card2 && (
                    <div ref={el => { sectionRefs.current['handType'] = el; }} className="scroll-mt-20">
                      <Label>Tipo</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => { setHandType('suited'); scrollTo('preflop'); }}
                          className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            handType === 'suited' ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                          }`}>Suited (s)</button>
                        <button onClick={() => { setHandType('offsuit'); scrollTo('preflop'); }}
                          className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            handType === 'offsuit' ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                          }`}>Offsuit (o)</button>
                      </div>
                    </div>
                  )}
                  {card1 && card2 && handType && (
                    <div className="num text-xs text-stone-500 pt-1">
                      Notação: <span className="font-bold text-stone-900">{handNotation(card1, card2, handType)}</span>
                      <span className="mx-2">·</span>
                      Range: <span className="font-bold text-stone-900">{getHandRange(card1, card2, handType)}</span>
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {handType && (
              <div ref={el => { sectionRefs.current['preflop'] = el; }} className="scroll-mt-20">
                <Section title="Ação pré-flop" step="04">
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['fold', 'Fold'], ['fold_to_raise', 'Fold ao Raise'],
                      ['limp', 'Limp'], ['open', 'Open'],
                      ['call_open', 'Call Open'], ['3bet', '3-Bet'],
                      ['call_3bet', 'Call 3-Bet'], ['4bet_plus', '4-Bet+'],
                      ['fold_to_3bet', 'Fold ao 3-Bet'], ['fold_to_4bet_plus', 'Fold ao 4-Bet+'],
                    ] as [PreFlopAction, string][]).map(([action, label]) => (
                      <button key={action} onClick={() => handlePreFlopAction(action)}
                        className={`mono h-11 text-xs font-bold uppercase tracking-wider border transition-colors ${
                          preFlopAction === action
                            ? 'bg-stone-900 text-stone-50 border-stone-900'
                            : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                        }`}>{label}</button>
                    ))}
                  </div>
                  <p className="mono text-[10px] text-stone-500 mt-3 tracking-wider uppercase">Folds salvam automaticamente</p>
                </Section>
              </div>
            )}

            {preFlopAction && !isFoldPreFlop && (
              <div ref={el => { sectionRefs.current['flop'] = el; }} className="scroll-mt-20">
                <Section title="Ação no flop" step="05" optional>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['none', 'Não foi ao flop'],
                      ['cbet', 'C-Bet'],
                      ['no_cbet', 'Check (sem C-Bet)'],
                      ['fold_to_cbet', 'Fold ao C-Bet'],
                    ] as [FlopAction, string][]).map(([action, label]) => (
                      <button key={action} onClick={() => { setFlopAction(action); scrollTo('result'); }}
                        className={`mono h-11 text-xs font-bold uppercase tracking-wider border transition-colors ${
                          flopAction === action
                            ? 'bg-stone-900 text-stone-50 border-stone-900'
                            : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                        }`}>{label}</button>
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {preFlopAction && !isFoldPreFlop && (
              <div ref={el => { sectionRefs.current['result'] = el; }} className="scroll-mt-20">
                <Section title="Resultado" step="06">
                  <div className="grid grid-cols-2 gap-1">
                    <ResultBtn label="SD Win" variant="sd-win" selected={result === 'sd_win'} onClick={() => setResult('sd_win')} />
                    <ResultBtn label="SD Loss" variant="sd-loss" selected={result === 'sd_loss'} onClick={() => setResult('sd_loss')} />
                    <ResultBtn label="NS Win" variant="ns-win" selected={result === 'ns_win'} onClick={() => setResult('ns_win')} />
                    <ResultBtn label="NS Loss" variant="ns-loss" selected={result === 'ns_loss'} onClick={() => setResult('ns_loss')} />
                  </div>
                  <p className="mono text-[10px] text-stone-500 mt-3 tracking-wider uppercase">SD = foi a showdown · NS = ganhou/perdeu sem mostrar</p>
                </Section>
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && <StatsView stats={stats} hands={session.hands} />}
        {tab === 'history' && (
          <HistoryView hands={session.hands} existingCount={session.hands.length}
            onDelete={deleteHand} onImport={importHands} onToast={showToast} />
        )}
      </main>

      {tab === 'logger' && canSave && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-stone-50 border-t-2 border-stone-900">
          <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
            <button onClick={resetForm}
              className="px-5 py-3 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Limpar</button>
            <button onClick={() => saveHand()}
              className="flex-1 py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800">Salvar mão →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, step, optional, children }: { title: string; step: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="num text-xs font-bold text-stone-400">{step}</span>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {optional && <span className="mono text-[10px] uppercase tracking-wider text-stone-400">opcional</span>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">{children}</p>;
}

function CardGrid({ label, rank, selected, onSelect }: { label: string; rank: CardRank[]; selected: CardRank | null; onSelect: (c: CardRank) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-7 gap-1">
        {rank.map(r => (
          <button key={r} onClick={() => onSelect(r)}
            className={`num h-10 text-base font-bold border transition-colors ${
              selected === r ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
            }`}>{r}</button>
        ))}
      </div>
    </div>
  );
}

function ResultBtn({ label, variant, selected, onClick }: { label: string; variant: 'sd-win' | 'sd-loss' | 'ns-win' | 'ns-loss'; selected: boolean; onClick: () => void }) {
  const palette: Record<string, { bg: string; text: string; border: string; selBorder: string }> = {
    'sd-win':  { bg: 'bg-emerald-500',  text: 'text-white',       border: 'border-emerald-500', selBorder: 'border-emerald-900' },
    'sd-loss': { bg: 'bg-rose-500',     text: 'text-white',       border: 'border-rose-500',    selBorder: 'border-rose-900' },
    'ns-win':  { bg: 'bg-emerald-100',  text: 'text-emerald-900', border: 'border-emerald-300', selBorder: 'border-emerald-700' },
    'ns-loss': { bg: 'bg-rose-100',     text: 'text-rose-900',    border: 'border-rose-300',    selBorder: 'border-rose-700' },
  };
  const p = palette[variant];
  return (
    <button onClick={onClick}
      className={`mono h-12 text-xs font-bold uppercase tracking-wider border-2 transition-all ${p.bg} ${p.text} ${
        selected ? `${p.selBorder} ring-2 ring-offset-1 ring-stone-900` : p.border
      }`}>{label}</button>
  );
}

// ============================================================
// POSITION WIN RATE HELPER
// ============================================================
function PositionWinRate({ byPos }: { byPos: Record<string, { hands: number; wins: number }> }) {
  const allPositions: PokerPosition[] = ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1', 'UTG'];
  
  return (
    <div className="border border-stone-300">
      {allPositions.map((pos, idx) => {
        const d = byPos[pos] || { hands: 0, wins: 0 };
        const winRate = d.hands > 0 ? ((d.wins / d.hands) * 100).toFixed(0) : '0';
        return (
          <div key={pos} className={`flex items-center ${idx !== allPositions.length - 1 ? 'border-b border-stone-200' : ''} px-3 py-2`}>
            <span className="mono text-xs font-bold w-12">{pos}</span>
            <span className="num text-xs text-stone-500 w-12">{d.hands}m</span>
            <div className="flex-1 h-1.5 bg-stone-100 mx-3"><div className="h-full bg-stone-900" style={{ width: `${d.hands > 0 ? (d.wins / d.hands) * 100 : 0}%` }} /></div>
            <span className="num text-xs font-bold w-12 text-right">{winRate}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// VPIP BY POSITION HELPER
// ============================================================
function VpipByPosition({ byPosVpip }: { byPosVpip: Record<string, { total: number; voluntary: number }> }) {
  const allPositions: PokerPosition[] = ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1', 'UTG'];
  
  return (
    <div className="border border-stone-300">
      {allPositions.map((pos, idx) => {
        const d = byPosVpip[pos] || { total: 0, voluntary: 0 };
        const vpip = d.total > 0 ? ((d.voluntary / d.total) * 100).toFixed(1) : '0.0';
        return (
          <div key={pos} className={`flex items-center ${idx !== allPositions.length - 1 ? 'border-b border-stone-200' : ''} px-3 py-2`}>
            <span className="mono text-xs font-bold w-12">{pos}</span>
            <span className="num text-xs text-stone-500 w-12">{d.total}m</span>
            <div className="flex-1 h-1.5 bg-stone-100 mx-3"><div className="h-full bg-stone-900" style={{ width: `${d.total > 0 ? (d.voluntary / d.total) * 100 : 0}%` }} /></div>
            <span className="num text-xs font-bold w-12 text-right">{vpip}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// RANGE DISTRIBUTION HELPER
// ============================================================
function RangeDistribution({ byRange, total }: { byRange: Record<string, number>; total: number }) {
  const rangeGroups = [
    { label: 'Top 3%', ranges: ['3%'], pct: 3 },
    { label: 'Top 5%', ranges: ['5%'], pct: 2 },
    { label: 'Top 8%', ranges: ['8%'], pct: 3 },
    { label: 'Top 12-15%', ranges: ['12-15%'], pct: 4.5 },
    { label: 'Top 18-20%', ranges: ['18-20%'], pct: 5.5 },
    { label: 'Top 25%', ranges: ['25%'], pct: 6 },
    { label: 'Top 40%', ranges: ['30-35%', '40-45%'], pct: 17.5 },
    { label: 'Top 60%', ranges: ['50%'], pct: 10 },
    { label: 'Acima 60%', ranges: ['60-70%'], pct: 10 },
  ];

  const totalExpected = rangeGroups.slice(0, -1).reduce((sum, g) => sum + g.pct, 0);
  const acima60Expected = 100 - totalExpected;

  return (
    <div className="space-y-1">
      {rangeGroups.map((group, idx) => {
        const count = group.ranges.reduce((sum, r) => sum + (byRange[r] || 0), 0);
        const pct = ((count / total) * 100).toFixed(0);
        const expected = idx === rangeGroups.length - 1 ? acima60Expected.toFixed(1) : ((total * group.pct) / 100).toFixed(1);
        return (
          <div key={group.label} className="flex items-center border border-stone-300 px-2 py-1">
            <span className="mono text-[11px] font-bold w-20">{group.label}</span>
            <span className="num text-[11px] text-stone-500 w-10">{count}</span>
            <span className="num text-[11px] text-stone-400 w-14">exp: {expected}</span>
            <div className="flex-1 h-1 bg-stone-100 mx-2"><div className="h-full bg-stone-900" style={{ width: `${(count / total) * 100}%` }} /></div>
            <span className="num text-[11px] font-bold w-10 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// STATS VIEW
// ============================================================
function StatsView({ stats, hands }: { stats: ReturnType<typeof calculateStats>; hands: Hand[] }) {
  const [scope, setScope] = useState<'all' | 'last10' | 'last20'>('all');
  const scoped = useMemo(() => {
    if (scope === 'last10') return calculateStats(hands.slice(0, 10));
    if (scope === 'last20') return calculateStats(hands.slice(0, 20));
    return stats;
  }, [scope, hands, stats]);

  if (hands.length === 0) {
    return <div className="text-center py-20 mono text-xs uppercase tracking-widest text-stone-400">Nenhuma mão registrada</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-1">
        {([['all', 'Tudo'], ['last20', 'Últ. 20'], ['last10', 'Últ. 10']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)}
            className={`mono h-9 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
              scope === k ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
            }`}>{l}</button>
        ))}
      </div>

      <Stat label="Total / Voluntárias" value={`${scoped.total} / ${scoped.voluntary}`} hint="mãos jogadas" />

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Pré-Flop</h3>
        <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
          <Metric label="VPIP" value={scoped.vpip} />
          <Metric label="PFR" value={scoped.pfr} />
          <Metric label="3-Bet" value={scoped.threeBet} />
          <Metric label="Fold 3B" value={scoped.foldTo3Bet} />
        </div>
      </div>

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Pós-Flop</h3>
        <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
          <Metric label="C-Bet" value={scoped.cBet} />
          <Metric label="WTSD" value={scoped.wtsd} />
          <Metric label="W$SD" value={scoped.wsd} />
          <Metric label="Win Rate" value={scoped.winRate} accent />
        </div>
      </div>

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Distribuição de Ranges</h3>
        <RangeDistribution byRange={scoped.byRange} total={scoped.total} />
      </div>

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Resultados</h3>
        <ResultBars results={scoped.results} total={scoped.total} />
      </div>

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">VPIP por Posição</h3>
        <VpipByPosition byPosVpip={scoped.byPosVpip} />
      </div>

      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Win Rate por Posição</h3>
        <PositionWinRate byPos={scoped.byPos} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-b border-stone-300 pb-3">
      <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">{label}</div>
      <div className="num text-2xl font-bold">{value}</div>
      {hint && <div className="mono text-[10px] uppercase tracking-wider text-stone-400 mt-1">{hint}</div>}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`p-4 ${accent ? 'bg-stone-900 text-stone-50' : 'bg-stone-50'}`}>
      <div className={`mono text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-stone-400' : 'text-stone-500'}`}>{label}</div>
      <div className="num text-2xl font-bold mt-1">{value.toFixed(1)}<span className="text-base">%</span></div>
    </div>
  );
}

function ResultBars({ results, total }: { results: { sdWin: number; sdLoss: number; nsWin: number; nsLoss: number }; total: number }) {
  const items = [
    { label: 'SD Win', val: results.sdWin, color: 'bg-emerald-500' },
    { label: 'NS Win', val: results.nsWin, color: 'bg-emerald-200' },
    { label: 'NS Loss', val: results.nsLoss, color: 'bg-rose-200' },
    { label: 'SD Loss', val: results.sdLoss, color: 'bg-rose-500' },
  ];
  return (
    <div className="flex gap-1">
      {items.map(item => (
        <div key={item.label} className="flex-1">
          <div className={`h-6 ${item.color}`} style={{ width: '100%' }} />
          <div className="mono text-[9px] font-bold text-center mt-1">{item.label}</div>
          <div className="num text-[10px] font-bold text-center">{item.val}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// HISTORY + IMPORT
// ============================================================
function HistoryView({ hands, existingCount, onDelete, onImport, onToast }: {
  hands: Hand[]; existingCount: number;
  onDelete: (id: string) => void;
  onImport: (hands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => void;
  onToast: (msg: string) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'copied' | 'error'>('idle');

  const exportText = async () => {
    if (hands.length === 0) return;
    let txt = `=== POKER HAND LOGGER ===\n${new Date().toLocaleString('pt-BR')}\n${hands.length} mãos\n\n`;
    hands.forEach((h, i) => {
      const num = hands.length - i;
      const date = new Date(h.timestamp).toLocaleTimeString('pt-BR');
      txt += `#${num} ${date} | ${handNotation(h.card1, h.card2, h.handType)} ${h.position} | ${ACTION_LABEL[h.preFlopAction]}`;
      if (h.flopAction !== 'none') txt += ` → ${ACTION_LABEL[h.flopAction]}`;
      txt += ` | ${h.result.toUpperCase().replace('_', ' ')}\n`;
    });
    try {
      await navigator.clipboard.writeText(txt);
      setExportState('copied');
      onToast(`${hands.length} mãos copiadas`);
      setTimeout(() => setExportState('idle'), 1800);
    } catch {
      setExportState('error');
      onToast('Erro ao copiar');
      setTimeout(() => setExportState('idle'), 1800);
    }
  };

  const importLabel = showImport ? 'Fechar' : 'Importar';
  const exportLabel = exportState === 'copied' ? '✓ Copiado' : exportState === 'error' ? '✗ Erro' : 'Exportar';
  const exportClasses = exportState === 'copied' ? 'bg-emerald-600 text-white border-emerald-600'
    : exportState === 'error' ? 'bg-rose-600 text-white border-rose-600'
    : 'border-stone-900 hover:bg-stone-900 hover:text-stone-50';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => setShowImport(s => !s)}
          className={`py-3 mono text-xs font-bold uppercase tracking-wider border transition-colors ${
            showImport ? 'bg-stone-900 text-stone-50 border-stone-900' : 'border-stone-900 hover:bg-stone-900 hover:text-stone-50'
          }`}>{importLabel}</button>
        <button onClick={exportText} disabled={hands.length === 0}
          className={`py-3 border mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-900 ${exportClasses}`}>
          {exportLabel}
        </button>
      </div>

      {showImport && (
        <div className="border border-stone-300 bg-white p-4">
          <ImportView existingCount={existingCount}
            onImport={(parsedHands, mode) => { onImport(parsedHands, mode); setShowImport(false); }} />
        </div>
      )}

      {hands.length === 0 ? (
        <div className="text-center py-20 mono text-xs uppercase tracking-widest text-stone-400">Nenhuma mão registrada</div>
      ) : (
        <div className="space-y-px">
          {hands.map((h, i) => {
            const num = hands.length - i;
            const notation = handNotation(h.card1, h.card2, h.handType);
            const isWin = h.result === 'sd_win' || h.result === 'ns_win';
            const isFold = ['fold', 'fold_to_3bet', 'fold_to_4bet_plus'].includes(h.preFlopAction);
            const accent = isFold ? 'border-l-stone-300' : isWin ? 'border-l-emerald-500' : 'border-l-rose-500';
            return (
              <div key={h.id} className={`bg-stone-50 border border-stone-200 border-l-4 ${accent} p-3 flex items-center gap-3`}>
                <span className="num text-[10px] font-bold text-stone-400 w-8">#{num}</span>
                <span className="num text-base font-bold w-14">{notation}</span>
                <span className="mono text-[10px] text-stone-400">{h.range}</span>
                {h.smallStackMode && <span className="mono text-[10px] font-bold text-stone-400 bg-stone-200 px-2 py-0.5 rounded">SS</span>}
                <span className="mono text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">{h.position}</span>
                <span className="mono text-[10px] uppercase tracking-wider text-stone-700 flex-1 truncate">
                  {ACTION_LABEL[h.preFlopAction]}
                  {h.flopAction !== 'none' && <> · {ACTION_LABEL[h.flopAction]}</>}
                </span>
                <span className={`mono text-[10px] font-bold uppercase tracking-wider ${
                  isFold ? 'text-stone-400' : isWin ? 'text-emerald-700' : 'text-rose-700'
                }`}>{h.result.replace('_', ' ').toUpperCase()}</span>
                <button onClick={() => onDelete(h.id)} className="text-stone-400 hover:text-rose-600 transition-colors" title="Apagar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImportView({ existingCount, onImport }: { existingCount: number; onImport: (hands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleParse = () => setPreview(parseImport(text));
  const handleConfirm = (mode: 'replace' | 'append') => {
    if (!preview || preview.hands.length === 0) return;
    onImport(preview.hands, mode);
    setText(''); setPreview(null); setConfirming(false);
  };

  const sampleText = `# Cole o texto abaixo (ou seu próprio formato livre):
AKs CO open cbet ns_win
QQ BTN 3bet cbet sd_win
72o UTG fold
JTs BB call_open no_cbet ns_loss
AA HJ open cbet sd_win`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-600 leading-relaxed">
        Cole texto exportado pelo app ou no formato livre. Uma mão por linha. Ordem dos elementos não importa.
      </p>

      <div>
        <label className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2 block">Texto</label>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder={sampleText} spellCheck={false}
          className="num w-full h-48 p-3 border border-stone-300 bg-stone-50 text-xs leading-relaxed resize-y focus:outline-none focus:border-stone-900" />
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => { setText(''); setPreview(null); }} disabled={!text}
          className="py-3 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent">Limpar</button>
        <button onClick={handleParse} disabled={!text.trim()}
          className="py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-stone-900">Analisar texto</button>
      </div>

      {preview && (
        <div className="space-y-4 border-t border-stone-300 pt-6">
          <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
            <div className="bg-stone-50 p-4">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Válidas</div>
              <div className="num text-2xl font-bold text-emerald-700">{preview.hands.length}</div>
            </div>
            <div className="bg-stone-50 p-4">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Puladas</div>
              <div className={`num text-2xl font-bold ${preview.errors.length > 0 ? 'text-rose-700' : 'text-stone-400'}`}>{preview.errors.length}</div>
            </div>
          </div>

          {preview.hands.length > 0 && (
            <div>
              <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Preview (primeiras 5)</h3>
              <div className="space-y-px">
                {preview.hands.slice(0, 5).map((h, i) => {
                  const notation = handNotation(h.card1, h.card2, h.handType);
                  const isWin = h.result === 'sd_win' || h.result === 'ns_win';
                  const isFold = ['fold', 'fold_to_3bet', 'fold_to_4bet_plus'].includes(h.preFlopAction);
                  const accent = isFold ? 'border-l-stone-300' : isWin ? 'border-l-emerald-500' : 'border-l-rose-500';
                  return (
                    <div key={i} className={`bg-stone-50 border border-stone-200 border-l-4 ${accent} p-2 flex items-center gap-3`}>
                      <span className="num text-base font-bold w-14">{notation}</span>
                      <span className="mono text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">{h.position}</span>
                      <span className="mono text-[10px] uppercase tracking-wider text-stone-700 flex-1 truncate">
                        {ACTION_LABEL[h.preFlopAction]}
                        {h.flopAction !== 'none' && <> · {ACTION_LABEL[h.flopAction]}</>}
                      </span>
                      <span className={`mono text-[10px] font-bold uppercase tracking-wider ${
                        isFold ? 'text-stone-400' : isWin ? 'text-emerald-700' : 'text-rose-700'
                      }`}>{h.result.replace('_', ' ').toUpperCase()}</span>
                    </div>
                  );
                })}
                {preview.hands.length > 5 && (
                  <div className="mono text-[10px] uppercase tracking-wider text-stone-400 text-center py-2">+ {preview.hands.length - 5} mãos</div>
                )}
              </div>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div>
              <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-rose-700 mb-2">Linhas puladas</h3>
              <div className="space-y-1">
                {preview.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className="bg-rose-50 border border-rose-200 px-3 py-2 text-xs">
                    <span className="mono text-[10px] font-bold text-rose-700 mr-2">L{err.line}</span>
                    <span className="num text-stone-700">{err.text}</span>
                    <div className="mono text-[10px] uppercase tracking-wider text-rose-600 mt-0.5">{err.reason}</div>
                  </div>
                ))}
                {preview.errors.length > 10 && (
                  <div className="mono text-[10px] uppercase tracking-wider text-stone-400 text-center py-2">+ {preview.errors.length - 10} linhas</div>
                )}
              </div>
            </div>
          )}

          {preview.hands.length > 0 && (
            <button onClick={() => setConfirming(true)}
              className="w-full py-3 bg-emerald-600 text-white mono text-xs font-bold uppercase tracking-wider hover:bg-emerald-700">
              Importar {preview.hands.length} mão{preview.hands.length > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}

      {confirming && preview && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4" onClick={() => setConfirming(false)}>
          <div className="bg-stone-50 border border-stone-900 max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mono text-xs font-bold tracking-wider uppercase mb-3">Como importar?</h3>
            <p className="text-sm text-stone-700 mb-5 leading-relaxed">
              Você tem <span className="num font-bold">{existingCount}</span> mão{existingCount !== 1 ? 's' : ''} na sessão atual e vai importar <span className="num font-bold">{preview.hands.length}</span>.
            </p>
            <div className="space-y-2">
              <button onClick={() => handleConfirm('append')} disabled={existingCount === 0}
                className="w-full py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-stone-900">Adicionar à sessão atual</button>
              <button onClick={() => handleConfirm('replace')}
                className="w-full py-3 border border-stone-900 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Substituir tudo</button>
              <button onClick={() => setConfirming(false)}
                className="w-full py-3 mono text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-900">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
