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
      <li className="rounded-xl border border-teal-200 bg-teal-50/50 px-3 py-3 text-sm">
        <span className="font-medium text-teal-700">{note.user.alias}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !text.trim()}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-teal-700">{note.user.alias}</span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-medium text-slate-500 hover:text-teal-700"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap">{note.text}</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}
