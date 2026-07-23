import { Hand, PokerPosition, CardRank, HandType, PreFlopAction, FlopAction, HandResult } from './types';
import { isFoldPreflop } from './stats';
import { getHandRange } from './ranges';

// ============================================================
// PARSER
// ============================================================
export interface ParseResult {
  hands: Omit<Hand, 'id' | 'timestamp'>[];
  errors: { line: number; text: string; reason: string }[];
}

export const POSITIONS_SET = new Set(['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ', 'UTG', 'UTG+1', 'UTG+2']);

export function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[\s\-_]/g, '');
}

export const PREFLOP_ALIASES: Record<string, PreFlopAction> = {
  'fold': 'fold', 'limp': 'limp', 'open': 'open', 'callopen': 'call_open',
  '3bet': '3bet', '3b': '3bet',
  'call3bet': 'call_3bet', 'call3b': 'call_3bet',
  '4bet': '4bet_plus', '4bet+': '4bet_plus', '4betplus': '4bet_plus', '4b+': '4bet_plus', '4b': '4bet_plus',
  'foldto3bet': 'fold_to_3bet', 'foldto3b': 'fold_to_3bet', 'fold3b': 'fold_to_3bet', 'fold3bet': 'fold_to_3bet',
  'foldto4bet': 'fold_to_4bet_plus', 'foldto4bet+': 'fold_to_4bet_plus', 'foldto4betplus': 'fold_to_4bet_plus',
  'fold4b+': 'fold_to_4bet_plus', 'fold4b': 'fold_to_4bet_plus', 'fold4bet': 'fold_to_4bet_plus',
  'foldtoraise': 'fold_to_raise', 'foldraise': 'fold_to_raise',
  'foldtoallin': 'fold_to_allin', 'foldallin': 'fold_to_allin', 'foldpallin': 'fold_to_allin', 'foldpvallin': 'fold_to_allin',
};

export const FLOP_ALIASES: Record<string, FlopAction> = {
  'cbet': 'cbet', 'cb': 'cbet',
  'nocbet': 'no_cbet', 'check': 'no_cbet',
  'foldtocbet': 'fold_to_cbet', 'foldcbet': 'fold_to_cbet',
};

export const RESULT_ALIASES: Record<string, HandResult> = {
  'sdwin': 'sd_win', 'sdw': 'sd_win',
  'sdloss': 'sd_loss', 'sdlose': 'sd_loss', 'sdl': 'sd_loss',
  'nswin': 'ns_win', 'nsw': 'ns_win',
  'nsloss': 'ns_loss', 'nslose': 'ns_loss', 'nsl': 'ns_loss',
  'win': 'ns_win', 'won': 'ns_win',
  'loss': 'ns_loss', 'lost': 'ns_loss', 'lose': 'ns_loss',
};

export const VALID_RANKS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);

export function parseCompactHand(token: string): { card1: CardRank; card2: CardRank; handType: HandType } | null {
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

export function parseLine(line: string): Omit<Hand, 'id' | 'timestamp'> | { error: string } {
  // Extract inline Notes: ... and SS mode markers before tokenizing
  let notes: string | undefined;
  const notesMatch = line.match(/[|·]?\s*Notes?\s*:\s*(.+?)\s*$/i);
  if (notesMatch) {
    notes = notesMatch[1].trim();
    line = line.slice(0, notesMatch.index);
  }
  const ssMatch = line.match(/[|·]?\s*SS\s*mode\b/i);
  const smallStackMode = !!ssMatch;
  if (ssMatch) line = line.slice(0, ssMatch.index) + line.slice(ssMatch.index + ssMatch[0].length);

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

  const isFold = isFoldPreflop(preFlopAction);
  if (isFold) {
    return {
      position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
      preFlopAction, flopAction: 'none', result: 'ns_loss',
      range: getHandRange(hand.card1, hand.card2, hand.handType), playerCount: 6, smallStackMode,
      ...(notes && { notes }),
    };
  }
  if (!result) return { error: 'resultado faltando (sd_win/sd_loss/ns_win/ns_loss)' };

  return {
    position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
    preFlopAction, flopAction, result,
    range: getHandRange(hand.card1, hand.card2, hand.handType), playerCount: 6, smallStackMode,
    ...(notes && { notes }),
  };
}

export function parseImport(text: string, defaultPlayerCount: number = 6): ParseResult {
  const result: ParseResult = { hands: [], errors: [] };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith('===') || raw.startsWith('---')) continue;
    if (/^(data|date|total|jogadores|players|notes|notas|obs)\s*:/i.test(raw)) {
      if (/^(notes|notas)\s*:/i.test(raw) && result.hands.length > 0) {
        const note = raw.replace(/^(notes|notas)\s*:\s*/i, '').trim();
        if (note) result.hands[result.hands.length - 1].notes = note;
      }
      continue;
    }
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
