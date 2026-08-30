"use client";

import { QRCodeSVG } from "qrcode.react";
import { getJoinUrl } from "@/lib/utils";

export default function SharePanel({
  shareCode,
  title,
}: {
  shareCode: string;
  title: string;
}) {
  const joinUrl = getJoinUrl(shareCode);

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-1 font-semibold text-slate-900">Invitar al grupo</h3>
      <p className="mb-4 text-sm text-slate-500">
        Comparte el enlace o el código QR para que otros se unan a &ldquo;{title}&rdquo;
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="rounded-xl bg-white p-3 shadow-inner ring-1 ring-slate-100">
          <QRCodeSVG value={joinUrl} size={140} level="M" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Código
            </p>
            <p className="font-mono text-2xl font-bold tracking-widest text-teal-700">
              {shareCode}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Enlace
            </p>
            <p className="break-all text-sm text-slate-600">{joinUrl}</p>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Copiar enlace
          </button>
        </div>
      </div>
    </div>
  );
}
