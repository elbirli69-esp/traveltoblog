"use client";

import { useState } from "react";

export type TravelTab = "photos" | "places" | "days" | "timeline" | "trip";

export interface TravelTabCounts {
  photos?: number;
  places?: number;
  days?: number;
  timeline?: number;
  trip?: number;
}

interface TravelWorkspaceTabsProps {
  photosContent: React.ReactNode;
  placesContent: React.ReactNode;
  daysContent: React.ReactNode;
  timelineContent: React.ReactNode;
  tripContent: React.ReactNode;
  /** Uncontrolled initial tab when `activeTab` is omitted. */
  initialTab?: TravelTab;
  /** Controlled tab (deep-links / Añadir recuerdo). */
  activeTab?: TravelTab;
  onTabChange?: (tab: TravelTab) => void;
  /** Optional counts shown as «Fotos (12)». */
  tabCounts?: TravelTabCounts;
}

const TAB_BASE: { id: TravelTab; label: string }[] = [
  { id: "photos", label: "Fotos" },
  { id: "places", label: "Lugares" },
  { id: "days", label: "Días" },
  { id: "timeline", label: "Cronología" },
  { id: "trip", label: "Viaje" },
];

function tabLabel(base: string, count?: number): string {
  if (count == null) return base;
  return `${base} (${count})`;
}

export default function TravelWorkspaceTabs({
  photosContent,
  placesContent,
  daysContent,
  timelineContent,
  tripContent,
  initialTab = "photos",
  activeTab: controlledTab,
  onTabChange,
  tabCounts,
}: TravelWorkspaceTabsProps) {
  const isControlled = controlledTab != null;
  const [uncontrolledTab, setUncontrolledTab] = useState<TravelTab>(initialTab);
  const activeTab = isControlled ? controlledTab : uncontrolledTab;

  const setTab = (tab: TravelTab) => {
    if (!isControlled) setUncontrolledTab(tab);
    onTabChange?.(tab);
  };

  const panel =
    activeTab === "photos"
      ? photosContent
      : activeTab === "places"
        ? placesContent
        : activeTab === "days"
          ? daysContent
          : activeTab === "timeline"
            ? timelineContent
            : tripContent;

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Secciones del viaje"
        className="flex gap-1 rounded-xl bg-slate-100 p-1"
      >
        {TAB_BASE.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
              activeTab === tab.id
                ? "bg-white text-teal-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tabLabel(tab.label, tabCounts?.[tab.id])}
          </button>
        ))}
      </div>

      <div role="tabpanel">{panel}</div>
    </div>
  );
}
