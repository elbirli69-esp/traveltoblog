import type { PdfPageFormat, PdfTemplate } from "@/lib/export-pdf-types";

/** Print bleed for professional photobook (3 mm beyond trim). */
export const PDF_BLEED_MM = 3;

export function pageSizeCss(format: PdfPageFormat): string {
  if (format === "square") return `size: 210mm 210mm; margin: 0; bleed: ${PDF_BLEED_MM}mm;`;
  return `size: 297mm 210mm; margin: 0; bleed: ${PDF_BLEED_MM}mm;`;
}

export function pageDimensions(format: PdfPageFormat): { width: string; height: string } {
  if (format === "square") return { width: "210mm", height: "210mm" };
  return { width: "297mm", height: "210mm" };
}

interface ThemeTokens {
  pageBg: string;
  text: string;
  textMuted: string;
  accent: string;
  serif: string;
  sans: string;
  coverBg: string;
  coverText: string;
  coverEyebrow: string;
  dividerBg: string;
  dividerText: string;
  matBg: string;
  matBorder: string;
  featuredColBg: string;
  pairBorder: string;
  closingBg: string;
  closingText: string;
  closingMuted: string;
  mapBg: string;
  mosaicBg: string;
}

const THEMES: Record<PdfTemplate, ThemeTokens> = {
  classic: {
    pageBg: "#faf8f5",
    text: "#1a1816",
    textMuted: "#78716c",
    accent: "#c4b5a5",
    serif: '"Liberation Serif", Georgia, serif',
    sans: '"Liberation Sans", "Helvetica Neue", Arial, sans-serif',
    coverBg: "#0c0a09",
    coverText: "#fafaf9",
    coverEyebrow: "#d6d3d1",
    dividerBg: "#f5f2ec",
    dividerText: "#1c1917",
    matBg: "#fff",
    matBorder: "#e7e5e4",
    featuredColBg: "#f5f2ec",
    pairBorder: "#ebe6df",
    closingBg: "#1c1917",
    closingText: "#fafaf9",
    closingMuted: "#a8a29e",
    mapBg: "#f0ebe3",
    mosaicBg: "#faf8f5",
  },
  minimal: {
    pageBg: "#ffffff",
    text: "#111827",
    textMuted: "#6b7280",
    accent: "#d1d5db",
    serif: '"Liberation Sans", "Helvetica Neue", Arial, sans-serif',
    sans: '"Liberation Sans", "Helvetica Neue", Arial, sans-serif',
    coverBg: "#ffffff",
    coverText: "#111827",
    coverEyebrow: "#6b7280",
    dividerBg: "#ffffff",
    dividerText: "#111827",
    matBg: "#ffffff",
    matBorder: "#e5e7eb",
    featuredColBg: "#ffffff",
    pairBorder: "#f3f4f6",
    closingBg: "#f9fafb",
    closingText: "#111827",
    closingMuted: "#9ca3af",
    mapBg: "#ffffff",
    mosaicBg: "#ffffff",
  },
  "dark-magazine": {
    pageBg: "#0f0f0f",
    text: "#f5f5f4",
    textMuted: "#a8a29e",
    accent: "#f97316",
    serif: '"Liberation Serif", Georgia, serif',
    sans: '"Liberation Sans", "Helvetica Neue", Arial, sans-serif',
    coverBg: "#000000",
    coverText: "#fafaf9",
    coverEyebrow: "#fb923c",
    dividerBg: "#171717",
    dividerText: "#fafaf9",
    matBg: "#262626",
    matBorder: "#404040",
    featuredColBg: "#171717",
    pairBorder: "#262626",
    closingBg: "#000000",
    closingText: "#fafaf9",
    closingMuted: "#78716c",
    mapBg: "#0a0a0a",
    mosaicBg: "#141414",
  },
};

export function getPdfThemeCss(template: PdfTemplate, format: PdfPageFormat): string {
  const t = THEMES[template];
  const bleed = PDF_BLEED_MM;

  return `
    @page { ${pageSizeCss(format)} }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: ${t.sans};
      color: ${t.text};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      overflow: hidden;
      background: ${t.pageBg};
    }

    .page-safe {
      padding: ${bleed}mm;
    }

    .page-bleed-full,
    .page-cover {
      margin: -${bleed}mm;
      width: calc(100% + ${bleed * 2}mm);
      height: calc(100% + ${bleed * 2}mm);
    }

    .page-footer {
      position: absolute;
      bottom: ${bleed + 2}mm;
      left: ${bleed}mm;
      right: ${bleed}mm;
      text-align: center;
      font-size: 7pt;
      letter-spacing: 0.2em;
      color: ${t.textMuted};
      z-index: 2;
    }

    /* —— Cover —— */
    .page-cover { background: ${t.coverBg}; color: ${t.coverText}; }

    .cover-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-scrim {
      position: absolute;
      inset: 0;
      background: ${
        template === "minimal"
          ? "linear-gradient(180deg, transparent 50%, rgba(255,255,255,0.92) 100%)"
          : template === "dark-magazine"
            ? "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.88) 100%)"
            : "linear-gradient(180deg, rgba(12,10,9,0.35) 0%, rgba(12,10,9,0.2) 40%, rgba(12,10,9,0.82) 100%)"
      };
    }

    .cover-inner {
      position: absolute;
      left: ${bleed}mm;
      right: ${bleed}mm;
      bottom: ${bleed}mm;
      padding: 0 0 ${bleed + 4}mm;
      text-align: left;
      z-index: 1;
    }

    .cover-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: ${t.coverEyebrow};
      margin-bottom: 5mm;
    }

    .cover-title {
      font-family: ${t.serif};
      font-size: ${template === "minimal" ? "28pt" : "32pt"};
      font-weight: ${template === "minimal" ? "300" : "400"};
      line-height: 1.08;
      letter-spacing: ${template === "minimal" ? "0.02em" : "-0.02em"};
      max-width: 85%;
      color: ${t.coverText};
    }

    .cover-sub {
      margin-top: 5mm;
      font-size: 9.5pt;
      color: ${t.coverEyebrow};
      letter-spacing: 0.06em;
    }

    /* —— Map —— */
    .page-map { background: ${t.mapBg}; }

    .map-inner {
      display: table;
      width: 100%;
      height: 100%;
    }

    .map-content {
      display: table-cell;
      vertical-align: middle;
      padding: ${bleed + 8}mm ${bleed + 10}mm;
    }

    .map-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: ${t.textMuted};
      margin-bottom: 4mm;
    }

    .map-title {
      font-family: ${t.serif};
      font-size: 20pt;
      font-weight: 400;
      margin-bottom: 6mm;
      color: ${t.text};
    }

    .map-frame {
      background: ${t.matBg};
      border: 0.2mm solid ${t.matBorder};
      padding: 2mm;
    }

    .map-frame img {
      display: block;
      width: 100%;
      max-height: 140mm;
      object-fit: contain;
    }

    .map-caption {
      margin-top: 4mm;
      font-size: 8pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${t.textMuted};
    }

    .map-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 2.5mm 4mm;
      margin-top: 3mm;
      justify-content: center;
    }

    .map-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 1.5mm;
      font-size: 7.5pt;
      color: ${t.textMuted};
    }

    .map-legend-item i {
      display: inline-block;
      width: 6mm;
      height: 1.2mm;
      border-radius: 1mm;
    }

    /* —— Day divider —— */
    .page-divider {
      display: table;
      background: ${t.dividerBg};
    }

    .divider-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: ${bleed + 12}mm;
      width: 100%;
    }

    .divider-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: ${t.textMuted};
      margin-bottom: 6mm;
    }

    .divider-title {
      font-family: ${t.serif};
      font-size: 26pt;
      font-weight: 400;
      color: ${t.dividerText};
      line-height: 1.15;
      margin-bottom: 8mm;
    }

    .divider-rule {
      width: 18mm;
      height: 0.4mm;
      background: ${t.accent};
      margin: 0 auto;
    }

    .divider-intro {
      max-width: 120mm;
      max-height: 95mm;
      margin: 0 auto;
      text-align: left;
      font-family: ${t.serif};
      font-size: 10.5pt;
      line-height: 1.6;
      color: ${t.textMuted};
      overflow: hidden;
    }

    .divider-intro img {
      display: none !important;
    }

    .divider-intro h2 { font-size: 13pt; margin-bottom: 3mm; color: ${t.text}; }

    /* —— Full bleed —— */
    .page-bleed { background: #000; }

    .bleed-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .bleed-caption {
      position: absolute;
      left: ${bleed}mm;
      right: ${bleed}mm;
      bottom: ${bleed}mm;
      padding: 8mm 6mm 6mm;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
      color: #fafaf9;
      z-index: 1;
    }

    .caption-main {
      font-size: 9pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .caption-sub {
      margin-top: 1.5mm;
      font-family: ${t.serif};
      font-size: 11pt;
      font-style: italic;
      opacity: 0.92;
      max-width: 160mm;
    }

    /* —— Mosaic —— */
    .page-mosaic {
      display: table;
      table-layout: fixed;
      width: 100%;
      background: ${t.mosaicBg};
    }

    .mosaic-row {
      display: table-row;
    }

    .mosaic-cell {
      display: table-cell;
      vertical-align: top;
      padding: ${bleed + 6}mm ${bleed + 4}mm;
      text-align: center;
    }

    .mosaic-mat img {
      max-height: ${format === "square" ? "75mm" : "85mm"};
    }

    .mosaic-caption {
      margin-top: 3mm;
      font-size: 7pt;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${t.textMuted};
    }

    /* —— Featured (photo-led; crónica lives on day-divider) —— */
    .page-featured {
      display: table;
      width: 100%;
      background: ${t.featuredColBg};
    }

    .featured-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: ${bleed + 10}mm ${bleed + 18}mm;
    }

    .photo-mat {
      background: ${t.matBg};
      padding: 3mm;
      border: 0.2mm solid ${t.matBorder};
    }

    .photo-mat img {
      display: block;
      width: 100%;
      max-height: 150mm;
      object-fit: contain;
    }

    .featured-mat {
      display: inline-block;
      max-width: 160mm;
      width: 100%;
      text-align: left;
    }

    .featured-mat img {
      max-height: ${format === "square" ? "120mm" : "145mm"};
    }

    .featured-caption {
      margin-top: 4mm;
      font-size: 8pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: ${t.textMuted};
    }

    .featured-note,
    .featured-byline {
      margin: 2.5mm auto 0;
      max-width: 140mm;
      font-family: ${t.serif};
      font-size: 11pt;
      font-style: italic;
      color: ${t.text};
      line-height: 1.45;
    }

    .featured-byline {
      color: ${t.textMuted};
      font-size: 9.5pt;
    }

    /* —— Pair —— */
    .page-pair {
      display: table;
      table-layout: fixed;
      width: 100%;
    }

    .pair-cell {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      padding: ${bleed + 10}mm ${bleed + 8}mm;
      text-align: center;
    }

    .pair-cell:first-child {
      border-right: 0.2mm solid ${t.pairBorder};
    }

    .pair-mat img {
      max-height: 130mm;
    }

    .pair-caption {
      margin-top: 5mm;
      font-size: 8pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${t.textMuted};
    }

    .pair-note {
      margin-top: 2mm;
      font-family: ${t.serif};
      font-size: 9.5pt;
      font-style: italic;
      color: ${t.textMuted};
      line-height: 1.4;
      max-width: 85mm;
      margin-left: auto;
      margin-right: auto;
    }

    /* —— Closing —— */
    .page-closing {
      display: table;
      background: ${t.closingBg};
      color: ${t.closingText};
    }

    .closing-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: ${bleed + 14}mm;
    }

    .closing-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: ${t.closingMuted};
      margin-bottom: 6mm;
    }

    .closing-title {
      font-family: ${t.serif};
      font-size: 22pt;
      font-weight: 400;
      margin-bottom: 4mm;
    }

    .closing-meta {
      font-size: 9pt;
      color: ${t.closingMuted};
      margin-bottom: 12mm;
    }

    .closing-brand {
      font-size: 7pt;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: ${t.closingMuted};
    }
  `;
}
