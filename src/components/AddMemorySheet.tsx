"use client";

export type AddMemoryKind = "photo" | "place" | "day" | "trip";

interface AddMemorySheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (kind: AddMemoryKind) => void;
}

const OPTION_CLASS: Record<AddMemoryKind, string> = {
  photo: "memory-option memory-option-photo",
  place: "memory-option memory-option-place",
  day: "memory-option memory-option-day",
  trip: "memory-option memory-option-trip",
};

const OPTIONS: {
  id: AddMemoryKind;
  title: string;
  description: string;
  titleClass: string;
}[] = [
  {
    id: "photo",
    title: "Una foto",
    description: "Sube o elige fotos de la galería",
    titleClass: "text-accent-mint",
  },
  {
    id: "place",
    title: "Estoy aquí",
    description: "Marca un lugar con GPS o en el mapa",
    titleClass: "text-accent-cyan",
  },
  {
    id: "day",
    title: "Cómo fue el día",
    description: "Escribe una nota para la fecha de hoy",
    titleClass: "text-accent-blue",
  },
  {
    id: "trip",
    title: "Sobre el viaje",
    description: "Anécdota o resumen del viaje completo",
    titleClass: "text-accent-blue",
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
        className="absolute inset-0 bg-[var(--overlay)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-memory-title"
        className="surface-elevated relative z-10 w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-memory-title" className="heading-section">
              Añadir recuerdo
            </h2>
            <p className="mt-0.5 text-sm text-fg-secondary">
              ¿Qué tienes a mano? No hace falta elegir el tipo técnico.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary px-2 py-1 text-sm">
            Cerrar
          </button>
        </div>

        <ul className="space-y-2">
          {OPTIONS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onSelect(option.id)}
                className={`flex w-full flex-col ${OPTION_CLASS[option.id]}`}
              >
                <span className={`text-sm font-semibold ${option.titleClass}`}>
                  {option.title}
                </span>
                <span className="mt-0.5 text-xs text-fg-secondary">{option.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
