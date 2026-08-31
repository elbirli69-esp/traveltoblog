"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/utils";
import { buildTravelUrlWithPendingShare } from "@/lib/share-client";

export default function CreateTravelForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/travels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, alias }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      saveSession({
        userId: data.user.id,
        alias: data.user.alias,
        travelId: data.travel.id,
      });

      router.push(buildTravelUrlWithPendingShare(data.travel.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear viaje");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
          Nombre del viaje
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Road trip por Andalucía 2026"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      <div>
        <label htmlFor="alias" className="mb-1 block text-sm font-medium text-slate-700">
          Tu alias
        </label>
        <input
          id="alias"
          type="text"
          required
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: María"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Creando…" : "Crear viaje y generar sala"}
      </button>
    </form>
  );
}
