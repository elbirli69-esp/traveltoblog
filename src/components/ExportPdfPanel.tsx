"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DownloadCancelledError,
  downloadFromBase64,
  type DownloadResult,
} from "@/lib/download-blob";
import {
  PDF_PROGRESS_STEPS,
  PDF_STEP_LABELS,
  type PdfPipelineEvent,
  type PdfPipelineStep,
} from "@/lib/export-pdf-pipeline";
import type { PdfPageFormat, PdfTemplate } from "@/lib/export-pdf-types";
import { PDF_TEMPLATES } from "@/lib/export-pdf-types";
import {
  featuredPdfPresetCatalog,
  type PdfPresetId,
} from "@/lib/export/pdf-preset-catalog";

const PDF_PRESETS = featuredPdfPresetCatalog();

const FORMATS: { id: PdfPageFormat; name: string; description: string }[] = [
  {
    id: "a4-landscape",
    name: "A4 Horizontal",
    description: "297 × 210 mm — ideal para álbumes panorámicos (Saal Digital, CEWE).",
  },
  {
    id: "square",
    name: "Cuadrado 21×21 cm",
    description: "210 × 210 mm — formato cuadrado tipo fotolibro.",
  },
];

export interface PdfCoverPhotoOption {
  id: string;
  thumbUrl: string;
  highlightScore?: number;
}

interface ExportPdfPanelProps {
  travelId: string;
  hasJournal?: boolean;
  photoCount?: number;
  coverPhotos?: PdfCoverPhotoOption[];
}

export default function ExportPdfPanel({
  travelId,
  hasJournal = false,
  photoCount = 0,
  coverPhotos = [],
}: ExportPdfPanelProps) {
  const [format, setFormat] = useState<PdfPageFormat>("a4-landscape");
  const [template, setTemplate] = useState<PdfTemplate>("classic");
  const [presetId, setPresetId] = useState<PdfPresetId>("pdf-classic");
  const [brief, setBrief] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [presetSuggestion, setPresetSuggestion] = useState<{
    suggestedPresetId: PdfPresetId;
    label: string;
    tagline: string;
    score: number;
    reasons: string[];
    unmet: string[];
    differsFromUi: boolean;
  } | null>(null);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfAvailable, setPdfAvailable] = useState<boolean | null>(null);
  const [currentStep, setCurrentStep] = useState<PdfPipelineStep | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<PdfPipelineStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/export-pdf")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { available?: boolean } | null) => {
        if (!cancelled) setPdfAvailable(data?.available ?? false);
      })
      .catch(() => {
        if (!cancelled) setPdfAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInterpret = async () => {
    setInterpreting(true);
    setError(null);
    try {
      const res = await fetch("/api/export-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          target: "pdf",
          hasJournal,
          photoCount,
          uiPdfPreset: presetId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        interpretation?: string | null;
        summary?: string | null;
        message?: string;
        warning?: string | null;
        pdfPresetMatch?: {
          suggestedPresetId: PdfPresetId;
          label: string;
          tagline: string;
          score: number;
          reasons: string[];
          unmet: string[];
          differsFromUi: boolean;
          theme?: PdfTemplate;
        } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Error al interpretar el brief");
      setInterpretation(data.interpretation ?? data.message ?? null);
      setSummary(data.summary ?? null);
      setPresetSuggestion(data.pdfPresetMatch ?? null);
      if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setInterpreting(false);
    }
  };

  const handleExport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setCurrentStep(null);
    setStepMessage(null);
    setCompletedSteps([]);

    try {
      const res = await fetch("/api/export-pdf?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          format,
          template,
          coverPhotoId,
          presetId,
          brief: brief.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al generar PDF");
      }

      if (!res.body) throw new Error("Sin respuesta del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handleEvent = async (event: PdfPipelineEvent) => {
        if (event.step === "error") {
          throw new Error(event.message ?? "Error al generar PDF");
        }

        if (event.status === "running" && event.step !== "complete") {
          setCurrentStep(event.step as PdfPipelineStep);
          setStepMessage(event.message ?? null);
        }

        if (event.status === "done" && event.step !== "complete") {
          setCompletedSteps((prev) => {
            const step = event.step as PdfPipelineStep;
            return prev.includes(step) ? prev : [...prev, step];
          });
        }

        if (event.step === "complete" && event.status === "done" && event.blobBase64) {
          const filename = event.filename ?? "album-imprenta.pdf";
          const result: DownloadResult = await downloadFromBase64(
            event.blobBase64,
            filename,
            event.contentType ?? "application/pdf"
          );
          if (result === "saved") {
            setSuccess("PDF guardado en Descargas/TravelToBlog.");
          } else if (result === "shared") {
            setSuccess("Elige dónde guardar el PDF en el menú Compartir.");
          } else {
            setSuccess("Se abrió la vista previa del PDF. Usa Compartir para guardarlo.");
          }
          finished = true;
          setCompletedSteps(PDF_PROGRESS_STEPS);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          await handleEvent(JSON.parse(line) as PdfPipelineEvent);
        }

        if (done) {
          if (buffer.trim()) {
            await handleEvent(JSON.parse(buffer) as PdfPipelineEvent);
          }
          break;
        }
      }

      if (!finished) {
        throw new Error("La exportación no devolvió un PDF");
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) return;
      setError(err instanceof Error ? err.message : "Error al generar PDF");
    } finally {
      setLoading(false);
      setCurrentStep(null);
      setStepMessage(null);
    }
  }, [brief, coverPhotoId, format, presetId, template, travelId]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Formato de página</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              disabled={loading}
              className={`rounded-xl border-2 p-4 text-left transition ${
                format === f.id
                  ? "select-card-violet-active"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              <p className="font-medium text-fg">{f.name}</p>
              <p className="mt-1 text-sm text-fg-secondary">{f.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Look del álbum</h3>
        <p className="mb-3 text-xs text-fg-secondary">
          Misma tubería de impresión; cambia tema, tipografía tipada y knobs de maquetación (full-bleed, mosaicos, prosa).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PDF_PRESETS.map((preset) => {
            const selected = presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setPresetId(preset.id);
                  setTemplate(preset.theme);
                  setPresetSuggestion(null);
                }}
                disabled={loading || interpreting}
                className={`rounded-xl border-2 p-3 text-left transition ${
                  selected
                    ? "select-card-violet-active"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <p className="font-medium text-fg">{preset.label}</p>
                <p className="mt-1 text-xs text-fg-secondary">{preset.tagline}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="pdf-export-brief" className="block text-sm font-semibold text-fg-secondary">
          Indicaciones para este PDF (opcional)
        </label>
        <textarea
          id="pdf-export-brief"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setInterpretation(null);
            setSummary(null);
            setPresetSuggestion(null);
          }}
          disabled={loading || interpreting}
          rows={3}
          placeholder="Ej.: poca prosa, fotos a sangre y mosaicos; o guía con más crónica…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-secondary/70 focus:border-accent-cyan focus:outline-none"
        />
        <p className="text-xs text-fg-secondary">
          Texto libre → knobs tipados (énfasis foto, prosa, full-bleed, mosaico) y sugerencia de look.
          El preset UI manda hasta que pulses «Aplicar sugerencia».
        </p>
        <button
          type="button"
          onClick={() => void handleInterpret()}
          disabled={loading || interpreting || !brief.trim()}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {interpreting ? "Interpretando…" : "Interpretar brief"}
        </button>
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
                  const entry = PDF_PRESETS.find(
                    (p) => p.id === presetSuggestion.suggestedPresetId
                  );
                  if (entry) setTemplate(entry.theme);
                  setPresetSuggestion({
                    ...presetSuggestion,
                    differsFromUi: false,
                  });
                }}
                disabled={loading || interpreting}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Aplicar sugerencia
              </button>
            )}
          </div>
        )}
      </div>

<h3 className="mb-2 text-sm font-semibold text-fg-secondary">Plantilla</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {PDF_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              disabled={loading}
              className={`rounded-xl border-2 p-3 text-left transition ${
                template === t.id
                  ? "select-card-violet-active"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              <p className="font-medium text-fg">{t.name}</p>
              <p className="mt-1 text-xs text-fg-secondary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {coverPhotos.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-fg-secondary">
            Foto de portada
            <span className="ml-2 font-normal text-fg-muted">(opcional)</span>
          </h3>
          <p className="mb-3 text-xs text-fg-secondary">
            Si no eliges ninguna, se usará la foto con mayor puntuación de destacado.
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <button
              type="button"
              onClick={() => setCoverPhotoId(null)}
              disabled={loading}
              className={`flex aspect-square items-center justify-center rounded-lg border-2 text-xs ${
                coverPhotoId === null
                  ? "select-card-violet-active"
                  : "border-[var(--border)] text-fg-secondary"
              }`}
            >
              Auto
            </button>
            {coverPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setCoverPhotoId(photo.id)}
                disabled={loading}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                  coverPhotoId === photo.id
                    ? "select-card-violet-active"
                    : "border-[var(--border)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-1 text-sm text-fg-secondary">
        <li>📖 Portada personalizable y página de mapa con ruta GPS</li>
        <li>📅 Mosaicos (3–4 fotos) en días con muchas imágenes</li>
        <li>🖨️ Sangrado 3 mm y alta resolución en páginas a sangre</li>
      </ul>

      {!hasJournal && (
        <p className="callout callout-warning text-sm">
          Sin crónica IA: el álbum usará texto mínimo y las fotos del viaje.
        </p>
      )}

      {photoCount === 0 && (
        <p className="callout callout-error text-sm">
          Necesitas al menos una foto seleccionada para generar el álbum.
        </p>
      )}

      {pdfAvailable === false && (
        <p className="callout callout-error text-sm">
          WeasyPrint no está disponible en el servidor. Tras desplegar con{" "}
          <code className="text-xs">Dockerfile.bookworm</code> (incluido en docker-compose), vuelve a
          generar el contenedor en el NAS.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={loading || photoCount === 0 || pdfAvailable === false}
        className="btn-pdf disabled:opacity-50"
      >
        {loading ? "Generando PDF para imprenta…" : "🖨️ Descargar Álbum para Imprenta (PDF)"}
      </button>

      {loading && (
        <ul className="progress-panel space-y-1.5">
          {PDF_PROGRESS_STEPS.map((key) => {
            const done = completedSteps.includes(key);
            const active = currentStep === key;
            return (
              <li
                key={key}
                className={`flex items-center gap-2 ${
                  done
                    ? "progress-step-done"
                    : active
                      ? "progress-step-active"
                      : "progress-step-pending"
                }`}
              >
                <span>{done ? "✓" : active ? "…" : "○"}</span>
                {PDF_STEP_LABELS[key]}
              </li>
            );
          })}
          {stepMessage && (
            <li className="progress-step-active font-medium">{stepMessage}</li>
          )}
        </ul>
      )}

      {success && <p className="callout callout-success text-sm">{success}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
