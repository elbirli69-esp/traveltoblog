"use client";

import { useEffect, useMemo, useState } from "react";
import type { TravelType } from "@prisma/client";
import type { ExportPipelineEvent, ExportPipelineStep } from "@/lib/export-pipeline";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ExportPipelineStep | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<ExportPipelineStep[]>([]);

  const progressSteps = useMemo(
    () => (format === "html" ? HTML_STEPS : ZIP_STEPS),
    [format]
  );

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

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setCurrentStep(null);
    setStepMessage(null);
    setCompletedSteps([]);

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
          format,
          includeGpsTrail,
          stream: true,
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
      let downloaded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ExportPipelineEvent;

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

          if (event.step === "complete" && event.status === "done" && event.blobBase64) {
            const binary = atob(event.blobBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], {
              type: event.contentType ?? "application/octet-stream",
            });
            const filename =
              event.filename ?? (format === "zip" ? "viaje-export.zip" : "viaje.html");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            downloaded = true;
            setCompletedSteps(progressSteps);
          }
        }
      }

      if (!downloaded) {
        throw new Error("La exportación no devolvió un archivo");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setLoading(false);
      setCurrentStep(null);
      setStepMessage(null);
    }
  };

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
              className={`select-card p-4 ${template === t.id ? "select-card-active" : ""}`}
            >
              <div className={`mb-3 ${TEMPLATE_PREVIEW[t.id]}`}>{t.name}</div>
              <p className="text-sm text-fg-secondary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
        <input
          type="checkbox"
          checked={includeGpsTrail}
          onChange={(e) => setIncludeGpsTrail(e.target.checked)}
          className="accent-theme"
        />
        Incluir recorridos GPS grabados en el export
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
              className="accent-theme"
            />
            ZIP (recomendado — fotos + mapa offline)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="format"
              checked={format === "html"}
              onChange={() => setFormat("html")}
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

      {!hasJournal && (
        <p className="callout callout-warning text-sm">
          Sin crónica IA: se exportará cronología unificada y galería con las fotos seleccionadas.
        </p>
      )}

      {hasGpsPhotos ? (
        <p className="callout callout-success text-sm">
          🗺️ Incluye cronología interactiva, mapa sincronizado y modo reproducir por días.
        </p>
      ) : (
        <p className="surface-inset text-sm text-fg-secondary">
          Sin GPS: cronología textual unificada (fotos, lugares, notas). Añade GPS para mapa completo.
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="btn-primary w-full py-3 text-sm disabled:opacity-50"
      >
        {loading ? "Generando exportación…" : "📦 Exportar diario interactivo (HTML)"}
      </button>

      {loading && (
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

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
