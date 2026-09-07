"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rememberTravel, saveSession } from "@/lib/utils";

/** Home entry point to restore a full project backup ZIP. */
export default function ImportProjectCard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (alias.trim()) form.set("alias", alias.trim());
      const res = await fetch("/api/import-project", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al importar");

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
      router.push(`/travel/${data.travel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="surface mb-6 p-6">
      <h2 className="heading-section mb-1 text-accent-blue">Importar copia</h2>
      <p className="mb-4 text-sm text-fg-secondary">
        Restaura un viaje desde un ZIP de copia de seguridad (fotos, lugares, notas y diario).
      </p>
      <div className="mb-3">
        <label
          htmlFor="home-import-alias"
          className="mb-1 block text-sm font-medium text-fg-secondary"
        >
          Tu alias (opcional)
        </label>
        <input
          id="home-import-alias"
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: Rodri"
          className="form-input input-focus"
          disabled={loading}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="btn-secondary w-full py-2.5 text-sm disabled:opacity-50"
      >
        {loading ? "Importando…" : "Elegir ZIP de copia"}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
