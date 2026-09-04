"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PendingShareBanner from "@/components/PendingShareBanner";

export default function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleaned) return;
    router.push(`/join/${cleaned}`);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-fg">Unirse a un viaje</h1>
      <p className="mb-6 text-fg-secondary">
        Pega el código que te compartió el organizador (está en «Invitar al grupo» en el móvil).
      </p>

      <PendingShareBanner />

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-secondary">Código del viaje</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ej: wbkyq1tm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            className="form-input form-input-lg input-focus font-mono text-lg tracking-wider"
            required
          />
        </label>
        <button
          type="submit"
          disabled={!code.trim()}
          className="btn-primary w-full py-3 text-sm disabled:opacity-50"
        >
          Continuar
        </button>
      </form>

      <p className="mt-4 text-xs text-fg-tertiary">
        También puedes abrir directamente el enlace de invitación del móvil.
      </p>

      <Link
        href="/"
        className="mt-6 inline-block text-sm link-accent"
      >
        ← Volver al inicio
      </Link>
    </main>
  );
}
