import { Hand } from './types';
import { handNotation } from './ranges';

// Canonical export format (C1/C5 fix): machine tokens (the raw PreFlopAction/
// FlopAction/HandResult union values, e.g. call_open, fold_to_3bet, sd_win)
// instead of human labels, and oldest-first ordering (#1 = oldest hand).
// normalizeToken() strips underscores/dashes/spaces, so the parser accepts
// these tokens directly. `hands` is the in-memory session array, which is
// newest-first (prepend-on-save), so it is iterated reversed here to produce
// oldest-first output.
export function buildExportText(hands: Hand[], playerCount: number): string {
  const oldestFirst = [...hands].reverse();
  let txt = `=== POKER HAND LOGGER ===\nData: ${new Date().toLocaleString('pt-BR')}\nTotal: ${hands.length} mãos\nJogadores: ${playerCount}\n\n`;
  oldestFirst.forEach((h, i) => {
    const num = i + 1;
    const date = new Date(h.timestamp).toLocaleTimeString('pt-BR');
    txt += `#${num} ${date} | ${handNotation(h.card1, h.card2, h.handType)} ${h.position} | ${h.preFlopAction}`;
    if (h.flopAction !== 'none') txt += ` → ${h.flopAction}`;
    txt += ` | ${h.result}`;
    if (h.smallStackMode) txt += ` | SS mode`;
    if (h.notes) txt += ` | Notes: ${h.notes}`;
    txt += `\n`;
  });
  return txt;
}
