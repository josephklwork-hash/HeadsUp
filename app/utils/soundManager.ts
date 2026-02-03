// Sound effects engine using Web Audio API — no external dependencies
// All sounds are variations of a bass kick/thud

type AudioCtx = AudioContext;

let audioCtx: AudioCtx | null = null;
let muted = false;

/** Initialize or resume AudioContext — must be called from a user gesture */
export function initAudio(): void {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
}

/** Get the current AudioContext, or null if unavailable */
function ctx(): AudioCtx | null {
  if (!audioCtx) return null;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Toggle mute */
export function setMuted(m: boolean): void {
  muted = m;
}

/**
 * Core thud — sine wave pitch-dropping into sub bass.
 * All sounds are built from this.
 */
function thud(
  ac: AudioCtx,
  startFreq: number,
  endFreq: number,
  duration: number,
  volume: number,
  startTime: number,
) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration * 0.6);

  const g = ac.createGain();
  g.gain.setValueAtTime(volume, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(g).connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ── Sound Effects ──────────────────────────────────────────────

/** Card deal — quick light tap thud */
export function playDealCard(): void {
  const ac = ctx();
  if (!ac || muted) return;
  thud(ac, 120, 40, 0.12, 0.35, ac.currentTime);
}

/** Check — the original kick, clean and punchy */
export function playCheck(): void {
  const ac = ctx();
  if (!ac || muted) return;
  thud(ac, 150, 30, 0.25, 0.6, ac.currentTime);
}

/** Call — slightly higher pitch, medium weight */
export function playCall(): void {
  const ac = ctx();
  if (!ac || muted) return;
  thud(ac, 180, 35, 0.2, 0.5, ac.currentTime);
}

/** Bet/Raise — double thud, assertive */
export function playBetRaise(): void {
  const ac = ctx();
  if (!ac || muted) return;
  const t = ac.currentTime;
  thud(ac, 160, 30, 0.18, 0.5, t);
  thud(ac, 200, 40, 0.15, 0.35, t + 0.1);
}

/** Fold — soft low thud, longer decay, subdued */
export function playFold(): void {
  const ac = ctx();
  if (!ac || muted) return;
  thud(ac, 90, 25, 0.3, 0.3, ac.currentTime);
}

/** All-in — deep rumble: three rising thuds stacked */
export function playAllIn(): void {
  const ac = ctx();
  if (!ac || muted) return;
  const t = ac.currentTime;
  thud(ac, 100, 25, 0.35, 0.5, t);
  thud(ac, 140, 30, 0.3, 0.45, t + 0.08);
  thud(ac, 200, 35, 0.25, 0.4, t + 0.16);
}

/** Win — ascending thuds (low → high), triumphant */
export function playWin(): void {
  const ac = ctx();
  if (!ac || muted) return;
  const t = ac.currentTime;
  thud(ac, 120, 30, 0.2, 0.45, t);
  thud(ac, 160, 35, 0.2, 0.45, t + 0.12);
  thud(ac, 220, 45, 0.25, 0.5, t + 0.24);
}

/** Lose — descending thuds (high → low), deflating */
export function playLose(): void {
  const ac = ctx();
  if (!ac || muted) return;
  const t = ac.currentTime;
  thud(ac, 180, 40, 0.2, 0.4, t);
  thud(ac, 100, 20, 0.35, 0.35, t + 0.15);
}
