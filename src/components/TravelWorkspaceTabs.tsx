"use client";

import { useState } from "react";

export type TravelTab = "photos" | "places" | "days";

interface TravelWorkspaceTabsProps {
  photosContent: React.ReactNode;
  placesContent?: React.ReactNode;
  daysContent?: React.ReactNode;
}

const TABS: { id: TravelTab; label: string }[] = [
  { id: "photos", label: "Fotos" },
  { id: "places", label: "Lugares" },
  { id: "days", label: "Días" },
];

export default function TravelWorkspaceTabs({
  photosContent,
  placesContent,
  daysContent,
}: TravelWorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TravelTab>("photos");

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Secciones del viaje"
        className="flex gap-1 rounded-xl bg-slate-100 p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-white text-teal-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {activeTab === "photos" && photosContent}
        {activeTab === "places" &&
          (placesContent ?? (
            <PlaceholderPanel
              title="Lugares del viaje"
              description="Marca sitios en el mapa — hoteles, restaurantes, miradores… Inspirado en DogTrainer."
            />
          ))}
        {activeTab === "days" &&
          (daysContent ?? (
            <PlaceholderPanel
              title="Calendario del viaje"
              description="Navega día a día y añade comentarios por fecha — inspirado en Nutriplaner."
            />
          ))}
      </div>
    </div>
  );
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-teal-600">
        Próximamente
      </p>
    </div>
  );
}
