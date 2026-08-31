"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateJournalButton({ travelId }: { travelId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      router.push(`/travel/${travelId}/journal`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Generando crónica con IA…" : "✨ Generar diario con IA"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
