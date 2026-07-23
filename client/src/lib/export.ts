import { Hand } from './types';
import { handNotation } from './ranges';

// Canonical export format (C1/C5 fix): machine tokens (the raw PreFlopAction/
// FlopAction/HandResult union values, e.g. call_open, fold_to_3bet, sd_win)
// instead of human labels, and oldest-first ordering (#1 = oldest hand).
// normalizeToken() strips underscores/dashes/spaces, so the parser accepts
// these tokens directly. `hands` is the in-memory session array, which is
// newest-first (prepend-on-save), so it is iterated reversed here to produce
// oldest-first output.
//
// Table size (M5): the "Jogadores:" header carries the dominant (modal) table
// size of the exported hands — NOT the live session setting, which may have
// changed after these hands were logged — and any hand played at a different
// size carries its own "| Nmax" marker, so a mixed-size session round-trips
// per hand. `fallbackPlayerCount` is only used when `hands` is empty.
export function buildExportText(hands: Hand[], fallbackPlayerCount: number): string {
  const oldestFirst = [...hands].reverse();

  const sizeCounts = new Map<number, number>();
  for (const h of hands) sizeCounts.set(h.playerCount, (sizeCounts.get(h.playerCount) || 0) + 1);
  let headerCount = fallbackPlayerCount;
  let bestSeen = -1;
  for (const [pc, n] of sizeCounts) {
    // strict > keeps the first-inserted value on ties, i.e. the newest hand's size
    if (n > bestSeen) { bestSeen = n; headerCount = pc; }
  }

  let txt = `=== POKER HAND LOGGER ===\nData: ${new Date().toLocaleString('pt-BR')}\nTotal: ${hands.length} mãos\nJogadores: ${headerCount}\n\n`;
  oldestFirst.forEach((h, i) => {
    const num = i + 1;
    const date = new Date(h.timestamp).toLocaleTimeString('pt-BR');
    txt += `#${num} ${date} | ${handNotation(h.card1, h.card2, h.handType)} ${h.position} | ${h.preFlopAction}`;
    if (h.flopAction !== 'none') txt += ` → ${h.flopAction}`;
    txt += ` | ${h.result}`;
    if (h.playerCount !== headerCount) txt += ` | ${h.playerCount}max`;
    if (h.smallStackMode) txt += ` | SS mode`;
    if (h.notes) txt += ` | Notes: ${h.notes}`;
    txt += `\n`;
  });
  return txt;
}
