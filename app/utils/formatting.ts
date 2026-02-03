import type { Card, Street, StreetName } from '../types';
import { RANKS, SUITS } from '../types';

export function drawUniqueCards(count: number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.slice(0, count);
}

export function roundToHundredth(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatBB(value: number | "") {
  if (value === "") return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function toTitleCase(str: string): string {
  if (!str) return str;
  const minorWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an'];
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Handle hyphenated words - capitalize each part (e.g., "kim-lee" -> "Kim-Lee")
      if (word.includes('-')) {
        return word
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('-');
      }
      // Always capitalize first word, otherwise check if it's a minor word
      if (index === 0 || !minorWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// Helper to get sort priority for dashboard ordering
// A=0: Accept/Reject (incoming), B=1: Connected, C=2: Pending (outgoing), D=3: Connect (no relation)
export function getConnectionSortPriority(
  userId: string,
  myConnections: Set<string>,
  pendingOutgoing: Set<string>,
  pendingIncoming: Map<string, { id: string; createdAt: string }>
): number {
  if (pendingIncoming.has(userId)) return 0; // A - Accept/Reject
  if (myConnections.has(userId)) return 1;   // B - Connected
  if (pendingOutgoing.has(userId)) return 2; // C - Pending
  return 3;                                   // D - Connect
}

export function streetNameFromCount(street: Street): StreetName {
  if (street === 0) return "Preflop";
  if (street === 3) return "Flop";
  if (street === 4) return "Turn";
  return "River";
}
