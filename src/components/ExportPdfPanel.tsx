"use client";

import { useState } from "react";

export type PdfPageFormat = "a4-landscape" | "square";

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

interface ExportPdfPanelProps {
  travelId: string;
  hasJournal?: boolean;
  photoCount?: number;
}

export default function ExportPdfPanel({
  travelId,
  hasJournal = false,
  photoCount = 0,
}: ExportPdfPanelProps) {
  const [format, setFormat] = useState<PdfPageFormat>("a4-landscape");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelId, format }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al generar PDF");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "album-imprenta.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar PDF");
    } finally {
      setLoading(false);
    }
  };

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
              className={`rounded-xl border-2 p-4 text-left transition ${
                format === f.id
                  ? "border-violet-500 ring-2 ring-violet-500/20"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              <p className="font-medium text-fg">{f.name}</p>
              <p className="mt-1 text-sm text-fg-secondary">{f.description}</p>
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-1 text-sm text-fg-secondary">
        <li>📖 Portada oscura con título y fechas</li>
        <li>📷 Páginas a dos columnas: fotos + EXIF | narrativa IA + citas</li>
        <li>🖨️ PDF optimizado para imprenta (WeasyPrint, 300 DPI)</li>
      </ul>

      {!hasJournal && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sin crónica IA: el álbum usará texto mínimo y las fotos del viaje.
        </p>
      )}

      {photoCount === 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Necesitas al menos una foto seleccionada para generar el álbum.
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={loading || photoCount === 0}
        className="w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {loading ? "Generando PDF para imprenta…" : "🖨️ Descargar Álbum para Imprenta (PDF)"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
