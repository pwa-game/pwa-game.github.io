import { type CSSProperties } from 'react';
import { TableEffect, effectDurationMs } from '../core/effects';

interface EffectOverlayProps {
  effect?: TableEffect;
  seatCount: number;
}

export function EffectOverlay({ effect, seatCount }: EffectOverlayProps) {
  if (!effect) return null;
  const seat = seatClass(effect.playerIndex, seatCount);
  const impact = effect.kind === 'bomb' || effect.kind === 'mushroom' || effect.kind === 'rocket';
  const style = effectAnimationStyle(effect);
  return (
    <>
      {impact && <div key={`${effect.id}-impact`} className={`effect-impact-backdrop ${seat} ${effect.kind} intensity-${effect.intensity}`} style={style} aria-hidden="true" />}
      <div key={effect.id} className={`effect-overlay ${seat} ${effect.kind} intensity-${effect.intensity}`} style={style} aria-hidden="true">
        <div className="effect-burst">
          <span className="effect-title">{effect.title}</span>
          {effect.subtitle && <span className="effect-subtitle">{effect.subtitle}</span>}
        </div>
        <div className="effect-particles">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </>
  );
}

export function effectAnimationStyle(effect: TableEffect): CSSProperties {
  return { '--effect-duration': `${effectDurationMs(effect.intensity)}ms` } as CSSProperties;
}

function seatClass(index: number, seatCount: number): string {
  if (index === 0) return 'seat-bottom';
  if (seatCount === 3) return index === 1 ? 'seat-left' : 'seat-right';
  if (index === 1) return 'seat-left';
  if (index === 2) return 'seat-top';
  return 'seat-right';
}
