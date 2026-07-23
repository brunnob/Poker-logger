import {
  Hand, SessionState, CardRank, HandType, PokerPosition, PreFlopAction, FlopAction, HandResult,
  CARD_RANKS, POSITIONS_BY_COUNT, getPositions,
} from './types';

// ============================================================
// STORAGE (pure, unit-testable localStorage <-> SessionState bridge)
// ============================================================

const DEFAULT_SESSION: SessionState = { hands: [], playerCount: 6, currentPositionIndex: 0 };

// Runtime mirrors of the current type-level unions in ./types. Hardcoded
// (rather than derived from ACTION_LABEL) so a value from an older schema
// that no longer exists (e.g. a removed action) is reliably rejected.
const VALID_CARD_RANKS = new Set<string>(CARD_RANKS);
const VALID_HAND_TYPES = new Set<string>(['pair', 'suited', 'offsuit'] satisfies HandType[]);
const VALID_POSITIONS = new Set<string>(Object.values(POSITIONS_BY_COUNT).flat());
const VALID_PREFLOP_ACTIONS = new Set<string>([
  'fold', 'limp', 'open', 'call_open',
  '3bet', 'call_3bet', '4bet_plus',
  'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_raise', 'fold_to_allin', 'limp_fold',
] satisfies PreFlopAction[]);
const VALID_FLOP_ACTIONS = new Set<string>([
  'cbet', 'fold_to_cbet', 'no_cbet', 'none', 'call_cbet',
] satisfies FlopAction[]);
const VALID_RESULTS = new Set<string>([
  'sd_win', 'sd_loss', 'ns_win', 'ns_loss',
] satisfies HandResult[]);

function cloneDefaultSession(): SessionState {
  return { hands: [], playerCount: DEFAULT_SESSION.playerCount, currentPositionIndex: DEFAULT_SESSION.currentPositionIndex };
}

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function normalizePlayerCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 9 ? value : fallback;
}

// Validates + rebuilds a single hand from an unknown blob. Returns null when
// any field that drives stats/parsing (cards, handType, position, actions,
// result) is missing or holds a value outside the current unions -- such
// entries are dropped rather than crashing the whole session load. Unknown
// extra fields (e.g. a legacy `range`) are never copied onto the rebuilt
// object, so they're tolerated on read and dropped on write.
function normalizeHand(raw: unknown, fallbackPlayerCount: number): Hand | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;

  if (!VALID_CARD_RANKS.has(h.card1 as string)) return null;
  if (!VALID_CARD_RANKS.has(h.card2 as string)) return null;
  if (!VALID_HAND_TYPES.has(h.handType as string)) return null;
  if (!VALID_POSITIONS.has(h.position as string)) return null;
  if (!VALID_PREFLOP_ACTIONS.has(h.preFlopAction as string)) return null;
  if (!VALID_FLOP_ACTIONS.has(h.flopAction as string)) return null;
  if (!VALID_RESULTS.has(h.result as string)) return null;

  let timestamp = Number(h.timestamp);
  if (!Number.isFinite(timestamp)) timestamp = Date.now();

  const id = typeof h.id === 'string' && h.id.length > 0 ? h.id : genId();
  const playerCount = normalizePlayerCount(h.playerCount, fallbackPlayerCount);
  const notes = typeof h.notes === 'string' && h.notes.trim() ? h.notes.trim() : undefined;
  const fromImport = typeof h.fromImport === 'boolean' ? h.fromImport : undefined;

  return {
    id,
    timestamp,
    position: h.position as PokerPosition,
    card1: h.card1 as CardRank,
    card2: h.card2 as CardRank,
    handType: h.handType as HandType,
    preFlopAction: h.preFlopAction as PreFlopAction,
    flopAction: h.flopAction as FlopAction,
    result: h.result as HandResult,
    playerCount,
    smallStackMode: Boolean(h.smallStackMode),
    ...(notes !== undefined && { notes }),
    ...(fromImport !== undefined && { fromImport }),
  };
}

export function loadSession(raw: string | null): SessionState {
  if (!raw) return cloneDefaultSession();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneDefaultSession();
  }
  if (!parsed || typeof parsed !== 'object') return cloneDefaultSession();

  const p = parsed as Record<string, unknown>;
  const playerCount = normalizePlayerCount(p.playerCount, DEFAULT_SESSION.playerCount);

  const rawHands = Array.isArray(p.hands) ? p.hands : [];
  const hands = rawHands
    .map(h => normalizeHand(h, playerCount))
    .filter((h): h is Hand => h !== null);

  const maxIndex = Math.max(0, getPositions(playerCount).length - 1);
  const rawIndex = typeof p.currentPositionIndex === 'number' && Number.isFinite(p.currentPositionIndex)
    ? Math.trunc(p.currentPositionIndex)
    : 0;
  const currentPositionIndex = Math.min(Math.max(rawIndex, 0), maxIndex);

  return { hands, playerCount, currentPositionIndex };
}

export function serializeSession(s: SessionState): string {
  return JSON.stringify(s);
}
