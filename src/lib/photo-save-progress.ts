/** Progress events while confirming / uploading photos. */
export type PhotoSavePhase =
  | "preparing"
  | "compressing"
  | "uploading"
  | "queuing"
  | "done";

export interface PhotoSaveProgress {
  phase: PhotoSavePhase;
  /** 1-based index of the item currently in progress (0 when idle/done). */
  current: number;
  total: number;
  /** How many photos already uploaded (or queued offline) successfully. */
  completed: number;
  /** Short Spanish label for the UI. */
  label: string;
}

export function formatPhotoSaveProgress(p: PhotoSaveProgress): {
  headline: string;
  detail: string;
  percent: number;
} {
  const remaining = Math.max(0, p.total - p.completed);
  const percent =
    p.total <= 0 ? 0 : Math.min(100, Math.round((p.completed / p.total) * 100));
  const detail =
    p.phase === "done"
      ? p.total === 1
        ? "1 foto lista"
        : `${p.total} fotos listas`
      : remaining === 0
        ? p.label
        : `${p.label} · Quedan ${remaining}`;
  return {
    headline:
      p.phase === "done"
        ? "Listo"
        : p.phase === "compressing"
          ? "Preparando fotos"
          : p.phase === "uploading"
            ? "Subiendo fotos"
            : p.phase === "queuing"
              ? "Guardando en cola"
              : "Guardando fotos",
    detail,
    percent: p.phase === "done" ? 100 : percent,
  };
}
