"use client";

import { useState } from "react";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import ExportProjectPanel from "@/components/ExportProjectPanel";
import ExportReelPanel, {
  type ReelDayOption,
} from "@/components/ExportReelPanel";

export type ExportFormatTab = "html" | "pdf" | "video" | "backup";

interface PdfCoverPhotoOption {
  id: string;
  thumbUrl: string;
  highlightScore?: number;
}

interface ExportFormatTabsProps {
  travelId: string;
  travelTitle: string;
  hasJournal: boolean;
  hasDayJournal?: boolean;
  hasBlogJournal?: boolean;
  hasGpsPhotos: boolean;
  photoCount: number;
  /** All media files (selected + unselected) for backup sizing hints */
  allPhotoCount?: number;
  coverPhotos: PdfCoverPhotoOption[];
  reelDays?: ReelDayOption[];
  initialTab?: ExportFormatTab;
}

const TABS: {
  id: ExportFormatTab;
  label: string;
  title: string;
  description: string;
  titleClass: string;
}[] = [
  {
    id: "html",
    label: "HTML",
    title: "Diario HTML interactivo",
    description:
      "Cronología, mapa sincronizado, tipología de viaje y modo reproducir. Exporta como ZIP o HTML.",
    titleClass: "text-accent-mint",
  },
  {
    id: "pdf",
    label: "PDF",
    title: "Álbum para imprenta",
    description:
      "PDF maquetado para imprenta profesional (A4 horizontal o cuadrado 21×21 cm). Listo para Saal Digital, CEWE u otra imprenta.",
    titleClass: "text-accent-blue",
  },
  {
    id: "video",
    label: "Vídeo",
    title: "Reel para Instagram",
    description:
      "ZIP con un vídeo vertical listo para Reels: viaje entero o un solo día (para publicar mientras viajas).",
    titleClass: "text-accent-cyan",
  },
  {
    id: "backup",
    label: "Copia",
    title: "Copia de seguridad del proyecto",
    description:
      "ZIP restaurable con fotos, lugares, notas, diario y GPS. Para no perder el viaje si falla el servidor.",
    titleClass: "text-accent-blue",
  },
];

export default function ExportFormatTabs({
  travelId,
  travelTitle,
  hasJournal,
  hasDayJournal = false,
  hasBlogJournal = false,
  hasGpsPhotos,
  photoCount,
  allPhotoCount,
  coverPhotos,
  reelDays = [],
  initialTab = "html",
}: ExportFormatTabsProps) {
  const [activeTab, setActiveTab] = useState<ExportFormatTab>(initialTab);
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Formatos de exportación" className="tab-track">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`export-panel-${tab.id}`}
              id={`export-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-pill ${selected ? "tab-pill-active" : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id={`export-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`export-tab-${active.id}`}
        className="surface p-6"
      >
        <h2 className={`heading-section mb-1 ${active.titleClass}`}>{active.title}</h2>
        <p className="mb-5 text-sm text-fg-secondary">{active.description}</p>

        {activeTab === "html" && (
          <ExportHtmlPanel
            travelId={travelId}
            hasJournal={hasJournal}
            hasDayJournal={hasDayJournal}
            hasBlogJournal={hasBlogJournal}
            hasGpsPhotos={hasGpsPhotos}
            photoCount={photoCount}
          />
        )}
        {activeTab === "pdf" && (
          <ExportPdfPanel
            travelId={travelId}
            hasJournal={hasJournal}
            photoCount={photoCount}
            coverPhotos={coverPhotos}
          />
        )}
        {activeTab === "video" && (
          <ExportReelPanel
            travelId={travelId}
            travelTitle={travelTitle}
            photoCount={photoCount}
            reelDays={reelDays}
          />
        )}
        {activeTab === "backup" && (
          <ExportProjectPanel
            travelId={travelId}
            travelTitle={travelTitle}
            photoCount={allPhotoCount ?? photoCount}
          />
        )}
      </section>
    </div>
  );
}
