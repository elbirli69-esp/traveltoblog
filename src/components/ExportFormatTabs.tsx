"use client";

import { useCallback, useEffect, useState } from "react";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import ExportProjectPanel from "@/components/ExportProjectPanel";
import ExportReelPanel, {
  type ReelDayOption,
} from "@/components/ExportReelPanel";
import {
  applyAudienceBrief,
  audienceIdFromBrief,
  EXPORT_AUDIENCE_OPTIONS,
  getExportAudiencePlan,
  type ExportAudienceId,
} from "@/lib/export-audience";
import {
  fetchTravelExportPrefs,
  saveTravelExportPrefs,
} from "@/lib/export-prefs";
import { defaultThemePackForTemplate } from "@/lib/export/theme-packs";
import { defaultTypePackForTemplate } from "@/lib/export/type-packs";

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
  hasGpsPhotos,
  photoCount,
  allPhotoCount,
  coverPhotos,
  reelDays = [],
  initialTab = "html",
}: ExportFormatTabsProps) {
  const [activeTab, setActiveTab] = useState<ExportFormatTab>(initialTab);
  const [audienceId, setAudienceId] = useState<ExportAudienceId | null>(null);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [audienceHint, setAudienceHint] = useState<string | null>(null);
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  useEffect(() => {
    let cancelled = false;
    void fetchTravelExportPrefs(travelId).then((prefs) => {
      if (cancelled || !prefs) return;
      const fromBrief = audienceIdFromBrief(prefs.exportBrief);
      if (fromBrief) setAudienceId(fromBrief);
    });
    return () => {
      cancelled = true;
    };
  }, [travelId]);

  const applyAudience = useCallback(
    async (id: ExportAudienceId) => {
      const plan = getExportAudiencePlan(id);
      if (!plan) return;
      setAudienceBusy(true);
      setAudienceHint(null);
      try {
        const prefs = await fetchTravelExportPrefs(travelId);
        const nextBrief = applyAudienceBrief(prefs?.exportBrief, plan.briefSeed);
        let prevCache: Record<string, unknown> = {};
        if (prefs?.exportBriefCache) {
          try {
            prevCache = JSON.parse(prefs.exportBriefCache) as Record<string, unknown>;
          } catch {
            prevCache = {};
          }
        }
        const patch: Parameters<typeof saveTravelExportPrefs>[1] = {
          exportBrief: nextBrief,
          exportBriefCache: JSON.stringify({
            ...prevCache,
            target: "audience",
            audienceId: plan.id,
            includeReaderGuide:
              plan.html?.includeReaderGuide ??
              (typeof prevCache.includeReaderGuide === "boolean"
                ? prevCache.includeReaderGuide
                : true),
            at: new Date().toISOString(),
          }),
        };
        if (plan.html) {
          const templateId = plan.html.templateId;
          patch.htmlTemplateId = templateId;
          patch.htmlThemePackId =
            plan.html.themePackId ?? defaultThemePackForTemplate(templateId);
          patch.htmlTypePackId =
            plan.html.typePackId ?? defaultTypePackForTemplate(templateId);
        }
        if (plan.pdf) {
          patch.pdfPresetId = plan.pdf.presetId;
        }
        if (plan.reel) {
          patch.reelPresetId = plan.reel.presetId;
        }
        await saveTravelExportPrefs(travelId, patch);
        setAudienceId(plan.id);
        setActiveTab(plan.tab as ExportFormatTab);
        setPanelKey((k) => k + 1);
        setAudienceHint(
          `Listo: ${plan.label} — brief y preset aplicados. Ajusta solo si quieres.`
        );
      } catch {
        setAudienceHint("No se pudieron guardar las preferencias de audiencia.");
      } finally {
        setAudienceBusy(false);
      }
    },
    [travelId]
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-fg-secondary">
          ¿Para quién es?
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Audiencia del export"
        >
          {EXPORT_AUDIENCE_OPTIONS.map((opt) => {
            const selected = audienceId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={audienceBusy}
                aria-pressed={selected}
                onClick={() => void applyAudience(opt.id)}
                className={`chip-btn max-w-full text-left text-xs sm:text-sm ${
                  selected
                    ? "border-[var(--accent-cyan)] font-semibold text-fg"
                    : ""
                }`}
              >
                <span className="block font-semibold">{opt.label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-fg-tertiary">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
        {audienceHint && (
          <p className="text-xs text-fg-tertiary">{audienceHint}</p>
        )}
      </div>

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
            key={`html-${panelKey}`}
            travelId={travelId}
            hasJournal={hasJournal}
            hasGpsPhotos={hasGpsPhotos}
            photoCount={photoCount}
          />
        )}
        {activeTab === "pdf" && (
          <ExportPdfPanel
            key={`pdf-${panelKey}`}
            travelId={travelId}
            hasJournal={hasJournal}
            photoCount={photoCount}
            coverPhotos={coverPhotos}
          />
        )}
        {activeTab === "video" && (
          <ExportReelPanel
            key={`video-${panelKey}`}
            travelId={travelId}
            travelTitle={travelTitle}
            photoCount={photoCount}
            reelDays={reelDays}
          />
        )}
        {activeTab === "backup" && (
          <ExportProjectPanel
            key={`backup-${panelKey}`}
            travelId={travelId}
            travelTitle={travelTitle}
            photoCount={allPhotoCount ?? photoCount}
          />
        )}
      </section>
    </div>
  );
}
