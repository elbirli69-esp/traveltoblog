"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JournalMarkdown from "@/components/JournalMarkdown";

interface JournalEditorProps {
  travelId: string;
  initialMarkdown: string;
  generatedAt: string | null;
}

export default function JournalEditor({
  travelId,
  initialMarkdown,
  generatedAt,
}: JournalEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [draft, setDraft] = useState(initialMarkdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setMarkdown(initialMarkdown);
    if (!editing) setDraft(initialMarkdown);
  }, [initialMarkdown, editing]);

  const startEdit = () => {
    setDraft(markdown);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(markdown);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/journal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalMarkdown: draft }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      const data = await res.json();
      setMarkdown(data.travel.journalMarkdown ?? draft);
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      router.refresh();
    } catch {
      setError("Error al guardar la crónica");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg-secondary">
            Revisa y edita el texto antes de exportar a HTML o PDF.
          </p>
          {generatedAt && (
            <p className="mt-0.5 text-xs text-fg-tertiary">
              Última generación / refinamiento IA:{" "}
              {new Intl.DateTimeFormat("es-ES", {
                dateStyle: "long",
                timeStyle: "short",
              }).format(new Date(generatedAt))}
            </p>
          )}
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="btn-primary px-4 py-2 text-sm"
          >
            Editar crónica
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {savedFlash && (
        <p className="callout callout-success mb-3 text-sm font-medium">
          Crónica guardada. Los exports usarán este texto.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-fg-secondary">
            Markdown de la crónica
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={28}
            spellCheck
            className="form-input input-focus rounded-2xl px-4 py-3 font-mono leading-relaxed"
          />
          <p className="text-xs text-fg-tertiary">
            Puedes usar Markdown: # títulos, **negrita**, ![alt](ruta) para fotos, etc.
          </p>
        </div>
      ) : (
        <JournalMarkdown markdown={markdown} />
      )}
    </div>
  );
}
