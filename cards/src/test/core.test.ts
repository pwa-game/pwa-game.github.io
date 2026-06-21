import { describe, expect, test } from 'vitest';
import { Card, Rank, Suit, makeDeck, sortCards } from '../core/cards';
import { effectDurationMs, effectIsMajor, fourFourteenAIActionDelayMs, pauseAfterLatestEventMs } from '../core/effects';
import { PublicCardMemory } from '../core/publicMemory';
import {
  canBeat414,
  canBeatDouDizhu,
  canBeatGuanDan,
  canBeatRunFast,
  classify414,
  classifyDouDizhu,
  classifyGuanDan,
  classifyRunFast,
  comboEffect,
  comboLabel,
  comboSortScore414,
  legal414
} from '../core/rules';
import { bombReserveSplitPenalty414, chooseAICombo, chooseHintCombo, fourFourteenPassScore, limitFourFourteenCandidateCombos } from '../games/ai';
import type { AIContext } from '../games/ai';
import { FourFourteenState, fourFourteenModule } from '../games/fourFourteen';
import { douDizhuModule } from '../games/doudizhu';
import { runFastModule } from '../games/runFast';
import { guanDanModule } from '../games/guanDan';
import { buildHandLayoutRows, handRowTotalWidth, handSpreadHeightForCount } from '../ui/handLayout';
import { fanTotalWidth, playedCardsFanMetrics, slotContentWidth, slotWidthForSeat } from '../ui/tableLayout';
import { effectAnimationStyle } from '../ui/EffectOverlay';

function c(rank: Rank, suit: Suit = 'H', deck = 0): Card {
  return { id: `${deck}-${suit}-${rank}-${Math.random()}`, rank, suit: rank === 'SJ' || rank === 'BJ' ? 'J' : suit, deck };
}

describe('cards and PWA rules', () => {
  test('deck identities are unique across duplicate decks', () => {
    const deck = makeDeck(3);
    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);
    expect(deck).toHaveLength(162);
  });

  test('deck generation and suit sorting follow the iOS card order', () => {
    const deck = makeDeck(1);
    expect(deck.slice(0, 8).map((card) => `${card.rank}${card.suit}`)).toEqual(['3D', '3C', '3H', '3S', '4D', '4C', '4H', '4S']);
    expect(deck.at(-2)?.rank).toBe('SJ');
    expect(deck.at(-1)?.rank).toBe('BJ');

    const sameRank = [c('5', 'S'), c('5', 'H'), c('5', 'C'), c('5', 'D')];
    expect(sortCards(sameRank).map((card) => card.suit)).toEqual(['D', 'C', 'H', 'S']);
  });

  test('414 recognizes rockets, double joker, bombs, and public memory impossibility', () => {
    expect(classify414([c('4'), c('4', 'S'), c('A')])?.kind).toBe('rocket414');
    expect(classify414([c('SJ'), c('BJ')])?.kind).toBe('doubleJoker');
    expect(classify414([c('6'), c('6', 'S'), c('6', 'C')])?.kind).toBe('sameRankBomb');

    const memory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [],
      visibleCards: [c('4'), c('4', 'S'), c('4', 'C')]
    });
    expect(memory.opponentsCanHaveRocket414()).toBe(false);
    expect(memory.opponentsCanHaveSameRankBomb('4', 3)).toBe(false);
  });

  test('414 treats duplicate jokers as same-rank pairs and bombs like iOS', () => {
    const smallJokers = [c('SJ', 'J', 0), c('SJ', 'J', 1), c('SJ', 'J', 2)];
    const bigJokers = [c('BJ', 'J', 0), c('BJ', 'J', 1), c('BJ', 'J', 2)];
    const smallPair = classify414(smallJokers.slice(0, 2));
    const bigBomb = classify414(bigJokers);

    expect(smallPair?.kind).toBe('pair');
    expect(smallPair?.primaryRank).toBe('SJ');
    expect(bigBomb?.kind).toBe('sameRankBomb');
    expect(bigBomb?.primaryRank).toBe('BJ');
    expect(bigBomb?.sameRankCount).toBe(3);

    expect(canBeat414(smallPair!, classify414([c('2'), c('2', 'S')])!)).toBe(true);
    expect(canBeat414(bigBomb!, classify414([c('2'), c('2', 'S'), c('2', 'C')])!)).toBe(true);

    const legal = legal414([...smallJokers, c('BJ')]);
    expect(legal.some((combo) => combo.kind === 'pair' && combo.primaryRank === 'SJ')).toBe(true);
    expect(legal.some((combo) => combo.kind === 'sameRankBomb' && combo.primaryRank === 'SJ' && combo.sameRankCount === 3)).toBe(true);
    expect(legal.some((combo) => combo.kind === 'doubleJoker')).toBe(true);
  });

  test('414 enumerates full same-rank bomb sizes beyond eight cards like iOS', () => {
    const suits: Suit[] = ['H', 'S', 'D', 'C', 'H', 'S', 'D', 'C', 'H'];
    const nineCards = suits.map((suit, index) => c('9', suit, Math.floor(index / 4)));
    const legal = legal414([...nineCards, c('3')]);

    expect(classify414(nineCards)?.kind).toBe('sameRankBomb');
    expect(classify414(nineCards)?.sameRankCount).toBe(9);
    expect(legal.some((combo) => combo.kind === 'sameRankBomb' && combo.primaryRank === '9' && combo.sameRankCount === 9)).toBe(true);
    expect(legal414(nineCards, classify414(nineCards.slice(0, 8))).some((combo) => combo.sameRankCount === 9)).toBe(true);
  });

  test('414 cha and gou are reaction-only and cannot be beaten like iOS', () => {
    const single = classify414([c('A')])!;
    const rocket = classify414([c('4'), c('4', 'S'), c('A')])!;
    const doubleJoker = classify414([c('SJ'), c('BJ')])!;
    const cha = { kind: 'cha' as const, cards: [c('7'), c('7', 'S')], primaryRank: '7' as Rank };
    const gou = { kind: 'gou' as const, cards: [c('7')], primaryRank: '7' as Rank };

    expect(canBeat414(cha, single)).toBe(false);
    expect(canBeat414(gou, single)).toBe(false);
    expect(canBeat414(rocket, cha)).toBe(false);
    expect(canBeat414(doubleJoker, gou)).toBe(false);
    expect(legal414([c('4'), c('4', 'S'), c('A'), c('SJ'), c('BJ')], cha)).toHaveLength(0);
  });

  test('414 legal combinations use iOS decision ordering instead of generic rank interleaving', () => {
    const singleFour = classify414([c('4')])!;
    const pairThree = classify414([c('3'), c('3', 'S')])!;
    const run = classify414([c('3'), c('4'), c('5')])!;
    const bomb = classify414([c('3'), c('3', 'S'), c('3', 'D')])!;
    const legal = legal414([c('3'), c('3', 'S'), c('4')]);

    expect(comboSortScore414(singleFour)).toBeLessThan(comboSortScore414(pairThree));
    expect(comboSortScore414(run)).toBeLessThan(comboSortScore414(bomb));
    expect(legal.map((combo) => combo.kind)).toEqual(['single', 'single', 'pair']);
    expect(legal.map((combo) => combo.primaryRank)).toEqual(['3', '4', '3']);
  });

  test('414 run primary rank uses the starting rank like the iOS rules engine', () => {
    const lowRun = classify414([c('3'), c('4'), c('5')])!;
    const highRun = classify414([c('4'), c('5'), c('6')])!;
    const pairRun = classify414([c('3'), c('3', 'S'), c('4'), c('4', 'S'), c('5'), c('5', 'S')])!;
    const legal = legal414([c('3'), c('4'), c('5'), c('6')]);

    expect(lowRun.kind).toBe('singleRun');
    expect(lowRun.primaryRank).toBe('3');
    expect(highRun.primaryRank).toBe('4');
    expect(pairRun.kind).toBe('pairRun');
    expect(pairRun.primaryRank).toBe('3');
    expect(canBeat414(highRun, lowRun)).toBe(true);
    expect(legal.find((combo) => combo.kind === 'singleRun' && combo.sequenceLength === 3)?.primaryRank).toBe('3');
  });

  test('414 enumerates all trio attachments including jokers like iOS', () => {
    const sixTrio = [c('6'), c('6', 'S'), c('6', 'D')];
    const lowAttachment = c('3');
    const highAttachment = c('K');
    const jokerTrio = [c('SJ', 'J', 0), c('SJ', 'J', 1), c('SJ', 'J', 2)];
    const fourPair = [c('4'), c('4', 'S')];
    const hand = [...sixTrio, lowAttachment, highAttachment, ...jokerTrio, ...fourPair];
    const legal = legal414(hand);
    const hasCards = (kind: string, cards: Card[]) =>
      legal.some((combo) => combo.kind === kind && combo.cards.length === cards.length && cards.every((card) => combo.cards.some((used) => used.id === card.id)));

    expect(hasCards('trioWithSingle', [...sixTrio, lowAttachment])).toBe(true);
    expect(hasCards('trioWithSingle', [...sixTrio, highAttachment])).toBe(true);
    expect(hasCards('trioWithSingle', [...jokerTrio, lowAttachment])).toBe(true);
    expect(hasCards('trioWithPair', [...jokerTrio, ...fourPair])).toBe(true);

    const previous = classify414([c('5'), c('5', 'S'), c('5', 'D'), c('3')])!;
    const follow = legal414([...sixTrio, lowAttachment, highAttachment], previous);
    expect(follow.some((combo) => combo.kind === 'trioWithSingle' && combo.cards.some((card) => card.id === highAttachment.id))).toBe(true);
  });

  test('414 labels and bomb effects match the iOS client display names', () => {
    const threeBomb = classify414([c('6'), c('6', 'S'), c('6', 'C')])!;
    const fourBomb = classify414([c('7'), c('7', 'S'), c('7', 'C'), c('7', 'D')])!;
    const sixBomb = classify414([c('8'), c('8', 'S'), c('8', 'C'), c('8', 'D'), c('8', 'H', 1), c('8', 'S', 1)])!;
    const rocket = classify414([c('4'), c('4', 'S'), c('A')])!;
    const trioWithSingle = classify414([c('5'), c('5', 'S'), c('5', 'C'), c('9')])!;
    const trioWithPair = classify414([c('6'), c('6', 'S'), c('6', 'C'), c('10'), c('10', 'S')])!;

    expect(comboLabel(threeBomb)).toBe('炸');
    expect(comboLabel(fourBomb)).toBe('炮');
    expect(comboLabel(sixBomb)).toBe('6同张炸');
    expect(comboLabel(rocket)).toBe('4A4火箭');
    expect(comboEffect('414', threeBomb)).toMatchObject({ kind: 'bomb', title: '炸', intensity: 'a' });
    expect(comboEffect('414', sixBomb)).toMatchObject({ kind: 'mushroom', title: '6同张炸', intensity: 's' });
    expect(comboEffect('414', rocket)).toMatchObject({ kind: 'rocket', title: '4A4', subtitle: '火箭升空', intensity: 's' });
    expect(comboEffect('414', trioWithSingle)).toMatchObject({ kind: 'stamp', title: '三带一', intensity: 'c' });
    expect(comboEffect('414', trioWithPair)).toMatchObject({ kind: 'stamp', title: '三带二', intensity: 'c' });
    expect(comboEffect('414', { kind: 'cha', cards: [c('7'), c('7', 'S')], primaryRank: '7' })).toMatchObject({
      kind: 'stamp',
      title: '叉!',
      intensity: 'c'
    });
    expect(comboEffect('414', { kind: 'gou', cards: [c('7')], primaryRank: '7' })).toMatchObject({
      kind: 'stamp',
      title: '勾!',
      intensity: 'c'
    });
  });

  test('card effect durations match the iOS intensity timing constants', () => {
    expect(effectDurationMs('c')).toBe(800);
    expect(effectDurationMs('b')).toBe(900);
    expect(effectDurationMs('a')).toBe(1050);
    expect(effectDurationMs('s')).toBe(1250);
    expect(effectIsMajor('c')).toBe(false);
    expect(effectIsMajor('b')).toBe(false);
    expect(effectIsMajor('a')).toBe(true);
    expect(effectIsMajor('s')).toBe(true);
  });

  test('414 AI pauses after latest events using the iOS effect extras', () => {
    expect(pauseAfterLatestEventMs(undefined, false)).toBe(1250);
    expect(pauseAfterLatestEventMs(undefined, true)).toBe(1850);
    expect(pauseAfterLatestEventMs('c', false)).toBe(1250);
    expect(pauseAfterLatestEventMs('b', false)).toBe(1250);
    expect(pauseAfterLatestEventMs('a', false)).toBe(1250);
    expect(pauseAfterLatestEventMs('s', false)).toBe(1450);
    expect(pauseAfterLatestEventMs('s', true)).toBe(1850);
  });

  test('414 AI action delay keeps the iOS one-second thinking beat', () => {
    expect(fourFourteenAIActionDelayMs({ hasLatestEvent: false, latestEventIsLeadStart: false, latestEventIsReaction: false })).toBe(1000);
    expect(fourFourteenAIActionDelayMs({ hasLatestEvent: true, latestEventIsLeadStart: true, latestEventIsReaction: false, latestEventPlayerIndex: -1 })).toBe(1000);
    expect(fourFourteenAIActionDelayMs({ hasLatestEvent: true, latestEventIsLeadStart: false, latestEventIsReaction: false, latestEventPlayerIndex: 0, intensity: 's' })).toBe(1000);
    expect(fourFourteenAIActionDelayMs({ hasLatestEvent: true, latestEventIsLeadStart: false, latestEventIsReaction: false, latestEventPlayerIndex: 1 })).toBe(2250);
    expect(fourFourteenAIActionDelayMs({ hasLatestEvent: true, latestEventIsLeadStart: false, latestEventIsReaction: true, latestEventPlayerIndex: 2, intensity: 's' })).toBe(2850);
  });

  test('414 pass scoring respects iOS short-card coverage responsibility', () => {
    const aiHand = [c('5'), c('6'), c('7'), c('8'), c('9'), c('10')];
    const threatHand = [c('A')];
    const uncovered = fourFourteenPassScore({
      ruleset: '414',
      playerIndex: 1,
      hands: [[c('3'), c('4'), c('5')], aiHand, threatHand],
      previous: classify414([c('3')]),
      previousPlayerIndex: 2,
      deckCount: 1,
      style: 'relaxed',
      cardsPlayedCount: [0, 0, 0],
      passCount: 0
    });
    const covered = fourFourteenPassScore({
      ruleset: '414',
      playerIndex: 1,
      hands: [[c('3'), c('4'), c('5')], aiHand, threatHand],
      previous: classify414([c('4'), c('4', 'S')]),
      previousPlayerIndex: 0,
      deckCount: 1,
      style: 'relaxed',
      cardsPlayedCount: [0, 0, 0],
      passCount: 0
    });

    expect(fourFourteenPassScore({ ruleset: '414', playerIndex: 1, hands: [[], aiHand, threatHand] })).toBe(-100000);
    expect(uncovered).toBeLessThan(-1000);
    expect(covered).toBeGreaterThan(uncovered);
    expect(covered - uncovered).toBeGreaterThan(1000);
    expect(covered).toBeGreaterThan(-500);
  });

  test('414 bomb reserve split penalty follows iOS turn-improvement relief', () => {
    const hand = [c('3'), c('3', 'S'), c('3', 'C'), c('4'), c('5'), c('9')];
    const combo = classify414([hand[0], hand[3], hand[4]])!;
    const context: AIContext = {
      ruleset: '414',
      playerIndex: 0,
      hands: [
        hand,
        Array.from({ length: 13 }, (_, index) => c('A', 'H', index)),
        Array.from({ length: 13 }, (_, index) => c('K', 'S', index))
      ],
      deckCount: 1,
      style: 'competitive',
      cardsPlayedCount: [0, 0, 0]
    };

    const noImprovement = bombReserveSplitPenalty414(combo, hand, context, 2, 2);
    const improved = bombReserveSplitPenalty414(combo, hand, context, 4, 1);

    expect(combo.kind).toBe('singleRun');
    expect(noImprovement).toBeGreaterThan(improved);
    expect(noImprovement - improved).toBeGreaterThanOrEqual(260);
  });

  test('table effect overlay animation duration follows iOS intensity timing', () => {
    expect(effectAnimationStyle({ id: 1, kind: 'rocket', playerIndex: 0, title: '4A4', intensity: 's' })).toMatchObject({
      '--effect-duration': '1250ms'
    });
    expect(effectAnimationStyle({ id: 2, kind: 'stamp', playerIndex: 1, title: '叉!', intensity: 'c' })).toMatchObject({
      '--effect-duration': '800ms'
    });
  });

  test('hand layout follows the iOS bottom-anchored one-row geometry', () => {
    const cards = Array.from({ length: 22 }, (_, index) => c('3', 'H', index));
    const [row] = buildHandLayoutRows(cards, 600, handSpreadHeightForCount(cards.length, '414'));

    expect(row.cards).toHaveLength(22);
    expect(row.cardWidth).toBe(50);
    expect(row.cardHeight).toBe(72);
    expect(row.y).toBe(10);
    expect(row.spacing).toBeCloseTo(-23.8095, 4);
    expect(handRowTotalWidth(row)).toBeCloseTo(600, 4);
  });

  test('hand layout follows the iOS two-row geometry for large hands', () => {
    const cards = Array.from({ length: 23 }, (_, index) => c('4', 'H', index));
    const rows = buildHandLayoutRows(cards, 600, handSpreadHeightForCount(cards.length, '414'));

    expect(rows.map((row) => row.cards.length)).toEqual([12, 11]);
    expect(rows[0].cardWidth).toBe(46);
    expect(rows[0].cardHeight).toBeCloseTo(62.56, 2);
    expect(rows.map((row) => row.y)).toEqual([0, 41.44]);
    expect(rows[0].spacing).toBe(3);
    expect(handRowTotalWidth(rows[0])).toBeLessThanOrEqual(600);
    expect(handRowTotalWidth(rows[1])).toBeLessThanOrEqual(600);
  });

  test('hand layout keeps very narrow PWA hands inside the available width', () => {
    const cards = Array.from({ length: 43 }, (_, index) => c('5', 'H', index));
    const rows = buildHandLayoutRows(cards, 180, handSpreadHeightForCount(cards.length, '414'));

    expect(rows.map((row) => row.cards.length)).toEqual([22, 21]);
    rows.forEach((row) => {
      expect(handRowTotalWidth(row)).toBeLessThanOrEqual(180.0001);
    });
    expect(handSpreadHeightForCount(23, 'guandan')).toBe(108);
  });

  test('414 played card fan fits within the padded iOS-style table slot', () => {
    const sideSlotWidth = slotWidthForSeat(1, 3, 844);
    const contentWidth = slotContentWidth(sideSlotWidth, true);

    expect(sideSlotWidth).toBe(238);
    expect(contentWidth).toBe(226);
    [1, 3, 5, 12, 24, 36].forEach((count) => {
      const metrics = playedCardsFanMetrics(contentWidth, count);
      expect(fanTotalWidth(metrics, count)).toBeLessThanOrEqual(contentWidth + 0.0001);
    });
  });

  test('414 public memory rules out visible double joker and exhausted ranks without hidden opponent peeking', () => {
    const visibleJokerMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [],
      visibleCards: [c('SJ')]
    });
    expect(visibleJokerMemory.opponentAvailableCount('SJ')).toBe(0);
    expect(visibleJokerMemory.opponentAvailableCount('BJ')).toBe(1);
    expect(visibleJokerMemory.opponentsCanHaveDoubleJoker()).toBe(false);

    const ownNine = c('9', 'S');
    const exhaustedRankMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [ownNine],
      visibleCards: [c('9', 'D'), c('9', 'C'), c('9', 'H')]
    });
    expect(exhaustedRankMemory.opponentAvailableCount('9')).toBe(0);
    expect(exhaustedRankMemory.rankExhausted('9')).toBe(true);
    expect(exhaustedRankMemory.opponentsCanCha('9')).toBe(false);
    expect(exhaustedRankMemory.opponentsCanGou('9')).toBe(false);

    const hiddenRocketMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [c('5'), c('6')],
      visibleCards: []
    });
    const noHiddenRocketMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [c('5'), c('6')],
      visibleCards: []
    });
    expect(hiddenRocketMemory.opponentAvailableCount('4')).toBe(noHiddenRocketMemory.opponentAvailableCount('4'));
    expect(hiddenRocketMemory.opponentAvailableCount('A')).toBe(noHiddenRocketMemory.opponentAvailableCount('A'));
    expect(hiddenRocketMemory.opponentsCanHaveRocket414()).toBe(noHiddenRocketMemory.opponentsCanHaveRocket414());
  });

  test('414 public memory respects opponent hand counts and larger-count bomb pressure like iOS', () => {
    const shortOpponentsMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [],
      visibleCards: [],
      opponentHandCounts: [2, 1]
    });
    expect(shortOpponentsMemory.opponentsCanHaveRocket414()).toBe(false);
    expect(shortOpponentsMemory.opponentsCanHaveSameRankBomb('4', 3)).toBe(false);
    expect(shortOpponentsMemory.opponentsCanCha('4')).toBe(true);
    expect(shortOpponentsMemory.opponentsCanHaveDoubleJoker()).toBe(true);

    const oneCardOpponentsMemory = new PublicCardMemory({
      deckCount: 1,
      ownCards: [],
      visibleCards: [],
      opponentHandCounts: [1, 1]
    });
    expect(oneCardOpponentsMemory.opponentsCanCha('4')).toBe(false);
    expect(oneCardOpponentsMemory.opponentsCanHaveDoubleJoker()).toBe(false);

    const threeTwos = classify414([c('2'), c('2', 'D'), c('2', 'C')])!;
    const multiDeckMemory = new PublicCardMemory({
      deckCount: 2,
      ownCards: [],
      visibleCards: [],
      opponentHandCounts: [4, 1]
    });
    expect(multiDeckMemory.opponentsCanBeatSameRankBomb(threeTwos)).toBe(true);
  });

  test('414 default is 3 players, one deck, relaxed UI setting like iOS', () => {
    let state = fourFourteenModule.deal(fourFourteenModule.create());
    expect(state.phase).toBe('dealing');
    expect(state.players.map((player) => player.hand.length)).toEqual([0, 0, 0]);
    for (let step = 0; step < 24 && state.phase === 'dealing'; step += 1) {
      state = fourFourteenModule.dealStep!(state);
    }
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(3);
    expect(state.players.map((player) => player.hand.length)).toEqual([18, 18, 18]);
    expect(state.settings.aiStyle).toBe('relaxed');
    expect(state.settings.deckCount).toBe(1);
  });

  test('414 pauses on deal complete before entering play like iOS', () => {
    let state = fourFourteenModule.deal(fourFourteenModule.create());
    while (state.phase === 'dealing' && !state.dealReady) {
      state = fourFourteenModule.dealStep!(state);
    }

    expect(state.phase).toBe('dealing');
    expect(state.dealReady).toBe(true);
    expect(state.message).toBe('发牌完成');
    expect(state.players.map((player) => player.status)).toEqual(['发牌中', '发牌中', '发牌中']);

    state = fourFourteenModule.dealStep!(state);
    expect(state.phase).toBe('playing');
    expect(state.dealReady).toBeUndefined();
    expect(state.message).toMatch(/^红桃3在.+手中，.+先出$/);
    expect(state.visibleRecord?.system).toBe('leadStart');
    expect(state.visibleRecord?.playerIndex).toBe(-1);
    expect(state.eventLog).toHaveLength(1);
    expect(state.eventLog[0]).toBe(state.visibleRecord);
    expect(state.effect).toBeUndefined();
  });

  test('414 scores match iOS multipliers for retained rockets and no-play hands', () => {
    const winningCard = c('3', 'H');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [winningCard], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('4'), c('4', 'S'), c('A')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('5'), c('6')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 1]
    };
    const result = fourFourteenModule.apply(state, 'play', [winningCard]);
    expect(result.phase).toBe('finished');
    expect(result.message).toBe('你率先出完，游戏结束');
    expect(result.visibleRecord?.system).toBe('gameOver');
    expect(result.visibleRecord?.playerIndex).toBe(-1);
    expect(result.eventLog.at(-2)?.label).toBe('你出单张');
    expect(result.eventLog.at(-1)?.label).toBe('你率先出完，游戏结束');
    expect(result.scores).toEqual(['你 赢家', 'AI 左 3张 x4 = 12', 'AI 右 2张 x1 = 2']);
    expect(result.players.map((player) => player.status)).toEqual(['赢家', '明牌', '明牌']);
    expect(fourFourteenModule.view(result).players.map((player) => player.status)).toEqual(['赢家', '结束', '结束']);
    expect(result.scoreLines).toEqual([
      { playerIndex: 0, playerName: '你', remainingCards: 0, multiplier: 0, penalty: 0, notes: ['赢家'] },
      { playerIndex: 1, playerName: 'AI 左', remainingCards: 3, multiplier: 4, penalty: 12, notes: ['留有4A4或双王', '未出过牌'] },
      { playerIndex: 2, playerName: 'AI 右', remainingCards: 2, multiplier: 1, penalty: 2, notes: [] }
    ]);
  });

  test('414 ending system event suppresses the final play effect like iOS', () => {
    const rocketCards = [c('4'), c('4', 'S'), c('A')];
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: rocketCards, status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('5')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('6')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    const result = fourFourteenModule.apply(state, 'play', rocketCards);

    expect(result.phase).toBe('finished');
    expect(result.effect).toBeUndefined();
    expect(result.visibleRecord?.system).toBe('gameOver');
    expect(result.eventLog.at(-2)?.combo?.kind).toBe('rocket414');
    expect(result.eventLog.at(-1)?.label).toBe('你率先出完，游戏结束');
  });

  test('414 enables selected plays and reports illegal selections like iOS', () => {
    const first = c('3', 'H');
    const second = c('5', 'S');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [first, second], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('8')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('9')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    expect(fourFourteenModule.legalActions(state, [first, second])).toContain('play');
    const result = fourFourteenModule.apply(state, 'play', [first, second]);
    expect(result.message).toBe('牌型不合法');
    expect(result.players[0].hand).toEqual([first, second]);
    expect(result.currentPlayerIndex).toBe(0);
  });

  test('414 follows with equivalent run cards even when legal enumeration picked different suits', () => {
    const previousCards = [c('3', 'D'), c('4', 'D'), c('5', 'D')];
    const previous = classify414(previousCards)!;
    const selectedRun = [c('4', 'H'), c('5', 'H'), c('6', 'H')];
    const hand = [c('4', 'D'), selectedRun[0], c('5', 'D'), selectedRun[1], c('6', 'D'), selectedRun[2]];
    const previousRecord = {
      id: 1,
      playerIndex: 1,
      cards: previousCards,
      combo: previous,
      label: 'AI 左出单龙'
    };
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand, status: '跟牌' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('8')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('9')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay: previousRecord,
      visibleRecord: previousRecord,
      tableRecords: [undefined, previousRecord, undefined],
      cardsPlayedCount: [0, 3, 0]
    };

    expect(legal414(hand, previous).some((combo) => combo.kind === 'singleRun' && combo.primaryRank === '4')).toBe(true);
    const result = fourFourteenModule.apply(state, 'play', selectedRun);

    expect(result.message).toBe('你出单龙');
    expect(result.lastPlay?.combo?.kind).toBe('singleRun');
    expect(result.lastPlay?.combo?.primaryRank).toBe('4');
    expect(result.players[0].hand.some((card) => selectedRun.some((used) => used.id === card.id))).toBe(false);
  });

  test('414 view exposes iOS-style prompt text instead of stale table events', () => {
    const previousCard = c('7', 'H');
    const previous = classify414([previousCard])!;
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('8'), c('9')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('5')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('6')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    expect(fourFourteenModule.view(state).promptText).toBe('你起手');
    expect(fourFourteenModule.view(state).players.map((player) => player.status)).toEqual(['起手', '等待', '等待']);

    const followState: FourFourteenState = {
      ...state,
      lastPlay: { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' },
      visibleRecord: { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' },
      message: 'AI 左出单张'
    };
    expect(fourFourteenModule.view(followState).promptText).toBe('你跟牌或过');
    expect(fourFourteenModule.view(followState).players.map((player) => player.status)).toEqual(['跟牌', '等待', '等待']);

    const humanReaction: FourFourteenState = {
      ...followState,
      reaction: { kind: 'cha', targetRank: '7', sourcePlayerIndex: 1, normalPlayPlayerIndex: 1, remainingPlayers: [0] }
    };
    expect(fourFourteenModule.view(humanReaction).promptText).toBe('你可以叉7');
    expect(fourFourteenModule.view(humanReaction).players.map((player) => player.status)).toEqual(['可叉', '等待', '等待']);

    const aiReaction: FourFourteenState = {
      ...followState,
      currentPlayerIndex: 1,
      reaction: { kind: 'gou', targetRank: '7', sourcePlayerIndex: 0, remainingPlayers: [1] }
    };
    expect(fourFourteenModule.view(aiReaction).promptText).toBe('AI 左思考中');
    expect(fourFourteenModule.view(aiReaction).players.map((player) => player.status)).toEqual(['等待', '思考', '等待']);
  });

  test('414 option changes apply to the next deal without interrupting the current game', () => {
    const currentCard = c('7', 'H');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      settings: { playerCount: 3, deckCount: 1, aiStyle: 'relaxed' },
      nextSettings: { playerCount: 3, deckCount: 1, aiStyle: 'relaxed' },
      players: [
        { id: 0, name: '你', isHuman: true, hand: [currentCard], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('8')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('9')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    const changed = fourFourteenModule.setOption!(state, 'playerCount', 4);
    expect(changed.phase).toBe('playing');
    expect(changed.players).toHaveLength(3);
    expect(changed.players[0].hand).toEqual([currentCard]);
    expect(changed.settings.playerCount).toBe(3);
    expect(changed.nextSettings?.playerCount).toBe(4);

    const nextDeal = fourFourteenModule.deal(changed);
    expect(nextDeal.phase).toBe('dealing');
    expect(nextDeal.players).toHaveLength(4);
    expect(nextDeal.settings.playerCount).toBe(4);

    const dealingNoop = fourFourteenModule.setOption!(nextDeal, 'deckCount', 3);
    expect(dealingNoop).toBe(nextDeal);
  });

  test('414 clears pass clutter when everyone passes back to the controller', () => {
    const lastCard = c('9', 'H');
    const lastPlay = {
      id: 1,
      playerIndex: 1,
      cards: [lastCard],
      combo: classify414([lastCard])!,
      label: 'AI 左出单张'
    };
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('10')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('J')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay,
      visibleRecord: lastPlay,
      tableRecords: [undefined, lastPlay, { id: 2, playerIndex: 2, cards: [], label: 'AI 右过', passed: true }],
      passCount: 1,
      cardsPlayedCount: [0, 1, 0]
    };
    const result = fourFourteenModule.apply(state, 'pass', []);
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.lastPlay).toBeUndefined();
    expect(result.tableRecords[1]).toBe(lastPlay);
    expect(result.tableRecords[0]).toBeUndefined();
    expect(result.tableRecords[2]).toBeUndefined();
    expect(result.visibleRecord?.system).toBe('relead');
    expect(result.eventLog.at(-1)?.label).toBe('2家过牌，AI 左重新起手');
  });

  test('414 reaction pass stays silent while normal follow pass remains public like iOS', () => {
    const previousCard = c('5', 'H');
    const previous = classify414([previousCard])!;
    const lastPlay = { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' };
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('5'), c('5', 'S'), c('8')], status: '可叉' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('9')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('5', 'D'), c('5', 'C'), c('10')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay,
      visibleRecord: lastPlay,
      tableRecords: [undefined, lastPlay, undefined],
      reaction: { kind: 'cha', targetRank: '5', sourcePlayerIndex: 1, normalPlayPlayerIndex: 1, remainingPlayers: [0, 2] },
      cardsPlayedCount: [0, 1, 0],
      eventLog: [lastPlay]
    };

    const reactionPass = fourFourteenModule.apply(state, 'pass', []);
    expect(reactionPass.eventLog).toHaveLength(1);
    expect(reactionPass.eventLog[0]).toBe(lastPlay);
    expect(reactionPass.visibleRecord).toBe(lastPlay);
    expect(reactionPass.message).toBe('AI 右思考中');
    expect(reactionPass.message).not.toContain('放弃');
    expect(reactionPass.currentPlayerIndex).toBe(2);
    expect(reactionPass.reaction?.remainingPlayers).toEqual([2]);

    const followState: FourFourteenState = {
      ...state,
      reaction: undefined,
      currentPlayerIndex: 0,
      passCount: 0,
      eventLog: [lastPlay]
    };
    const followPass = fourFourteenModule.apply(followState, 'pass', []);
    expect(followPass.eventLog).toHaveLength(2);
    expect(followPass.eventLog.at(-1)?.label).toBe('你过');
    expect(followPass.visibleRecord?.label).toBe('你过');
    expect(followPass.tableRecords[0]?.passed).toBe(true);
  });

  test('414 skips the cha prompt when no player can react to a single', () => {
    const heartThree = c('3', 'H');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [heartThree, c('8')], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('4'), c('6')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('5'), c('7')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    const result = fourFourteenModule.apply(state, 'play', [heartThree]);

    expect(result.reaction).toBeUndefined();
    expect(result.lastPlay?.combo?.kind).toBe('single');
    expect(result.currentPlayerIndex).toBe(1);
  });

  test('414 opener can lead any legal combo like the iOS client', () => {
    const heartThree = c('3', 'H');
    const openingCard = c('8', 'S');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [heartThree, openingCard], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('4'), c('6')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('5'), c('7')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    expect(fourFourteenModule.legalActions(state, [openingCard])).toContain('play');
    const result = fourFourteenModule.apply(state, 'play', [openingCard]);

    expect(result.message).toBe('你出单张');
    expect(result.players[0].hand.map((card) => card.id)).toContain(heartThree.id);
    expect(result.players[0].hand.map((card) => card.id)).not.toContain(openingCard.id);
  });

  test('414 lets the original single player auto-gou after another player cha', () => {
    const heartThree = c('3', 'H');
    const spareThree = c('3', 'S');
    const leftThreeA = c('3', 'C');
    const leftThreeB = c('3', 'D');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 3, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [heartThree, spareThree, c('8')], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [leftThreeA, leftThreeB, c('9')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('J'), c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    const waitingForCha = fourFourteenModule.apply(state, 'play', [heartThree]);
    expect(waitingForCha.reaction?.kind).toBe('cha');
    expect(waitingForCha.currentPlayerIndex).toBe(1);

    const waitingForGou = fourFourteenModule.aiStep(waitingForCha);
    expect(waitingForGou.reaction?.kind).toBe('gou');
    expect(waitingForGou.currentPlayerIndex).toBe(0);
    expect(fourFourteenModule.legalActions(waitingForGou, [])).toContain('gou');
    expect(waitingForGou.visibleRecord?.label).toBe('AI 左叉3');
    expect(waitingForGou.effect).toMatchObject({ title: '叉!', subtitle: 'AI 左' });

    const afterGou = fourFourteenModule.apply(waitingForGou, 'gou', []);
    expect(afterGou.reaction).toBeUndefined();
    expect(afterGou.lastPlay).toBeUndefined();
    expect(afterGou.currentPlayerIndex).toBe(0);
    expect(afterGou.players[0].hand.map((card) => card.id)).not.toContain(spareThree.id);
    expect(afterGou.visibleRecord?.label).toBe('你勾3');
    expect(afterGou.effect).toMatchObject({ title: '勾!', subtitle: '你' });
  });

  test('414 rejects normal play actions during cha and gou reaction prompts like iOS', () => {
    const previousCard = c('7', 'H');
    const previous = classify414([previousCard])!;
    const playableCard = c('8', 'S');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [playableCard, c('7'), c('7', 'S')], status: '可叉' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('9')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('10')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay: { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' },
      tableRecords: Array(3).fill(undefined),
      reaction: { kind: 'cha', targetRank: '7', sourcePlayerIndex: 1, normalPlayPlayerIndex: 1, remainingPlayers: [0] },
      cardsPlayedCount: [0, 1, 0]
    };

    expect(fourFourteenModule.legalActions(state, [playableCard])).not.toContain('play');
    const result = fourFourteenModule.apply(state, 'play', [playableCard]);

    expect(result.reaction).toEqual(state.reaction);
    expect(result.currentPlayerIndex).toBe(0);
    expect(result.players[0].hand.map((card) => card.id)).toContain(playableCard.id);
    expect(result.eventLog).toHaveLength(0);
    expect(result.lastPlay).toBe(state.lastPlay);
  });

  test('414 reaction actions reject exact invalid selections instead of silently auto-correcting', () => {
    const previousCard = c('7', 'H');
    const previous = classify414([previousCard])!;
    const sevenA = c('7');
    const sevenB = c('7', 'S');
    const wrongPair = [c('8'), c('8', 'S')];
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [sevenA, sevenB, ...wrongPair], status: '可叉' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('9')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('10')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay: { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' },
      tableRecords: Array(3).fill(undefined),
      reaction: { kind: 'cha', targetRank: '7', sourcePlayerIndex: 1, normalPlayPlayerIndex: 1, remainingPlayers: [0] },
      cardsPlayedCount: [0, 1, 0]
    };

    const wrongRankResult = fourFourteenModule.apply(state, 'cha', wrongPair);
    expect(wrongRankResult.message).toBe('当前不能这样出');
    expect(wrongRankResult.players[0].hand.map((card) => card.id)).toEqual(state.players[0].hand.map((card) => card.id));
    expect(wrongRankResult.eventLog).toHaveLength(0);

    const missingCards = [c('7', 'C'), c('7', 'D')];
    const missingCardResult = fourFourteenModule.apply(state, 'cha', missingCards);
    expect(missingCardResult.message).toBe('选中的牌不在手牌中');
    expect(missingCardResult.players[0].hand.map((card) => card.id)).toEqual(state.players[0].hand.map((card) => card.id));
    expect(missingCardResult.eventLog).toHaveLength(0);

    const autoResult = fourFourteenModule.apply(state, 'cha', []);
    expect(autoResult.eventLog.some((record) => record.label === '你叉7')).toBe(true);
    expect(autoResult.tableRecords[0]?.label).toBe('你叉7');
    expect(autoResult.players[0].hand.map((card) => card.id)).not.toContain(sevenA.id);
    expect(autoResult.players[0].hand.map((card) => card.id)).not.toContain(sevenB.id);

    const gouState: FourFourteenState = {
      ...state,
      players: [
        { id: 0, name: '你', isHuman: true, hand: [sevenA, wrongPair[0]], status: '可勾' },
        state.players[1],
        state.players[2]
      ],
      reaction: { kind: 'gou', targetRank: '7', sourcePlayerIndex: 1, remainingPlayers: [0] }
    };
    const wrongGouResult = fourFourteenModule.apply(gouState, 'gou', [wrongPair[0]]);
    expect(wrongGouResult.message).toBe('当前不能这样出');
    expect(wrongGouResult.players[0].hand.map((card) => card.id)).toEqual(gouState.players[0].hand.map((card) => card.id));
  });

  test('414 AI avoids gou when it would break an important single run', () => {
    const five = c('5');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 3, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('9')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('3'), c('4'), five, c('6'), c('7'), c('K')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('5', 'S'), c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 1,
      tableRecords: Array(3).fill(undefined),
      reaction: { kind: 'gou', targetRank: '5', sourcePlayerIndex: 0, remainingPlayers: [1, 2] },
      cardsPlayedCount: [0, 0, 0]
    };

    const result = fourFourteenModule.aiStep(state);

    expect(result.currentPlayerIndex).toBe(2);
    expect(result.reaction?.kind).toBe('gou');
    expect(result.players[1].hand.map((card) => card.id)).toContain(five.id);
    expect(result.eventLog).toHaveLength(0);
  });

  test('414 AI still takes cheap gou when it does not damage hand structure', () => {
    const five = c('5');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 3, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('9')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [five, c('K')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 1,
      tableRecords: Array(3).fill(undefined),
      reaction: { kind: 'gou', targetRank: '5', sourcePlayerIndex: 0, remainingPlayers: [1] },
      cardsPlayedCount: [0, 0, 0]
    };

    const result = fourFourteenModule.aiStep(state);

    expect(result.reaction).toBeUndefined();
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.lastPlay).toBeUndefined();
    expect(result.players[1].hand.map((card) => card.id)).not.toContain(five.id);
    expect(result.eventLog.at(-1)?.combo?.kind).toBe('gou');
  });

  test('414 AI avoids spending two twos on a likely unprofitable cha', () => {
    const twoA = c('2');
    const twoB = c('2', 'S');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 4, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('8'), c('9'), c('10')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [twoA, twoB, c('3'), c('4'), c('5'), c('6'), c('7')], status: '等待' },
        { id: 2, name: 'AI 上', isHuman: false, hand: [c('J')], status: '等待' },
        { id: 3, name: 'AI 右', isHuman: false, hand: [c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 1,
      tableRecords: Array(4).fill(undefined),
      reaction: { kind: 'cha', targetRank: '2', sourcePlayerIndex: 0, normalPlayPlayerIndex: 0, remainingPlayers: [1] },
      cardsPlayedCount: [0, 0, 0, 0]
    };

    const result = fourFourteenModule.aiStep(state);

    expect(result.reaction).toBeUndefined();
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.players[1].hand.map((card) => card.id)).toContain(twoA.id);
    expect(result.players[1].hand.map((card) => card.id)).toContain(twoB.id);
    expect(result.eventLog).toHaveLength(0);
  });

  test('414 AI spends two twos on cha when the current controller is nearly out', () => {
    const twoA = c('2');
    const twoB = c('2', 'S');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 4, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [c('9')], status: '等待' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [twoA, twoB, c('3'), c('4'), c('5'), c('6'), c('7')], status: '等待' },
        { id: 2, name: 'AI 上', isHuman: false, hand: [c('J'), c('Q'), c('K')], status: '等待' },
        { id: 3, name: 'AI 右', isHuman: false, hand: [c('A'), c('K')], status: '等待' }
      ],
      currentPlayerIndex: 1,
      tableRecords: Array(4).fill(undefined),
      reaction: { kind: 'cha', targetRank: '2', sourcePlayerIndex: 0, normalPlayPlayerIndex: 0, remainingPlayers: [1] },
      cardsPlayedCount: [0, 0, 0, 0]
    };

    const result = fourFourteenModule.aiStep(state);

    expect(result.reaction).toBeUndefined();
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.players[1].hand.map((card) => card.id)).not.toContain(twoA.id);
    expect(result.players[1].hand.map((card) => card.id)).not.toContain(twoB.id);
    expect(result.eventLog.some((record) => record.combo?.kind === 'cha')).toBe(true);
    expect(result.tableRecords[1]?.combo?.kind).toBe('cha');
  });

  test('414 records an iOS-style dead-cha system event when nobody can gou', () => {
    const heartThree = c('3', 'H');
    const leftThreeA = c('3', 'C');
    const leftThreeB = c('3', 'D');
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      settings: { playerCount: 3, deckCount: 1, aiStyle: 'competitive' },
      phase: 'playing',
      players: [
        { id: 0, name: '你', isHuman: true, hand: [heartThree, c('8')], status: '先出' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [leftThreeA, leftThreeB, c('9')], status: '等待' },
        { id: 2, name: 'AI 右', isHuman: false, hand: [c('J'), c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      tableRecords: Array(3).fill(undefined),
      cardsPlayedCount: [0, 0, 0]
    };

    const waitingForCha = fourFourteenModule.apply(state, 'play', [heartThree]);
    const deadCha = fourFourteenModule.aiStep(waitingForCha);

    expect(deadCha.reaction).toBeUndefined();
    expect(deadCha.currentPlayerIndex).toBe(1);
    expect(deadCha.lastPlay).toBeUndefined();
    expect(deadCha.tableRecords[0]).toBeUndefined();
    expect(deadCha.tableRecords[1]?.combo?.kind).toBe('cha');
    expect(deadCha.tableRecords[2]).toBeUndefined();
    expect(deadCha.visibleRecord?.system).toBe('deadCha');
    expect(deadCha.eventLog.at(-1)?.label).toBe('无人勾，AI 左死叉后起手');
  });

  test('414 hint prefers iOS-style quick lead shapes over control cards', () => {
    const heartThree = c('3', 'H');
    const hand = [heartThree, c('4', 'S'), c('5'), c('6'), c('7'), c('2'), c('SJ'), c('BJ')];
    const hint = chooseHintCombo({
      ruleset: '414',
      playerIndex: 0,
      hands: [hand, [], []],
      deckCount: 1,
      visibleCards: []
    });

    expect(hint?.kind).toBe('singleRun');
    expect(hint?.cards.map((card) => card.rank)).toEqual(['3', '4', '5', '6', '7']);
  });

  test('414 multi-deck AI candidate bounding follows the iOS priority shape pass', () => {
    const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
    const hand = ranks.flatMap((rank, rankIndex) =>
      [0, 1].flatMap((deck) => [c(rank, 'H', deck + rankIndex * 10), c(rank, 'S', deck + rankIndex * 10)])
    );
    const legal = legal414(hand);
    const bounded = limitFourFourteenCandidateCombos(legal, {
      ruleset: '414',
      playerIndex: 1,
      hands: [[], hand, Array(2).fill(0).map((_, index) => c('A', 'C', index)), []],
      deckCount: 3,
      visibleCards: [],
      cardsPlayedCount: [0, 0, 0, 0]
    });

    expect(hand).toHaveLength(40);
    expect(legal.length).toBeGreaterThan(30);
    expect(bounded.length).toBeLessThan(legal.length);
    expect(bounded.length).toBeLessThanOrEqual(27);
    expect(bounded.some((combo) => combo.kind === 'singleRun')).toBe(true);
    expect(bounded.some((combo) => combo.kind === 'pairRun')).toBe(true);
    expect(bounded.some((combo) => combo.kind === 'sameRankBomb')).toBe(true);
  });

  test('414 follow hint preserves 4A4 when a normal pair can beat the table', () => {
    const previous = classify414([c('4'), c('4', 'S')])!;
    const hand = [c('5'), c('5', 'S'), c('4', 'C'), c('4', 'D'), c('A')];
    const hint = chooseHintCombo({
      ruleset: '414',
      playerIndex: 0,
      hands: [hand, [], []],
      previous,
      deckCount: 1,
      visibleCards: []
    });

    expect(hint?.kind).toBe('pair');
    expect(hint?.primaryRank).toBe('5');
  });

  test('414 best hint upgrades the quick hint like the iOS recommendation pass', () => {
    const previousCard = c('K', 'C');
    const previous = classify414([previousCard])!;
    const two = c('2');
    const bombCards = [c('3'), c('3', 'D'), c('3', 'C')];
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      settings: { playerCount: 4, deckCount: 1, aiStyle: 'relaxed' },
      nextSettings: { playerCount: 4, deckCount: 1, aiStyle: 'relaxed' },
      players: [
        { id: 0, name: '你', isHuman: true, hand: [two, ...bombCards, c('8'), c('9')], status: '跟牌' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [c('4'), c('5'), c('6'), c('7')], status: '等待' },
        { id: 2, name: 'AI 上', isHuman: false, hand: [c('BJ')], status: '等待' },
        { id: 3, name: 'AI 右', isHuman: false, hand: [c('10'), c('J'), c('Q')], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay: { id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' },
      tableRecords: Array(4).fill(undefined),
      passCount: 0,
      cardsPlayedCount: [10, 13, 12, 8],
      eventLog: [{ id: 1, playerIndex: 1, cards: [previousCard], combo: previous, label: 'AI 左出单张' }]
    };

    const quick = fourFourteenModule.hint(state);
    expect(classify414(quick)?.kind).toBe('single');
    expect(quick[0].id).toBe(two.id);

    const best = fourFourteenModule.bestHint!(state);
    expect(classify414(best)?.kind).toBe('sameRankBomb');
    expect(best.map((card) => card.id)).toEqual(sortCards(bombCards).map((card) => card.id));
  });

  test('414 best hint uses a lower sufficient bomb instead of four twos', () => {
    const sixBomb = [c('6', 'D'), c('6', 'C'), c('6', 'H'), c('6', 'S')];
    const twoBomb = [c('2', 'D'), c('2', 'C'), c('2', 'H'), c('2', 'S')];
    const previousCards = [c('2', 'D', 1), c('2', 'C', 1), c('2', 'H', 1)];
    const previous = classify414(previousCards)!;
    const state: FourFourteenState = {
      ...fourFourteenModule.create(),
      phase: 'playing',
      settings: { playerCount: 4, deckCount: 2, aiStyle: 'relaxed' },
      nextSettings: { playerCount: 4, deckCount: 2, aiStyle: 'relaxed' },
      players: [
        { id: 0, name: '你', isHuman: true, hand: [...sixBomb, ...twoBomb, c('3'), c('4'), c('5')], status: '跟牌' },
        { id: 1, name: 'AI 左', isHuman: false, hand: [], status: '等待' },
        { id: 2, name: 'AI 上', isHuman: false, hand: [], status: '等待' },
        { id: 3, name: 'AI 右', isHuman: false, hand: [], status: '等待' }
      ],
      currentPlayerIndex: 0,
      lastPlay: { id: 1, playerIndex: 1, cards: previousCards, combo: previous, label: 'AI 左出炸' },
      tableRecords: Array(4).fill(undefined),
      cardsPlayedCount: [0, 0, 0, 0],
      eventLog: [{ id: 1, playerIndex: 1, cards: previousCards, combo: previous, label: 'AI 左出炸' }]
    };

    const best = fourFourteenModule.bestHint!(state);

    expect(classify414(best)?.kind).toBe('sameRankBomb');
    expect(new Set(best.map((card) => card.id))).toEqual(new Set(sixBomb.map((card) => card.id)));
  });

  test('414 AI follows with a spare single instead of breaking an important run', () => {
    const king = c('K', 'C');
    const previous = classify414([c('4', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [],
        [c('3'), c('4'), c('5'), c('6'), c('7'), king],
        [],
        []
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('single');
    expect(combo?.cards[0].id).toBe(king.id);
  });

  test('414 AI uses a duplicate single to preserve a run', () => {
    const previous = classify414([c('4', 'C')])!;
    const hand = [c('3'), c('4'), c('5'), c('6', 'C'), c('6'), c('7')];
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [[], hand, [], []],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('single');
    expect(combo?.primaryRank).toBe('6');
    expect(classify414(hand.filter((card) => !combo?.cards.some((used) => used.id === card.id)))?.kind).toBe('singleRun');
  });

  test('414 AI splits overlapping run material into two playable runs', () => {
    const hand = [c('3'), c('4'), c('5', 'C'), c('5'), c('6', 'C'), c('6'), c('7'), c('8'), c('9')];
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [[], hand, [], []],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('singleRun');
    expect(combo?.cards.map((card) => card.rank)).toEqual(['3', '4', '5', '6']);
    expect(classify414(hand.filter((card) => !combo?.cards.some((used) => used.id === card.id)))?.kind).toBe('singleRun');
  });

  test('414 AI keeps a triad bomb intact when opening with a run is available', () => {
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [],
        [c('3'), c('3', 'D'), c('3', 'S'), c('4'), c('4', 'C'), c('6'), c('7'), c('8'), c('9'), c('10')],
        [],
        []
      ],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('singleRun');
    expect(combo?.cards.map((card) => card.rank)).toEqual(['6', '7', '8', '9', '10']);
  });

  test('414 AI may use triad with pair when it immediately finishes', () => {
    const hand = [c('3'), c('3', 'D'), c('3', 'S'), c('4'), c('4', 'C')];
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [[], hand, [], []],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('trioWithPair');
    expect(new Set(combo!.cards.map((card) => card.id))).toEqual(new Set(hand.map((card) => card.id)));
  });

  test('414 AI passes instead of overkilling a low-pressure follow with a two', () => {
    const previous = classify414([c('K', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('3', 'C'), c('4', 'C'), c('5', 'C'), c('6', 'C'), c('7', 'C'), c('8'), c('9'), c('10')],
        [c('2'), c('3'), c('4'), c('5'), c('6'), c('7')],
        [],
        []
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo).toBeUndefined();
  });

  test('414 relaxed AI passes instead of spending a bomb in low pressure', () => {
    const previous = classify414([c('K', 'C'), c('K', 'D')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('4', 'C'), c('5', 'C'), c('6', 'C'), c('7', 'C'), c('8', 'C'), c('9', 'C')],
        [c('3'), c('3', 'D'), c('3', 'C'), c('4'), c('5'), c('6'), c('7'), c('8')],
        [c('4', 'D'), c('5', 'D'), c('6', 'D'), c('7', 'D'), c('8', 'D'), c('9', 'D')],
        [c('4', 'S'), c('5', 'S'), c('6', 'S'), c('7', 'S'), c('8', 'S'), c('9', 'S')]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      style: 'relaxed',
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo).toBeUndefined();
  });

  test('414 AI spends a two when table progress pressure is high', () => {
    const two = c('2');
    const previous = classify414([c('K', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('3', 'C'), c('4', 'C'), c('5', 'C'), c('6', 'C'), c('7', 'C'), c('BJ')],
        [two, c('3'), c('4'), c('5'), c('6'), c('7')],
        [],
        []
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [16, 12, 8, 6],
      visibleCards: []
    });

    expect(combo?.kind).toBe('single');
    expect(combo?.cards[0].id).toBe(two.id);
  });

  test('414 AI leads a non-single shape when an opponent has one card', () => {
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('A', 'S')],
        [c('BJ'), c('6'), c('6', 'D'), c('9'), c('J')],
        [c('3'), c('4'), c('5')],
        [c('7'), c('8'), c('10')]
      ],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('pair');
    expect(combo?.primaryRank).toBe('6');
  });

  test('414 AI blocks a one-card opponent with a bomb over a single two', () => {
    const previous = classify414([c('K', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('4'), c('5'), c('6'), c('7')],
        [c('2'), c('3'), c('3', 'D'), c('3', 'C'), c('8'), c('9')],
        [c('BJ')],
        [c('10'), c('J'), c('Q')]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [13, 10, 12, 8],
      visibleCards: []
    });

    expect(combo?.kind).toBe('sameRankBomb');
    expect(combo?.primaryRank).toBe('3');
  });

  test('414 AI saves a bomb when the current table shape already covers a one-card threat', () => {
    const previous = classify414([c('Q'), c('Q', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 3,
      hands: [
        [c('A', 'S')],
        [c('4'), c('5'), c('6'), c('7'), c('8'), c('9')],
        [c('3', 'C'), c('4', 'C'), c('5', 'C')],
        [c('3'), c('3', 'D'), c('3', 'S'), c('8', 'C'), c('9', 'C')]
      ],
      previous,
      previousPlayerIndex: 2,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo).toBeUndefined();
  });

  test('414 AI uses a bomb at the last reliable interception point', () => {
    const previous = classify414([c('K'), c('K', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('A', 'S')],
        [c('3'), c('3', 'D'), c('3', 'S'), c('8', 'C'), c('9', 'C')],
        [c('4', 'C')],
        [c('5', 'C')]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('sameRankBomb');
    expect(combo?.primaryRank).toBe('3');
  });

  test('414 AI chooses the lowest sufficient ordinary interception over a bomb', () => {
    const previous = classify414([c('K'), c('K', 'C')])!;
    const pairAces = [c('A'), c('A', 'C')];
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('9', 'S')],
        [...pairAces, c('3'), c('3', 'D'), c('3', 'S'), c('5', 'C')],
        [c('4', 'C')],
        [c('5', 'D')]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).toBe('pair');
    expect(new Set(combo?.cards.map((card) => card.id))).toEqual(new Set(pairAces.map((card) => card.id)));
  });

  test('414 AI leads a restrictive three-card shape when an opponent has two cards', () => {
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('A', 'S'), c('K', 'S')],
        [c('3'), c('4'), c('5'), c('6'), c('6', 'C'), c('9', 'C')],
        [c('4', 'C'), c('5', 'C'), c('6', 'C')],
        [c('7', 'C'), c('8', 'C'), c('9')]
      ],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.cards.length).toBeGreaterThanOrEqual(3);
    expect(combo?.kind).toBe('singleRun');
  });

  test('414 three-deck AI does not open with 4A4 when ordinary lead shapes are available', () => {
    const hand = [
      c('3', 'H', 1),
      c('4'),
      c('4', 'D'),
      c('5', 'C'),
      c('6', 'C'),
      c('7', 'C'),
      c('8', 'C'),
      c('9', 'C'),
      c('10', 'C'),
      c('J', 'D'),
      c('Q', 'D'),
      c('A', 'S'),
      c('2', 'C'),
      c('SJ', 'J', 1)
    ];
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [Array(28).fill(0).map((_, index) => c('3', 'S', index + 10)), hand, [], []],
      deckCount: 3,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    expect(combo?.kind).not.toBe('rocket414');
    expect(combo?.cards.length).toBeGreaterThan(1);
  });

  test('414 multi-deck AI spends abundant control before the one-card cliff', () => {
    const previous = classify414([c('K', 'C')])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('3', 'H', 1), c('4', 'H', 1), c('5', 'H', 1), c('6', 'H', 1), c('7', 'H', 1), c('8', 'H', 1)],
        [
          c('2'),
          c('2', 'S', 1),
          c('SJ'),
          c('BJ'),
          c('3'),
          c('3', 'D'),
          c('3', 'C'),
          c('4'),
          c('4', 'D'),
          c('4', 'C'),
          c('4', 'S'),
          c('9', 'C'),
          c('10', 'C'),
          c('J', 'C')
        ],
        [c('5', 'C', 1), c('6', 'C', 1), c('7', 'C', 1), c('8', 'C', 1), c('9', 'C', 1), c('10', 'C', 1), c('J', 'C', 1), c('Q', 'C', 1)],
        [c('5', 'D', 1), c('6', 'D', 1), c('7', 'D', 1), c('8', 'D', 1), c('9', 'D', 1), c('10', 'D', 1), c('J', 'D', 1), c('Q', 'D', 1)]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 2,
      cardsPlayedCount: [12, 10, 8, 8],
      visibleCards: []
    });

    expect(combo).toBeDefined();
  });

  test('414 three-deck AI treats three-card bombs as lower-cost pressure', () => {
    const previous = classify414([c('A', 'H', 2), c('A', 'S', 2)])!;
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('4', 'H', 2), c('5', 'H', 2), c('6', 'H', 2), c('7', 'H', 2), c('8', 'H', 2), c('9', 'H', 2), c('10', 'H', 2), c('J', 'H', 2)],
        [
          c('3'),
          c('3', 'D'),
          c('3', 'C'),
          c('4'),
          c('4', 'D'),
          c('4', 'C'),
          c('5'),
          c('5', 'D'),
          c('5', 'C'),
          c('6', 'C'),
          c('7', 'C'),
          c('8', 'C'),
          c('9', 'C'),
          c('10', 'C')
        ],
        [c('6', 'C', 2), c('7', 'C', 2), c('8', 'C', 2), c('9', 'C', 2), c('10', 'C', 2), c('J', 'C', 2), c('Q', 'C', 2), c('K', 'C', 2), c('A', 'C', 2)],
        [c('6', 'D', 2), c('7', 'D', 2), c('8', 'D', 2), c('9', 'D', 2), c('10', 'D', 2), c('J', 'D', 2), c('Q', 'D', 2), c('K', 'D', 2), c('A', 'D', 2)]
      ],
      previous,
      previousPlayerIndex: 0,
      deckCount: 3,
      cardsPlayedCount: [18, 14, 12, 12],
      visibleCards: []
    });

    expect(combo?.kind).toBe('sameRankBomb');
    expect(combo?.sameRankCount).toBe(3);
  });

  test('414 AI keeps compact control endgames intact instead of splitting a bomb', () => {
    const aces = [c('A'), c('A', 'D'), c('A', 'C')];
    const hand = [...aces, c('SJ'), c('BJ')];

    for (const style of ['competitive', 'relaxed'] as const) {
      const combo = chooseAICombo({
        ruleset: '414',
        playerIndex: 1,
        hands: [
          [c('3'), c('4'), c('5')],
          hand,
          [c('6'), c('7'), c('8')],
          [c('9'), c('10'), c('J')]
        ],
        deckCount: 1,
        style,
        cardsPlayedCount: [0, 0, 0, 0],
        visibleCards: []
      });

      expect(combo?.kind).toBe('sameRankBomb');
      expect(combo?.primaryRank).toBe('A');
      expect(new Set(combo!.cards.map((card) => card.id))).toEqual(new Set(aces.map((card) => card.id)));
    }
  });

  test('414 AI does not break a same-rank bomb just to make a short run', () => {
    const combo = chooseAICombo({
      ruleset: '414',
      playerIndex: 1,
      hands: [
        [c('6'), c('7'), c('8')],
        [c('3'), c('3', 'D'), c('3', 'C'), c('4'), c('5'), c('9', 'C'), c('J', 'C'), c('K', 'C')],
        [c('6', 'D'), c('7', 'D'), c('8', 'D')],
        [c('6', 'S'), c('7', 'S'), c('8', 'S')]
      ],
      deckCount: 1,
      cardsPlayedCount: [0, 0, 0, 0],
      visibleCards: []
    });

    const usesThree = combo?.cards.some((card) => card.rank === '3') ?? false;
    expect(!(combo?.kind === 'singleRun' && usesThree)).toBe(true);
    expect(!(combo?.kind === 'single' && combo.primaryRank === '3')).toBe(true);
  });

  test('dou dizhu recognizes airplane, rocket, and bomb hierarchy', () => {
    const airplane = classifyDouDizhu([c('3'), c('3', 'S'), c('3', 'C'), c('4'), c('4', 'S'), c('4', 'C'), c('6'), c('7')]);
    expect(airplane?.kind).toBe('airplaneWithSingles');
    const pair = classifyDouDizhu([c('A'), c('A', 'S')])!;
    const bomb = classifyDouDizhu([c('3'), c('3', 'S'), c('3', 'C'), c('3', 'D')])!;
    const rocket = classifyDouDizhu([c('SJ'), c('BJ')])!;
    expect(canBeatDouDizhu(bomb, pair)).toBe(true);
    expect(canBeatDouDizhu(rocket, bomb)).toBe(true);
  });

  test('dou dizhu deal enters bidding with 17 cards plus bottom', () => {
    const state = douDizhuModule.deal(douDizhuModule.create());
    expect(state.phase).toBe('bidding');
    expect(state.players.map((player) => player.hand.length)).toEqual([17, 17, 17]);
    expect(state.bottomCards).toHaveLength(3);
  });

  test('dou dizhu human landlord receives the three bottom cards for hand highlighting', () => {
    const state = {
      ...douDizhuModule.deal(douDizhuModule.create()),
      currentPlayerIndex: 0
    };
    const bottomIds = new Set(state.bottomCards.map((card) => card.id));
    const result = douDizhuModule.apply(state, 'bid3', []);

    expect(result.phase).toBe('playing');
    expect(result.landlordIndex).toBe(0);
    expect(result.players[0].hand.filter((card) => bottomIds.has(card.id))).toHaveLength(3);
  });

  test('dou dizhu redeal clears previous landlord and peasant labels', () => {
    const state = {
      ...douDizhuModule.deal(douDizhuModule.create()),
      currentPlayerIndex: 0
    };
    const playing = douDizhuModule.apply(state, 'bid3', []);
    const redealt = douDizhuModule.deal(playing);

    expect(redealt.phase).toBe('bidding');
    expect(redealt.landlordIndex).toBeUndefined();
    expect(redealt.players.every((player) => player.role == null && player.team == null && !player.finished)).toBe(true);
    expect(douDizhuModule.view(redealt).settingsSummary).toBe('等待地主');
  });

  test('run fast uses 48 cards and black spade three opener', () => {
    const state = runFastModule.deal(runFastModule.create());
    expect(state.players.map((player) => player.hand.length)).toEqual([16, 16, 16]);
    expect(state.players[state.currentPlayerIndex].hand.some((card) => card.rank === '3' && card.suit === 'S')).toBe(true);

    const bomb = classifyRunFast([c('4'), c('4', 'S'), c('4', 'C'), c('4', 'D')])!;
    const straight = classifyRunFast([c('8'), c('9'), c('10'), c('J'), c('Q')])!;
    expect(canBeatRunFast(bomb, straight)).toBe(true);
  });

  test('guan dan recognizes wild straight flush and bomb hierarchy', () => {
    const straightFlush = classifyGuanDan([c('5', 'H'), c('6', 'H'), c('7', 'H'), c('8', 'H'), c('2', 'H')]);
    expect(straightFlush?.kind).toBe('straightFlush');
    expect(straightFlush?.usesWildCards).toBe(true);

    const sixBomb = classifyGuanDan([c('5'), c('5', 'S'), c('5', 'C'), c('5', 'D'), c('5', 'H', 1), c('5', 'S', 1)])!;
    const jokerBomb = classifyGuanDan([c('SJ', 'J', 0), c('SJ', 'J', 1), c('BJ', 'J', 0), c('BJ', 'J', 1)])!;
    expect(canBeatGuanDan(jokerBomb, sixBomb)).toBe(true);
  });

  test('all game modules produce legal human hints after deal when possible', () => {
    const modules = [fourFourteenModule, douDizhuModule, runFastModule, guanDanModule] as Array<{
      create: () => unknown;
      deal: (state: unknown) => unknown;
      view: (state: unknown) => { phase: string };
      isHumanTurn: (state: unknown) => boolean;
      hint: (state: unknown) => Card[];
      legalActions: (state: unknown, selected: Card[]) => string[];
      aiStep: (state: unknown) => unknown;
      dealStep?: (state: unknown) => unknown;
    }>;
    for (const module of modules) {
      let state = module.deal(module.create());
      for (let dealStep = 0; dealStep < 80 && module.view(state).phase === 'dealing' && module.dealStep; dealStep += 1) {
        state = module.dealStep(state);
      }
      for (let step = 0; step < 12; step += 1) {
        const view = module.view(state);
        if (view.phase === 'finished') break;
        if (module.isHumanTurn(state)) {
          const hint = module.hint(state);
          const actions = module.legalActions(state, hint);
          expect(actions.includes('play') || actions.includes('pass') || actions.some((action) => action.startsWith('bid'))).toBe(true);
          break;
        }
        state = module.aiStep(state);
      }
    }
  });
});
