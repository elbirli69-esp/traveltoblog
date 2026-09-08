"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  DownloadCancelledError,
  downloadBlob,
  type DownloadResult,
} from "@/lib/download-blob";
import {
  REEL_DURATION_OPTIONS,
  reelReadmeText,
  type ReelDurationPreset,
  type ReelManifest,
} from "@/lib/export-reel";
import {
  canEncodeInstagramReel,
  encodeInstagramReelMp4,
  type ReelEncodeProgress,
} from "@/lib/export-reel-encode";
import {
  featuredReelPresetCatalog,
  type ReelPresetId,
} from "@/lib/export/reel-preset-catalog";
import {
  REEL_AUDIO_PRESETS,
  type ReelAudioPresetId,
} from "@/lib/export/reel-audio";
import type { ExportWarning } from "@/lib/export-warnings";
import {
  fetchTravelExportPrefs,
  saveTravelExportPrefs,
} from "@/lib/export-prefs";
import { REEL_STORYBOARD_SEED_MIN_CHARS } from "@/lib/ai-suggest-reel-storyboard";

const REEL_PRESETS = featuredReelPresetCatalog();

function uniqueStoryboardIds(frames: { photoId?: string | null }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const frame of frames) {
    const id = frame.photoId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 8) break;
  }
  return ids;
}

export interface ReelDayOption {
  dayKey: string;
  label: string;
  photoCount: number;
}

type ReelScope = "trip" | "day";

interface ExportReelPanelProps {
  travelId: string;
  travelTitle: string;
  photoCount?: number;
  /** Days that already have selected photos — for mid-trip day Reels. */
  reelDays?: ReelDayOption[];
}

export default function ExportReelPanel({
  travelId,
  travelTitle,
  photoCount = 0,
  reelDays = [],
}: ExportReelPanelProps) {
  const [durationSeconds, setDurationSeconds] = useState<ReelDurationPreset>(30);
  const [presetId, setPresetId] = useState<ReelPresetId>("balanced-story");
  const [scope, setScope] = useState<ReelScope>("trip");
  const [dayKey, setDayKey] = useState<string>(reelDays[0]?.dayKey ?? "");
  const [brief, setBrief] = useState("");
  const [presetSuggestion, setPresetSuggestion] = useState<{
    suggestedPresetId: ReelPresetId;
    label: string;
    tagline: string;
    score: number;
    reasons: string[];
    unmet: string[];
    differsFromUi: boolean;
  } | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [audioPreset, setAudioPreset] = useState<ReelAudioPresetId>("none");
  const [warnings, setWarnings] = useState<ExportWarning[]>([]);
  const [storyboardIds, setStoryboardIds] = useState<string[] | null>(null);
  const [appliedStoryboard, setAppliedStoryboard] = useState<{
    photoIds: string[];
    captions: Record<string, string>;
  } | null>(null);
  const [proposedFrames, setProposedFrames] = useState<Array<{
    photoId: string;
    caption?: string;
    role?: string;
    reason?: string;
  }> | null>(null);
  const [proposing, setProposing] = useState(false);
  const [proposeMeta, setProposeMeta] = useState<string | null>(null);
  const [storyboardSeed, setStoryboardSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReelEncodeProgress | null>(null);

  const selectedDay = useMemo(
    () => reelDays.find((d) => d.dayKey === dayKey) ?? null,
    [reelDays, dayKey]
  );
  const scopedPhotoCount =
    scope === "day" ? (selectedDay?.photoCount ?? 0) : photoCount;
  const canExport = scopedPhotoCount > 0;

  const progressLabel = useMemo(() => {
    if (!progress) return null;
    if (progress.phase === "frames") return progress.message;
    if (progress.phase === "encode") {
      const pct = Math.round((progress.current / Math.max(progress.total, 1)) * 100);
      return `${progress.message} (${pct}%)`;
    }
    return progress.message;
  }, [progress]);

  useEffect(() => {
    if (reelDays.length === 0) {
      setScope("trip");
      setDayKey("");
      return;
    }
    if (!reelDays.some((d) => d.dayKey === dayKey)) {
      setDayKey(reelDays[0]!.dayKey);
    }
  }, [reelDays, dayKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchTravelExportPrefs(travelId).then((prefs) => {
      if (cancelled || !prefs) return;
      if (prefs.exportBrief) setBrief(prefs.exportBrief);
      if (prefs.reelPresetId) {
        setPresetId(prefs.reelPresetId as ReelPresetId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [travelId]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/travels/${travelId}/export-warnings?format=reel`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWarnings(data.warnings ?? []);
      })
      .catch(() => {
        if (!cancelled) setWarnings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [travelId]);

  const persistReelPrefs = useCallback(
    (patch: {
      exportBrief?: string | null;
      reelPresetId?: string | null;
      exportBriefCache?: string | null;
    }) => {
      void saveTravelExportPrefs(travelId, patch);
    },
    [travelId]
  );

  const handleInterpret = async () => {
    setInterpreting(true);
    setError(null);
    try {
      const res = await fetch("/api/export-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          target: "reel",
          durationSeconds,
          photoCount: scopedPhotoCount,
          travelTitle,
          uiReelPreset: presetId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        interpretation?: string | null;
        summary?: string | null;
        message?: string;
        warning?: string | null;
        reelPresetMatch?: {
          suggestedPresetId: ReelPresetId;
          label: string;
          tagline: string;
          score: number;
          reasons: string[];
          unmet: string[];
          differsFromUi: boolean;
        } | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Error al interpretar el brief");
      }
      setInterpretation(data.interpretation ?? data.message ?? null);
      setSummary(data.summary ?? null);
      setPresetSuggestion(data.reelPresetMatch ?? null);
      if (data.warning) setError(data.warning);
      persistReelPrefs({
        exportBrief: brief.trim() || null,
        reelPresetId: presetId,
        exportBriefCache: JSON.stringify({
          target: "reel",
          interpretation: data.interpretation ?? data.message ?? null,
          summary: data.summary ?? null,
          reelPresetMatch: data.reelPresetMatch ?? null,
          at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setInterpreting(false);
    }
  };

  const handleProposeStoryboard = async () => {
    setProposing(true);
    setError(null);
    setProposeMeta(null);
    try {
      if (scope === "day" && !dayKey) {
        throw new Error("Elige un día con fotos antes de proponer el storyboard.");
      }
      const seed = storyboardSeed.trim();
      if (seed.length < REEL_STORYBOARD_SEED_MIN_CHARS) {
        throw new Error(
          `Cuenta qué quieres en el Reel (mín. ${REEL_STORYBOARD_SEED_MIN_CHARS} caracteres); la IA ordena fotos y captions con esa idea.`
        );
      }
      const res = await fetch("/api/ai/suggest-reel-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          durationSeconds,
          userSeed: seed,
          brief: brief.trim() || undefined,
          ...(scope === "day" && dayKey ? { dayKey } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        frames?: Array<{
          photoId: string;
          caption?: string;
          role?: string;
          reason?: string;
        }>;
        interpretation?: string | null;
        fromAi?: boolean;
        cached?: boolean;
        candidateCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "No se pudo proponer el storyboard");
      setProposedFrames(data.frames ?? []);
      const bits: string[] = [];
      if (data.interpretation) bits.push(data.interpretation);
      if (typeof data.candidateCount === "number") {
        bits.push(`${data.candidateCount} candidatas · ${(data.frames ?? []).length} en montaje.`);
      }
      if (data.cached) bits.push("Desde caché.");
      if (data.fromAi === false) bits.push("Orden local (sin IA o fallback).");
      setProposeMeta(bits.join(" ") || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al proponer storyboard");
      setProposedFrames(null);
    } finally {
      setProposing(false);
    }
  };

  const applyProposedStoryboard = () => {
    if (!proposedFrames?.length) return;
    const photoIds = proposedFrames.map((f) => f.photoId);
    const captions: Record<string, string> = {};
    for (const f of proposedFrames) {
      if (f.caption?.trim()) captions[f.photoId] = f.caption.trim();
    }
    setAppliedStoryboard({ photoIds, captions });
    setStoryboardIds(photoIds);
    setProposeMeta(
      `Storyboard aplicado (${photoIds.length} fotos). Se usará al exportar el Reel.`
    );
  };

  const clearAppliedStoryboard = () => {
    setAppliedStoryboard(null);
    setProposedFrames(null);
    setStoryboardIds(null);
    setProposeMeta(null);
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (!appliedStoryboard) setStoryboardIds(null);
    setProgress({ phase: "frames", current: 0, total: 1, message: "Preparando guion…" });

    try {
      if (!(await canEncodeInstagramReel())) {
        throw new Error(
          "Este dispositivo/navegador no puede codificar MP4 H.264. Prueba Chrome o Edge en escritorio, o Chrome en Android."
        );
      }

      if (scope === "day" && !dayKey) {
        throw new Error("Elige un día con fotos para generar el Reel.");
      }

      const res = await fetch("/api/export-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          durationSeconds,
          brief: brief.trim() || undefined,
          presetId,
          audioPreset,
          ...(scope === "day" && dayKey ? { dayKey } : {}),
          ...(appliedStoryboard
            ? {
                storyboardPhotoIds: appliedStoryboard.photoIds,
                captionOverrides: appliedStoryboard.captions,
              }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ReelManifest & {
        error?: string;
        briefWarning?: string | null;
        briefFromAi?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Error al preparar el reel");
      }

      if (data.briefInterpretation) {
        setInterpretation(data.briefInterpretation);
      }
      if (data.briefWarning) {
        setError(data.briefWarning);
      }

      const thumbs = uniqueStoryboardIds(data.frames ?? []);
      if (!appliedStoryboard) {
        setStoryboardIds(thumbs.length > 0 ? thumbs : null);
      }
      setProgress({
        phase: "frames",
        current: 0,
        total: 1,
        message: "Vista previa del montaje — codificando MP4…",
      });

      const { mp4, cover } = await encodeInstagramReelMp4(data, setProgress);

      setProgress({
        phase: "zip",
        current: 1,
        total: 1,
        message: "Empaquetando ZIP…",
      });

      const zip = new JSZip();
      zip.file("instagram-reel.mp4", mp4);
      zip.file("cover.jpg", cover);
      zip.file("LEEME-INSTAGRAM.txt", reelReadmeText(data));

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const safeTitle = travelTitle
        .replace(/[^\w\u00C0-\u024f\- ]+/gi, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40);
      const daySuffix =
        scope === "day" && (data.scopeDayKey || dayKey)
          ? `-${data.scopeDayKey || dayKey}`
          : "";
      const audioSuffix = audioPreset !== "none" ? "-audio" : "";
      const filename = `reel-instagram-${safeTitle || travelId}${daySuffix}-${durationSeconds}s${audioSuffix}.zip`;

      const result: DownloadResult = await downloadBlob(zipBlob, filename);
      const sizeMb = (zipBlob.size / (1024 * 1024)).toFixed(1);
      const scopeNote =
        scope === "day" && selectedDay
          ? ` Día: ${selectedDay.label}.`
          : " Viaje completo.";
      const briefNote = data.briefInterpretation
        ? ` Brief: ${data.briefInterpretation}`
        : "";
      if (result === "saved") {
        setSuccess(
          `ZIP guardado (~${sizeMb} MB): incluye instagram-reel.mp4 listo para subir a Reels.${scopeNote}${briefNote}`
        );
      } else if (result === "shared") {
        setSuccess(
          `Elige dónde guardar el ZIP (~${sizeMb} MB) en el menú Compartir.${scopeNote}${briefNote}`
        );
      } else {
        setSuccess(
          `ZIP listo (~${sizeMb} MB). Usa Compartir/guardar para descargarlo.${scopeNote}${briefNote}`
        );
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) return;
      setError(err instanceof Error ? err.message : "Error al generar el reel");
    } finally {
      setLoading(false);
      setProgress(null);
      if (!appliedStoryboard) setStoryboardIds(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-secondary">
        Genera un MP4 vertical 1080×1920 (9:16, H.264) pensado para publicarlo directamente como{" "}
        <span className="font-medium text-fg">Reel de Instagram</span>. Puedes montar el viaje
        entero o solo un día (útil mientras el viaje sigue). Audio tipado opcional (cama
        sintética) o silencio — en Instagram siempre puedes sustituir la música. ZIP aparte del
        HTML.
      </p>

      {photoCount > 0 && (
        <p className="text-xs text-fg-secondary">
          {scope === "day"
            ? selectedDay
              ? `${selectedDay.photoCount} foto${selectedDay.photoCount === 1 ? "" : "s"} seleccionada${selectedDay.photoCount === 1 ? "" : "s"} ese día.`
              : "Elige un día con fotos."
            : `Usa hasta ${photoCount} fotos seleccionadas (reparte por días; omite ida/vuelta si hay alternativas).`}
        </p>
      )}

      <fieldset className="space-y-2" disabled={loading}>
        <legend className="mb-2 text-sm font-medium text-accent-cyan">Ámbito del Reel</legend>
        <label
          className={`option-radio ${scope === "trip" ? "option-radio-active" : ""}`}
        >
          <input
            type="radio"
            name="reel-scope"
            value="trip"
            checked={scope === "trip"}
            onChange={() => setScope("trip")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Todo el viaje</span>
            <span className="block text-xs text-fg-secondary">
              Resumen con fotos de varios días
            </span>
          </span>
        </label>
        <label
          className={`option-radio ${scope === "day" ? "option-radio-active" : ""} ${
            reelDays.length === 0 ? "opacity-50" : ""
          }`}
        >
          <input
            type="radio"
            name="reel-scope"
            value="day"
            checked={scope === "day"}
            disabled={reelDays.length === 0}
            onChange={() => setScope("day")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Un día</span>
            <span className="block text-xs text-fg-secondary">
              {reelDays.length === 0
                ? "Aún no hay días con fotos seleccionadas"
                : "Ideal para publicar en Instagram durante el viaje"}
            </span>
          </span>
        </label>
        {scope === "day" && reelDays.length > 0 && (
          <label className="mt-2 block text-sm text-fg">
            <span className="mb-1 block text-xs font-medium text-fg-secondary">Día</span>
            <select
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent-cyan focus:outline-none"
            >
              {reelDays.map((day) => (
                <option key={day.dayKey} value={day.dayKey}>
                  {day.label} · {day.photoCount} foto{day.photoCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-2" disabled={loading}>
        <legend className="mb-2 text-sm font-medium text-accent-cyan">Duración del Reel</legend>
        {REEL_DURATION_OPTIONS.map((option) => {
          const selected = durationSeconds === option.seconds;
          return (
            <label
              key={option.seconds}
              className={`option-radio ${selected ? "option-radio-active" : ""}`}
            >
              <input
                type="radio"
                name="reel-duration"
                value={option.seconds}
                checked={selected}
                onChange={() => setDurationSeconds(option.seconds)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">{option.label}</span>
                <span className="block text-xs text-fg-secondary">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="space-y-2" disabled={loading}>
        <legend className="mb-2 text-sm font-medium text-accent-cyan">
          Estilo de montaje
        </legend>
        <p className="text-xs text-fg-secondary">
          Misma estructura vertical; cambia ritmo, textos y cortes. La duración de arriba siempre manda.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {REEL_PRESETS.map((preset) => {
            const selected = presetId === preset.id;
            return (
              <label
                key={preset.id}
                className={`option-radio ${selected ? "option-radio-active" : ""}`}
              >
                <input
                  type="radio"
                  name="reel-preset"
                  value={preset.id}
                  checked={selected}
                  onChange={() => {
                    setPresetId(preset.id);
                    setPresetSuggestion(null);
                    persistReelPrefs({ reelPresetId: preset.id, exportBrief: brief.trim() || null });
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-fg">{preset.label}</span>
                  <span className="block text-xs text-fg-secondary">{preset.tagline}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={loading}>
        <legend className="mb-2 text-sm font-medium text-accent-cyan">
          Audio (opcional)
        </legend>
        <p className="text-xs text-fg-secondary">
          Presets tipados sintetizados (sin subir MP3). Por defecto silencio; Instagram puede
          añadir la banda sonora.
        </p>
        {REEL_AUDIO_PRESETS.map((preset) => {
          const selected = audioPreset === preset.id;
          return (
            <label
              key={preset.id}
              className={`option-radio ${selected ? "option-radio-active" : ""}`}
            >
              <input
                type="radio"
                name="reel-audio"
                value={preset.id}
                checked={selected}
                onChange={() => setAudioPreset(preset.id)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">{preset.label}</span>
                <span className="block text-xs text-fg-secondary">{preset.tagline}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="reel-export-brief" className="block text-sm font-medium text-accent-cyan">
          Indicaciones para este Reel (opcional)
        </label>
        <textarea
          id="reel-export-brief"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setInterpretation(null);
            setSummary(null);
            setPresetSuggestion(null);
          }}
          disabled={loading || interpreting}
          rows={3}
          placeholder="Ej.: pocas fotos tranquilas, casi sin texto; o ritmo rápido con textos cortos sobre las imágenes…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-secondary/70 focus:border-accent-cyan focus:outline-none"
        />
        <p className="text-xs text-fg-secondary">
          Texto libre: aterrizamos ritmo, nº de fotos, textos y fundidos a knobs del Reel, y
          sugerimos un preset de montaje. La duración UI manda; el preset no se cambia solo —
          usa «Aplicar sugerencia».
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleInterpret()}
            disabled={loading || interpreting || !brief.trim()}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {interpreting ? "Interpretando…" : "Interpretar brief"}
          </button>
        </div>
        {(interpretation || summary) && (
          <p className="callout text-sm text-fg">
            {interpretation}
            {summary ? (
              <span className="mt-1 block text-xs text-fg-secondary">{summary}</span>
            ) : null}
          </p>
        )}

        {presetSuggestion && (
          <div className="callout callout-info space-y-2 text-sm">
            <p className="font-semibold text-fg">
              Sugerencia: {presetSuggestion.label}
              {presetSuggestion.differsFromUi ? "" : " (ya elegido)"}
              <span className="ml-1 font-normal text-fg-secondary">
                · score {Math.round(presetSuggestion.score * 100)}%
              </span>
            </p>
            {presetSuggestion.tagline ? (
              <p className="text-xs text-fg-secondary">{presetSuggestion.tagline}</p>
            ) : null}
            {presetSuggestion.reasons.length > 0 && (
              <p className="text-xs text-fg-secondary">
                {presetSuggestion.reasons.join(" · ")}
              </p>
            )}
            {presetSuggestion.unmet.length > 0 && (
              <p className="text-xs text-fg-secondary">
                No aplica: {presetSuggestion.unmet.join("; ")}
              </p>
            )}
            {presetSuggestion.differsFromUi && (
              <button
                type="button"
                onClick={() => {
                  setPresetId(presetSuggestion.suggestedPresetId);
                  setPresetSuggestion({
                    ...presetSuggestion,
                    differsFromUi: false,
                  });
                }}
                disabled={loading}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Aplicar sugerencia
              </button>
            )}
          </div>
        )}

      </div>

      {warnings.length > 0 && (
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={`callout text-sm ${
                w.level === "warning" ? "callout-warning" : "callout-success"
              }`}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-fg-secondary">
            Completar storyboard con IA
          </p>
          <p className="text-[11px] text-fg-tertiary">
            Tú cuentas · blog + lugares · no exporta solo
          </p>
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium text-fg-secondary"
            htmlFor="reel-storyboard-seed"
          >
            Qué quieres contar en este Reel
          </label>
          <textarea
            id="reel-storyboard-seed"
            value={storyboardSeed}
            onChange={(e) => setStoryboardSeed(e.target.value)}
            rows={2}
            placeholder="Ej. Ritmo rápido: salida, callejeo, comida y atardecer"
            className="form-input input-focus text-sm"
            disabled={proposing || loading}
          />
          <p className="mt-1 text-[11px] text-fg-tertiary">
            Mínimo {REEL_STORYBOARD_SEED_MIN_CHARS} caracteres. La IA ordena
            candidatas y captions con gancho de blog (historia/costumbres del
            lugar) — sin inventar la escena de la foto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleProposeStoryboard()}
            disabled={
              proposing ||
              loading ||
              !canExport ||
              storyboardSeed.trim().length < REEL_STORYBOARD_SEED_MIN_CHARS
            }
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {proposing ? "Completando…" : "Completar con IA"}
          </button>
          {proposedFrames && proposedFrames.length > 0 && (
            <button
              type="button"
              onClick={applyProposedStoryboard}
              disabled={loading}
              className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Aplicar al export
            </button>
          )}
          {(appliedStoryboard || proposedFrames) && (
            <button
              type="button"
              onClick={clearAppliedStoryboard}
              disabled={loading}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
        {proposeMeta && <p className="text-xs text-fg-tertiary">{proposeMeta}</p>}
        {appliedStoryboard && (
          <p className="text-xs text-accent-mint">
            Activo: {appliedStoryboard.photoIds.length} fotos
            {Object.keys(appliedStoryboard.captions).length > 0
              ? ` · ${Object.keys(appliedStoryboard.captions).length} captions`
              : ""}
          </p>
        )}
        {proposedFrames && proposedFrames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {proposedFrames.map((frame) => (
              <div key={frame.photoId} className="w-16 shrink-0 space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${frame.photoId}/reel-frame`}
                  alt=""
                  className="h-20 w-12 rounded object-cover"
                />
                {frame.caption ? (
                  <p className="line-clamp-2 text-[10px] text-fg-tertiary">
                    {frame.caption}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={loading || !canExport}
        className="btn-primary w-full py-3 text-sm disabled:opacity-50"
      >
        {loading
          ? "Generando Reel…"
          : scope === "day"
            ? "Descargar ZIP del Reel (este día)"
            : "Descargar ZIP del Reel (Instagram)"}
      </button>

      {storyboardIds && storyboardIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-fg-secondary">
            Vista previa del montaje (sin codificar aún)
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {storyboardIds.map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={id}
                src={`/api/photos/${id}/reel-frame`}
                alt=""
                className="h-20 w-12 shrink-0 rounded object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {loading && progressLabel && (
        <p className="progress-panel text-sm progress-step-active">{progressLabel}</p>
      )}

      {!canExport && (
        <p className="text-sm text-fg-secondary">
          {scope === "day"
            ? "Ese día no tiene fotos seleccionadas. Elige otro día o marca fotos en el viaje."
            : "Selecciona al menos una foto en el viaje para poder generar el Reel."}
        </p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && !loading && <p className="callout callout-success text-sm">{success}</p>}
    </div>
  );
}
