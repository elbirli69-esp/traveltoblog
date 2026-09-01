"use client";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export default function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = "elementos",
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="surface-inset flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <p className="text-xs text-fg-secondary">
        {start}–{end} de {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          ← Anterior
        </button>
        <span className="px-2 text-xs font-medium text-fg-secondary">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
