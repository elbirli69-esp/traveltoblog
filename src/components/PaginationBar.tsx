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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-600">
        {start}–{end} de {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          ← Anterior
        </button>
        <span className="px-2 text-xs font-medium text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
