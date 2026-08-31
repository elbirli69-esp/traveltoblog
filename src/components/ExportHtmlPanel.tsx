"use client";

import { useState } from "react";

export type ExportTemplateId = "visual-journey" | "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "zip" | "html";

const TEMPLATES: {
  id: ExportTemplateId;
  name: string;
  description: string;
  preview: string;
}[] = [
  {
    id: "visual-journey",
    name: "Visual Journey",
    description:
      "Hero con foto de portada, galería tipo mosaico, lightbox, animaciones y navegación sticky.",
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
  const [template, setTemplate] = useState<ExportTemplateId>("visual-journey");
  const [format, setFormat] = useState<ExportFormat>("zip");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/export-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelId, template, format }),
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
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Plantilla visual
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={`rounded-xl border-2 p-4 text-left transition ${
                template === t.id
                  ? "border-teal-500 ring-2 ring-teal-500/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div
                className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${t.preview}`}
              >
                {t.name}
              </div>
              <p className="text-sm text-slate-600">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Formato</h3>
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
          Sin crónica IA: se exportará una galería con las fotos seleccionadas.
        </p>
      )}

      {template === "visual-journey" && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          ✨ Incluye hero con portada, galería interactiva, lightbox al pulsar fotos y animaciones al hacer scroll.
        </p>
      )}

      {hasGpsPhotos ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          🗺️ Mapa Leaflet con ruta, vuelos y lugares marcados.
        </p>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Sin GPS en fotos: el export no incluirá mapa interactivo.
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Generando exportación…" : "📦 Exportar blog visual (HTML + mapa)"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
