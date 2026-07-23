import { CardRank, HandType, HandRange, CARD_RANKS, RANK_ORDER } from './types';

// 169 starting hands bucketed by cumulative top-X% strength (heads-up equity + standard preflop ranking).
// Each bucket label corresponds to its cumulative threshold; empty bucket falls through to '60-70%'.
export const HAND_RANGE_MAP: Record<string, HandRange> = {
  'AA':'3%','KK':'3%','QQ':'3%','JJ':'3%','AKs':'3%',
  'AKo':'5%','TT':'5%','AQs':'5%','AJs':'5%','KQs':'5%',
  'AQo':'8%','99':'8%','ATs':'8%','KJs':'8%','KTs':'8%','QJs':'8%','AJo':'8%',
  'KQo':'10%','88':'10%','JTs':'10%','A9s':'10%',
  'KJo':'12-15%','ATo':'12-15%','77':'12-15%','QTs':'12-15%','KTo':'12-15%','QJo':'12-15%',
  'QTo':'18-20%','JTo':'18-20%','66':'18-20%','T9s':'18-20%','A8s':'18-20%','K9s':'18-20%','J9s':'18-20%','Q9s':'18-20%','55':'18-20%','A7s':'18-20%','98s':'18-20%','87s':'18-20%','T8s':'18-20%','A6s':'18-20%',
  '76s':'25%','A5s':'25%','65s':'25%','A4s':'25%','A3s':'25%','A2s':'25%','54s':'25%','44':'25%','K8s':'25%','K7s':'25%','Q8s':'25%','J8s':'25%','33':'25%','22':'25%','K6s':'25%',
  'T7s':'30-35%','97s':'30-35%','86s':'30-35%','75s':'30-35%','Q7s':'30-35%','J7s':'30-35%','64s':'30-35%','53s':'30-35%','K5s':'30-35%','Q6s':'30-35%','J6s':'30-35%','T6s':'30-35%','96s':'30-35%','85s':'30-35%','74s':'30-35%','K4s':'30-35%','Q5s':'30-35%','J5s':'30-35%','43s':'30-35%','K3s':'30-35%','K2s':'30-35%','Q4s':'30-35%','J4s':'30-35%','T5s':'30-35%','95s':'30-35%','63s':'30-35%','52s':'30-35%','42s':'30-35%','32s':'30-35%','Q3s':'30-35%','J3s':'30-35%','T4s':'30-35%','84s':'30-35%',
  '94s':'40-45%','73s':'40-45%','62s':'40-45%','Q2s':'40-45%','J2s':'40-45%','T3s':'40-45%','T2s':'40-45%','83s':'40-45%','93s':'40-45%','82s':'40-45%','72s':'40-45%','92s':'40-45%','A9o':'40-45%','K9o':'40-45%','Q9o':'40-45%','J9o':'40-45%','T9o':'40-45%','A8o':'40-45%','A7o':'40-45%',
  'A6o':'50%','K8o':'50%','Q8o':'50%','J8o':'50%','A5o':'50%',
  'A4o':'60-70%','T8o':'60-70%','K7o':'60-70%','Q7o':'60-70%','A3o':'60-70%','A2o':'60-70%','J7o':'60-70%','T7o':'60-70%','98o':'60-70%','87o':'60-70%','76o':'60-70%','K6o':'60-70%','65o':'60-70%','K5o':'60-70%','K4o':'60-70%','Q6o':'60-70%','54o':'60-70%','K3o':'60-70%','K2o':'60-70%','Q5o':'60-70%','J6o':'60-70%','T6o':'60-70%','97o':'60-70%','Q4o':'60-70%','Q3o':'60-70%','Q2o':'60-70%','J5o':'60-70%','T5o':'60-70%','86o':'60-70%','75o':'60-70%','J4o':'60-70%','T4o':'60-70%','96o':'60-70%','J3o':'60-70%','J2o':'60-70%','T3o':'60-70%','T2o':'60-70%','95o':'60-70%','85o':'60-70%','64o':'60-70%','74o':'60-70%','53o':'60-70%','84o':'60-70%','94o':'60-70%','93o':'60-70%','92o':'60-70%','83o':'60-70%','82o':'60-70%','73o':'60-70%','72o':'60-70%','63o':'60-70%','62o':'60-70%','52o':'60-70%','43o':'60-70%','42o':'60-70%','32o':'60-70%',
};

export function getHandRange(card1: CardRank, card2: CardRank, handType: HandType): HandRange {
  return HAND_RANGE_MAP[handNotation(card1, card2, handType)] || '60-70%';
}

export const TOTAL_COMBOS = 1326;
export const BUCKET_WEIGHTS: Record<HandRange, number> = (() => {
  const w = {} as Record<HandRange, number>;
  for (const r of CARD_RANKS) {
    const b = getHandRange(r, r, 'pair');
    w[b] = (w[b] || 0) + 6;
  }
  for (let i = 0; i < CARD_RANKS.length; i++) {
    for (let j = i + 1; j < CARD_RANKS.length; j++) {
      const a = CARD_RANKS[i], b = CARD_RANKS[j];
      const s = getHandRange(a, b, 'suited');
      w[s] = (w[s] || 0) + 4;
      const o = getHandRange(a, b, 'offsuit');
      w[o] = (w[o] || 0) + 12;
    }
  }
  return w;
})();

export function formatExpected(n: number): string {
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

export function handNotation(card1: CardRank, card2: CardRank, handType: HandType): string {
  const [higher, lower] = RANK_ORDER[card1] >= RANK_ORDER[card2] ? [card1, card2] : [card2, card1];
  const suffix = handType === 'pair' ? '' : handType === 'suited' ? 's' : 'o';
  return `${higher}${lower}${suffix}`;
}
