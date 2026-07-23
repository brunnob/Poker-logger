import { Hand, ACTION_LABEL } from './types';
import { handNotation } from './ranges';

export function buildExportText(hands: Hand[]): string {
  let txt = `=== POKER HAND LOGGER ===\n${new Date().toLocaleString('pt-BR')}\n${hands.length} mãos\n\n`;
  hands.forEach((h, i) => {
    const num = hands.length - i;
    const date = new Date(h.timestamp).toLocaleTimeString('pt-BR');
    txt += `#${num} ${date} | ${handNotation(h.card1, h.card2, h.handType)} ${h.position} | ${ACTION_LABEL[h.preFlopAction]}`;
    if (h.flopAction !== 'none') txt += ` → ${ACTION_LABEL[h.flopAction]}`;
    txt += ` | ${h.result.toUpperCase().replace('_', ' ')}`;
    if (h.smallStackMode) txt += ` | SS mode`;
    if (h.notes) txt += ` | Notes: ${h.notes}`;
    txt += `\n`;
  });
  return txt;
}
