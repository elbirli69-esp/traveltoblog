import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import type {
  MediaType,
  NoteType,
  PlaceType,
  TravelType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateShareCode, createLocalId } from "@/lib/utils";
import { photoFilePath } from "@/lib/photo-storage";
import { generateThumbnail } from "@/lib/photo-thumbnail";
import {
  parseProjectManifest,
  PROJECT_BACKUP_FORMAT,
  PROJECT_BACKUP_VERSION,
  type ProjectBackupManifestV1,
} from "@/lib/project-backup-format";

export {
  parseProjectManifest,
  PROJECT_BACKUP_FORMAT,
  PROJECT_BACKUP_VERSION,
  type ProjectBackupManifestV1,
} from "@/lib/project-backup-format";

/**
 * TravelToBlog project backup — full restore package (metadata + media).
 *
 * ZIP layout:
 *   manifest.json
 *   LEEME.txt
 *   media/<oldPhotoId>/<filename>
 *   media/<oldPhotoId>/<posterFilename>   (videos)
 */

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function mediaRelPath(photoId: string, filename: string): string {
  return `media/${photoId}/${filename}`;
}

export async function buildProjectBackup(
  travelId: string
): Promise<{ buffer: Buffer; filename: string; manifest: ProjectBackupManifestV1 }> {
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    include: {
      users: { orderBy: { createdAt: "asc" } },
      places: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      gpsTracks: { orderBy: { createdAt: "asc" } },
      creator: { select: { alias: true } },
    },
  });

  if (!travel) {
    throw new Error("Viaje no encontrado");
  }

  const missing: string[] = [];
  const zip = new JSZip();

  const photoEntries: ProjectBackupManifestV1["photos"] = [];

  for (const photo of travel.photos) {
    const mediaPath = mediaRelPath(photo.id, photo.filename);
    let included = false;
    try {
      const buf = await readFile(photoFilePath(travel.id, photo.filename));
      zip.file(mediaPath, buf, { compression: "STORE" });
      included = true;
    } catch {
      missing.push(mediaPath);
    }

    let posterPath: string | null = null;
    if (photo.posterFilename) {
      posterPath = mediaRelPath(photo.id, photo.posterFilename);
      try {
        const posterBuf = await readFile(
          photoFilePath(travel.id, photo.posterFilename)
        );
        zip.file(posterPath, posterBuf, { compression: "STORE" });
      } catch {
        missing.push(posterPath);
        posterPath = null;
      }
    }

    if (!included) {
      // Still record metadata so restore can surface the gap
    }

    photoEntries.push({
      id: photo.id,
      userId: photo.userId,
      filename: photo.filename,
      mediaPath: included ? mediaPath : mediaPath,
      posterFilename: photo.posterFilename,
      posterPath,
      mediaType: photo.mediaType,
      durationMs: photo.durationMs,
      exifDateTime: iso(photo.exifDateTime),
      latitude: photo.latitude,
      longitude: photo.longitude,
      placeId: photo.placeId,
      selected: photo.selected,
      highlightScore: photo.highlightScore,
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
      createdAt: photo.createdAt.toISOString(),
    });
  }

  const manifest: ProjectBackupManifestV1 = {
    format: PROJECT_BACKUP_FORMAT,
    version: PROJECT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    travel: {
      title: travel.title,
      startDate: iso(travel.startDate),
      endDate: iso(travel.endDate),
      journalMarkdown: travel.journalMarkdown,
      journalGeneratedAt: iso(travel.journalGeneratedAt),
      journalMarkdownPrevious: travel.journalMarkdownPrevious,
      journalBrief: travel.journalBrief,
      exportBrief: travel.exportBrief,
      exportBriefCache: travel.exportBriefCache,
      htmlTemplateId: travel.htmlTemplateId,
      htmlThemePackId: travel.htmlThemePackId,
      htmlTypePackId: travel.htmlTypePackId,
      reelPresetId: travel.reelPresetId,
      pdfPresetId: travel.pdfPresetId,
      destinationName: travel.destinationName ?? null,
      destinationThemes: travel.destinationThemes ?? null,
      travelType: travel.travelType as ProjectBackupManifestV1["travel"]["travelType"],
      creatorAlias: travel.creator?.alias ?? travel.users[0]?.alias ?? null,
      startPhotoId: travel.startPhotoId,
      endPhotoId: travel.endPhotoId,
    },
    users: travel.users.map((u) => ({
      id: u.id,
      alias: u.alias,
      createdAt: u.createdAt.toISOString(),
    })),
    places: travel.places.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      type: p.type,
      latitude: p.latitude,
      longitude: p.longitude,
      comment: p.comment,
      visitedAt: iso(p.visitedAt),
      highlightScore: p.highlightScore,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    photos: photoEntries,
    notes: travel.notes.map((n) => ({
      id: n.id,
      userId: n.userId,
      photoId: n.photoId,
      placeId: n.placeId,
      type: n.type,
      dayDate: iso(n.dayDate),
      text: n.text,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
    gpsTracks: travel.gpsTracks.map((t) => ({
      id: t.id,
      userId: t.userId,
      startedAt: t.startedAt.toISOString(),
      endedAt: iso(t.endedAt),
      points: t.points,
      includeInExport: t.includeInExport,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    media: {
      included: photoEntries.filter((p) => !missing.includes(p.mediaPath)).length,
      missing,
    },
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "LEEME.txt",
    [
      "Copia de seguridad TravelToBlog",
      "================================",
      "",
      `Viaje: ${travel.title}`,
      `Exportado: ${manifest.exportedAt}`,
      `Formato: ${PROJECT_BACKUP_FORMAT} v${PROJECT_BACKUP_VERSION}`,
      "",
      "Contiene metadatos (lugares, notas, diario, GPS) y los archivos de media.",
      "Para restaurar: en la app → inicio → «Importar copia» o Exportar → Copia → Importar.",
      "",
      "No abras este ZIP como álbum HTML; usa el export HTML/ZIP del diario para eso.",
      "",
    ].join("\n")
  );

  const buffer = Buffer.from(
    await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
  );

  const slug =
    travel.title
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "viaje";

  const day = new Date().toISOString().slice(0, 10);
  return {
    buffer,
    filename: `traveltoblog-backup-${slug}-${day}.zip`,
    manifest,
  };
}

export type ImportProjectResult = {
  travel: { id: string; title: string; shareCode: string };
  user: { id: string; alias: string; travelId: string };
  stats: {
    users: number;
    places: number;
    photos: number;
    notes: number;
    gpsTracks: number;
    mediaRestored: number;
    mediaMissing: number;
  };
  warnings: string[];
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function importProjectBackup(
  zipBuffer: Buffer,
  options?: { importerAlias?: string }
): Promise<ImportProjectResult> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Falta manifest.json en la copia");
  }
  const manifest = parseProjectManifest(
    JSON.parse(await manifestFile.async("text"))
  );

  const warnings: string[] = [...(manifest.media.missing ?? [])].map(
    (p) => `Falta en la copia: ${p}`
  );

  const shareCode = generateShareCode();
  const originalCreatorAlias =
    manifest.travel.creatorAlias || manifest.users[0]?.alias || "Viajero";
  const sessionAlias =
    options?.importerAlias?.trim() || originalCreatorAlias;

  const result = await prisma.$transaction(async (tx) => {
    const travel = await tx.travel.create({
      data: {
        title: manifest.travel.title,
        shareCode,
        startDate: parseDate(manifest.travel.startDate),
        endDate: parseDate(manifest.travel.endDate),
        journalMarkdown: manifest.travel.journalMarkdown,
        journalGeneratedAt: parseDate(manifest.travel.journalGeneratedAt),
        journalMarkdownPrevious: manifest.travel.journalMarkdownPrevious,
        journalBrief: manifest.travel.journalBrief,
        exportBrief: manifest.travel.exportBrief,
        exportBriefCache: manifest.travel.exportBriefCache,
        htmlTemplateId: manifest.travel.htmlTemplateId,
        htmlThemePackId: manifest.travel.htmlThemePackId,
        htmlTypePackId: manifest.travel.htmlTypePackId,
        reelPresetId: manifest.travel.reelPresetId,
        pdfPresetId: manifest.travel.pdfPresetId,
        destinationName: manifest.travel.destinationName ?? null,
        destinationThemes: manifest.travel.destinationThemes ?? null,
        travelType: manifest.travel.travelType as TravelType | null,
      },
    });

    const userMap = new Map<string, string>();
    for (const u of manifest.users) {
      const created = await tx.user.create({
        data: {
          alias: u.alias,
          travelId: travel.id,
        },
      });
      userMap.set(u.id, created.id);
    }

    // Ensure original creator alias exists and is marked as creator
    let creatorUserId: string | undefined;
    const creatorOld = manifest.users.find(
      (u) => u.alias === originalCreatorAlias
    );
    if (creatorOld && userMap.has(creatorOld.id)) {
      creatorUserId = userMap.get(creatorOld.id);
    } else {
      const byAlias = await tx.user.findUnique({
        where: {
          travelId_alias: { travelId: travel.id, alias: originalCreatorAlias },
        },
      });
      if (byAlias) {
        creatorUserId = byAlias.id;
      } else {
        const created = await tx.user.create({
          data: { alias: originalCreatorAlias, travelId: travel.id },
        });
        creatorUserId = created.id;
      }
    }

    if (!creatorUserId) {
      const first = await tx.user.findFirst({ where: { travelId: travel.id } });
      if (!first) throw new Error("No se pudo crear usuarios del viaje");
      creatorUserId = first.id;
    }

    await tx.travel.update({
      where: { id: travel.id },
      data: { creatorId: creatorUserId },
    });

    // Session user: importer alias if distinct from restored users
    let sessionUserId = creatorUserId;
    if (sessionAlias !== originalCreatorAlias) {
      const existing = await tx.user.findUnique({
        where: {
          travelId_alias: { travelId: travel.id, alias: sessionAlias },
        },
      });
      if (existing) {
        sessionUserId = existing.id;
      } else {
        const created = await tx.user.create({
          data: { alias: sessionAlias, travelId: travel.id },
        });
        sessionUserId = created.id;
      }
    } else {
      sessionUserId = creatorUserId;
    }

    const placeMap = new Map<string, string>();
    for (const p of manifest.places) {
      const userId = userMap.get(p.userId) ?? creatorUserId;
      const created = await tx.place.create({
        data: {
          travelId: travel.id,
          userId,
          name: p.name,
          type: p.type as PlaceType,
          latitude: p.latitude,
          longitude: p.longitude,
          comment: p.comment,
          visitedAt: parseDate(p.visitedAt),
          highlightScore: p.highlightScore ?? 0,
          localId: createLocalId(),
        },
      });
      placeMap.set(p.id, created.id);
    }

    const photoMap = new Map<string, string>();
    const photoWriteJobs: Array<{
      oldId: string;
      newId: string;
      filename: string;
      posterFilename: string | null;
      mediaPath: string;
      posterPath: string | null;
      mediaType: MediaType;
    }> = [];

    for (const p of manifest.photos) {
      const userId = userMap.get(p.userId) ?? creatorUserId;
      const localId = createLocalId();
      const ext = path.extname(p.filename) || ".jpg";
      const filename = `${localId}${ext}`;
      let posterFilename: string | null = null;
      if (p.posterFilename) {
        posterFilename = `${localId}.poster.jpg`;
      }

      const created = await tx.photo.create({
        data: {
          travelId: travel.id,
          userId,
          filename,
          url: `/uploads/${travel.id}/${filename}`,
          mediaType: (p.mediaType as MediaType) ?? "IMAGE",
          durationMs: p.durationMs,
          posterFilename,
          exifDateTime: parseDate(p.exifDateTime),
          latitude: p.latitude,
          longitude: p.longitude,
          placeId: p.placeId ? placeMap.get(p.placeId) ?? null : null,
          selected: p.selected ?? true,
          highlightScore: p.highlightScore ?? 0,
          isTransportStart: p.isTransportStart ?? false,
          isTransportEnd: p.isTransportEnd ?? false,
          localId,
        },
      });
      photoMap.set(p.id, created.id);
      photoWriteJobs.push({
        oldId: p.id,
        newId: created.id,
        filename,
        posterFilename,
        mediaPath: p.mediaPath,
        posterPath: p.posterPath,
        mediaType: (p.mediaType as MediaType) ?? "IMAGE",
      });
    }

    for (const n of manifest.notes) {
      const userId = userMap.get(n.userId) ?? creatorUserId;
      await tx.note.create({
        data: {
          travelId: travel.id,
          userId,
          photoId: n.photoId ? photoMap.get(n.photoId) ?? null : null,
          placeId: n.placeId ? placeMap.get(n.placeId) ?? null : null,
          type: n.type as NoteType,
          dayDate: parseDate(n.dayDate),
          text: n.text,
          localId: createLocalId(),
        },
      });
    }

    for (const t of manifest.gpsTracks ?? []) {
      const userId = userMap.get(t.userId) ?? creatorUserId;
      await tx.gpsTrack.create({
        data: {
          travelId: travel.id,
          userId,
          startedAt: parseDate(t.startedAt) ?? new Date(),
          endedAt: parseDate(t.endedAt),
          points: t.points || "[]",
          includeInExport: t.includeInExport ?? false,
        },
      });
    }

    const startPhotoId = manifest.travel.startPhotoId
      ? photoMap.get(manifest.travel.startPhotoId) ?? null
      : null;
    const endPhotoId = manifest.travel.endPhotoId
      ? photoMap.get(manifest.travel.endPhotoId) ?? null
      : null;

    if (startPhotoId || endPhotoId) {
      await tx.travel.update({
        where: { id: travel.id },
        data: { startPhotoId, endPhotoId },
      });
    }

    return {
      travel,
      sessionUserId,
      photoWriteJobs,
      counts: {
        users: await tx.user.count({ where: { travelId: travel.id } }),
        places: placeMap.size,
        photos: photoMap.size,
        notes: manifest.notes.length,
        gpsTracks: (manifest.gpsTracks ?? []).length,
      },
    };
  });

  // Write media outside the DB transaction
  await mkdir(path.join(process.cwd(), "public", "uploads", result.travel.id), {
    recursive: true,
  });

  let mediaRestored = 0;
  let mediaMissing = 0;

  for (const job of result.photoWriteJobs) {
    const entry = zip.file(job.mediaPath);
    if (!entry) {
      mediaMissing += 1;
      warnings.push(`Sin archivo de media: ${job.mediaPath}`);
      continue;
    }
    try {
      const buf = Buffer.from(await entry.async("nodebuffer"));
      await writeFile(photoFilePath(result.travel.id, job.filename), buf);
      if (job.mediaType === "IMAGE") {
        try {
          await generateThumbnail(buf, result.travel.id, job.filename);
        } catch {
          // thumbs are optional
        }
      }
      mediaRestored += 1;
    } catch (err) {
      mediaMissing += 1;
      warnings.push(
        `No se pudo restaurar ${job.mediaPath}: ${
          err instanceof Error ? err.message : "error"
        }`
      );
    }

    if (job.posterFilename && job.posterPath) {
      const posterEntry = zip.file(job.posterPath);
      if (posterEntry) {
        try {
          const posterBuf = Buffer.from(await posterEntry.async("nodebuffer"));
          await writeFile(
            photoFilePath(result.travel.id, job.posterFilename),
            posterBuf
          );
          try {
            await generateThumbnail(
              posterBuf,
              result.travel.id,
              job.filename
            );
          } catch {
            // optional
          }
        } catch {
          warnings.push(`No se pudo restaurar póster: ${job.posterPath}`);
        }
      }
    }
  }

  const sessionUser = await prisma.user.findUniqueOrThrow({
    where: { id: result.sessionUserId },
  });

  return {
    travel: {
      id: result.travel.id,
      title: result.travel.title,
      shareCode: result.travel.shareCode,
    },
    user: {
      id: sessionUser.id,
      alias: sessionUser.alias,
      travelId: result.travel.id,
    },
    stats: {
      ...result.counts,
      mediaRestored,
      mediaMissing,
    },
    warnings,
  };
}
