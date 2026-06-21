export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';
export type Rank =
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'
  | '2'
  | 'SJ'
  | 'BJ';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  deck: number;
}

export const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ'];
export const runRanks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const suits: Suit[] = ['D', 'C', 'H', 'S'];

export function rankValue(rank: Rank, levelRank?: Rank): number {
  if (rank === 'SJ') return 98;
  if (rank === 'BJ') return 99;
  if (levelRank && rank === levelRank) return 97;
  return ranks.indexOf(rank);
}

export function rankLabel(rank: Rank): string {
  if (rank === 'SJ') return '小王';
  if (rank === 'BJ') return '大王';
  return rank;
}

export function suitLabel(suit: Suit): string {
  switch (suit) {
    case 'S':
      return '♠';
    case 'H':
      return '♥';
    case 'D':
      return '♦';
    case 'C':
      return '♣';
    case 'J':
      return '';
  }
}

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D' || card.rank === 'BJ';
}

export function isJoker(card: Card): boolean {
  return card.rank === 'SJ' || card.rank === 'BJ';
}

export function cardText(card: Card): string {
  return isJoker(card) ? rankLabel(card.rank) : `${rankLabel(card.rank)}${suitLabel(card.suit)}`;
}

export function makeDeck(deckCount = 1, includeJokers = true): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d += 1) {
    for (const rank of ranks.filter((rank) => rank !== 'SJ' && rank !== 'BJ')) {
      for (const suit of suits) {
        deck.push({ id: `${d}-${suit}-${rank}`, rank, suit, deck: d });
      }
    }
    if (includeJokers) {
      deck.push({ id: `${d}-J-SJ`, rank: 'SJ', suit: 'J', deck: d });
      deck.push({ id: `${d}-J-BJ`, rank: 'BJ', suit: 'J', deck: d });
    }
  }
  return deck;
}

export function shuffle<T>(items: T[], seed?: number): T[] {
  const result = [...items];
  let state = seed == null ? Math.floor(Math.random() * 0xffffffff) : seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortCards(cards: Card[], levelRank?: Rank): Card[] {
  return [...cards].sort((lhs, rhs) => {
    const rankDiff = rankValue(lhs.rank, levelRank) - rankValue(rhs.rank, levelRank);
    if (rankDiff !== 0) return rankDiff;
    const suitDiff = suits.indexOf(lhs.suit) - suits.indexOf(rhs.suit);
    if (suitDiff !== 0) return suitDiff;
    return lhs.deck - rhs.deck;
  });
}

export function groupByRank(cards: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of cards) {
    const existing = groups.get(card.rank) ?? [];
    existing.push(card);
    groups.set(card.rank, sortCards(existing));
  }
  return groups;
}

export function countRank(cards: Card[], rank: Rank): number {
  return cards.filter((card) => card.rank === rank).length;
}

export function removeCards(hand: Card[], cards: Card[]): Card[] {
  const removing = new Set(cards.map((card) => card.id));
  return hand.filter((card) => !removing.has(card.id));
}

export function containsAllCards(hand: Card[], cards: Card[]): boolean {
  const handIds = new Set(hand.map((card) => card.id));
  return cards.every((card) => handIds.has(card.id));
}

export function sameRank(cards: Card[]): Rank | undefined {
  if (cards.length === 0) return undefined;
  const rank = cards[0].rank;
  return cards.every((card) => card.rank === rank) ? rank : undefined;
}

export function uniqueRanks(cards: Card[]): Rank[] {
  return [...new Set(cards.map((card) => card.rank))].sort((a, b) => rankValue(a) - rankValue(b));
}

export function areConsecutive(rankList: Rank[]): boolean {
  if (rankList.length < 2) return true;
  if (rankList.some((rank) => !runRanks.includes(rank))) return false;
  const values = rankList.map((rank) => runRanks.indexOf(rank)).sort((a, b) => a - b);
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

export function takeLowest(cards: Card[], count: number, excludedRanks: Rank[] = [], levelRank?: Rank): Card[] | undefined {
  const pool = sortCards(
    cards.filter((card) => !excludedRanks.includes(card.rank)),
    levelRank
  );
  if (pool.length < count) return undefined;
  return pool.slice(0, count);
}

export function takeRank(groups: Map<Rank, Card[]>, rank: Rank, count: number): Card[] | undefined {
  const cards = groups.get(rank) ?? [];
  if (cards.length < count) return undefined;
  return cards.slice(0, count);
}

export function findCardById(cards: Card[], id: string): Card | undefined {
  return cards.find((card) => card.id === id);
}

export function cardsKey(cards: Card[]): string {
  return sortCards(cards)
    .map((card) => card.id)
    .join('|');
}

export function windowedRanks(minLength: number, maxLength = runRanks.length): Rank[][] {
  const windows: Rank[][] = [];
  for (let length = minLength; length <= maxLength; length += 1) {
    for (let start = 0; start + length <= runRanks.length; start += 1) {
      windows.push(runRanks.slice(start, start + length));
    }
  }
  return windows;
}
