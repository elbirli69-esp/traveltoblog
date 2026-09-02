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
  }, [coverPhotoId, format, template, travelId]);

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
