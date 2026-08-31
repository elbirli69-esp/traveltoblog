import type { TravelType } from "@prisma/client";

export type SectionId =
  | "hero"
  | "stats"
  | "flights"
  | "map"
  | "timeline"
  | "gallery"
  | "journal"
  | "play";

export interface TypologyProfile {
  id: TravelType;
  label: string;
  description: string;
  sectionOrder: SectionId[];
  mapConfig: {
    showRoute: boolean;
    showDaySidebar: boolean;
    clusterBy: "day" | "none";
    emphasis: "route" | "pois" | "flights";
  };
  playProfile: {
    unit: "day" | "event";
    mapBehavior: "follow" | "jump";
    showScrubber: boolean;
  };
  statsLabels?: { distance?: boolean; days?: boolean; places?: boolean };
}

export const TYPOLOGY_PROFILES: Record<TravelType, TypologyProfile> = {
  GENERIC: {
    id: "GENERIC",
    label: "Genérico",
    description: "Equilibrio entre mapa, cronología y galería",
    sectionOrder: ["hero", "map", "timeline", "gallery", "journal", "play"],
    mapConfig: {
      showRoute: true,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "route",
    },
    playProfile: { unit: "day", mapBehavior: "jump", showScrubber: true },
  },
  CITY_BREAK: {
    id: "CITY_BREAK",
    label: "Ciudad",
    description: "Cronología densa de lugares, mapa de POIs",
    sectionOrder: ["hero", "timeline", "map", "gallery", "journal", "play"],
    mapConfig: {
      showRoute: false,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "pois",
    },
    playProfile: { unit: "event", mapBehavior: "jump", showScrubber: true },
  },
  ROAD_TRIP: {
    id: "ROAD_TRIP",
    label: "Carretera",
    description: "Ruta protagonista con km y paradas numeradas",
    sectionOrder: ["hero", "stats", "map", "timeline", "gallery", "play"],
    mapConfig: {
      showRoute: true,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "route",
    },
    playProfile: { unit: "day", mapBehavior: "follow", showScrubber: true },
    statsLabels: { distance: true, days: true },
  },
  INTERNATIONAL: {
    id: "INTERNATIONAL",
    label: "Internacional",
    description: "Tres actos: ida, destino y vuelta",
    sectionOrder: ["hero", "flights", "map", "timeline", "journal", "gallery", "play"],
    mapConfig: {
      showRoute: false,
      showDaySidebar: false,
      clusterBy: "none",
      emphasis: "flights",
    },
    playProfile: { unit: "day", mapBehavior: "jump", showScrubber: true },
  },
  BEACH_RESORT: {
    id: "BEACH_RESORT",
    label: "Playa / resort",
    description: "Días en la misma zona, galería protagonista",
    sectionOrder: ["hero", "gallery", "timeline", "map", "journal", "play"],
    mapConfig: {
      showRoute: false,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "pois",
    },
    playProfile: { unit: "day", mapBehavior: "jump", showScrubber: true },
  },
  TREKKING: {
    id: "TREKKING",
    label: "Trekking",
    description: "Etapas y waypoints en naturaleza",
    sectionOrder: ["hero", "stats", "map", "timeline", "gallery", "play"],
    mapConfig: {
      showRoute: true,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "route",
    },
    playProfile: { unit: "event", mapBehavior: "jump", showScrubber: true },
    statsLabels: { days: true, places: true },
  },
  SLOW_TRAVEL: {
    id: "SLOW_TRAVEL",
    label: "Estancia larga",
    description: "Ritmo lento, cronología por semanas",
    sectionOrder: ["hero", "timeline", "gallery", "map", "journal", "play"],
    mapConfig: {
      showRoute: false,
      showDaySidebar: true,
      clusterBy: "day",
      emphasis: "pois",
    },
    playProfile: { unit: "day", mapBehavior: "jump", showScrubber: true },
    statsLabels: { days: true },
  },
};

export function getTypologyProfile(id: TravelType): TypologyProfile {
  return TYPOLOGY_PROFILES[id] ?? TYPOLOGY_PROFILES.GENERIC;
}

export const TYPOLOGY_LIST = Object.values(TYPOLOGY_PROFILES);
