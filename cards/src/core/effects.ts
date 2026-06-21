export type EffectKind =
  | 'bomb'
  | 'mushroom'
  | 'rocket'
  | 'airplane'
  | 'straightTrail'
  | 'pairChain'
  | 'steelPlate'
  | 'straightFlush'
  | 'stamp';

export type EffectIntensity = 'c' | 'b' | 'a' | 's';

export interface TableEffect {
  id: number;
  kind: EffectKind;
  playerIndex: number;
  title: string;
  subtitle?: string;
  intensity: EffectIntensity;
}

export function effectDurationMs(intensity: EffectIntensity): number {
  switch (intensity) {
    case 's':
      return 1250;
    case 'a':
      return 1050;
    case 'b':
      return 900;
    case 'c':
      return 800;
  }
}

export function effectIsMajor(intensity: EffectIntensity): boolean {
  return intensity === 'a' || intensity === 's';
}

export function pauseAfterLatestEventMs(intensity: EffectIntensity | undefined, latestEventIsReaction: boolean): number {
  const base = latestEventIsReaction ? 1850 : 1250;
  if (!intensity) return base;
  return Math.max(base, effectDurationMs(intensity) + (effectIsMajor(intensity) ? 200 : 120));
}

const FOUR_FOURTEEN_AI_THINKING_MS = 1000;

export interface FourFourteenAIDelayInput {
  hasLatestEvent: boolean;
  latestEventIsLeadStart: boolean;
  latestEventIsReaction: boolean;
  latestEventPlayerIndex?: number;
  intensity?: EffectIntensity;
}

export function fourFourteenAIActionDelayMs(input: FourFourteenAIDelayInput): number {
  if (!input.hasLatestEvent || input.latestEventIsLeadStart || input.latestEventPlayerIndex === 0) {
    return FOUR_FOURTEEN_AI_THINKING_MS;
  }
  return FOUR_FOURTEEN_AI_THINKING_MS + pauseAfterLatestEventMs(input.intensity, input.latestEventIsReaction);
}
