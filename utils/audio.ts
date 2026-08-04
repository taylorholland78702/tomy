import { Platform } from 'react-native';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/**
 * Short synthesized tick for Phase 2's countdown urgency (see updateCountdownTick in
 * GameCanvas.tsx). Web-only via the Web Audio API — no sound asset exists yet for expo-av, so
 * native builds silently no-op here, matching how useTiltGravity already splits web/native.
 *
 * `urgency` in [0,1]: 0 = plenty of time left, 1 = about to expire. Raises pitch and volume
 * slightly so the tick reads as more urgent the closer a ball is to sinking.
 */
export function playCountdownTick(urgency: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    // Browsers gate audio until a user gesture — the first tick before any tap is silently
    // dropped; resume() succeeds once the player has pressed the Air Jet button at least once.
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = 700 + urgency * 500;
  osc.type = 'sine';
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  const peak = 0.05 + urgency * 0.05;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}
