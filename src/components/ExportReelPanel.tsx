"use client";

import { useMemo, useState } from "react";
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

interface ExportReelPanelProps {
  travelId: string;
  travelTitle: string;
  photoCount?: number;
}

export default function ExportReelPanel({
  travelId,
  travelTitle,
  photoCount = 0,
}: ExportReelPanelProps) {
  const [durationSeconds, setDurationSeconds] = useState<ReelDurationPreset>(30);
  const [brief, setBrief] = useState("");
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReelEncodeProgress | null>(null);

  const progressLabel = useMemo(() => {
    if (!progress) return null;
    if (progress.phase === "frames") return progress.message;
    if (progress.phase === "encode") {
      const pct = Math.round((progress.current / Math.max(progress.total, 1)) * 100);
      return `${progress.message} (${pct}%)`;
    }
    return progress.message;
  }, [progress]);

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
          photoCount,
          travelTitle,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        interpretation?: string | null;
        summary?: string | null;
        message?: string;
        warning?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Error al interpretar el brief");
      }
      setInterpretation(data.interpretation ?? data.message ?? null);
      setSummary(data.summary ?? null);
      if (data.warning) {
        setError(data.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setInterpreting(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setProgress({ phase: "frames", current: 0, total: 1, message: "Preparando guion…" });

    try {
      if (!(await canEncodeInstagramReel())) {
        throw new Error(
          "Este dispositivo/navegador no puede codificar MP4 H.264. Prueba Chrome o Edge en escritorio, o Chrome en Android."
        );
      }

      const res = await fetch("/api/export-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          durationSeconds,
          brief: brief.trim() || undefined,
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
        .slice(0, 48);
      const filename = `reel-instagram-${safeTitle || travelId}-${durationSeconds}s.zip`;

      const result: DownloadResult = await downloadBlob(zipBlob, filename);
      const sizeMb = (zipBlob.size / (1024 * 1024)).toFixed(1);
      const briefNote = data.briefInterpretation
        ? ` Brief: ${data.briefInterpretation}`
        : "";
      if (result === "saved") {
        setSuccess(
          `ZIP guardado (~${sizeMb} MB): incluye instagram-reel.mp4 listo para subir a Reels.${briefNote}`
        );
      } else if (result === "shared") {
        setSuccess(
          `Elige dónde guardar el ZIP (~${sizeMb} MB) en el menú Compartir.${briefNote}`
        );
      } else {
        setSuccess(
          `ZIP listo (~${sizeMb} MB). Usa Compartir/guardar para descargarlo.${briefNote}`
        );
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) return;
      setError(err instanceof Error ? err.message : "Error al generar el reel");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-secondary">
        Genera un MP4 vertical 1080×1920 (9:16, H.264, sin audio) pensado para publicarlo
        directamente como <span className="font-medium text-fg">Reel de Instagram</span>.
        Alterna clips con descripción tipográfica (cita / tarjeta / acento), pin de lugar, mapa
        con pin activo y fotos limpias, con transiciones variadas. ZIP aparte del HTML; la música
        se añade en Instagram.
      </p>

      {photoCount > 0 && (
        <p className="text-xs text-fg-secondary">
          Usa hasta {photoCount} fotos seleccionadas (reparte por días; omite ida/vuelta si hay
          alternativas).
        </p>
      )}

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
          }}
          disabled={loading || interpreting}
          rows={3}
          placeholder="Ej.: pocas fotos tranquilas, casi sin texto; o ritmo rápido con textos cortos sobre las imágenes…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-secondary/70 focus:border-accent-cyan focus:outline-none"
        />
        <p className="text-xs text-fg-secondary">
          Texto libre: aterrizamos lo que pidas (ritmo, nº de fotos, textos, fundidos…) a los
          knobs del Reel. La duración de arriba manda si hay conflicto.
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
      </div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={loading || photoCount === 0}
        className="btn-primary w-full py-3 text-sm disabled:opacity-50"
      >
        {loading ? "Generando Reel…" : "Descargar ZIP del Reel (Instagram)"}
      </button>

      {loading && progressLabel && (
        <p className="progress-panel text-sm progress-step-active">{progressLabel}</p>
      )}

      {photoCount === 0 && (
        <p className="text-sm text-fg-secondary">
          Selecciona al menos una foto en el viaje para poder generar el Reel.
        </p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && !loading && <p className="callout callout-success text-sm">{success}</p>}
    </div>
  );
}
