import type { ExportFormat } from "@/lib/export-html";
import { buildExportZip, buildSingleFileHtml, type ExportContext } from "@/lib/export-html";

export type ExportPipelineStep =
  | "load"
  | "exif"
  | "photos"
  | "html"
  | "map"
  | "pack"
  | "embed"
  | "complete";

export interface ExportPipelineEvent {
  step: ExportPipelineStep | "error";
  status: "running" | "done" | "error";
  message?: string;
  filename?: string;
  contentType?: string;
  blobBase64?: string;
}

export type ExportProgressCallback = (event: ExportPipelineEvent) => void;

export async function buildExportArtifact(
  ctx: ExportContext,
  format: ExportFormat,
  onProgress?: ExportProgressCallback
): Promise<Buffer> {
  if (format === "html") {
    return buildSingleFileHtml(ctx, onProgress);
  }
  return buildExportZip(ctx, onProgress);
}
