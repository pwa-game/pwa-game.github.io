import { EffectKind } from './effects';

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;
type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type?: string;
  };
};

const files = {
  tap: assetPath('audio/tap.wav'),
  deal: assetPath('audio/shuffle.wav'),
  draw: assetPath('audio/draw.wav'),
  error: assetPath('audio/error.wav'),
  play: assetPath('audio/playcard.wav'),
  pass: assetPath('audio/pass.wav'),
  bomb: assetPath('audio/bomb_bang.wav'),
  bombPop: assetPath('audio/bomb_pop.wav'),
  cannonBoom: assetPath('audio/cannon_boom.wav'),
  cardContact: assetPath('audio/card_contact.wav'),
  cardCut: assetPath('audio/card_cut.wav'),
  rocket: assetPath('audio/rocket_launch.wav'),
  reaction: assetPath('audio/reaction.wav')
};

let enabled = true;
let audioContext: AudioContext | undefined;
const bufferCache = new Map<keyof typeof files, Promise<AudioBuffer>>();
const pendingTimers = new Set<number>();
const activeSounds = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();

installLifecycleStop();

export function setAudioEnabled(value: boolean): void {
  enabled = value;
  if (!enabled) stopAllAudio({ suspend: true });
}

export function isAudioEnabled(): boolean {
  return enabled;
}

export function playSound(name: keyof typeof files): void {
  playLayer(name);
}

export function playEffectSound(kind?: EffectKind): void {
  switch (kind) {
    case 'bomb':
      playLayer('bombPop', 0.92, 0.92);
      playLayer('bomb', 0.96, 0.9, 42);
      playLayer('reaction', 0.52, 0.72, 96);
      break;
    case 'mushroom':
      playLayer('cannonBoom', 1, 0.82);
      playLayer('bomb', 0.8, 0.66, 112);
      playLayer('reaction', 0.5, 0.58, 210);
      break;
    case 'rocket':
      playLayer('rocket', 0.96);
      playLayer('bombPop', 0.56, 1.18, 72);
      playLayer('reaction', 0.62, 0.76, 230);
      break;
    case 'straightFlush':
    case 'steelPlate':
      playLayer('reaction', 0.82, 0.94);
      playLayer('cardCut', 0.56, 0.84, 48);
      break;
    case 'airplane':
      playLayer('draw', 0.76, 1.22);
      playLayer('cardCut', 0.46, 1.2, 60);
      break;
    case 'straightTrail':
    case 'pairChain':
      playLayer('play', 0.82, 1.04);
      playLayer('cardContact', 0.46, 1, 34);
      break;
    case 'stamp':
      playLayer('reaction', 0.95, 1.04);
      break;
    default:
      playLayer('play', 0.82, 1.04);
      playLayer('cardContact', 0.52, 1, 36);
  }
}

function playLayer(name: keyof typeof files, volumeMultiplier = 1, playbackRate = 1, delayMs = 0): void {
  if (typeof window === 'undefined' || !enabled || isPageHidden()) return;
  const timer = window.setTimeout(() => {
    pendingTimers.delete(timer);
    if (!enabled || isPageHidden()) return;
    void playBuffer(name, volumeMultiplier, playbackRate);
  }, delayMs);
  pendingTimers.add(timer);
}

async function playBuffer(name: keyof typeof files, volumeMultiplier: number, playbackRate: number): Promise<void> {
  const context = ensureAudioContext();
  if (!context) return;
  try {
    if (context.state === 'suspended') {
      await context.resume();
    }
    const buffer = await loadBuffer(context, name);
    if (!enabled || isPageHidden()) return;

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.5, Math.min(1.8, playbackRate));
    gain.gain.value = Math.min(1, baseVolume(name) * volumeMultiplier);
    source.connect(gain).connect(context.destination);
    const activeSound = { source, gain };
    activeSounds.add(activeSound);
    source.onended = () => {
      activeSounds.delete(activeSound);
      safeDisconnect(source);
      safeDisconnect(gain);
    };
    source.start();
  } catch {
    // Autoplay policies can reject sound outside a direct user gesture.
  }
}

function loadBuffer(context: AudioContext, name: keyof typeof files): Promise<AudioBuffer> {
  const cached = bufferCache.get(name);
  if (cached) return cached;

  const request = fetch(files[name])
    .then((response) => {
      if (!response.ok) throw new Error(`Audio asset failed: ${files[name]}`);
      return response.arrayBuffer();
    })
    .then((buffer) => context.decodeAudioData(buffer.slice(0)))
    .catch((error: unknown) => {
      bufferCache.delete(name);
      throw error;
    });

  bufferCache.set(name, request);
  return request;
}

function ensureAudioContext(): AudioContext | undefined {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return undefined;

  preferAmbientAudioSession();
  const audioWindow = window as AudioWindow;
  const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextClass) return undefined;

  audioContext = new AudioContextClass();
  return audioContext;
}

function preferAmbientAudioSession(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const session = (navigator as NavigatorWithAudioSession).audioSession;
    if (session) session.type = 'ambient';
  } catch {
    // Some browsers expose audioSession as read-only or not at all.
  }
}

function stopAllAudio(options: { suspend?: boolean } = {}): void {
  pendingTimers.forEach((timer) => window.clearTimeout(timer));
  pendingTimers.clear();
  activeSounds.forEach(({ source, gain }) => {
    try {
      source.stop();
    } catch {
      // The source may already have ended.
    }
    safeDisconnect(source);
    safeDisconnect(gain);
  });
  activeSounds.clear();
  if (options.suspend && audioContext?.state === 'running') {
    void audioContext.suspend().catch(() => undefined);
  }
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

function installLifecycleStop(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopAllAudio({ suspend: true });
  });
  window.addEventListener('pagehide', () => stopAllAudio({ suspend: true }));
  window.addEventListener('freeze', () => stopAllAudio({ suspend: true }));
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function baseVolume(name: keyof typeof files): number {
  switch (name) {
    case 'bomb':
    case 'bombPop':
    case 'cannonBoom':
    case 'rocket':
      return 0.55;
    case 'cardContact':
    case 'cardCut':
      return 0.42;
    case 'reaction':
      return 0.52;
    case 'deal':
      return 0.38;
    default:
      return 0.35;
  }
}

export function vibrateForEffect(kind?: EffectKind): void {
  if (typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  switch (kind) {
    case 'mushroom':
    case 'rocket':
      navigator.vibrate([40, 30, 80]);
      break;
    case 'bomb':
      navigator.vibrate([35, 25, 45]);
      break;
    case 'stamp':
      navigator.vibrate(25);
      break;
    default:
      navigator.vibrate(10);
  }
}

function assetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
