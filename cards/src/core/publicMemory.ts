import { Card, Rank, countRank, rankValue, ranks } from './cards';
import type { Combo } from './rules';

export interface PublicCardMemoryInput {
  deckCount: number;
  ownCards: Card[];
  visibleCards: Card[];
  opponentHandCounts?: number[];
}

export class PublicCardMemory {
  private readonly deckCount: number;
  private readonly ownCards: Card[];
  private readonly visibleCards: Card[];
  private readonly opponentHandCounts?: number[];

  constructor(input: PublicCardMemoryInput) {
    this.deckCount = input.deckCount;
    this.ownCards = input.ownCards;
    this.visibleCards = input.visibleCards;
    this.opponentHandCounts = input.opponentHandCounts;
  }

  opponentAvailableCount(rank: Rank): number {
    return Math.max(0, this.totalCount(rank) - countRank(this.ownCards, rank) - countRank(this.visibleCards, rank));
  }

  rankExhausted(rank: Rank): boolean {
    return this.opponentAvailableCount(rank) === 0;
  }

  opponentsCanHaveRocket414(): boolean {
    return this.opponentAvailableCount('4') >= 2 && this.opponentAvailableCount('A') >= 1 && this.opponentCanHold(3);
  }

  opponentsCanHaveDoubleJoker(): boolean {
    return this.opponentAvailableCount('SJ') >= 1 && this.opponentAvailableCount('BJ') >= 1 && this.opponentCanHold(2);
  }

  opponentsCanHaveSameRankBomb(rank: Rank, count: number): boolean {
    if (rank === 'SJ' || rank === 'BJ' || count < 3) return false;
    return this.opponentAvailableCount(rank) >= count && this.opponentCanHold(count);
  }

  opponentsCanBeatSameRankBomb(combo: Combo): boolean {
    const count = combo.sameRankCount ?? combo.cards.length;
    return ranks.some((rank) =>
      rank !== 'SJ' &&
      rank !== 'BJ' &&
      (
        this.opponentsCanHaveSameRankBomb(rank, count + 1) ||
        (rankValue(rank) > rankValue(combo.primaryRank) && this.opponentsCanHaveSameRankBomb(rank, count))
      )
    );
  }

  opponentsCanCha(rank: Rank): boolean {
    if (rank === 'SJ' || rank === 'BJ') return false;
    return this.opponentAvailableCount(rank) >= 2 && this.opponentCanHold(2);
  }

  opponentsCanGou(rank: Rank): boolean {
    return this.opponentAvailableCount(rank) >= 1 && this.opponentCanHold(1);
  }

  private totalCount(rank: Rank): number {
    return rank === 'SJ' || rank === 'BJ' ? this.deckCount : this.deckCount * 4;
  }

  private opponentCanHold(count: number): boolean {
    return this.opponentHandCounts == null || this.opponentHandCounts.some((handCount) => handCount >= count);
  }
}
