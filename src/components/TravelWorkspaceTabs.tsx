"use client";

import { useState } from "react";

export type TravelTab = "photos" | "places" | "days" | "trip";

interface TravelWorkspaceTabsProps {
  photosContent: React.ReactNode;
  placesContent: React.ReactNode;
  daysContent: React.ReactNode;
  tripContent: React.ReactNode;
  /** Optional controlled tab (e.g. deep-links in later phases). */
  initialTab?: TravelTab;
}

const TABS: { id: TravelTab; label: string }[] = [
  { id: "photos", label: "Fotos" },
  { id: "places", label: "Lugares" },
  { id: "days", label: "Días" },
  { id: "trip", label: "Viaje" },
];

export default function TravelWorkspaceTabs({
  photosContent,
  placesContent,
  daysContent,
  tripContent,
  initialTab = "photos",
}: TravelWorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TravelTab>(initialTab);

  const panel =
    activeTab === "photos"
      ? photosContent
      : activeTab === "places"
        ? placesContent
        : activeTab === "days"
          ? daysContent
          : tripContent;

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
            className={`flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
              activeTab === tab.id
                ? "bg-white text-teal-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">{panel}</div>
    </div>
  );
}
