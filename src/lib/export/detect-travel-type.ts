import type { TravelType } from "@prisma/client";
import type { BuildTimelineInput } from "@/lib/timeline";
import { buildTimeline } from "@/lib/timeline";
import { distanceMeters } from "@/lib/geo";

export interface TravelTypeSuggestion {
  type: TravelType;
  score: number;
  reason: string;
}

function scoreInternational(photos: BuildTimelineInput["photos"]): TravelTypeSuggestion | null {
  const outbound = photos.find((p) => p.isTransportStart && p.latitude != null);
  const inbound = photos.find((p) => p.isTransportEnd && p.latitude != null);
  if (!outbound?.latitude || !inbound?.latitude) return null;
  const dist = distanceMeters(
    outbound.latitude,
    outbound.longitude!,
    inbound.latitude,
    inbound.longitude!
  );
  if (dist > 500_000) {
    return {
      type: "INTERNATIONAL",
      score: 85,
      reason: "Fotos de ida y vuelta muy separadas — viaje internacional",
    };
  }
  if (outbound && inbound) {
    return {
      type: "INTERNATIONAL",
      score: 60,
      reason: "Marcadores de transporte de ida y vuelta",
    };
  }
  return null;
}

function scoreRoadTrip(photos: BuildTimelineInput["photos"]): TravelTypeSuggestion | null {
  const gps = photos
    .filter(
      (p) =>
        !p.isTransportStart &&
        !p.isTransportEnd &&
        p.latitude != null &&
        p.longitude != null &&
        p.exifDateTime
    )
    .sort(
      (a, b) =>
        new Date(a.exifDateTime!).getTime() - new Date(b.exifDateTime!).getTime()
    );
  if (gps.length < 5) return null;

  let totalM = 0;
  for (let i = 1; i < gps.length; i++) {
    totalM += distanceMeters(
      gps[i - 1].latitude!,
      gps[i - 1].longitude!,
      gps[i].latitude!,
      gps[i].longitude!
    );
  }
  const ratio = totalM / gps.length;
  if (ratio > 3000 && gps.length >= 8) {
    return {
      type: "ROAD_TRIP",
      score: 80,
      reason: `${gps.length} fotos GPS en secuencia con muchos km entre ellas`,
    };
  }
  if (gps.length >= 15 && ratio > 1500) {
    return {
      type: "ROAD_TRIP",
      score: 65,
      reason: "Ruta larga con muchas fotos geolocalizadas",
    };
  }
  return null;
}

function scoreCityBreak(
  photos: BuildTimelineInput["photos"],
  places: BuildTimelineInput["places"]
): TravelTypeSuggestion | null {
  const gps = photos.filter((p) => p.latitude != null && !p.isTransportStart && !p.isTransportEnd);
  if (places.length >= 4 && gps.length <= 20) {
    return {
      type: "CITY_BREAK",
      score: 70,
      reason: `${places.length} lugares marcados y pocas fotos dispersas`,
    };
  }
  if (places.length >= 2 && gps.length > 0 && gps.length <= 10) {
    const lats = gps.map((p) => p.latitude!);
    const lngs = gps.map((p) => p.longitude!);
    const span =
      distanceMeters(Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)) /
      1000;
    if (span < 30) {
      return {
        type: "CITY_BREAK",
        score: 75,
        reason: "Fotos y lugares concentrados en un radio pequeño",
      };
    }
  }
  return null;
}

function scoreBeachResort(places: BuildTimelineInput["places"]): TravelTypeSuggestion | null {
  const beach = places.filter((p) => p.type === "BEACH" || p.type === "HOTEL");
  if (beach.length >= 2) {
    return {
      type: "BEACH_RESORT",
      score: 65,
      reason: "Hoteles o playas marcados en el mapa",
    };
  }
  return null;
}

function scoreTrekking(places: BuildTimelineInput["places"]): TravelTypeSuggestion | null {
  const nature = places.filter(
    (p) => p.type === "VIEWPOINT" || p.type === "PARK"
  );
  if (nature.length >= 3) {
    return {
      type: "TREKKING",
      score: 60,
      reason: "Varios miradores o parques naturales",
    };
  }
  return null;
}

function scoreSlowTravel(input: BuildTimelineInput): TravelTypeSuggestion | null {
  const { days } = buildTimeline({ ...input, selectedPhotosOnly: false });
  if (days.length >= 10) {
    const avg = days.reduce((s, d) => s + d.eventCount, 0) / days.length;
    if (avg < 4) {
      return {
        type: "SLOW_TRAVEL",
        score: 55,
        reason: "Viaje largo con pocos eventos por día",
      };
    }
  }
  return null;
}

export function suggestTravelType(input: BuildTimelineInput): TravelTypeSuggestion {
  const candidates: TravelTypeSuggestion[] = [];

  const intl = scoreInternational(input.photos);
  if (intl) candidates.push(intl);
  const road = scoreRoadTrip(input.photos);
  if (road) candidates.push(road);
  const city = scoreCityBreak(input.photos, input.places);
  if (city) candidates.push(city);
  const beach = scoreBeachResort(input.places);
  if (beach) candidates.push(beach);
  const trek = scoreTrekking(input.places);
  if (trek) candidates.push(trek);
  const slow = scoreSlowTravel(input);
  if (slow) candidates.push(slow);

  candidates.sort((a, b) => b.score - a.score);
  return (
    candidates[0] ?? {
      type: "GENERIC",
      score: 50,
      reason: "Sin patrón claro — diario equilibrado",
    }
  );
}

export function resolveTravelType(
  fixed: TravelType | null | undefined,
  input: BuildTimelineInput
): TravelType {
  if (fixed) return fixed;
  return suggestTravelType(input).type;
}
