"use client";

import { useCallback, useEffect, useState } from "react";
import { useEscapeKey } from "@/lib/use-escape-key";

interface HtmlPreviewModalProps {
  open: boolean;
  /** Object URL or data URL for the generated HTML. */
  src: string | null;
  title?: string;
  onClose: () => void;
  /** Optional: start ZIP download from the same panel. */
  onExportZip?: () => void;
  exportBusy?: boolean;
}

/**
 * Near-fullscreen in-app reader preview for exported HTML (B4).
 * Prefer this over window.open so the user can judge “¿se puede compartir?” without a popup.
 */
export default function HtmlPreviewModal({
  open,
  src,
  title = "Vista previa del blog",
  onClose,
  onExportZip,
  exportBusy = false,
}: HtmlPreviewModalProps) {
  const [iframeReady, setIframeReady] = useState(false);

  useEscapeKey(onClose, open);

  useEffect(() => {
    if (!open) setIframeReady(false);
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/70 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 bg-[var(--surface,#0f172a)] px-3 py-2.5 text-white sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-white/65">
            Así lo verá quien abra el HTML — cierra o exporta el ZIP cuando te convenza.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onExportZip && (
            <button
              type="button"
              onClick={() => onExportZip()}
              disabled={exportBusy}
              className="rounded-lg bg-[var(--accent-cyan,#22d3ee)] px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {exportBusy ? "Exportando…" : "Exportar ZIP"}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[var(--bg,#faf9f7)]">
        {!iframeReady && (
          <p className="absolute inset-x-0 top-4 z-10 text-center text-sm text-fg-secondary">
            Cargando vista previa…
          </p>
        )}
        <iframe
          title={title}
          src={src}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => setIframeReady(true)}
        />
      </div>
    </div>
  );
}
