"use client";

import { useEffect, useState } from "react";
import type { TravelType } from "@prisma/client";

export type ExportTemplateId = "magazine" | "visual-journey" | "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "zip" | "html";
export type ExportTypologyId = TravelType | "auto";

const TEMPLATES: {
  id: ExportTemplateId;
  name: string;
  description: string;
  preview: string;
}[] = [
  {
    id: "magazine",
    name: "Magazine",
    description:
      "Estilo blog experto: hero con subtítulo, recorrido cronológico, guía práctica, TOC y meta para compartir.",
    preview: "bg-gradient-to-br from-teal-50 to-amber-50 text-teal-900 border-teal-200",
  },
  {
    id: "visual-journey",
    name: "Visual Journey",
    description:
      "Hero con foto de portada, recorrido cronológico visual, galería, lightbox y animaciones.",
    preview: "bg-gradient-to-br from-teal-900 to-stone-900 text-teal-200 border-teal-700",
  },
  {
    id: "editorial-clean",
    name: "Editorial Clean",
    description: "Estilo revista clásica: fondo claro, tipografía serif y acentos teal.",
    preview: "bg-stone-50 text-stone-800 border-stone-200",
  },
  {
    id: "dark-photo-journey",
    name: "Dark Photo Journey",
    description: "Tema oscuro cinematográfico con fotos destacadas.",
    preview: "bg-slate-900 text-amber-300 border-slate-700",
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
        body: JSON.stringify({ travelId, template, typology, format, includeGpsTrail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al exportar");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ?? (format === "zip" ? "viaje-export.zip" : "viaje.html");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Tipología de viaje</h3>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Define la estructura del HTML (cronología, mapa, reproducción). La plantilla visual es independiente.
        </p>
        {suggestion && typology === "auto" && (
          <p className="mb-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
            Sugerencia: <strong>{suggestion.type.replace(/_/g, " ").toLowerCase()}</strong> — {suggestion.reason}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {typologies.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypology(t.id)}
              className={`rounded-xl border-2 p-3 text-left transition ${
                typology === t.id
                  ? "border-teal-500 ring-2 ring-teal-500/20"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Plantilla visual</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={`rounded-xl border-2 p-4 text-left transition ${
                template === t.id
                  ? "border-teal-500 ring-2 ring-teal-500/20"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              <div
                className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${t.preview}`}
              >
                {t.name}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={includeGpsTrail}
          onChange={(e) => setIncludeGpsTrail(e.target.checked)}
          className="accent-teal-600"
        />
        Incluir recorridos GPS grabados en el export
      </label>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Formato</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="format"
              checked={format === "zip"}
              onChange={() => setFormat("zip")}
              className="accent-teal-600"
            />
            ZIP (recomendado — fotos + mapa offline)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="format"
              checked={format === "html"}
              onChange={() => setFormat("html")}
              className="accent-teal-600"
            />
            HTML único (todo embebido)
          </label>
        </div>
      </div>

      {!hasJournal && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sin crónica IA: se exportará cronología unificada y galería con las fotos seleccionadas.
        </p>
      )}

      {hasGpsPhotos ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          🗺️ Incluye cronología interactiva, mapa sincronizado y modo reproducir por días.
        </p>
      ) : (
        <p className="rounded-lg bg-slate-50 dark:bg-slate-950/60 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
          Sin GPS: cronología textual unificada (fotos, lugares, notas). Añade GPS para mapa completo.
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Generando exportación…" : "📦 Exportar diario interactivo (HTML)"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
