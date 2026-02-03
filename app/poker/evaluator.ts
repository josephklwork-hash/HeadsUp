/* ---------- simple poker evaluator (7-card) ---------- */

import type { Card } from '../types';

export const RANK_TO_VALUE: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

export function compareScore(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function getStraightHigh(valuesUniqueDesc: number[]) {
  const vals = [...valuesUniqueDesc];
  if (vals[0] === 14) vals.push(1); // wheel

  let run = 1;
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i] - 1 === vals[i + 1]) {
      run++;
      if (run >= 5) {
        const high = vals[i - 3];
        return high === 1 ? 5 : high;
      }
    } else {
      run = 1;
    }
  }
  return null;
}

export function evaluate7(cards: Card[]) {
  const values = cards.map((c) => RANK_TO_VALUE[c.rank]).sort((a, b) => b - a);

  const counts = new Map<number, number>();
  const suits = new Map<string, number[]>();

  for (const c of cards) {
    const v = RANK_TO_VALUE[c.rank];
    counts.set(v, (counts.get(v) ?? 0) + 1);
    const arr = suits.get(c.suit) ?? [];
    arr.push(v);
    suits.set(c.suit, arr);
  }

  const groups = Array.from(counts.entries())
    .map(([v, cnt]) => ({ v, cnt }))
    .sort((a, b) => (b.cnt !== a.cnt ? b.cnt - a.cnt : b.v - a.v));

  // Flush?
  let flushSuit: string | null = null;
  let flushValsDesc: number[] = [];
  for (const [s, vals] of suits.entries()) {
    if (vals.length >= 5) {
      const sorted = vals.slice().sort((a, b) => b - a);
      if (!flushSuit || compareScore(sorted, flushValsDesc) > 0) {
        flushSuit = s;
        flushValsDesc = sorted;
      }
    }
  }

  const uniqueDesc = Array.from(new Set(values)).sort((a, b) => b - a);
  const straightHigh = getStraightHigh(uniqueDesc);

  // Straight flush
  if (flushSuit) {
    const fvUnique = Array.from(new Set(flushValsDesc)).sort((a, b) => b - a);
    const sfHigh = getStraightHigh(fvUnique);
    if (sfHigh !== null) return [8, sfHigh];
  }

  // Quads
  if (groups[0]?.cnt === 4) {
    const quad = groups[0].v;
    const kicker = uniqueDesc.find((v) => v !== quad) ?? 0;
    return [7, quad, kicker];
  }

  // Full house
  if (groups[0]?.cnt === 3) {
    const trips = groups[0].v;
    const pairCandidate = groups.find((g) => g.v !== trips && g.cnt >= 2);
    if (pairCandidate) return [6, trips, pairCandidate.v];
  }

  // Flush
  if (flushSuit) return [5, ...flushValsDesc.slice(0, 5)];

  // Straight
  if (straightHigh !== null) return [4, straightHigh];

  // Trips
  if (groups[0]?.cnt === 3) {
    const trips = groups[0].v;
    const kickers = uniqueDesc.filter((v) => v !== trips).slice(0, 2);
    return [3, trips, ...kickers];
  }

  // Two pair
  if (groups[0]?.cnt === 2) {
    const pairs = groups.filter((g) => g.cnt === 2).map((g) => g.v);
    if (pairs.length >= 2) {
      const sorted = pairs.sort((a, b) => b - a);
      const highPair = sorted[0];
      const lowPair = sorted[1];
      const kicker = uniqueDesc.find((v) => v !== highPair && v !== lowPair) ?? 0;
      return [2, highPair, lowPair, kicker];
    }
  }

  // One pair
  if (groups[0]?.cnt === 2) {
    const pair = groups[0].v;
    const kickers = uniqueDesc.filter((v) => v !== pair).slice(0, 3);
    return [1, pair, ...kickers];
  }

  // High card
  return [0, ...uniqueDesc.slice(0, 5)];
}

/* ---------- hand display helpers ---------- */

export const VALUE_TO_NAME: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two",
};

export function pluralRank(v: number) {
  const name = VALUE_TO_NAME[v] ?? String(v);
  // simple plural for poker ranks
  if (name === "Six") return "Sixes";
  return name + "s";
}

export function cardStr(c: Card) {
  return `${c.rank}${c.suit}`;
}

export function handDesc(score: number[]) {
  const cat = score[0];

  // score formats from evaluator:
  // 8: [8, sfHigh]
  // 7: [7, quad, kicker]
  // 6: [6, trips, pair]
  // 5: [5, v1, v2, v3, v4, v5] (flush high cards)
  // 4: [4, straightHigh]
  // 3: [3, trips, k1, k2]
  // 2: [2, highPair, lowPair, kicker]
  // 1: [1, pair, k1, k2, k3]
  // 0: [0, h1, h2, h3, h4, h5]

  if (cat === 8) return `Straight Flush, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 7) return `Four of a Kind, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;
  if (cat === 6) return `Full House, ${pluralRank(score[1])} full of ${pluralRank(score[2])}`;
  if (cat === 5) return `Flush, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 4) return `Straight, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 3) return `Three of a Kind, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;
  if (cat === 2)
    return `Two Pair, ${pluralRank(score[1])} and ${pluralRank(score[2])} (kicker ${VALUE_TO_NAME[score[3]]})`;
  if (cat === 1) return `One Pair, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;

  // high card
  return `High Card, ${VALUE_TO_NAME[score[1]]} (kicker ${VALUE_TO_NAME[score[2]]})`;
}

export function handRankOnly(score: number[]) {
  switch (score[0]) {
    case 8: return "Straight Flush";
    case 7: return "Four of a Kind";
    case 6: return "Full House";
    case 5: return "Flush";
    case 4: return "Straight";
    case 3: return "Three of a Kind";
    case 2: return "Two Pair";
    case 1: return "One Pair";
    default: return "High Card";
  }
}

/* ---------- best 5-card hand selection ---------- */

export function best5From7(all: Card[]) {
  let bestScore: number[] | null = null;
  let bestHand: Card[] = [];

  for (let a = 0; a < all.length - 4; a++) {
    for (let b = a + 1; b < all.length - 3; b++) {
      for (let c = b + 1; c < all.length - 2; c++) {
        for (let d = c + 1; d < all.length - 1; d++) {
          for (let e = d + 1; e < all.length; e++) {
            const hand = [all[a], all[b], all[c], all[d], all[e]];
            const score = evaluate7(hand);
            if (!bestScore || compareScore(score, bestScore) > 0) {
              bestScore = score;
              bestHand = hand;
            }
          }
        }
      }
    }
  }

  return bestHand;
}

export function sortBest5ForDisplay(cards: Card[]) {
  const score = evaluate7(cards);
  const cat = score[0];

  const groups = new Map<number, Card[]>();
  for (const c of cards) {
    const v = RANK_TO_VALUE[c.rank];
    const arr = groups.get(v) ?? [];
    arr.push(c);
    groups.set(v, arr);
  }

  const take = (v: number) => {
    const arr = groups.get(v);
    if (!arr || arr.length === 0) return null;
    const c = arr.shift()!;
    if (arr.length === 0) groups.delete(v);
    return c;
  };

  const takeAll = (v: number) => {
    const arr = groups.get(v) ?? [];
    groups.delete(v);
    return arr;
  };

  // Straight / Straight Flush: show in sequence high->low; wheel = 5-4-3-2-A
  if (cat === 4 || cat === 8) {
    const high = score[1];
    const seq =
      high === 5
        ? [5, 4, 3, 2, 14]
        : [high, high - 1, high - 2, high - 3, high - 4];

    return seq.map((v) => take(v)!).filter(Boolean) as Card[];
  }

  // Quads
  if (cat === 7) {
    const quad = score[1];
    const kicker = score[2];
    return [...takeAll(quad), take(kicker)!].filter(Boolean) as Card[];
  }

  // Full House
  if (cat === 6) {
    const trips = score[1];
    const pair = score[2];
    return [...takeAll(trips), ...takeAll(pair)].filter(Boolean) as Card[];
  }

  // Flush (show high->low from score)
  if (cat === 5) {
    const vals = score.slice(1, 6);
    return vals.map((v) => take(v)!).filter(Boolean) as Card[];
  }

  // Trips
  if (cat === 3) {
    const trips = score[1];
    const kickers = score.slice(2);
    return [...takeAll(trips), ...kickers.map((v) => take(v)!)].filter(Boolean) as Card[];
  }

  // Two Pair
  if (cat === 2) {
    const highPair = score[1];
    const lowPair = score[2];
    const kicker = score[3];
    return [...takeAll(highPair), ...takeAll(lowPair), take(kicker)!].filter(Boolean) as Card[];
  }

  // One Pair
  if (cat === 1) {
    const pair = score[1];
    const kickers = score.slice(2);
    return [...takeAll(pair), ...kickers.map((v) => take(v)!)].filter(Boolean) as Card[];
  }

  // High Card
  const vals = score.slice(1, 6);
  return vals.map((v) => take(v)!).filter(Boolean) as Card[];
}

export function cards5Str(cards5: Card[]) {
  return cards5.map(cardStr).join(" ");
}
