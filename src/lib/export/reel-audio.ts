/**
 * Typed Reel audio presets — synthesized beds only (no free MP3 upload).
 */

export type ReelAudioPresetId = "none" | "soft-pulse" | "travel-beat";

export interface ReelAudioPreset {
  id: ReelAudioPresetId;
  label: string;
  tagline: string;
  /** Beats per minute used to snap clip cuts when not none. */
  bpm: number | null;
  /** Peak gain 0–1 for the synthesized bed. */
  gain: number;
}

export const REEL_AUDIO_PRESETS: ReelAudioPreset[] = [
  {
    id: "none",
    label: "Sin audio",
    tagline: "Mute — añade música en Instagram",
    bpm: null,
    gain: 0,
  },
  {
    id: "soft-pulse",
    label: "Pulso suave",
    tagline: "Cama sintética ~72 BPM, baja",
    bpm: 72,
    gain: 0.18,
  },
  {
    id: "travel-beat",
    label: "Ritmo viaje",
    tagline: "Cama sintética ~96 BPM, un poco más marcada",
    bpm: 96,
    gain: 0.22,
  },
];

export function getReelAudioPreset(id: unknown): ReelAudioPreset {
  const found = REEL_AUDIO_PRESETS.find((p) => p.id === id);
  return found ?? REEL_AUDIO_PRESETS[0]!;
}

export function parseReelAudioPresetId(raw: unknown): ReelAudioPresetId {
  if (raw === "soft-pulse" || raw === "travel-beat" || raw === "none") return raw;
  return "none";
}

/**
 * Build a looping soft pulse / travel beat AudioBuffer for the reel duration.
 * Pure synthesis — no external files.
 */
export function synthesizeReelAudioBuffer(
  presetId: ReelAudioPresetId,
  durationSeconds: number
): AudioBuffer | null {
  const preset = getReelAudioPreset(presetId);
  if (!preset.bpm || typeof AudioContext === "undefined") return null;

  const sampleRate = 44100;
  const length = Math.max(1, Math.ceil(sampleRate * Math.max(durationSeconds, 1)));
  const ctx = new AudioContext({ sampleRate });
  const buffer = ctx.createBuffer(2, length, sampleRate);
  void ctx.close();

  const bpm = preset.bpm;
  const beatSec = 60 / bpm;
  const gain = preset.gain;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const phase = (t % beatSec) / beatSec;
    // Soft percussive envelope every beat + quiet sub tone.
    const hit = Math.exp(-phase * (presetId === "travel-beat" ? 14 : 10));
    const tone =
      Math.sin(2 * Math.PI * (presetId === "travel-beat" ? 110 : 88) * t) * 0.35 +
      Math.sin(2 * Math.PI * (presetId === "travel-beat" ? 220 : 176) * t) * 0.15;
    const click = Math.sin(2 * Math.PI * 880 * t) * hit * 0.55;
    const sample = (tone * (0.25 + hit * 0.75) + click) * gain;
    left[i] = sample;
    right[i] = sample * 0.92;
  }

  return buffer;
}

/** Snap a clip duration to the nearest beat grid (keeps min hold). */
export function snapDurationToBpm(
  seconds: number,
  bpm: number,
  minSeconds = 1.1
): number {
  const beat = 60 / bpm;
  const units = Math.max(1, Math.round(seconds / beat));
  return Math.max(minSeconds, units * beat);
}
