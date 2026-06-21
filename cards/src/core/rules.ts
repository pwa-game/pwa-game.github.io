import {
  Card,
  Rank,
  Suit,
  areConsecutive,
  cardsKey,
  countRank,
  groupByRank,
  isJoker,
  rankLabel,
  rankValue,
  removeCards,
  runRanks,
  sameRank,
  sortCards,
  takeLowest,
  takeRank,
  uniqueRanks,
  windowedRanks
} from './cards';
import { EffectKind, EffectIntensity } from './effects';

export type Ruleset = '414' | 'doudizhu' | 'runfast' | 'guandan';

export type ComboKind =
  | 'single'
  | 'pair'
  | 'trio'
  | 'sameRankBomb'
  | 'doubleJoker'
  | 'rocket414'
  | 'cha'
  | 'gou'
  | 'singleRun'
  | 'pairRun'
  | 'trioWithSingle'
  | 'trioWithPair'
  | 'singleStraight'
  | 'pairStraight'
  | 'airplane'
  | 'airplaneWithSingles'
  | 'airplaneWithPairs'
  | 'airplaneWithWings'
  | 'trioWithTwo'
  | 'fourWithTwoSingles'
  | 'fourWithTwoPairs'
  | 'bomb'
  | 'rocket'
  | 'steelPlate'
  | 'straightFlush'
  | 'jokerBomb';

export interface Combo {
  kind: ComboKind;
  cards: Card[];
  primaryRank: Rank;
  sequenceLength?: number;
  sameRankCount?: number;
  bombCount?: number;
  usesWildCards?: boolean;
}

export interface EffectMapping {
  kind: EffectKind;
  title: string;
  subtitle?: string;
  intensity: EffectIntensity;
}

export function comboLabel(combo: Combo): string {
  switch (combo.kind) {
    case 'single':
      return '单张';
    case 'pair':
      return '对子';
    case 'trio':
      return '三张';
    case 'sameRankBomb': {
      const count = combo.sameRankCount ?? combo.cards.length;
      if (count === 3) return '炸';
      if (count === 4) return '炮';
      return `${count}同张炸`;
    }
    case 'doubleJoker':
      return '双王';
    case 'rocket414':
      return '4A4火箭';
    case 'cha':
      return '叉';
    case 'gou':
      return '勾';
    case 'singleRun':
      return '单龙';
    case 'pairRun':
      return '双龙';
    case 'trioWithSingle':
      return '三带一';
    case 'trioWithPair':
      return '三带二';
    case 'singleStraight':
      return '顺子';
    case 'pairStraight':
      return '连对';
    case 'airplane':
      return '飞机';
    case 'airplaneWithSingles':
    case 'airplaneWithPairs':
    case 'airplaneWithWings':
      return '飞机带翅膀';
    case 'trioWithTwo':
      return '三带二';
    case 'fourWithTwoSingles':
    case 'fourWithTwoPairs':
      return '四带二';
    case 'bomb':
      return `${combo.bombCount ?? combo.cards.length}张炸`;
    case 'rocket':
      return '王炸';
    case 'steelPlate':
      return '钢板';
    case 'straightFlush':
      return '同花顺';
    case 'jokerBomb':
      return '四王炸';
  }
}

export function comboEffect(ruleset: Ruleset, combo?: Combo): EffectMapping | undefined {
  if (!combo) return undefined;
  if (ruleset === '414') {
    switch (combo.kind) {
      case 'rocket414':
        return { kind: 'rocket', title: '4A4', subtitle: '火箭升空', intensity: 's' };
      case 'doubleJoker':
        return { kind: 'mushroom', title: '双王', intensity: 's' };
      case 'sameRankBomb': {
        const count = combo.sameRankCount ?? combo.cards.length;
        return count >= 6
          ? { kind: 'mushroom', title: comboLabel(combo), intensity: 's' }
          : { kind: 'bomb', title: comboLabel(combo), intensity: 'a' };
      }
      case 'singleRun':
        return { kind: 'straightTrail', title: '单龙', intensity: 'b' };
      case 'pairRun':
        return { kind: 'pairChain', title: '双龙', intensity: 'b' };
      case 'trioWithSingle':
      case 'trioWithPair':
        return { kind: 'stamp', title: comboLabel(combo), intensity: 'c' };
      case 'cha':
      case 'gou':
        return { kind: 'stamp', title: combo.kind === 'cha' ? '叉!' : '勾!', intensity: 'c' };
      default:
        return undefined;
    }
  }
  if (ruleset === 'doudizhu') {
    switch (combo.kind) {
      case 'rocket':
        return { kind: 'mushroom', title: '王炸', intensity: 's' };
      case 'bomb':
        return { kind: 'bomb', title: '炸弹', intensity: 'a' };
      case 'airplane':
      case 'airplaneWithSingles':
      case 'airplaneWithPairs':
        return { kind: 'airplane', title: comboLabel(combo), intensity: 'b' };
      case 'singleStraight':
        return { kind: 'straightTrail', title: '顺子', intensity: 'b' };
      case 'pairStraight':
        return { kind: 'pairChain', title: '连对', intensity: 'b' };
      case 'fourWithTwoPairs':
      case 'fourWithTwoSingles':
        return { kind: 'stamp', title: '四带二', intensity: 'c' };
      default:
        return undefined;
    }
  }
  if (ruleset === 'runfast') {
    switch (combo.kind) {
      case 'bomb':
        return { kind: 'bomb', title: '炸弹', intensity: 'a' };
      case 'airplane':
      case 'airplaneWithWings':
        return { kind: 'airplane', title: comboLabel(combo), intensity: 'b' };
      case 'singleStraight':
        return { kind: 'straightTrail', title: '顺子', intensity: 'b' };
      case 'pairStraight':
        return { kind: 'pairChain', title: '连对', intensity: 'b' };
      case 'trioWithTwo':
        return { kind: 'stamp', title: '三带二', intensity: 'c' };
      default:
        return undefined;
    }
  }
  switch (combo.kind) {
    case 'jokerBomb':
      return { kind: 'mushroom', title: '四王炸', intensity: 's' };
    case 'bomb':
      return combo.bombCount && combo.bombCount >= 6
        ? { kind: 'mushroom', title: comboLabel(combo), intensity: 's' }
        : { kind: 'bomb', title: comboLabel(combo), intensity: 'a' };
    case 'straightFlush':
      return { kind: 'straightFlush', title: '同花顺', intensity: 'a' };
    case 'steelPlate':
      return { kind: 'steelPlate', title: '钢板', intensity: 'a' };
    case 'singleStraight':
      return { kind: 'straightTrail', title: '顺子', intensity: 'b' };
    case 'pairStraight':
      return { kind: 'pairChain', title: '连对', intensity: 'b' };
    default:
      return undefined;
  }
}

export function classify414(cards: Card[]): Combo | undefined {
  const sorted = sortCards(cards);
  const groups = groupByRank(sorted);
  if (sorted.length === 3 && countRank(sorted, '4') === 2 && countRank(sorted, 'A') === 1) {
    return makeCombo('rocket414', sorted, 'A');
  }
  if (sorted.length === 2 && countRank(sorted, 'SJ') === 1 && countRank(sorted, 'BJ') === 1) {
    return makeCombo('doubleJoker', sorted, 'BJ');
  }
  const rank = sameRank(sorted);
  if (rank) {
    if (sorted.length >= 3) return makeCombo('sameRankBomb', sorted, rank, { sameRankCount: sorted.length });
    if (sorted.length === 2) return makeCombo('pair', sorted, rank);
    if (sorted.length === 1) return makeCombo('single', sorted, rank);
  }
  if (sorted.length === 1) return makeCombo('single', sorted, sorted[0].rank);

  if (sorted.length >= 3 && uniqueRanks(sorted).length === sorted.length && areConsecutive(uniqueRanks(sorted))) {
    return makeCombo('singleRun', sorted, uniqueRanks(sorted)[0], { sequenceLength: sorted.length });
  }
  if (sorted.length >= 6 && sorted.length % 2 === 0) {
    const ranks = [...groups.keys()];
    if (ranks.length === sorted.length / 2 && ranks.every((rank) => groups.get(rank)!.length === 2) && areConsecutive(ranks)) {
      return makeCombo('pairRun', sorted, ranks[0], { sequenceLength: ranks.length });
    }
  }
  if (sorted.length === 4) {
    const trio = [...groups.entries()].find(([, cards]) => cards.length === 3);
    if (trio) return makeCombo('trioWithSingle', sorted, trio[0]);
  }
  if (sorted.length === 5) {
    const trio = [...groups.entries()].find(([, cards]) => cards.length === 3);
    const pair = [...groups.entries()].find(([, cards]) => cards.length === 2);
    if (trio && pair) return makeCombo('trioWithPair', sorted, trio[0]);
  }
  return undefined;
}

export function canBeat414(challenger: Combo, previous: Combo): boolean {
  if (challenger.kind === 'cha' || challenger.kind === 'gou') return false;
  if (previous.kind === 'cha' || previous.kind === 'gou') return false;
  if (challenger.kind === 'rocket414') return previous.kind !== 'rocket414';
  if (previous.kind === 'rocket414') return false;
  if (challenger.kind === 'doubleJoker') return previous.kind !== 'doubleJoker';
  if (previous.kind === 'doubleJoker') return false;
  if (challenger.kind === 'sameRankBomb' && previous.kind === 'sameRankBomb') {
    const countDiff = (challenger.sameRankCount ?? challenger.cards.length) - (previous.sameRankCount ?? previous.cards.length);
    return countDiff === 0 ? rankValue(challenger.primaryRank) > rankValue(previous.primaryRank) : countDiff > 0;
  }
  if (challenger.kind === 'sameRankBomb') {
    if (previous.kind === 'pairRun' || previous.kind === 'trioWithSingle' || previous.kind === 'trioWithPair') {
      return (challenger.sameRankCount ?? challenger.cards.length) >= 4;
    }
    return !['doubleJoker', 'rocket414', 'cha', 'gou'].includes(previous.kind);
  }
  if (previous.kind === 'sameRankBomb') return false;
  if (challenger.kind !== previous.kind) return false;
  if (challenger.cards.length !== previous.cards.length) return false;
  return rankValue(challenger.primaryRank) > rankValue(previous.primaryRank);
}

export function legal414(hand: Card[], previous?: Combo): Combo[] {
  const filtered = previous ? all414(hand).filter((combo) => canBeat414(combo, previous)) : all414(hand);
  return filtered.sort((lhs, rhs) => comboSortScore414(lhs) - comboSortScore414(rhs) || lhs.cards.length - rhs.cards.length);
}

export function all414(hand: Card[]): Combo[] {
  const groups = groupByRank(sortCards(hand));
  const combos: Combo[] = [];
  for (const [rank, cards] of groups) {
    combos.push(makeCombo('single', [cards[0]], rank));
    if (cards.length >= 2) combos.push(makeCombo('pair', cards.slice(0, 2), rank));
    if (cards.length >= 3) {
      for (let count = 3; count <= cards.length; count += 1) {
        combos.push(makeCombo('sameRankBomb', cards.slice(0, count), rank, { sameRankCount: count }));
      }
    }
  }
  const small = groups.get('SJ')?.[0];
  const big = groups.get('BJ')?.[0];
  if (small && big) combos.push(makeCombo('doubleJoker', [small, big], 'BJ'));
  const fours = groups.get('4') ?? [];
  const aces = groups.get('A') ?? [];
  if (fours.length >= 2 && aces.length >= 1) combos.push(makeCombo('rocket414', [fours[0], fours[1], aces[0]], 'A'));

  addFourFourteenRuns(combos, groups, 'singleRun', 1, 3);
  addFourFourteenRuns(combos, groups, 'pairRun', 2, 3);
  addFourFourteenTrioAttachments(combos, groups);
  return dedupe(combos);
}

export function classifyDouDizhu(cards: Card[]): Combo | undefined {
  const sorted = sortCards(cards);
  const groups = groupByRank(sorted);
  if (sorted.length === 2 && countRank(sorted, 'SJ') === 1 && countRank(sorted, 'BJ') === 1) {
    return makeCombo('rocket', sorted, 'BJ');
  }
  const rank = sameRank(sorted);
  if (rank && !isJoker(sorted[0])) {
    if (sorted.length === 4) return makeCombo('bomb', sorted, rank, { bombCount: 4 });
    if (sorted.length === 3) return makeCombo('trio', sorted, rank);
    if (sorted.length === 2) return makeCombo('pair', sorted, rank);
    if (sorted.length === 1) return makeCombo('single', sorted, rank);
  }
  if (sorted.length === 1) return makeCombo('single', sorted, sorted[0].rank);
  const airplane = classifyAirplane(sorted, true);
  if (airplane) return airplane;
  const four = [...groups.entries()].find(([rank, cards]) => !isSpecialRank(rank) && cards.length === 4);
  if (four && sorted.length === 6) return makeCombo('fourWithTwoSingles', sorted, four[0]);
  if (four && sorted.length === 8 && [...groups.entries()].filter(([rank, cards]) => rank !== four[0] && cards.length === 2).length === 2) {
    return makeCombo('fourWithTwoPairs', sorted, four[0]);
  }
  if (sorted.length === 4) {
    const trio = [...groups.entries()].find(([rank, cards]) => !isSpecialRank(rank) && cards.length === 3);
    if (trio) return makeCombo('trioWithSingle', sorted, trio[0]);
  }
  if (sorted.length === 5) {
    const trio = [...groups.entries()].find(([rank, cards]) => !isSpecialRank(rank) && cards.length === 3);
    const pair = [...groups.entries()].find(([rank, cards]) => rank !== trio?.[0] && cards.length === 2);
    if (trio && pair) return makeCombo('trioWithPair', sorted, trio[0]);
  }
  const straight = classifyRepeatedRun(sorted, 1, 5, 'singleStraight');
  if (straight) return straight;
  const pairStraight = classifyRepeatedRun(sorted, 2, 3, 'pairStraight');
  if (pairStraight) return pairStraight;
  return undefined;
}

export function canBeatDouDizhu(challenger: Combo, previous: Combo): boolean {
  if (challenger.kind === 'rocket') return previous.kind !== 'rocket';
  if (previous.kind === 'rocket') return false;
  if (challenger.kind === 'bomb' && previous.kind === 'bomb') return rankValue(challenger.primaryRank) > rankValue(previous.primaryRank);
  if (challenger.kind === 'bomb') return previous.kind !== 'bomb';
  if (previous.kind === 'bomb') return false;
  return sameShapeBeats(challenger, previous);
}

export function legalDouDizhu(hand: Card[], previous?: Combo): Combo[] {
  return filterAndSort(allDouDizhu(hand), previous, canBeatDouDizhu);
}

export function allDouDizhu(hand: Card[]): Combo[] {
  const groups = groupByRank(sortCards(hand));
  const combos = baseSameRankCombos(groups, true);
  const small = groups.get('SJ')?.[0];
  const big = groups.get('BJ')?.[0];
  if (small && big) combos.push(makeCombo('rocket', [small, big], 'BJ'));
  addRuns(combos, groups, 'singleStraight', 1, 5);
  addRuns(combos, groups, 'pairStraight', 2, 3);
  addTrioAttachments(combos, groups, hand, false);
  addTrioAttachments(combos, groups, hand, true);
  addAirplanes(combos, groups, hand, true);
  addFourWithTwo(combos, groups, hand);
  return dedupe(combos);
}

export function classifyRunFast(cards: Card[]): Combo | undefined {
  const sorted = sortCards(cards);
  const groups = groupByRank(sorted);
  const rank = sameRank(sorted);
  if (rank && !isJoker(sorted[0])) {
    if (sorted.length === 4) return makeCombo('bomb', sorted, rank, { bombCount: 4 });
    if (sorted.length === 3) return makeCombo('trio', sorted, rank);
    if (sorted.length === 2) return makeCombo('pair', sorted, rank);
    if (sorted.length === 1) return makeCombo('single', sorted, rank);
  }
  if (sorted.length === 1) return makeCombo('single', sorted, sorted[0].rank);
  const airplane = classifyAirplane(sorted, false);
  if (airplane) return airplane;
  if (sorted.length === 5) {
    const trio = [...groups.entries()].find(([rank, cards]) => !isSpecialRank(rank) && cards.length === 3);
    if (trio) return makeCombo('trioWithTwo', sorted, trio[0]);
  }
  const straight = classifyRepeatedRun(sorted, 1, 5, 'singleStraight');
  if (straight) return straight;
  const pairStraight = classifyRepeatedRun(sorted, 2, 2, 'pairStraight');
  if (pairStraight) return pairStraight;
  return undefined;
}

export function canBeatRunFast(challenger: Combo, previous: Combo): boolean {
  if (challenger.kind === 'bomb' && previous.kind === 'bomb') return rankValue(challenger.primaryRank) > rankValue(previous.primaryRank);
  if (challenger.kind === 'bomb') return previous.kind !== 'bomb';
  if (previous.kind === 'bomb') return false;
  return sameShapeBeats(challenger, previous);
}

export function legalRunFast(hand: Card[], previous?: Combo): Combo[] {
  return filterAndSort(allRunFast(hand), previous, canBeatRunFast);
}

export function allRunFast(hand: Card[]): Combo[] {
  const groups = groupByRank(sortCards(hand));
  const combos = baseSameRankCombos(groups, false);
  addRuns(combos, groups, 'singleStraight', 1, 5);
  addRuns(combos, groups, 'pairStraight', 2, 2);
  addTrioWithTwo(combos, groups, hand);
  addAirplanes(combos, groups, hand, false);
  return dedupe(combos);
}

export function isGuanDanWild(card: Card, levelRank: Rank): boolean {
  return card.rank === levelRank && card.suit === 'H';
}

export function classifyGuanDan(cards: Card[], levelRank: Rank = '2'): Combo | undefined {
  const sorted = sortCards(cards, levelRank);
  const wilds = sorted.filter((card) => isGuanDanWild(card, levelRank));
  const naturals = sorted.filter((card) => !isGuanDanWild(card, levelRank));
  if (sorted.length === 4 && countRank(sorted, 'SJ') === 2 && countRank(sorted, 'BJ') === 2) {
    return makeCombo('jokerBomb', sorted, 'BJ', { bombCount: 4 });
  }
  const straightFlush = classifyGuanDanRepeatedRun(sorted, levelRank, 1, 5, 5, 'straightFlush', true);
  if (straightFlush) return straightFlush;
  if (sorted.length >= 4 && naturals.every((card) => !isJoker(card)) && sameNaturalRank(naturals)) {
    const primaryRank = naturals[0]?.rank ?? levelRank;
    return makeCombo('bomb', sorted, primaryRank, { bombCount: sorted.length, usesWildCards: wilds.length > 0 });
  }
  const trioWithPair = classifyGuanDanTrioWithPair(sorted, levelRank);
  if (trioWithPair) return trioWithPair;
  const steel = classifyGuanDanRepeatedRun(sorted, levelRank, 3, 2, 2, 'steelPlate', false);
  if (steel) return steel;
  const pairStraight = classifyGuanDanRepeatedRun(sorted, levelRank, 2, 3, Math.floor(sorted.length / 2), 'pairStraight', false);
  if (pairStraight) return pairStraight;
  const straight = classifyGuanDanRepeatedRun(sorted, levelRank, 1, 5, 5, 'singleStraight', false);
  if (straight) return straight;

  if (sorted.length === 1) return makeCombo('single', sorted, sorted[0].rank, { usesWildCards: wilds.length > 0 });
  if (sorted.length === 2 && canFormSameRank(sorted, levelRank)) {
    return makeCombo('pair', sorted, naturalPrimaryRank(sorted, levelRank), { usesWildCards: wilds.length > 0 });
  }
  if (sorted.length === 3 && canFormSameRank(sorted, levelRank)) {
    return makeCombo('trio', sorted, naturalPrimaryRank(sorted, levelRank), { usesWildCards: wilds.length > 0 });
  }
  return undefined;
}

export function canBeatGuanDan(challenger: Combo, previous: Combo, levelRank: Rank = '2'): boolean {
  const challengerPower = guandanBombPower(challenger, levelRank);
  const previousPower = guandanBombPower(previous, levelRank);
  if (challengerPower > 0 || previousPower > 0) {
    if (challenger.kind === 'bomb' && previous.kind === 'bomb' && challenger.bombCount !== previous.bombCount) {
      return (challenger.bombCount ?? 0) > (previous.bombCount ?? 0);
    }
    return challengerPower > previousPower;
  }
  return sameShapeBeats(challenger, previous, levelRank);
}

export function legalGuanDan(hand: Card[], previous?: Combo, levelRank: Rank = '2'): Combo[] {
  return filterAndSort(allGuanDan(hand, levelRank), previous, (a, b) => canBeatGuanDan(a, b, levelRank), levelRank);
}

export function allGuanDan(hand: Card[], levelRank: Rank = '2'): Combo[] {
  const sorted = sortCards(hand, levelRank);
  const groups = groupByRank(sorted);
  const wilds = sorted.filter((card) => isGuanDanWild(card, levelRank));
  const combos: Combo[] = [];
  for (const card of sorted) combos.push(makeCombo('single', [card], card.rank, { usesWildCards: isGuanDanWild(card, levelRank) }));
  for (const rank of ranksNoJokers()) {
    for (const count of [2, 3, 4, 5, 6]) {
      const cards = takeRankWithWilds(groups, wilds, rank, count, levelRank);
      if (!cards) continue;
      const combo = classifyGuanDan(cards, levelRank);
      if (combo) combos.push(combo);
    }
  }
  const jokerCards = sorted.filter((card) => card.rank === 'SJ' || card.rank === 'BJ');
  if (jokerCards.length >= 4) {
    const combo = classifyGuanDan(jokerCards.slice(0, 4), levelRank);
    if (combo) combos.push(combo);
  }
  addGuanDanRuns(combos, groups, wilds, levelRank, 1, 5, 5, 'singleStraight', false);
  addGuanDanRuns(combos, groups, wilds, levelRank, 1, 5, 5, 'straightFlush', true);
  addGuanDanRuns(combos, groups, wilds, levelRank, 2, 3, 8, 'pairStraight', false);
  addGuanDanRuns(combos, groups, wilds, levelRank, 3, 2, 4, 'steelPlate', false);
  addGuanDanTrioWithPair(combos, groups, wilds, levelRank);
  return dedupe(combos);
}

export function classify(ruleset: Ruleset, cards: Card[], levelRank: Rank = '2'): Combo | undefined {
  switch (ruleset) {
    case '414':
      return classify414(cards);
    case 'doudizhu':
      return classifyDouDizhu(cards);
    case 'runfast':
      return classifyRunFast(cards);
    case 'guandan':
      return classifyGuanDan(cards, levelRank);
  }
}

export function canBeat(ruleset: Ruleset, challenger: Combo, previous: Combo, levelRank: Rank = '2'): boolean {
  switch (ruleset) {
    case '414':
      return canBeat414(challenger, previous);
    case 'doudizhu':
      return canBeatDouDizhu(challenger, previous);
    case 'runfast':
      return canBeatRunFast(challenger, previous);
    case 'guandan':
      return canBeatGuanDan(challenger, previous, levelRank);
  }
}

export function legalCombinations(ruleset: Ruleset, hand: Card[], previous?: Combo, levelRank: Rank = '2'): Combo[] {
  switch (ruleset) {
    case '414':
      return legal414(hand, previous);
    case 'doudizhu':
      return legalDouDizhu(hand, previous);
    case 'runfast':
      return legalRunFast(hand, previous);
    case 'guandan':
      return legalGuanDan(hand, previous, levelRank);
  }
}

function makeCombo(kind: ComboKind, cards: Card[], primaryRank: Rank, extra: Partial<Combo> = {}): Combo {
  return { kind, cards: sortCards(cards), primaryRank, ...extra };
}

function filterAndSort(
  combos: Combo[],
  previous: Combo | undefined,
  beat: (challenger: Combo, previous: Combo) => boolean,
  levelRank?: Rank
): Combo[] {
  const filtered = previous ? combos.filter((combo) => beat(combo, previous)) : combos;
  return filtered.sort((lhs, rhs) => comboSortScore(lhs, levelRank) - comboSortScore(rhs, levelRank));
}

export function comboSortScore(combo: Combo, levelRank?: Rank): number {
  let base = rankValue(combo.primaryRank, levelRank) * 10 + combo.cards.length;
  switch (combo.kind) {
    case 'rocket414':
    case 'rocket':
    case 'jokerBomb':
      base += 10000;
      break;
    case 'doubleJoker':
      base += 9000;
      break;
    case 'sameRankBomb':
    case 'bomb':
      base += 7000 + (combo.bombCount ?? combo.sameRankCount ?? combo.cards.length) * 100;
      break;
    case 'straightFlush':
      base += 6500;
      break;
    case 'steelPlate':
      base += 900;
      break;
    case 'airplane':
    case 'airplaneWithSingles':
    case 'airplaneWithPairs':
    case 'airplaneWithWings':
      base += 650;
      break;
    case 'singleRun':
    case 'singleStraight':
    case 'pairRun':
    case 'pairStraight':
      base += 400;
      break;
    default:
      break;
  }
  return base;
}

export function comboSortScore414(combo: Combo): number {
  const rank = rankValue(combo.primaryRank);
  switch (combo.kind) {
    case 'single':
      return 100 + rank;
    case 'pair':
      return 200 + rank;
    case 'trioWithSingle':
      return 300 + rank;
    case 'trioWithPair':
      return 350 + rank;
    case 'singleRun':
      return 400 + (combo.sequenceLength ?? combo.cards.length) * 20 + rank;
    case 'pairRun':
      return 600 + (combo.sequenceLength ?? Math.floor(combo.cards.length / 2)) * 20 + rank;
    case 'sameRankBomb':
      return 10000 + (combo.sameRankCount ?? combo.cards.length) * 100 + rank;
    case 'doubleJoker':
      return 90000;
    case 'cha':
      return 95000 + rank;
    case 'gou':
      return 96000 + rank;
    case 'rocket414':
      return 100000;
    default:
      return comboSortScore(combo);
  }
}

function sameShapeBeats(challenger: Combo, previous: Combo, levelRank?: Rank): boolean {
  if (challenger.kind !== previous.kind) return false;
  if (challenger.cards.length !== previous.cards.length) return false;
  if ((challenger.sequenceLength ?? 0) !== (previous.sequenceLength ?? 0)) return false;
  return rankValue(challenger.primaryRank, levelRank) > rankValue(previous.primaryRank, levelRank);
}

function classifyRepeatedRun(cards: Card[], repeatCount: number, minLength: number, kind: ComboKind): Combo | undefined {
  if (cards.length % repeatCount !== 0) return undefined;
  const sequenceLength = cards.length / repeatCount;
  if (sequenceLength < minLength) return undefined;
  const groups = groupByRank(cards);
  const rankList = [...groups.keys()];
  if (rankList.length !== sequenceLength) return undefined;
  if (rankList.some((rank) => isSpecialRank(rank) || groups.get(rank)!.length !== repeatCount)) return undefined;
  if (!areConsecutive(rankList)) return undefined;
  return makeCombo(kind, cards, rankList.at(-1)!, { sequenceLength });
}

function classifyAirplane(cards: Card[], douDizhuMode: boolean): Combo | undefined {
  const groups = groupByRank(cards);
  const trioRanks = [...groups.entries()]
    .filter(([rank, group]) => !isSpecialRank(rank) && group.length >= 3)
    .map(([rank]) => rank)
    .sort((a, b) => rankValue(a) - rankValue(b));
  for (let length = trioRanks.length; length >= 2; length -= 1) {
    for (let start = 0; start + length <= trioRanks.length; start += 1) {
      const window = trioRanks.slice(start, start + length);
      if (!areConsecutive(window)) continue;
      const rest = cards.filter((card) => !window.includes(card.rank));
      const exactTrios = window.every((rank) => (groups.get(rank)?.length ?? 0) === 3);
      if (exactTrios && cards.length === length * 3) {
        return makeCombo('airplane', cards, window.at(-1)!, { sequenceLength: length });
      }
      if (cards.length === length * 4 && rest.length === length && rest.every((card) => !window.includes(card.rank))) {
        return makeCombo(douDizhuMode ? 'airplaneWithSingles' : 'airplaneWithWings', cards, window.at(-1)!, {
          sequenceLength: length
        });
      }
      if (douDizhuMode && cards.length === length * 5) {
        const restGroups = groupByRank(rest);
        if (restGroups.size === length && [...restGroups.values()].every((group) => group.length === 2)) {
          return makeCombo('airplaneWithPairs', cards, window.at(-1)!, { sequenceLength: length });
        }
      }
    }
  }
  return undefined;
}

function baseSameRankCombos(groups: Map<Rank, Card[]>, includeRocketBombName: boolean): Combo[] {
  const combos: Combo[] = [];
  for (const [rank, cards] of groups) {
    combos.push(makeCombo('single', [cards[0]], rank));
    if (isSpecialRank(rank)) continue;
    if (cards.length >= 2) combos.push(makeCombo('pair', cards.slice(0, 2), rank));
    if (cards.length >= 3) combos.push(makeCombo('trio', cards.slice(0, 3), rank));
    if (cards.length >= 4) combos.push(makeCombo(includeRocketBombName ? 'bomb' : 'bomb', cards.slice(0, 4), rank, { bombCount: 4 }));
  }
  return combos;
}

function addRuns(combos: Combo[], groups: Map<Rank, Card[]>, kind: ComboKind, repeatCount: number, minLength: number): void {
  for (const window of windowedRanks(minLength)) {
    const cards: Card[] = [];
    let ok = true;
    for (const rank of window) {
      const rankCards = groups.get(rank);
      if (!rankCards || rankCards.length < repeatCount) {
        ok = false;
        break;
      }
      cards.push(...rankCards.slice(0, repeatCount));
    }
    if (ok) combos.push(makeCombo(kind, cards, window.at(-1)!, { sequenceLength: window.length }));
  }
}

function addFourFourteenRuns(combos: Combo[], groups: Map<Rank, Card[]>, kind: ComboKind, repeatCount: number, minLength: number): void {
  for (const window of windowedRanks(minLength)) {
    const cards: Card[] = [];
    let ok = true;
    for (const rank of window) {
      const rankCards = groups.get(rank);
      if (!rankCards || rankCards.length < repeatCount) {
        ok = false;
        break;
      }
      cards.push(...rankCards.slice(0, repeatCount));
    }
    if (ok) combos.push(makeCombo(kind, cards, window[0], { sequenceLength: window.length }));
  }
}

function addTrioAttachments(combos: Combo[], groups: Map<Rank, Card[]>, hand: Card[], pairAttachment: boolean): void {
  for (const [rank, trioCards] of groups) {
    if (isSpecialRank(rank) || trioCards.length < 3) continue;
    const trio = trioCards.slice(0, 3);
    const remaining = removeCards(hand, trio);
    if (pairAttachment) {
      const pair = [...groupByRank(sortCards(remaining)).entries()]
        .filter(([pairRank, cards]) => pairRank !== rank && !isSpecialRank(pairRank) && cards.length >= 2)
        .sort((a, b) => rankValue(a[0]) - rankValue(b[0]))[0];
      if (pair) combos.push(makeCombo('trioWithPair', [...trio, ...pair[1].slice(0, 2)], rank));
    } else {
      const single = takeLowest(remaining, 1, [rank]);
      if (single) combos.push(makeCombo('trioWithSingle', [...trio, ...single], rank));
    }
  }
}

function addFourFourteenTrioAttachments(combos: Combo[], groups: Map<Rank, Card[]>): void {
  for (const [rank, trioCards] of groups) {
    if (trioCards.length < 3) continue;
    const trio = trioCards.slice(0, 3);
    for (const [attachmentRank, attachmentCards] of groups) {
      if (attachmentRank === rank) continue;
      if (attachmentCards.length >= 1) {
        combos.push(makeCombo('trioWithSingle', [...trio, attachmentCards[0]], rank));
      }
      if (attachmentCards.length >= 2) {
        combos.push(makeCombo('trioWithPair', [...trio, ...attachmentCards.slice(0, 2)], rank));
      }
    }
  }
}

function addTrioWithTwo(combos: Combo[], groups: Map<Rank, Card[]>, hand: Card[]): void {
  for (const [rank, trioCards] of groups) {
    if (isSpecialRank(rank) || trioCards.length < 3) continue;
    const trio = trioCards.slice(0, 3);
    const attachment = takeLowest(removeCards(hand, trio), 2, [rank]);
    if (attachment) combos.push(makeCombo('trioWithTwo', [...trio, ...attachment], rank));
  }
}

function addAirplanes(combos: Combo[], groups: Map<Rank, Card[]>, hand: Card[], douDizhuMode: boolean): void {
  for (const window of windowedRanks(2, 6)) {
    if (!window.every((rank) => (groups.get(rank)?.length ?? 0) >= 3)) continue;
    const trios = window.flatMap((rank) => groups.get(rank)!.slice(0, 3));
    combos.push(makeCombo('airplane', trios, window.at(-1)!, { sequenceLength: window.length }));
    const remaining = removeCards(hand, trios);
    const singles = takeLowest(remaining, window.length, window);
    if (singles) {
      combos.push(makeCombo(douDizhuMode ? 'airplaneWithSingles' : 'airplaneWithWings', [...trios, ...singles], window.at(-1)!, {
        sequenceLength: window.length
      }));
    }
    if (douDizhuMode) {
      const remainingGroups = groupByRank(sortCards(remaining));
      const pairs = [...remainingGroups.entries()]
        .filter(([rank, cards]) => !window.includes(rank) && !isSpecialRank(rank) && cards.length >= 2)
        .sort((a, b) => rankValue(a[0]) - rankValue(b[0]))
        .slice(0, window.length)
        .flatMap(([, cards]) => cards.slice(0, 2));
      if (pairs.length === window.length * 2) {
        combos.push(makeCombo('airplaneWithPairs', [...trios, ...pairs], window.at(-1)!, { sequenceLength: window.length }));
      }
    }
  }
}

function addFourWithTwo(combos: Combo[], groups: Map<Rank, Card[]>, hand: Card[]): void {
  for (const [rank, cards] of groups) {
    if (isSpecialRank(rank) || cards.length < 4) continue;
    const four = cards.slice(0, 4);
    const remaining = removeCards(hand, four);
    const singles = takeLowest(remaining, 2, [rank]);
    if (singles) combos.push(makeCombo('fourWithTwoSingles', [...four, ...singles], rank));
    const pairs = [...groupByRank(sortCards(remaining)).entries()]
      .filter(([pairRank, pairCards]) => pairRank !== rank && !isSpecialRank(pairRank) && pairCards.length >= 2)
      .sort((a, b) => rankValue(a[0]) - rankValue(b[0]))
      .slice(0, 2)
      .flatMap(([, pairCards]) => pairCards.slice(0, 2));
    if (pairs.length === 4) combos.push(makeCombo('fourWithTwoPairs', [...four, ...pairs], rank));
  }
}

function classifyGuanDanRepeatedRun(
  cards: Card[],
  levelRank: Rank,
  repeatCount: number,
  minLength: number,
  exactLength: number,
  kind: ComboKind,
  sameSuit: boolean
): Combo | undefined {
  if (cards.length % repeatCount !== 0) return undefined;
  const sequenceLength = cards.length / repeatCount;
  if (sequenceLength < minLength) return undefined;
  if (exactLength > 0 && sequenceLength !== exactLength) return undefined;
  const wilds = cards.filter((card) => isGuanDanWild(card, levelRank));
  const naturals = cards.filter((card) => !isGuanDanWild(card, levelRank));
  if (naturals.some((card) => isJoker(card))) return undefined;
  if (sameSuit && new Set(naturals.map((card) => card.suit)).size > 1) return undefined;
  const naturalGroups = groupByRank(naturals);
  for (const window of windowedRanks(sequenceLength, sequenceLength)) {
    if ([...naturalGroups.keys()].some((rank) => !window.includes(rank))) continue;
    const missing = window.reduce((sum, rank) => sum + Math.max(0, repeatCount - (naturalGroups.get(rank)?.length ?? 0)), 0);
    if ([...naturalGroups.values()].some((group) => group.length > repeatCount)) continue;
    if (missing <= wilds.length) {
      return makeCombo(kind, cards, window.at(-1)!, { sequenceLength, usesWildCards: wilds.length > 0 });
    }
  }
  return undefined;
}

function classifyGuanDanTrioWithPair(cards: Card[], levelRank: Rank): Combo | undefined {
  if (cards.length !== 5) return undefined;
  const wilds = cards.filter((card) => isGuanDanWild(card, levelRank));
  const naturals = cards.filter((card) => !isGuanDanWild(card, levelRank));
  if (naturals.some((card) => isJoker(card))) return undefined;
  const groups = groupByRank(naturals);
  for (const trioRank of ranksNoJokers()) {
    for (const pairRank of ranksNoJokers()) {
      if (pairRank === trioRank) continue;
      const trioNatural = groups.get(trioRank)?.length ?? 0;
      const pairNatural = groups.get(pairRank)?.length ?? 0;
      const otherCount = naturals.filter((card) => card.rank !== trioRank && card.rank !== pairRank).length;
      const missing = Math.max(0, 3 - trioNatural) + Math.max(0, 2 - pairNatural);
      if (otherCount === 0 && trioNatural <= 3 && pairNatural <= 2 && missing === wilds.length) {
        return makeCombo('trioWithPair', cards, trioRank, { usesWildCards: wilds.length > 0 });
      }
    }
  }
  return undefined;
}

function addGuanDanRuns(
  combos: Combo[],
  groups: Map<Rank, Card[]>,
  wilds: Card[],
  levelRank: Rank,
  repeatCount: number,
  minLength: number,
  maxLength: number,
  kind: ComboKind,
  sameSuit: boolean
): void {
  for (let length = minLength; length <= maxLength; length += 1) {
    for (const window of windowedRanks(length, length)) {
      const cards: Card[] = [];
      let missing = 0;
      let suit: Suit | undefined;
      let ok = true;
      for (const rank of window) {
        const available = (groups.get(rank) ?? []).filter((card) => !isGuanDanWild(card, levelRank));
        if (sameSuit) {
          const suited = available.filter((card) => {
            if (!suit) return true;
            return card.suit === suit;
          });
          const chosen = suited[0];
          if (chosen) {
            suit = suit ?? chosen.suit;
            cards.push(chosen);
          } else {
            missing += 1;
          }
        } else {
          cards.push(...available.slice(0, repeatCount));
          missing += Math.max(0, repeatCount - available.length);
        }
      }
      if (missing > wilds.length) ok = false;
      if (ok) {
        const candidate = [...cards, ...wilds.slice(0, missing)];
        const combo = classifyGuanDan(candidate, levelRank);
        if (combo && combo.kind === kind) combos.push(combo);
      }
    }
  }
}

function addGuanDanTrioWithPair(combos: Combo[], groups: Map<Rank, Card[]>, wilds: Card[], levelRank: Rank): void {
  for (const trioRank of ranksNoJokers()) {
    for (const pairRank of ranksNoJokers()) {
      if (trioRank === pairRank) continue;
      const trio = takeRankWithWilds(groups, wilds, trioRank, 3, levelRank);
      if (!trio) continue;
      const remainingWilds = wilds.filter((card) => !trio.some((used) => used.id === card.id));
      const pair = takeRankWithWilds(groups, remainingWilds, pairRank, 2, levelRank);
      if (!pair) continue;
      const combo = classifyGuanDan([...trio, ...pair], levelRank);
      if (combo) combos.push(combo);
    }
  }
}

function takeRankWithWilds(
  groups: Map<Rank, Card[]>,
  wilds: Card[],
  rank: Rank,
  count: number,
  levelRank: Rank
): Card[] | undefined {
  const naturals = (groups.get(rank) ?? []).filter((card) => !isGuanDanWild(card, levelRank));
  const missing = count - naturals.length;
  if (missing <= 0) return naturals.slice(0, count);
  if (missing > wilds.length) return undefined;
  return [...naturals, ...wilds.slice(0, missing)];
}

function canFormSameRank(cards: Card[], levelRank: Rank): boolean {
  const naturals = cards.filter((card) => !isGuanDanWild(card, levelRank));
  return naturals.length === 0 || sameNaturalRank(naturals);
}

function sameNaturalRank(cards: Card[]): boolean {
  if (cards.length === 0) return true;
  if (cards.some((card) => isJoker(card))) return cards.every((card) => card.rank === cards[0].rank);
  return cards.every((card) => card.rank === cards[0].rank);
}

function naturalPrimaryRank(cards: Card[], levelRank: Rank): Rank {
  return cards.find((card) => !isGuanDanWild(card, levelRank))?.rank ?? levelRank;
}

function guandanBombPower(combo: Combo, levelRank: Rank): number {
  switch (combo.kind) {
    case 'jokerBomb':
      return 9000;
    case 'bomb':
      if ((combo.bombCount ?? 0) >= 6) return 7000 + (combo.bombCount ?? 0) * 100 + rankValue(combo.primaryRank, levelRank);
      if ((combo.bombCount ?? 0) === 5) return 6000 + rankValue(combo.primaryRank, levelRank);
      return 5000 + rankValue(combo.primaryRank, levelRank);
    case 'straightFlush':
      return 6500 + rankValue(combo.primaryRank, levelRank);
    default:
      return 0;
  }
}

function ranksNoJokers(): Rank[] {
  return runRanks.concat('2');
}

function isSpecialRank(rank: Rank): boolean {
  return rank === '2' || rank === 'SJ' || rank === 'BJ';
}

function dedupe(combos: Combo[]): Combo[] {
  const seen = new Set<string>();
  const result: Combo[] = [];
  for (const combo of combos) {
    const key = `${combo.kind}:${cardsKey(combo.cards)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(combo);
  }
  return result;
}

export function describeCombo(combo?: Combo): string {
  if (!combo) return '过';
  const rank = combo.primaryRank ? rankLabel(combo.primaryRank) : '';
  return `${comboLabel(combo)}${rank ? ` ${rank}` : ''}`;
}
