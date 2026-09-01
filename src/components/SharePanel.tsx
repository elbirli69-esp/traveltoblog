"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getJoinUrl } from "@/lib/utils";

interface SharePanelProps {
  shareCode: string;
  title: string;
  /** Abrir al montar (p. ej. tras crear el viaje con ?invite=1) */
  defaultOpen?: boolean;
}

export default function SharePanel({
  shareCode,
  title,
  defaultOpen = false,
}: SharePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const joinUrl = getJoinUrl(shareCode);

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Invitar al grupo</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {open
              ? `Código ${shareCode} · enlace y QR para unirse`
              : "Comparte enlace o QR cuando quieras sumar a alguien"}
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-semibold text-teal-700"
          aria-hidden="true"
        >
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800/80 px-5 pb-5 pt-4">
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Comparte el enlace o el código QR para que otros se unan a &ldquo;{title}
            &rdquo;
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="rounded-xl bg-white dark:bg-slate-900 p-3 shadow-inner ring-1 ring-slate-100">
              <QRCodeSVG value={joinUrl} size={140} level="M" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Código
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-teal-700">
                  {shareCode}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Enlace
                </p>
                <p className="break-all text-sm text-slate-600 dark:text-slate-300">{joinUrl}</p>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="rounded-lg bg-slate-100 dark:bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Copiar enlace
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
