"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TravelType } from "@prisma/client";
import type { ExportPipelineEvent, ExportPipelineStep } from "@/lib/export-pipeline";
import type { ExportWarning } from "@/lib/export-warnings";
import {
  DownloadCancelledError,
  downloadFromBase64,
  openBlobPreview,
  type DownloadResult,
} from "@/lib/download-blob";
import { isCapacitorNative } from "@/lib/capacitor-native";

export type ExportTemplateId = "magazine" | "visual-journey" | "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "zip" | "html";
export type ExportTypologyId = TravelType | "auto";

const STEP_LABELS: Record<ExportPipelineStep, string> = {
  load: "Cargando viaje",
  exif: "Ubicación de fotos",
  photos: "Preparando fotos",
  html: "Generando HTML",
  map: "Mapa interactivo",
  pack: "Optimizando fotos",
  embed: "HTML único embebido",
  complete: "Listo",
};

const ZIP_STEPS: ExportPipelineStep[] = ["load", "exif", "photos", "html", "map", "pack"];
const HTML_STEPS: ExportPipelineStep[] = [...ZIP_STEPS, "embed"];

const TEMPLATE_PREVIEW: Record<ExportTemplateId, string> = {
  magazine: "template-preview template-preview-magazine",
  "visual-journey": "template-preview template-preview-visual-journey",
  "editorial-clean": "template-preview template-preview-editorial-clean",
  "dark-photo-journey": "template-preview template-preview-dark-photo",
};

const TEMPLATES: {
  id: ExportTemplateId;
  name: string;
  description: string;
}[] = [
  {
    id: "magazine",
    name: "Magazine",
    description:
      "Estilo blog experto: hero con subtítulo, recorrido cronológico, guía práctica, TOC y meta para compartir.",
  },
  {
    id: "visual-journey",
    name: "Visual Journey",
    description:
      "Hero con foto de portada, recorrido cronológico visual, galería, lightbox y animaciones.",
  },
  {
    id: "editorial-clean",
    name: "Editorial Clean",
    description: "Estilo revista clásica: fondo claro, tipografía serif y acentos teal.",
  },
  {
    id: "dark-photo-journey",
    name: "Dark Photo Journey",
    description: "Tema oscuro cinematográfico con fotos destacadas.",
  },
];

interface TypologyOption {
  id: ExportTypologyId;
  label: string;
  description: string;
}

interface ExportHtmlPanelProps {
  travelId: string;
  hasJournal?: boolean;
  hasGpsPhotos?: boolean;
}

function blobFromBase64(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

export default function ExportHtmlPanel({
  travelId,
  hasJournal = false,
  hasGpsPhotos = false,
}: ExportHtmlPanelProps) {
  const [template, setTemplate] = useState<ExportTemplateId>("magazine");
  const [typology, setTypology] = useState<ExportTypologyId>("auto");
  const [typologies, setTypologies] = useState<TypologyOption[]>([]);
  const [suggestion, setSuggestion] = useState<{ type: TravelType; reason: string } | null>(
    null
  );
  const [includeGpsTrail, setIncludeGpsTrail] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("zip");
  const [brief, setBrief] = useState("");
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ExportWarning[]>([]);
  const [currentStep, setCurrentStep] = useState<ExportPipelineStep | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<ExportPipelineStep[]>([]);

  const busy = loading || previewing || interpreting;
  const progressSteps = useMemo(
    () => (previewing || format === "html" ? HTML_STEPS : ZIP_STEPS),
    [format, previewing]
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
          target: "html",
          hasJournal,
          travelTitle: undefined,
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
      if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setInterpreting(false);
    }
  };

  useEffect(() => {
    void fetch(`/api/travels/${travelId}/suggest-type`)
      .then((r) => r.json())
      .then((data) => {
        const list: TypologyOption[] = [
          { id: "auto", label: "Auto (sugerir)", description: "Detecta el tipo según tus datos" },
          ...(data.typologies ?? []).map((t: { id: TravelType; label: string; description: string }) => ({
            id: t.id as ExportTypologyId,
            label: t.label,
            description: t.description,
          })),
        ];
        setTypologies(list);
        if (data.suggestion) {
          setSuggestion({ type: data.suggestion.type, reason: data.suggestion.reason });
        }
        if (data.travelType) setTypology(data.travelType);
      })
      .catch(() => {});
  }, [travelId]);

  useEffect(() => {
    void fetch(`/api/travels/${travelId}/export-warnings`)
      .then((r) => r.json())
      .then((data) => setWarnings(data.warnings ?? []))
      .catch(() => setWarnings([]));
  }, [travelId]);

  const runExport = useCallback(
    async (mode: "download" | "preview") => {
      const isPreview = mode === "preview";
      if (isPreview) {
        setPreviewing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setSuccess(null);
      setCurrentStep(null);
      setStepMessage(null);
      setCompletedSteps([]);

      const exportFormat: ExportFormat = isPreview ? "html" : format;

      try {
        if (typology !== "auto") {
          await fetch(`/api/travels/${travelId}/travel-type`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ travelType: typology }),
          });
        }

        const res = await fetch("/api/export-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            travelId,
            template,
            typology,
            format: exportFormat,
            includeGpsTrail,
            stream: true,
            brief: brief.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Error al exportar");
        }

        if (!res.body) throw new Error("Sin respuesta del servidor");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        const handleEvent = async (event: ExportPipelineEvent) => {
          if (event.step === "error") {
            throw new Error(event.message ?? "Error al exportar");
          }

          if (event.status === "running" && event.step !== "complete") {
            setCurrentStep(event.step as ExportPipelineStep);
            setStepMessage(event.message ?? null);
          }

          if (event.status === "done" && event.step !== "complete") {
            setCompletedSteps((prev) => {
              const step = event.step as ExportPipelineStep;
              return prev.includes(step) ? prev : [...prev, step];
            });
          }

          if (event.briefInterpretation) {
            setInterpretation(event.briefInterpretation);
          }
          if (event.briefSummary) {
            setSummary(event.briefSummary);
          }
          if (event.briefWarning) {
            setError(event.briefWarning);
          }

          if (event.step === "complete" && event.status === "done" && event.blobBase64) {
            const blob = blobFromBase64(
              event.blobBase64,
              event.contentType ?? "application/octet-stream"
            );

            if (isPreview) {
              await openBlobPreview(blob);
            } else {
              const filename =
                event.filename ??
                (exportFormat === "zip" ? "viaje-export.zip" : "viaje.html");
              const result: DownloadResult = await downloadFromBase64(
                event.blobBase64,
                filename,
                event.contentType ?? "application/octet-stream"
              );
              const briefNote = event.briefInterpretation
                ? ` Brief: ${event.briefInterpretation}`
                : "";
              if (result === "saved") {
                setSuccess(`Archivo guardado en Descargas/TravelToBlog.${briefNote}`);
              } else if (result === "shared") {
                setSuccess(`Elige dónde guardar el archivo en el menú Compartir.${briefNote}`);
              } else {
                setSuccess(
                  `Se abrió la vista previa. Pulsa ⋮ o Compartir y elige «Guardar en Descargas».${briefNote}`
                );
              }
            }

            finished = true;
            setCompletedSteps(progressSteps);
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
            await handleEvent(JSON.parse(line) as ExportPipelineEvent);
          }

          if (done) {
            if (buffer.trim()) {
              await handleEvent(JSON.parse(buffer) as ExportPipelineEvent);
            }
            break;
          }
        }

        if (!finished) {
          throw new Error("La exportación no devolvió un archivo");
        }
      } catch (err) {
        if (err instanceof DownloadCancelledError) return;
        setError(err instanceof Error ? err.message : "Error al exportar");
      } finally {
        setLoading(false);
        setPreviewing(false);
        setCurrentStep(null);
        setStepMessage(null);
      }
    },
    [brief, format, includeGpsTrail, progressSteps, template, travelId, typology]
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">Tipología de viaje</h3>
        <p className="mb-2 text-xs text-fg-secondary">
          Define la estructura del HTML (cronología, mapa, reproducción). La plantilla visual es independiente.
        </p>
        {suggestion && typology === "auto" && (
          <p className="callout callout-success mb-2 text-xs">
            Sugerencia: <strong>{suggestion.type.replace(/_/g, " ").toLowerCase()}</strong> — {suggestion.reason}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {typologies.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypology(t.id)}
              disabled={busy}
              className={`select-card ${typology === t.id ? "select-card-active" : ""}`}
            >
              <p className="text-sm font-semibold text-fg">{t.label}</p>
              <p className="mt-0.5 text-xs text-fg-secondary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">Plantilla visual</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              disabled={busy}
              className={`select-card p-4 ${template === t.id ? "select-card-active" : ""}`}
            >
              <div className={`mb-3 ${TEMPLATE_PREVIEW[t.id]}`}>{t.name}</div>
              <p className="text-sm text-fg-secondary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-fg-secondary">
        <input
          type="checkbox"
          checked={includeGpsTrail}
          onChange={(e) => setIncludeGpsTrail(e.target.checked)}
          disabled={busy}
          className="mt-0.5 accent-theme"
        />
        <span>
          Incluir recorridos GPS grabados en el export
          <span className="mt-0.5 block text-xs text-fg-tertiary">
            Aparecen en la cronología y como línea punteada en el mapa (también si el track tiene
            «En export» activado en Cronología).
          </span>
        </span>
      </label>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Formato</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="format"
              checked={format === "zip"}
              onChange={() => setFormat("zip")}
              disabled={busy}
              className="accent-theme"
            />
            ZIP (recomendado — fotos WebP + mapa offline)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="format"
              checked={format === "html"}
              onChange={() => setFormat("html")}
              disabled={busy}
              className="accent-theme"
            />
            HTML único (todo embebido)
          </label>
        </div>
        {format === "html" && (
          <p className="callout callout-warning mt-2 text-xs">
            El HTML único embebe todas las fotos en un solo archivo: puede pesar mucho más y tardar
            más en generarse. Para compartir o archivar, recomendamos ZIP.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="html-export-brief" className="block text-sm font-semibold text-fg-secondary">
          Indicaciones para este HTML (opcional)
        </label>
        <textarea
          id="html-export-brief"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setInterpretation(null);
            setSummary(null);
          }}
          disabled={busy}
          rows={3}
          placeholder="Ej.: máximo protagonismo fotográfico y galería muy visible, poca crónica; o mapa grande y guía práctica destacada…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-secondary/70 focus:border-accent-cyan focus:outline-none"
        />
        <p className="text-xs text-fg-secondary">
          Texto libre: aterrizamos peso de fotos, galería, prosa, mapa y guía a knobs del
          export. Tipología y plantilla de arriba siguen mandando la estructura base.
        </p>
        <button
          type="button"
          onClick={() => void handleInterpret()}
          disabled={busy || !brief.trim()}
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

      {hasGpsPhotos && !warnings.some((w) => w.message.includes("GPS")) && (
        <p className="callout callout-success text-sm">
          🗺️ Incluye cronología interactiva, mapa sincronizado y modo reproducir por días.
        </p>
      )}

      {!hasJournal && warnings.length === 0 && (
        <p className="callout callout-warning text-sm">
          Sin crónica IA: se exportará cronología unificada y galería con las fotos seleccionadas.
        </p>
      )}

      {isCapacitorNative() && (
        <p className="callout callout-info text-sm">
          En la app Android, al exportar se abrirá el menú <strong>Compartir</strong> para guardar
          en Descargas, Drive u otra app. Si no aparece, el archivo se guardará en{" "}
          <strong>Descargas/TravelToBlog</strong>.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void runExport("preview")}
          disabled={busy}
          className="btn-secondary flex-1 py-3 text-sm disabled:opacity-50"
        >
          {previewing ? "Generando vista previa…" : "👁️ Vista previa"}
        </button>
        <button
          type="button"
          onClick={() => void runExport("download")}
          disabled={busy}
          className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
        >
          {loading ? "Generando exportación…" : "📦 Exportar"}
        </button>
      </div>

      {busy && (
        <ul className="progress-panel space-y-1.5">
          {progressSteps.map((key) => {
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
                {STEP_LABELS[key]}
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
