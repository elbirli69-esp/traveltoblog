"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 font-mono text-lg tracking-wider text-fg focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            required
          />
        </label>
        <button
          type="submit"
          disabled={!code.trim()}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Continuar
        </button>
      </form>

      <p className="mt-4 text-xs text-slate-400 dark:text-fg-secondary dark:text-slate-500">
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
