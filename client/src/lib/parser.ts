import { Hand, PokerPosition, CardRank, HandType, PreFlopAction, FlopAction, HandResult } from './types';
import { isFoldPreflop } from './stats';

// ============================================================
// PARSER
// ============================================================
export interface ParseResult {
  hands: Omit<Hand, 'id' | 'timestamp'>[];
  errors: { line: number; text: string; reason: string }[];
}

export const POSITIONS_SET = new Set(['BB', 'SB', 'BTN', 'CO', 'MP', 'HJ', 'LJ', 'UTG', 'UTG+1', 'UTG+2']);

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
  'limpfold': 'limp_fold',
};

export const FLOP_ALIASES: Record<string, FlopAction> = {
  'cbet': 'cbet', 'cb': 'cbet',
  'nocbet': 'no_cbet', 'check': 'no_cbet',
  'foldtocbet': 'fold_to_cbet', 'foldcbet': 'fold_to_cbet',
  'callcbet': 'call_cbet',
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
  if (notesMatch && notesMatch.index !== undefined) {
    notes = notesMatch[1].trim();
    line = line.slice(0, notesMatch.index);
  }
  const ssMatch = line.match(/[|·]?\s*SS\s*mode\b/i);
  const smallStackMode = !!ssMatch;
  if (ssMatch && ssMatch.index !== undefined) {
    line = line.slice(0, ssMatch.index) + line.slice(ssMatch.index + ssMatch[0].length);
  }

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

  let i = 0;
  while (i < tokens.length) {
    const raw = tokens[i];
    const nextRaw = tokens[i + 1];

    // Bigram pass (C1 fix): legacy human-readable exports split one action
    // across two whitespace-separated tokens ("Call Open", "Fold 3B", "SD
    // WIN", "Fold C-Bet"...). At every position, try the combined/normalized
    // pair against the alias maps FIRST, in the same precedence used by the
    // single-token pass below (preflop if unset, then flop if still 'none',
    // then result if unset), and consume BOTH tokens on a hit. A bigram can
    // only fire on an exact alias-map key match, so it can never mis-consume
    // a card or position token followed by an action: e.g. "CO open"
    // normalizes to "coopen", which is not a key in any alias map, so "CO"
    // and "open" each fall through to the single-token logic below, one
    // token at a time, exactly as before.
    if (nextRaw !== undefined) {
      const bigram = normalizeToken(raw + nextRaw);
      if (!preFlopAction && PREFLOP_ALIASES[bigram]) {
        preFlopAction = PREFLOP_ALIASES[bigram];
        i += 2;
        continue;
      }
      if (flopAction === 'none' && FLOP_ALIASES[bigram]) {
        flopAction = FLOP_ALIASES[bigram];
        i += 2;
        continue;
      }
      if (!result && RESULT_ALIASES[bigram]) {
        result = RESULT_ALIASES[bigram];
        i += 2;
        continue;
      }
    }

    const upper = raw.toUpperCase();
    const norm = normalizeToken(raw);

    if (POSITIONS_SET.has(upper)) { position = upper as PokerPosition; i++; continue; }

    const compact = parseCompactHand(raw);
    if (compact && !hand.card1) { hand = compact; pendingCards = []; i++; continue; }

    if (VALID_RANKS.has(upper) && pendingCards.length < 2 && !hand.card1) {
      pendingCards.push(upper as CardRank);
      if (pendingCards.length === 2 && pendingCards[0] === pendingCards[1]) {
        hand = { card1: pendingCards[0], card2: pendingCards[1], handType: 'pair' };
        pendingCards = [];
      }
      i++;
      continue;
    }

    if ((upper === 'S' || upper === 'O') && pendingCards.length === 2) {
      hand = {
        card1: pendingCards[0],
        card2: pendingCards[1],
        handType: upper === 'S' ? 'suited' : 'offsuit',
      };
      pendingCards = [];
      i++;
      continue;
    }

    if (PREFLOP_ALIASES[norm] && !preFlopAction) { preFlopAction = PREFLOP_ALIASES[norm]; i++; continue; }
    if (FLOP_ALIASES[norm] && flopAction === 'none') { flopAction = FLOP_ALIASES[norm]; i++; continue; }
    if (RESULT_ALIASES[norm] && !result) { result = RESULT_ALIASES[norm]; i++; continue; }

    i++;
  }

  if (!hand.card1 || !hand.card2 || !hand.handType) return { error: 'cartas não reconhecidas' };
  if (!position) return { error: 'posição não reconhecida' };
  if (!preFlopAction) return { error: 'ação pré-flop não reconhecida' };

  // fold-type preflop actions never see a flop and never reach a result
  // choice in the UI (they auto-save): force the derived fields so imports
  // agree with how the app itself records these hands.
  const isFold = isFoldPreflop(preFlopAction) || preFlopAction === 'limp_fold';
  if (isFold) {
    return {
      position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
      preFlopAction, flopAction: 'none', result: 'ns_loss',
      playerCount: 6, smallStackMode,
      ...(notes && { notes }),
    };
  }
  if (!result) return { error: 'resultado faltando (sd_win/sd_loss/ns_win/ns_loss)' };

  return {
    position, card1: hand.card1, card2: hand.card2, handType: hand.handType,
    preFlopAction, flopAction, result,
    playerCount: 6, smallStackMode,
    ...(notes && { notes }),
  };
}

export function parseImport(text: string, fallbackPlayerCount: number = 6): ParseResult {
  const result: ParseResult = { hands: [], errors: [] };
  const lines = text.split('\n');

  // A "Jogadores: N" / "Players: N" header line (already skipped as a header
  // below) also fixes the table size for every hand of this import; a text
  // with no such header falls back to fallbackPlayerCount for all hands.
  const playerCountMatch = text.match(/^\s*(jogadores|players)\s*:\s*(\d+)/im);
  const playerCount = playerCountMatch ? parseInt(playerCountMatch[2], 10) : fallbackPlayerCount;

  const handNumbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith('===') || raw.startsWith('---')) continue;
    // Legacy export headers that predate the "Data:"/"Total:" labels below —
    // a bare datetime line and a bare "N mãos" count line — used to fall
    // through to parseLine and show up as phantom parse errors (C1).
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(raw)) continue;
    if (/^\d+\s+m(ã|a)os\b/i.test(raw)) continue;
    if (/^(data|date|total|jogadores|players|notes|notas|obs)\s*:/i.test(raw)) {
      if (/^(notes|notas)\s*:/i.test(raw) && result.hands.length > 0) {
        const note = raw.replace(/^(notes|notas)\s*:\s*/i, '').trim();
        if (note) result.hands[result.hands.length - 1].notes = note;
      }
      continue;
    }

    const numMatch = raw.match(/^#(\d+)/);
    if (numMatch) handNumbers.push(parseInt(numMatch[1], 10));

    const parsed = parseLine(raw);
    if ('error' in parsed) {
      result.errors.push({ line: i + 1, text: raw, reason: parsed.error });
    } else {
      parsed.playerCount = playerCount;
      result.hands.push(parsed);
    }
  }

  // Legacy exports numbered newest-first (#3, #2, #1 top to bottom); the
  // current format numbers oldest-first (#1, #2, #3 top to bottom).
  // parseImport always returns hands oldest-first, so detect a strictly
  // descending "#n" sequence (C5) and flip the parsed order to match.
  const isLegacyDescending = handNumbers.length >= 2 &&
    handNumbers.every((n, idx) => idx === 0 || n < handNumbers[idx - 1]);
  if (isLegacyDescending) result.hands.reverse();

  return result;
}
