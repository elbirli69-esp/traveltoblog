"use client";

import { useState } from "react";

export interface EditableNoteData {
  id: string;
  text: string;
  user: { alias: string };
}

interface EditableNoteProps {
  note: EditableNoteData;
  onChanged?: () => void;
  /** Custom save (e.g. Place.comment). Defaults to PATCH /api/notes/:id */
  onSave?: (text: string) => Promise<void>;
  /** Custom delete. Defaults to DELETE /api/notes/:id */
  onDelete?: () => Promise<void>;
  deleteConfirmMessage?: string;
}

export default function EditableNote({
  note,
  onChanged,
  onSave,
  onDelete,
  deleteConfirmMessage = "¿Eliminar esta nota?",
}: EditableNoteProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setText(note.text);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setText(note.text);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!text.trim()) {
      setError("El texto no puede estar vacío");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        await onSave(text.trim());
      } else {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
        if (!res.ok) throw new Error("No se pudo guardar");
      }
      setEditing(false);
      onChanged?.();
    } catch {
      setError("Error al guardar la nota");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(deleteConfirmMessage)) return;
    setSaving(true);
    setError(null);
    try {
      if (onDelete) {
        await onDelete();
      } else {
        const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo eliminar");
      }
      onChanged?.();
    } catch {
      setError("Error al eliminar la nota");
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="surface-inset px-3 py-3 text-sm">
        <span className="text-alias">{note.user.alias}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="form-input input-focus mt-2"
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !text.trim()}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="surface-inset px-3 py-2 text-sm text-fg-secondary">
      <div className="flex items-start justify-between gap-2">
        <span className="text-alias">{note.user.alias}</span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-medium text-fg-secondary hover:text-accent-mint"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="text-xs font-medium text-danger disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap">{note.text}</p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}
