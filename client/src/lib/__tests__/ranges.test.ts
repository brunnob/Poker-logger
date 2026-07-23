import { describe, it, expect } from 'vitest';
import { CARD_RANKS } from '../types';
import { HAND_RANGE_MAP, BUCKET_WEIGHTS, handNotation } from '../ranges';

describe('HAND_RANGE_MAP', () => {
  it('covers all 169 starting hands (13 pairs + 78 suited + 78 offsuit)', () => {
    const notations: string[] = [];
    for (const r of CARD_RANKS) {
      notations.push(handNotation(r, r, 'pair'));
    }
    for (let i = 0; i < CARD_RANKS.length; i++) {
      for (let j = i + 1; j < CARD_RANKS.length; j++) {
        notations.push(handNotation(CARD_RANKS[i], CARD_RANKS[j], 'suited'));
        notations.push(handNotation(CARD_RANKS[i], CARD_RANKS[j], 'offsuit'));
      }
    }

    expect(notations.length).toBe(169);
    for (const notation of notations) {
      expect(HAND_RANGE_MAP[notation]).toBeDefined();
    }
    expect(Object.keys(HAND_RANGE_MAP).length).toBe(169);
  });
});

describe('BUCKET_WEIGHTS', () => {
  it('values sum to 1326', () => {
    const sum = Object.values(BUCKET_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(1326);
  });
});
