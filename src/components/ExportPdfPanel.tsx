"use client";

import { useEffect, useState } from "react";
import { DownloadCancelledError, downloadBlob, type DownloadResult } from "@/lib/download-blob";

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
  const [pdfAvailable, setPdfAvailable] = useState<boolean | null>(null);
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

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

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

      const result: DownloadResult = await downloadBlob(blob, filename);
      if (result === "saved") {
        setSuccess("PDF guardado en Descargas/TravelToBlog.");
      } else if (result === "shared") {
        setSuccess("Elige dónde guardar el PDF en el menú Compartir.");
      } else {
        setSuccess("Se abrió la vista previa del PDF. Usa Compartir para guardarlo.");
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) return;
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

      <ul className="space-y-1 text-sm text-fg-secondary">
        <li>📖 Portada oscura con título y fechas</li>
        <li>📷 Páginas a dos columnas: fotos + EXIF | narrativa IA + citas</li>
        <li>🖨️ PDF optimizado para imprenta (WeasyPrint, 300 DPI)</li>
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
        onClick={handleExport}
        disabled={loading || photoCount === 0 || pdfAvailable === false}
        className="btn-pdf disabled:opacity-50"
      >
        {loading ? "Generando PDF para imprenta…" : "🖨️ Descargar Álbum para Imprenta (PDF)"}
      </button>

      {success && <p className="callout callout-success text-sm">{success}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
