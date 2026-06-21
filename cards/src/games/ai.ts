import { Card, Rank, groupByRank, rankValue, removeCards, runRanks, sortCards } from '../core/cards';
import { Combo, Ruleset, comboSortScore, comboSortScore414, legalCombinations } from '../core/rules';
import { PublicCardMemory } from '../core/publicMemory';

export interface AIContext {
  ruleset: Ruleset;
  playerIndex: number;
  hands: Card[][];
  previous?: Combo;
  previousPlayerIndex?: number;
  landlordIndex?: number;
  teamOf?: (playerIndex: number) => string;
  deckCount?: number;
  levelRank?: Rank;
  style?: 'relaxed' | 'competitive';
  visibleCards?: Card[];
  firstPlayMustContain?: Card;
  cardsPlayedCount?: number[];
  passCount?: number;
}

export function chooseAICombo(context: AIContext): Combo | undefined {
  const hand = context.hands[context.playerIndex];
  let legal = legalCombinations(context.ruleset, hand, context.previous, context.levelRank);
  if (context.firstPlayMustContain) {
    legal = legal.filter((combo) => combo.cards.some((card) => card.id === context.firstPlayMustContain!.id));
  }
  if (legal.length === 0) return undefined;

  const finishing = legal.filter((combo) => combo.cards.length === hand.length).sort((a, b) => comboSortScoreForContext(a, context) - comboSortScoreForContext(b, context));
  if (finishing.length > 0) return finishing[0];
  legal = limitFourFourteenCandidateCombos(legal, context);

  const scored = legal.map((combo) => ({
    combo,
    score: scoreCombo(combo, context)
  }));
  scored.sort((a, b) => b.score - a.score || comboSortScoreForContext(a.combo, context) - comboSortScoreForContext(b.combo, context));
  const best = scored[0];
  if (context.previous && passScore(context) >= best.score) return undefined;
  return best.combo;
}

export function limitFourFourteenCandidateCombos(legal: Combo[], context: AIContext): Combo[] {
  if (context.ruleset !== '414' || (context.deckCount ?? 1) <= 1) return legal;
  const prompt = context.previous ? 'follow' : 'lead';
  const handCount = context.hands[context.playerIndex]?.length ?? 0;
  const limit = fourFourteenCandidateLimit(handCount, prompt);
  if (legal.length <= limit) return legal;

  const ranked = legal
    .map((combo) => ({ combo, score: fourFourteenQuickCandidateScore(combo, context) }))
    .sort((lhs, rhs) =>
      rhs.score - lhs.score ||
      rhs.combo.cards.length - lhs.combo.cards.length ||
      comboSortScore414(lhs.combo) - comboSortScore414(rhs.combo)
    );
  const selected: Combo[] = [];
  const seen = new Set<string>();
  const append = (combo: Combo) => {
    const key = combo.cards.map((card) => card.id).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(combo);
  };

  ranked.slice(0, limit).forEach(({ combo }) => append(combo));
  (['singleRun', 'pairRun', 'single', 'pair', 'trioWithSingle', 'trioWithPair', 'sameRankBomb', 'doubleJoker', 'rocket414'] as const)
    .forEach((kind) => {
      const priority = ranked.find(({ combo }) => combo.kind === kind)?.combo;
      if (priority) append(priority);
    });
  return selected;
}

export function chooseHintCombo(context: AIContext): Combo | undefined {
  const hand = context.hands[context.playerIndex];
  let legal = legalCombinations(context.ruleset, hand, context.previous, context.levelRank);
  if (context.firstPlayMustContain) {
    legal = legal.filter((combo) => combo.cards.some((card) => card.id === context.firstPlayMustContain!.id));
  }
  const finishing = legal.find((combo) => combo.cards.length === hand.length);
  if (finishing) return finishing;
  if (context.ruleset === '414') return chooseFourFourteenQuickHint(legal, context);
  return chooseAICombo({ ...context, style: 'competitive' }) ?? legal[0];
}

export function estimateTurns(cards: Card[], ruleset: Ruleset, levelRank?: Rank): number {
  if (cards.length === 0) return 0;
  if (legalCombinations(ruleset, cards, undefined, levelRank).some((combo) => combo.cards.length === cards.length)) return 1;
  let remaining = sortCards(cards, levelRank);
  let turns = 0;
  while (remaining.length > 0 && turns < 40) {
    const combos = legalCombinations(ruleset, remaining, undefined, levelRank)
      .filter((combo) => combo.cards.length <= remaining.length)
      .sort((a, b) => planningScore(b, ruleset, levelRank) - planningScore(a, ruleset, levelRank));
    const combo = combos[0];
    if (!combo) {
      turns += remaining.length;
      break;
    }
    remaining = removeCards(remaining, combo.cards);
    turns += 1;
  }
  return turns;
}

function scoreCombo(combo: Combo, context: AIContext): number {
  const hand = context.hands[context.playerIndex];
  const remaining = removeCards(hand, combo.cards);
  const beforeTurns = estimateTurns(hand, context.ruleset, context.levelRank);
  const afterTurns = estimateTurns(remaining, context.ruleset, context.levelRank);
  const pressure = tablePressure(context);
  let score = (beforeTurns - afterTurns) * 900 + combo.cards.length * 28 - rankValue(combo.primaryRank, context.levelRank) * 7;

  if (!context.previous) {
    score += leadShapeBonus(combo, context);
  } else {
    score += 140 + pressure * 22;
  }
  score += shortCardDefenseBonus(combo, context, pressure);

  if (context.ruleset === '414') {
    score += productiveShapeBonus414(combo, remaining, context);
    score += compactControlEndgameBonus414(combo, remaining, hand, context);
    score += multiDeckBombPressureBonus414(combo, context, pressure);
  }

  score -= resourceCost(combo, context);
  score -= controlOverkillPenalty(combo, context, pressure);
  score -= structureBreakCost(combo, hand, context);
  if (context.ruleset === '414') {
    score -= bombReserveSplitPenalty414(combo, hand, context, beforeTurns, afterTurns);
  }

  if (context.ruleset === '414') {
    score -= publicMemoryRisk(combo, context);
  }

  if (context.ruleset === 'doudizhu') {
    score += douDizhuTeamAdjustment(combo, context);
  }

  if (context.ruleset === 'guandan') {
    score += guanDanTeamAdjustment(combo, context);
  }

  if (context.style === 'relaxed' && context.previous && pressure < 5) {
    score -= 180;
  }
  return score;
}

function comboSortScoreForContext(combo: Combo, context: AIContext): number {
  return context.ruleset === '414' ? comboSortScore414(combo) : comboSortScore(combo, context.levelRank);
}

function fourFourteenCandidateLimit(handCount: number, prompt: 'lead' | 'follow'): number {
  if (prompt === 'lead' && handCount >= 40) return 18;
  if (prompt === 'follow' && handCount >= 40) return 24;
  if (prompt === 'lead' && handCount >= 20) return 18;
  if (prompt === 'follow' && handCount >= 20) return 26;
  return 56;
}

function fourFourteenQuickCandidateScore(combo: Combo, context: AIContext): number {
  const hand = context.hands[context.playerIndex] ?? [];
  const remaining = removeCards(hand, combo.cards);
  const handCount = hand.length;
  const rank = rankValue(combo.primaryRank, context.levelRank);
  const pressure = tablePressure(context);
  const threat = shortCardThreat(context);
  const defenseResponsibility = fourFourteenDefenseResponsibility(context, threat, pressure);
  const defenseIsUrgent = defenseResponsibility >= 55;
  let score = combo.cards.length * 45 - rank * 10;

  switch (combo.kind) {
    case 'singleRun': {
      score += 3200 + (combo.sequenceLength ?? combo.cards.length) * 210;
      const nextRunLength = bestSingleRunLength(remaining);
      if (nextRunLength >= 3) {
        score += 850 + nextRunLength * 70;
      } else if ((combo.sequenceLength ?? combo.cards.length) >= 6 && duplicateRanksUsed(combo.cards, hand) >= 2) {
        score -= 900;
      }
      break;
    }
    case 'pairRun':
      score += 3600 + (combo.sequenceLength ?? Math.floor(combo.cards.length / 2)) * 250;
      break;
    case 'single':
      score += 700 - rank * 18;
      if ((groupByRank(hand).get(combo.primaryRank)?.length ?? 0) > 1 && bestSingleRunLength(remaining) >= bestSingleRunLength(hand)) {
        score += 360;
      }
      break;
    case 'pair':
      score += 880 - rank * 16;
      break;
    case 'trioWithSingle':
      score += handCount <= 8 ? 1400 : 180;
      break;
    case 'trioWithPair':
      score += handCount <= 8 ? 1650 : 240;
      break;
    case 'sameRankBomb':
      score += -1600 + pressure * 8 + defenseResponsibility * 24;
      score -= (combo.sameRankCount ?? combo.cards.length) * 110;
      score += fourFourteenBombCandidateBonus(context);
      break;
    case 'doubleJoker':
    case 'rocket414':
      score += -2200 + pressure * 10 + defenseResponsibility * 28;
      score += fourFourteenControlCandidateBonus(context);
      break;
    default:
      break;
  }

  if (context.previous) {
    const followPressureBonus = Math.round(fourFourteenResourceSurplus(context) * 8);
    score += 550 + pressure * 4 + followPressureBonus * 5 + defenseResponsibility * 9;
    if (isBombLike414(combo) && !defenseIsUrgent) {
      score -= Math.max(260, 1700 - defenseResponsibility * 18 - pressure * 5 - followPressureBonus * 8);
    }
  }

  if (combo.cards.some(isControlCard414) && !defenseIsUrgent && handCount > 5) {
    score -= Math.max(0, 1250 - defenseResponsibility * 14 - pressure * 4);
  }

  if (threat?.count === 1) {
    if (blocksSingleCardOut414(combo)) {
      score += 520 + defenseResponsibility * 18 + pressure * 4;
    } else if (combo.kind === 'single') {
      score -= 420 + defenseResponsibility * 7;
    }
  }

  if (!context.previous) {
    score += fourFourteenLeadRestrictionScore(combo, threat);
  }

  return Math.round(score);
}

function productiveShapeBonus414(combo: Combo, remaining: Card[], context: AIContext): number {
  if (context.previous) return 0;
  if (combo.kind !== 'singleRun') return 0;
  if (estimateTurns(remaining, '414', context.levelRank) !== 1) return 0;
  const nextRunLength = bestSingleRunLength(remaining);
  if (nextRunLength < 3) return 0;
  return 520 + nextRunLength * 55;
}

function multiDeckBombPressureBonus414(combo: Combo, context: AIContext, pressure: number): number {
  if (!context.previous || isBombLike414(context.previous)) return 0;
  if ((context.deckCount ?? 1) <= 1 || combo.kind !== 'sameRankBomb') return 0;
  const count = combo.sameRankCount ?? combo.cards.length;
  const compactBombBonus = count === 3 ? 420 : 120;
  const deckBonus = ((context.deckCount ?? 1) - 1) * 120;
  const pressureBonus = Math.max(0, pressure - 3.2) * 130;
  return Math.round(compactBombBonus + deckBonus + pressureBonus);
}

function compactControlEndgameBonus414(combo: Combo, remaining: Card[], hand: Card[], context: AIContext): number {
  if (hand.length > 8 || remaining.length === 0) return 0;
  if (context.style === 'relaxed' && context.previous && tablePressure(context) < 5 && !shortCardThreat(context)) return 0;
  const remainingCombo = legalCombinations('414', remaining, undefined, context.levelRank)
    .find((candidate) => candidate.cards.length === remaining.length);
  if (!remainingCombo) return 0;
  if (!isBombLike414(combo) && !isBombLike414(remainingCombo) && !breaksSameRankBomb414(combo, hand)) return 0;

  let bonus = 1450 + Math.min(5, combo.cards.length) * 95;
  if (isBombLike414(combo) || isBombLike414(remainingCombo)) bonus += 1350;
  if (combo.kind === 'sameRankBomb' && remainingCombo.kind === 'doubleJoker') bonus += 900;
  if (combo.kind === 'doubleJoker' && remainingCombo.kind === 'sameRankBomb') bonus += 520;
  if (combo.kind === 'single' || combo.kind === 'pair') bonus -= 620;
  return bonus;
}

function passScore(context: AIContext): number {
  if (context.ruleset === '414') return fourFourteenPassScore(context);
  if (!context.previous) return -100000;
  const pressure = tablePressure(context);
  let score = 60 - pressure * 85;
  if (context.style === 'relaxed' && pressure < 5) score += 230;
  if (context.ruleset === 'doudizhu' && context.landlordIndex != null && context.previousPlayerIndex !== context.landlordIndex) {
    const myTeam = context.playerIndex === context.landlordIndex ? 'landlord' : 'farmer';
    const prevTeam = context.previousPlayerIndex === context.landlordIndex ? 'landlord' : 'farmer';
    if (myTeam === 'farmer' && prevTeam === 'farmer') score += 480;
  }
  if (context.ruleset === 'guandan' && context.teamOf && context.previousPlayerIndex != null) {
    if (context.teamOf(context.playerIndex) === context.teamOf(context.previousPlayerIndex)) score += 420;
  }
  return score;
}

export function fourFourteenPassScore(context: AIContext): number {
  if (!context.previous) return -100000;
  const pressure = Math.round(tablePressure(context) * 10);
  const threat = fourFourteenThreatContext(context);
  const coverage = fourFourteenCoverageStrength(threat?.count, threat?.index, context.previousPlayerIndex, context.previous);
  const intercept = fourFourteenInterceptReliabilityAfterMe(context, threat, context.previous);
  const defenseResponsibility = fourFourteenDefenseResponsibilityFromCoverage(context, threat, pressure, coverage, intercept);
  const followPressureBonus = Math.min(68, Math.round(fourFourteenResourceSurplus(context) * 8 + pressure / 20));
  const coveredPressure = pressure * 2 - coverage * 2 - intercept;
  let score = -Math.max(0, coveredPressure + followPressureBonus) - defenseResponsibility * 14;

  if (context.style === 'relaxed' && !fourFourteenRelaxedStyleBypass(context, defenseResponsibility, pressure)) {
    score += 320 + Math.max(0, 46 - pressure) * 4;
  }
  return Math.round(score);
}

function tablePressure(context: AIContext): number {
  if (context.ruleset === '414' && context.cardsPlayedCount && context.deckCount != null) {
    return fourFourteenTablePressure(context);
  }
  const opponents = context.hands
    .map((hand, index) => ({ index, count: hand.length }))
    .filter((entry) => entry.index !== context.playerIndex && entry.count > 0);
  const min = Math.min(...opponents.map((entry) => entry.count));
  const progress = Math.max(0, 20 - context.hands[context.playerIndex].length) / 3;
  if (min <= 1) return 10 + progress;
  if (min <= 2) return 8 + progress;
  if (min <= 4) return 5 + progress;
  return progress;
}

function fourFourteenTablePressure(context: AIContext): number {
  const deckCount = context.deckCount ?? 1;
  const totalCards = Math.max(1, deckCount * 54);
  const playedCards = Math.min(totalCards, Math.max(0, context.cardsPlayedCount?.reduce((total, count) => total + count, 0) ?? 0));
  const progressPressure = (playedCards / totalCards) * 4.2;
  const opponentCounts = context.hands
    .map((hand, index) => (index === context.playerIndex ? 0 : hand.length))
    .filter((count) => count > 0);
  const minOpponentCards = Math.min(...opponentCounts, 99);
  const dangerWindow = Math.max(9, deckCount * 7);
  const remainingPressure = Math.min(7.2, Math.max(0, 7.2 - (minOpponentCards * 7.2) / dangerWindow));
  const lastActorCards = context.previousPlayerIndex != null && context.previousPlayerIndex !== context.playerIndex
    ? context.hands[context.previousPlayerIndex]?.length
    : undefined;
  const lastActorPressure = lastActorCards && lastActorCards > 0 ? Math.max(0, 4.2 - lastActorCards * 0.6) : 0;
  const passPressure = context.previous ? (context.passCount ?? 0) * 0.5 : 0;
  return Math.min(10, progressPressure + remainingPressure + lastActorPressure + passPressure);
}

function fourFourteenThreatContext(context: AIContext): { index: number; count: number } | undefined {
  const threatLimit = Math.max(3, Math.min(12, (context.deckCount ?? 1) * 3));
  return context.hands
    .map((hand, index) => ({ index, count: hand.length }))
    .filter((entry) => entry.index !== context.playerIndex && entry.count > 0 && entry.count <= threatLimit)
    .sort((lhs, rhs) => {
      if (lhs.count !== rhs.count) return lhs.count - rhs.count;
      if (context.previousPlayerIndex === lhs.index) return -1;
      if (context.previousPlayerIndex === rhs.index) return 1;
      return turnDistance(context.playerIndex, lhs.index, context.hands.length) - turnDistance(context.playerIndex, rhs.index, context.hands.length);
    })[0];
}

function fourFourteenCoverageStrength(
  threatCards: number | undefined,
  threatPlayer: number | undefined,
  currentController: number | undefined,
  currentCombination: Combo | undefined
): number {
  if (threatCards == null || currentController == null || currentController === threatPlayer || !currentCombination) return 0;

  if (threatCards === 1) return currentCombination.kind === 'single' ? 0 : 86;
  if (threatCards === 2) {
    if (currentCombination.cards.length >= 3) return 82;
    if (currentCombination.kind === 'pair' || currentCombination.kind === 'doubleJoker') return 36;
    return 0;
  }

  switch (currentCombination.kind) {
    case 'singleRun':
      return 54 + Math.min(18, (currentCombination.sequenceLength ?? currentCombination.cards.length) * 3);
    case 'pairRun':
      return 68 + Math.min(16, (currentCombination.sequenceLength ?? Math.floor(currentCombination.cards.length / 2)) * 3);
    case 'trioWithSingle':
    case 'trioWithPair':
      return 68;
    case 'sameRankBomb':
    case 'doubleJoker':
    case 'rocket414':
      return 76;
    case 'pair':
      return 24;
    default:
      return 0;
  }
}

function fourFourteenInterceptReliabilityAfterMe(
  context: AIContext,
  threat: { index: number; count: number } | undefined,
  currentCombination: Combo | undefined
): number {
  if (!threat || !currentCombination || context.previousPlayerIndex == null || context.hands.length <= 1) return 0;
  let combined = 0;
  let next = (context.playerIndex + 1) % context.hands.length;
  let guard = 0;
  while (next !== context.previousPlayerIndex && guard < context.hands.length) {
    if (next === threat.index) break;
    const reliability = fourFourteenPlayerReliability(context, next, threat, currentCombination);
    combined = 100 - Math.round(((100 - combined) * (100 - reliability)) / 100);
    next = (next + 1) % context.hands.length;
    guard += 1;
  }
  return Math.min(92, combined);
}

function fourFourteenPlayerReliability(
  context: AIContext,
  candidateIndex: number,
  threat: { index: number; count: number },
  currentCombination: Combo
): number {
  const hand = context.hands[candidateIndex] ?? [];
  if (hand.length === 0) return 0;
  const legal = legalCombinations('414', hand, currentCombination, context.levelRank);
  if (legal.length === 0) return 0;
  const restrictive = legal.some((combo) => threat.count === 1 ? blocksSingleCardOut414(combo) : combo.cards.length >= Math.min(3, threat.count));
  const bombLike = legal.some(isBombLike414);
  const base = restrictive ? 52 : 28;
  return Math.min(82, base + (bombLike ? 18 : 0) + Math.max(0, 6 - threat.count) * 4);
}

function fourFourteenDefenseResponsibilityFromCoverage(
  context: AIContext,
  threat: { index: number; count: number } | undefined,
  pressure: number,
  coverage: number,
  intercept: number
): number {
  if (!threat) return 0;
  const base = threat.count === 1 ? 96 : threat.count === 2 ? 82 : threat.count === 3 ? 56 : Math.max(24, 56 - (threat.count - 3) * 7);
  const controllerBonus = context.previousPlayerIndex === threat.index ? 18 : 0;
  const leadBonus = !context.previous && context.playerIndex === threat.index ? 12 : 0;
  const threatPressure = Math.min(100, base + controllerBonus + leadBonus + Math.round(pressure / 5));
  return Math.round((threatPressure * Math.max(0, 100 - coverage) * Math.max(0, 100 - intercept)) / 10000);
}

function fourFourteenRelaxedStyleBypass(context: AIContext, defenseResponsibility: number, pressure: number): boolean {
  const hand = context.hands[context.playerIndex] ?? [];
  return defenseResponsibility >= 55 || pressure >= 78 || hand.length <= 5;
}

function fourFourteenContextDefenseResponsibility(context: AIContext): number {
  const pressure = Math.round(tablePressure(context) * 10);
  const threat = fourFourteenThreatContext(context);
  const coverage = fourFourteenCoverageStrength(threat?.count, threat?.index, context.previousPlayerIndex, context.previous);
  const intercept = fourFourteenInterceptReliabilityAfterMe(context, threat, context.previous);
  return fourFourteenDefenseResponsibilityFromCoverage(context, threat, pressure, coverage, intercept);
}

function turnDistance(from: number, to: number, playerCount: number): number {
  return (to - from + playerCount) % playerCount;
}

function leadShapeBonus(combo: Combo, context: AIContext): number {
  const opponentMin = Math.min(...context.hands.map((hand, index) => (index === context.playerIndex || hand.length === 0 ? 99 : hand.length)));
  let bonus = 0;
  switch (combo.kind) {
    case 'singleRun':
    case 'singleStraight':
    case 'pairRun':
    case 'pairStraight':
      bonus += 480 + combo.cards.length * 22;
      break;
    case 'airplaneWithSingles':
    case 'airplaneWithPairs':
    case 'airplaneWithWings':
      bonus += 560 + combo.cards.length * 24;
      break;
    case 'airplane':
      bonus += combo.cards.length === context.hands[context.playerIndex].length ? 800 : -250;
      break;
    case 'trioWithPair':
    case 'trioWithTwo':
      bonus += context.ruleset === '414' ? -180 : 320;
      break;
    case 'single':
      bonus += opponentMin <= 1 ? -550 : 20;
      break;
    case 'pair':
      bonus += opponentMin <= 1 ? 260 : 80;
      break;
    default:
      break;
  }
  if (opponentMin <= 2 && combo.cards.length >= 3) bonus += 400;
  return bonus;
}

function bestSingleRunLength(cards: Card[]): number {
  const ranksInHand = new Set(cards.map((card) => card.rank));
  let best = 0;
  let current = 0;
  for (const rank of runRanks) {
    if (ranksInHand.has(rank)) {
      current += 1;
      if (current >= 3) best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function shortCardDefenseBonus(combo: Combo, context: AIContext, pressure: number): number {
  if (context.ruleset !== '414') return 0;
  if (combo.cards.length >= context.hands[context.playerIndex].length) return 0;
  const threat = shortCardThreat(context);
  if (!threat || threat.count > 3) return 0;
  const currentControllerIsThreat = context.previousPlayerIndex === threat.index;
  const currentTableCoversThreat = context.previous && blocksSingleCardOut414(context.previous) && !currentControllerIsThreat;

  if (threat.count === 1) {
    if (currentTableCoversThreat) return isBombLike414(combo) ? -2600 : 0;
    if (blocksSingleCardOut414(combo)) {
      let bonus = 1800 + Math.round(pressure * 90);
      if (combo.kind === 'sameRankBomb') bonus -= 260;
      if (combo.kind === 'doubleJoker') bonus -= 520;
      if (combo.kind === 'rocket414') bonus -= 760;
      return Math.max(900, bonus);
    }
    return combo.kind === 'single' ? -900 - Math.round(pressure * 35) : 0;
  }
  if (threat.count === 2) {
    if (combo.cards.length >= 3) return restrictiveShapeScore414(combo) + 360;
    if (combo.kind === 'pair') return -220;
    return 0;
  }
  return restrictiveShapeScore414(combo);
}

function shortCardThreat(context: AIContext): { index: number; count: number } | undefined {
  return context.hands
    .map((hand, index) => ({ index, count: hand.length }))
    .filter((entry) => entry.index !== context.playerIndex && entry.count > 0 && entry.count <= 3)
    .sort((lhs, rhs) => {
      if (lhs.count !== rhs.count) return lhs.count - rhs.count;
      if (context.previousPlayerIndex === lhs.index) return -1;
      if (context.previousPlayerIndex === rhs.index) return 1;
      return lhs.index - rhs.index;
    })[0];
}

function blocksSingleCardOut414(combo: Combo): boolean {
  return ['pair', 'sameRankBomb', 'trioWithSingle', 'trioWithPair', 'singleRun', 'pairRun', 'doubleJoker', 'rocket414'].includes(combo.kind);
}

function restrictiveShapeScore414(combo: Combo): number {
  switch (combo.kind) {
    case 'single':
      return -280;
    case 'pair':
      return 120;
    case 'singleRun':
      return 320 + (combo.sequenceLength ?? combo.cards.length) * 55;
    case 'pairRun':
      return 500 + (combo.sequenceLength ?? Math.floor(combo.cards.length / 2)) * 65;
    case 'trioWithSingle':
      return 460;
    case 'trioWithPair':
      return 540;
    case 'sameRankBomb':
      return 360 + (combo.sameRankCount ?? combo.cards.length) * 45;
    case 'doubleJoker':
      return 420;
    case 'rocket414':
      return 500;
    default:
      return 0;
  }
}

function duplicateRanksUsed(cards: Card[], hand: Card[]): number {
  const handGroups = groupByRank(hand);
  let count = 0;
  for (const rank of new Set(cards.map((card) => card.rank))) {
    if ((handGroups.get(rank)?.length ?? 0) > 1) count += 1;
  }
  return count;
}

function fourFourteenLeadRestrictionScore(combo: Combo, threat: { index: number; count: number } | undefined): number {
  switch (threat?.count) {
    case 1:
      return blocksSingleCardOut414(combo) ? 900 : combo.kind === 'single' ? -650 : 0;
    case 2:
      if (combo.cards.length >= 3) return restrictiveShapeScore414(combo) + 360;
      return combo.kind === 'pair' ? -260 : 0;
    case 3:
      return restrictiveShapeScore414(combo);
    default:
      return 0;
  }
}

function fourFourteenDefenseResponsibility(context: AIContext, threat: { index: number; count: number } | undefined, pressure: number): number {
  if (!threat) return 0;
  const base = threat.count === 1 ? 96 : threat.count === 2 ? 82 : threat.count === 3 ? 56 : Math.max(24, 56 - (threat.count - 3) * 7);
  const controllerBonus = context.previousPlayerIndex === threat.index ? 18 : 0;
  return Math.min(100, Math.round(base + controllerBonus + pressure / 5));
}

function fourFourteenResourceSurplus(context: AIContext): number {
  const hand = context.hands[context.playerIndex] ?? [];
  const deckCount = Math.max(1, context.deckCount ?? 1);
  const totalCards = Math.max(1, deckCount * 54);
  const controlCardCount = hand.filter(isControlCard414).length;
  const expectedControlCards = Math.max(1, hand.length / 9);
  const controlSurplus = Math.max(0, controlCardCount - expectedControlCards);
  const groups = groupByRank(hand);
  const bombGroups = [...groups.values()].filter((cards) => cards.length >= 3).length;
  const strongBombGroups = [...groups.values()].filter((cards) => cards.length >= 4).length;
  const extraBombCards = [...groups.values()].reduce((total, cards) => total + Math.max(0, cards.length - 3), 0);
  const rocketCount = Math.min(Math.floor((groups.get('4')?.length ?? 0) / 2), groups.get('A')?.length ?? 0);
  const doubleJokerCount = Math.min(groups.get('SJ')?.length ?? 0, groups.get('BJ')?.length ?? 0);
  const bombLoad = bombGroups * 2 + strongBombGroups + extraBombCards / 2 + rocketCount * 3 + doubleJokerCount * 2;
  const initialHandShare = Math.max(1, totalCards / 4);
  const currentHandRatio = Math.max(0.35, hand.length / initialHandShare);
  const expectedBombLoad = Math.max(1, deckCount * 2.4 * currentHandRatio);
  const bombSurplus = Math.max(0, bombLoad - expectedBombLoad);
  return controlSurplus + bombSurplus;
}

function fourFourteenBombCandidateBonus(context: AIContext): number {
  return Math.min(1300, Math.round(fourFourteenResourceSurplus(context) * 150 + tablePressure(context) * 40));
}

function fourFourteenControlCandidateBonus(context: AIContext): number {
  return Math.min(1050, Math.round(fourFourteenResourceSurplus(context) * 105 + tablePressure(context) * 35));
}

function resourceCost(combo: Combo, context: AIContext): number {
  let cost = 0;
  const pressure = tablePressure(context);
  for (const card of combo.cards) {
    if (card.rank === '2') cost += 95;
    if (card.rank === 'SJ') cost += 190;
    if (card.rank === 'BJ') cost += 240;
  }
  switch (combo.kind) {
    case 'rocket414':
    case 'rocket':
    case 'jokerBomb':
      cost += 1150;
      break;
    case 'doubleJoker':
      cost += 880;
      break;
    case 'sameRankBomb':
    case 'bomb':
      cost += 620 + (combo.cards.length - 3) * 120;
      break;
    case 'straightFlush':
      cost += 760;
      break;
    default:
      break;
  }
  if (context.ruleset === '414') {
    cost = Math.round(cost * fourFourteenResourceCoefficient(context));
  }
  if (context.style === 'relaxed' && pressure < 6) cost = Math.round(cost * 1.25);
  return Math.max(0, cost - pressure * 85);
}

function controlOverkillPenalty(combo: Combo, context: AIContext, pressure: number): number {
  if (context.ruleset !== '414' || !context.previous || context.previous.cards.length === 0) return 0;
  if (isBombLike414(context.previous) || combo.cards.length >= context.hands[context.playerIndex].length) return 0;
  if (!combo.cards.some(isControlCard414)) return 0;
  const previousIsLow = rankValue(context.previous.primaryRank) <= rankValue('10');
  const base = previousIsLow ? 1700 : 1250;
  const relief = pressure * (previousIsLow ? 185 : 160);
  return Math.max(0, Math.round(base - relief));
}

function fourFourteenResourceCoefficient(context: AIContext): number {
  const deckCount = context.deckCount ?? 1;
  const hand = context.hands[context.playerIndex];
  const groups = groupByRank(hand);
  const bombGroups = [...groups.values()].filter((cards) => cards.length >= 3).length;
  const hasRocket414 = (groups.get('4')?.length ?? 0) >= 2 && (groups.get('A')?.length ?? 0) >= 1;
  const hasDoubleJoker = (groups.get('SJ')?.length ?? 0) >= 1 && (groups.get('BJ')?.length ?? 0) >= 1;
  const controlLoad = bombGroups + (hasRocket414 ? 1.5 : 0) + (hasDoubleJoker ? 1 : 0);
  const expected = Math.max(1, deckCount * 1.7);
  return Math.max(0.45, Math.min(1.2, expected / Math.max(expected, controlLoad)));
}

function isControlCard414(card: Card): boolean {
  return card.rank === '2' || card.rank === 'SJ' || card.rank === 'BJ';
}

function structureBreakCost(combo: Combo, hand: Card[], context: AIContext): number {
  if (combo.cards.length === hand.length) return 0;
  const beforeGroups = groupByRank(hand);
  const afterGroups = groupByRank(removeCards(hand, combo.cards));
  let cost = 0;
  for (const [rank, cards] of beforeGroups) {
    if (cards.length >= 3 && (afterGroups.get(rank)?.length ?? 0) < 3) {
      cost += context.ruleset === '414' ? 420 : 180;
    }
    if (cards.length >= 4 && (afterGroups.get(rank)?.length ?? 0) < 4) {
      cost += 480;
    }
  }
  return cost;
}

export function bombReserveSplitPenalty414(combo: Combo, hand: Card[], context: AIContext, beforeTurns = estimateTurns(hand, '414', context.levelRank), afterTurns = estimateTurns(removeCards(hand, combo.cards), '414', context.levelRank)): number {
  if (combo.cards.length === hand.length || isBombLike414(combo) || combo.kind === 'cha' || combo.kind === 'gou') return 0;
  const beforeGroups = groupByRank(hand);
  const actionGroups = groupByRank(combo.cards);
  const splitRanks = [...actionGroups.entries()].filter(([rank, cards]) => {
    const originalCount = beforeGroups.get(rank)?.length ?? 0;
    return originalCount >= 3 && cards.length < originalCount;
  });
  if (splitRanks.length === 0) return 0;

  let penalty = 0;
  for (const [rank, cards] of splitRanks) {
    const originalCount = beforeGroups.get(rank)?.length ?? 0;
    const remainingCount = originalCount - cards.length;
    let rankPenalty = originalCount >= 4 ? 1180 : 760;
    rankPenalty += rankValue(rank, context.levelRank) * 24;
    if (remainingCount < 3) {
      rankPenalty += originalCount >= 4 ? 980 : 680;
    }
    penalty += rankPenalty;
  }

  switch (combo.kind) {
    case 'singleRun':
    case 'pairRun':
      penalty += 4200 * splitRanks.length;
      break;
    case 'single':
    case 'pair':
      penalty += 260 * splitRanks.length;
      break;
    case 'trioWithSingle':
    case 'trioWithPair':
      penalty += hand.length > 7 ? 520 : 220;
      break;
    default:
      break;
  }

  const turnImprovement = beforeTurns - afterTurns;
  if (turnImprovement >= 2) {
    penalty -= 520;
  } else if (turnImprovement <= 0) {
    penalty += 360;
  }
  if (hand.length <= 6) penalty = Math.floor(penalty / 2);

  const deckDiscount = Math.min(42, Math.max(0, (context.deckCount ?? 1) - 1) * 16);
  penalty = Math.round((penalty * Math.max(58, 100 - deckDiscount)) / 100);
  penalty = Math.round((Math.max(0, penalty) * Math.max(0, 100 - Math.min(72, fourFourteenContextDefenseResponsibility(context)))) / 100);
  return Math.max(0, penalty);
}

function breaksSameRankBomb414(combo: Combo, hand: Card[]): boolean {
  const beforeGroups = groupByRank(hand);
  const actionGroups = groupByRank(combo.cards);
  return [...actionGroups.entries()].some(([rank, cards]) => {
    const originalCount = beforeGroups.get(rank)?.length ?? 0;
    return originalCount >= 3 && cards.length < originalCount;
  });
}

function publicMemoryRisk(combo: Combo, context: AIContext): number {
  if (!context.visibleCards || context.deckCount == null) return 0;
  const memory = new PublicCardMemory({
    deckCount: context.deckCount,
    ownCards: context.hands[context.playerIndex],
    visibleCards: context.visibleCards,
    opponentHandCounts: opponentHandCounts(context)
  });
  if (combo.kind === 'single' && !memory.opponentsCanCha(combo.primaryRank)) return -80;
  if (combo.kind === 'doubleJoker' && !memory.opponentsCanHaveRocket414()) return -160;
  if (combo.kind === 'sameRankBomb') {
    const higherRisk = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'].filter(
      (rank) => rankValue(rank as Rank) > rankValue(combo.primaryRank) && memory.opponentsCanHaveSameRankBomb(rank as Rank, combo.sameRankCount ?? combo.cards.length)
    ).length;
    return higherRisk * 55;
  }
  return 0;
}

function chooseFourFourteenQuickHint(legal: Combo[], context: AIContext): Combo | undefined {
  if (legal.length === 0) return undefined;
  const memory = context.deckCount == null
    ? undefined
    : new PublicCardMemory({
        deckCount: context.deckCount,
        ownCards: context.hands[context.playerIndex],
        visibleCards: context.visibleCards ?? [],
        opponentHandCounts: opponentHandCounts(context)
      });
  return [...legal].sort((lhs, rhs) => {
    const diff = (context.previous ? followHintScore414(lhs, memory, context) : leadHintScore414(lhs, context.hands[context.playerIndex].length, memory, context)) -
      (context.previous ? followHintScore414(rhs, memory, context) : leadHintScore414(rhs, context.hands[context.playerIndex].length, memory, context));
    return diff || comboSortScore414(lhs) - comboSortScore414(rhs);
  })[0];
}

function opponentHandCounts(context: AIContext): number[] {
  return context.hands
    .filter((_, index) => index !== context.playerIndex)
    .map((hand) => hand.length);
}

function followHintScore414(combo: Combo, memory: PublicCardMemory | undefined, context: AIContext): number {
  let score = comboSortScore414(combo);
  if (isBombLike414(combo)) {
    score += 80000;
    if (context.previous && isBombLike414(context.previous)) score += controlSpendScore414(combo) / 4;
    score += publicMemoryReservePenalty414(combo, memory);
  }
  score += combo.cards.reduce((total, card) => total + controlPenalty414(card), 0);
  return score;
}

function leadHintScore414(combo: Combo, handCount: number, memory: PublicCardMemory | undefined, context: AIContext): number {
  if (combo.cards.length === handCount) return -100000;
  let score = comboSortScore414(combo);
  switch (combo.kind) {
    case 'singleRun':
      score -= 3200 + (combo.sequenceLength ?? combo.cards.length) * 140;
      break;
    case 'pairRun':
      score -= 3000 + (combo.sequenceLength ?? Math.floor(combo.cards.length / 2)) * 150;
      break;
    case 'single':
      score -= 500;
      break;
    case 'pair':
      score -= 350;
      break;
    case 'trioWithSingle':
    case 'trioWithPair':
      score += handCount <= 7 ? -300 : 6000;
      break;
    case 'sameRankBomb':
      score += 24000 + publicMemoryReservePenalty414(combo, memory) / 2;
      break;
    case 'doubleJoker':
      score += 28000 + publicMemoryReservePenalty414(combo, memory) / 2;
      break;
    case 'rocket414':
      score += 32000;
      break;
    default:
      break;
  }
  score += combo.cards.reduce((total, card) => total + controlPenalty414(card), 0);
  return score;
}

function isBombLike414(combo: Combo): boolean {
  return combo.kind === 'sameRankBomb' || combo.kind === 'doubleJoker' || combo.kind === 'rocket414';
}

function publicMemoryReservePenalty414(combo: Combo, memory?: PublicCardMemory): number {
  if (!memory) return 0;
  switch (combo.kind) {
    case 'sameRankBomb': {
      const canBeBeaten = memory.opponentsCanBeatSameRankBomb(combo) || memory.opponentsCanHaveDoubleJoker() || memory.opponentsCanHaveRocket414();
      return canBeBeaten ? 0 : 2400;
    }
    case 'doubleJoker':
      return memory.opponentsCanHaveRocket414() ? 0 : 3400;
    case 'rocket414':
      return 4600;
    default:
      return 0;
  }
}

function controlSpendScore414(combo: Combo): number {
  const cardCost = combo.cards.reduce((total, card) => total + controlPenalty414(card), 0);
  switch (combo.kind) {
    case 'sameRankBomb':
      return 10000 + (combo.sameRankCount ?? combo.cards.length) * 2200 + rankValue(combo.primaryRank) * 120 + cardCost;
    case 'doubleJoker':
      return 45000 + cardCost;
    case 'rocket414':
      return 55000 + cardCost;
    default:
      return comboSortScore414(combo) + cardCost;
  }
}

function controlPenalty414(card: Card): number {
  switch (card.rank) {
    case 'BJ':
      return 8000;
    case 'SJ':
      return 7000;
    case '2':
      return 4200;
    case 'A':
      return 850;
    case 'K':
      return 650;
    default:
      return rankValue(card.rank) * 20;
  }
}

function douDizhuTeamAdjustment(combo: Combo, context: AIContext): number {
  if (context.landlordIndex == null || context.previousPlayerIndex == null || !context.previous) return 0;
  const isFarmer = context.playerIndex !== context.landlordIndex;
  const previousIsFarmer = context.previousPlayerIndex !== context.landlordIndex;
  const landlordShort = context.hands[context.landlordIndex]?.length <= 3;
  if (isFarmer && previousIsFarmer && !landlordShort) return combo.cards.length === context.hands[context.playerIndex].length ? 900 : -900;
  if (isFarmer && context.previousPlayerIndex === context.landlordIndex) return landlordShort ? 550 : 260;
  return 0;
}

function guanDanTeamAdjustment(combo: Combo, context: AIContext): number {
  if (!context.teamOf || context.previousPlayerIndex == null || !context.previous) return 0;
  if (context.teamOf(context.playerIndex) === context.teamOf(context.previousPlayerIndex)) {
    return combo.cards.length === context.hands[context.playerIndex].length ? 900 : -820;
  }
  return 220;
}

function planningScore(combo: Combo, ruleset: Ruleset, levelRank?: Rank): number {
  let score = combo.cards.length * 90 - rankValue(combo.primaryRank, levelRank) * 4;
  switch (combo.kind) {
    case 'singleRun':
    case 'singleStraight':
    case 'pairRun':
    case 'pairStraight':
      score += 500;
      break;
    case 'airplaneWithSingles':
    case 'airplaneWithPairs':
    case 'airplaneWithWings':
      score += 620;
      break;
    case 'airplane':
      score += 320;
      break;
    case 'trioWithSingle':
    case 'trioWithPair':
    case 'trioWithTwo':
      score += ruleset === '414' ? -100 : 260;
      break;
    case 'sameRankBomb':
    case 'bomb':
    case 'doubleJoker':
    case 'rocket414':
    case 'rocket':
    case 'jokerBomb':
      score -= ruleset === '414' ? 180 : 320;
      break;
    default:
      break;
  }
  return score;
}
