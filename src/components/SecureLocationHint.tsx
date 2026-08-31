"use client";

import { useEffect, useState } from "react";
import { isGeolocationSecureContext } from "@/lib/places";

const HTTPS_APP_URL =
  process.env.NEXT_PUBLIC_HTTPS_APP_URL?.trim() ||
  "https://syno-nas.tailf9872a.ts.net";

const SERVE_ENABLE_URL =
  "https://login.tailscale.com/f/serve?node=nZWPX2mcyT11CNTRL";

/** Shown when the PWA is opened over http://100.x (Tailscale IP) — GPS blocked. */
export default function SecureLocationHint({ compact = false }: { compact?: boolean }) {
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    setInsecure(!isGeolocationSecureContext());
  }, []);

  if (!insecure) return null;

  if (compact) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        GPS bloqueado en HTTP. Abre{" "}
        <a href={HTTPS_APP_URL} className="font-semibold underline">
          {HTTPS_APP_URL.replace(/^https:\/\//, "")}
        </a>{" "}
        o usa «Elegir en mapa».
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
      <p className="font-semibold">El GPS necesita HTTPS</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
        En el móvil, el navegador bloquea la ubicación en direcciones{" "}
        <code className="rounded bg-amber-100 px-1">http://100.…</code>. DogTrainer
        funciona porque usa HTTPS; TravelToBlog debe abrirse por la URL segura de
        Tailscale.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-amber-900/90">
        <li>
          Activa Serve (un clic, con la cuenta Tailscale):{" "}
          <a
            href={SERVE_ENABLE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            Activar HTTPS / Serve
          </a>
        </li>
        <li>
          En el NAS:{" "}
          <code className="rounded bg-amber-100 px-1">
            sudo /var/packages/Tailscale/target/bin/tailscale serve --bg 3000
          </code>
        </li>
        <li>
          Abre{" "}
          <a href={HTTPS_APP_URL} className="font-semibold underline">
            {HTTPS_APP_URL}
          </a>{" "}
          e instala de nuevo la PWA desde ahí.
        </li>
      </ol>
      <p className="mt-2 text-xs text-amber-800">
        Mientras tanto puedes marcar el lugar con «Elegir en mapa».
      </p>
    </div>
  );
}
