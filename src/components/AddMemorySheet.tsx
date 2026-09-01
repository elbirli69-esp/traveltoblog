"use client";

export type AddMemoryKind = "photo" | "place" | "day" | "trip";

interface AddMemorySheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (kind: AddMemoryKind) => void;
}

const OPTIONS: {
  id: AddMemoryKind;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    id: "photo",
    title: "Una foto",
    description: "Sube o elige fotos de la galería",
    accent: "bg-sky-50 text-sky-900 ring-sky-200",
  },
  {
    id: "place",
    title: "Estoy aquí",
    description: "Marca un lugar con GPS o en el mapa",
    accent: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  },
  {
    id: "day",
    title: "Cómo fue el día",
    description: "Escribe una nota para la fecha de hoy",
    accent: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  {
    id: "trip",
    title: "Sobre el viaje",
    description: "Anécdota o resumen del viaje completo",
    accent: "bg-violet-50 text-violet-900 ring-violet-200",
  },
];

export default function AddMemorySheet({
  open,
  onClose,
  onSelect,
}: AddMemorySheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-memory-title"
        className="relative z-10 w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-900 p-5 shadow-xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="add-memory-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Añadir recuerdo
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              ¿Qué tienes a mano? No hace falta elegir el tipo técnico.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 hover:text-slate-800 dark:text-slate-200"
          >
            Cerrar
          </button>
        </div>

        <ul className="space-y-2">
          {OPTIONS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onSelect(option.id)}
                className={`flex w-full flex-col rounded-2xl px-4 py-3 text-left ring-1 transition hover:brightness-[0.98] ${option.accent}`}
              >
                <span className="text-sm font-semibold">{option.title}</span>
                <span className="mt-0.5 text-xs opacity-80">
                  {option.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
