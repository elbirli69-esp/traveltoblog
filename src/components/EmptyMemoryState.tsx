"use client";

interface EmptyMemoryStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyMemoryState({
  title,
  description,
  actionLabel = "Añadir recuerdo",
  onAction,
}: EmptyMemoryStateProps) {
  return (
    <div className="empty-state">
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-fg-secondary">{description}</p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-primary mt-4 inline-flex items-center gap-1.5"
        >
          <span aria-hidden>+</span>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
