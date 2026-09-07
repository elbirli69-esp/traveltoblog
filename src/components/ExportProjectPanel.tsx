"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DownloadCancelledError,
  downloadBlob,
} from "@/lib/download-blob";
import { rememberTravel, saveSession } from "@/lib/utils";

interface ExportProjectPanelProps {
  travelId: string;
  travelTitle: string;
  photoCount: number;
}

export default function ExportProjectPanel({
  travelId,
  travelTitle,
  photoCount,
}: ExportProjectPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importAlias, setImportAlias] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/export-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al crear la copia");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename =
        match?.[1] ??
        `traveltoblog-backup-${travelTitle.slice(0, 30) || travelId}.zip`;
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
      const result = await downloadBlob(blob, filename);
      const missing = res.headers.get("X-TravelToBlog-Media-Missing");
      const missingNote =
        missing && missing !== "0"
          ? ` (aviso: ${missing} archivo(s) de media no estaban en el servidor)`
          : "";
      if (result === "saved" || result === "shared") {
        setSuccess(
          `Copia guardada (~${sizeMb} MB): incluye fotos, lugares, notas, diario y GPS.${missingNote}`
        );
      } else {
        setSuccess(
          `Copia lista (~${sizeMb} MB). Guárdala en un lugar seguro fuera del NAS.${missingNote}`
        );
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) {
        setError("Descarga cancelada");
      } else {
        setError(err instanceof Error ? err.message : "Error al exportar");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (importAlias.trim()) form.set("alias", importAlias.trim());

      const res = await fetch("/api/import-project", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al importar");
      }

      saveSession({
        userId: data.user.id,
        alias: data.user.alias,
        travelId: data.travel.id,
      });
      rememberTravel({
        userId: data.user.id,
        alias: data.user.alias,
        travelId: data.travel.id,
        title: data.travel.title,
        shareCode: data.travel.shareCode,
      });

      const s = data.stats as {
        photos: number;
        places: number;
        notes: number;
        mediaRestored: number;
        mediaMissing: number;
      };
      setSuccess(
        `Restaurado «${data.travel.title}»: ${s.photos} fotos, ${s.places} lugares, ${s.notes} notas (${s.mediaRestored} archivos OK${
          s.mediaMissing ? `, ${s.mediaMissing} faltan` : ""
        }). Abriendo…`
      );
      router.push(`/travel/${data.travel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">
          Descarga un ZIP con <strong className="font-medium text-fg">todo el proyecto</strong>:
          fotos/vídeos, lugares, notas, diario, preferencias de export y tracks GPS.
          Guárdalo fuera del NAS (PC o nube). Más adelante puedes importarlo para recrear el viaje.
        </p>
        <p className="text-xs text-fg-tertiary">
          Este viaje tiene {photoCount} archivo{photoCount === 1 ? "" : "s"} de media.
          La copia incluye fotos, vídeos, lugares, notas, diario y GPS (puede ser un archivo
          grande).
        </p>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || importing}
          className="btn-primary w-full py-3 text-sm disabled:opacity-50"
        >
          {exporting ? "Preparando copia…" : "Descargar copia del proyecto"}
        </button>
      </div>

      <div className="border-t border-[var(--border)] pt-5 space-y-3">
        <h3 className="text-sm font-semibold text-fg">Importar una copia</h3>
        <p className="text-sm text-fg-secondary">
          Crea un viaje nuevo a partir de un ZIP de copia. No sustituye el actual; restaura en
          paralelo.
        </p>
        <div>
          <label
            htmlFor="import-alias"
            className="mb-1 block text-sm font-medium text-fg-secondary"
          >
            Tu alias al restaurar (opcional)
          </label>
          <input
            id="import-alias"
            type="text"
            value={importAlias}
            onChange={(e) => setImportAlias(e.target.value)}
            placeholder="Ej: Irene"
            className="form-input input-focus"
            disabled={importing || exporting}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing || exporting}
          className="btn-secondary w-full py-3 text-sm disabled:opacity-50"
        >
          {importing ? "Importando…" : "Elegir ZIP e importar"}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-accent-mint">{success}</p>}
    </div>
  );
}
