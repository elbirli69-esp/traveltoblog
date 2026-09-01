"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, rememberTravel } from "@/lib/utils";
import { buildTravelUrlWithPendingShare } from "@/lib/share-client";

export default function JoinTravelForm({ shareCode }: { shareCode: string }) {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/join/${shareCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

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

      router.push(buildTravelUrlWithPendingShare(data.travel.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al unirse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="alias" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Tu alias en este viaje
        </label>
        <input
          id="alias"
          type="text"
          required
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: Carlos"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Uniéndose…" : "Unirme al viaje"}
      </button>
    </form>
  );
}
