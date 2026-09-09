/**
 * Shared format constants + manifest validation (no Node/Prisma deps).
 */

export const PROJECT_BACKUP_FORMAT = "traveltoblog-project" as const;
export const PROJECT_BACKUP_VERSION = 1 as const;

export type ProjectBackupManifestV1 = {
  format: typeof PROJECT_BACKUP_FORMAT;
  version: typeof PROJECT_BACKUP_VERSION;
  exportedAt: string;
  travel: {
    title: string;
    startDate: string | null;
    endDate: string | null;
    journalMarkdown: string | null;
    journalGeneratedAt: string | null;
    journalMarkdownPrevious: string | null;
    journalBlogMarkdown?: string | null;
    journalBlogGeneratedAt?: string | null;
    journalBlogMarkdownPrevious?: string | null;
    journalBrief: string | null;
    exportBrief: string | null;
    exportBriefCache: string | null;
    htmlTemplateId: string | null;
    htmlThemePackId: string | null;
    htmlTypePackId: string | null;
    htmlJournalSource?: string | null;
    reelPresetId: string | null;
    pdfPresetId: string | null;
    /** Optional B5 destination fiche (older backups omit these). */
    destinationName?: string | null;
    destinationThemes?: string | null;
    travelType: string | null;
    creatorAlias: string | null;
    startPhotoId: string | null;
    endPhotoId: string | null;
  };
  users: Array<{
    id: string;
    alias: string;
    createdAt: string;
  }>;
  places: Array<{
    id: string;
    userId: string;
    name: string;
    type: string;
    latitude: number;
    longitude: number;
    comment: string | null;
    visitedAt: string | null;
    highlightScore: number;
    createdAt: string;
    updatedAt: string;
  }>;
  photos: Array<{
    id: string;
    userId: string;
    filename: string;
    mediaPath: string;
    posterFilename: string | null;
    posterPath: string | null;
    mediaType: string;
    durationMs: number | null;
    exifDateTime: string | null;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
    selected: boolean;
    highlightScore: number;
    isTransportStart: boolean;
    isTransportEnd: boolean;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    userId: string;
    photoId: string | null;
    placeId: string | null;
    type: string;
    dayDate: string | null;
    text: string;
    createdAt: string;
    updatedAt: string;
  }>;
  gpsTracks: Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt: string | null;
    points: string;
    includeInExport: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  media: {
    included: number;
    missing: string[];
  };
};

export function parseProjectManifest(raw: unknown): ProjectBackupManifestV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("manifest.json inválido");
  }
  const m = raw as Partial<ProjectBackupManifestV1>;
  if (m.format !== PROJECT_BACKUP_FORMAT) {
    throw new Error("Este ZIP no es una copia TravelToBlog");
  }
  if (m.version !== 1) {
    throw new Error(`Versión de copia no soportada: ${String(m.version)}`);
  }
  if (!m.travel?.title || !Array.isArray(m.users) || !Array.isArray(m.photos)) {
    throw new Error("manifest.json incompleto");
  }
  return m as ProjectBackupManifestV1;
}
