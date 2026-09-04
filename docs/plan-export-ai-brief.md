# Plan: brief creativo de export (IA → directrices de presentación)

## Objetivo

Permitir indicar **en lenguaje natural** cómo debe verse y sentirse cada export (HTML, vídeo, PDF), igual que el brief de la crónica — pero **no** como selector de plantilla/tipología, sino como **dirección creativa** que enriquece la presentación:

- HTML: peso de imágenes, tamaño, galería, prosa…
- Vídeo: nº de fotos, ritmo, textos sobre imagen, transiciones…
- PDF (fase posterior): densidad visual vs texto, full-bleed…

La IA **no genera HTML/CSS/MP4 libres**. Traduce el brief a un **JSON tipado de directrices** que los renderers existentes aplican.

## Principio

```
Brief NL  →  IA  →  ExportDirectives (JSON)  →  HTML / Reel / PDF
                         ↑
              knobs reales del código actual
              (+ los que añadamos)
```

Misma filosofía que `Travel.journalBrief`: el usuario dirige; el sistema interpreta y aplica.

---

## Modelo de datos (propuesta)

### Persistencia

Opción A (recomendada, alineada con crónica):

| Campo | Uso |
|-------|-----|
| `Travel.exportBrief` | Texto libre del usuario |
| `Travel.exportDirectives` | JSON cacheado de la última interpretación (opcional) |

Opción B: brief **por export** en el panel (no persistido) — más simple al inicio, peor UX al reexportar.

**Recomendación:** empezar con brief en el panel (sesión) + botón «Interpretar»; en P2 persistir en `Travel` como `journalBrief`.

### Schema TypeScript (núcleo compartido)

```ts
type Emphasis = "low" | "medium" | "high";

interface ExportDirectives {
  /** Versión del schema para migrar interpretaciones viejas */
  version: 1;
  /** Eco corto de lo que entendió la IA (UI) */
  interpretation?: string;

  html?: {
    imageEmphasis: Emphasis;      // tamaño / protagonismo fotos en El viaje
    galleryEmphasis: Emphasis;    // peso y posición relativa de Galería
    proseDensity: Emphasis;       // cuánta crónica por día
    placeCallouts: Emphasis;      // Guía práctica
    mapEmphasis: Emphasis;
    /** Preferencias blandas; no sustituyen tipología/plantilla elegida a mano */
    preferSectionOrder?: ("timeline" | "gallery" | "map" | "guide" | "closing")[];
  };

  reel?: {
    durationSeconds?: 15 | 30 | 60;  // solo si el brief lo pide; si no, el selector UI manda
    targetPhotoCount?: number;       // p.ej. 8–12 en 30s
    pacing: "calm" | "balanced" | "punchy";
    captionMode: "none" | "placeOnly" | "short" | "story";
    captionPlacement: "bottom" | "center" | "side";
    transitionStyle: "softFade" | "mixed" | "fastCut";
    transitionSeconds?: number;      // 0.15–0.55
    heroBias: Emphasis;              // priorizar highlightScore altos
  };

  pdf?: {
    imageEmphasis: Emphasis;
    proseDensity: Emphasis;
    preferFullBleed: Emphasis;
    mosaicBias: Emphasis;
  };
}
```

Defaults seguros cuando el brief está vacío o la IA falla = comportamiento actual.

---

## UX

### Panel Export (HTML / Reel / PDF)

1. Textarea: **«Indicaciones para este export»**  
   Placeholder ej.: *“Quiero muchas fotos grandes, poca crónica, galería muy visible…”*
2. Botón **Interpretar** (o interpretar al pulsar Exportar).
3. Chip / resumen: *“Imágenes altas · Galería alta · Prosa baja”* (editable más adelante).
4. Los selectores actuales (plantilla, tipología, 15/30/60, A4…) **siguen**; el brief **enriquece** encima, no los reemplaza salvo que el texto lo pida con claridad (“haz un reel de 15 segundos”).

### Prioridad de conflicto

`selector UI explícito` > `directiva del brief` > `default tipología/plantilla`.

Ejemplo: usuario elige 60 s en radio pero brief dice “corto” → gana el radio 60 s; el brief solo afina ritmo/captions dentro de 60 s.

---

## Pipeline IA

### Prompt

Sistema: editor creativo de exports de viaje.  
Entrada: brief + metadatos del viaje (nº fotos, si hay crónica, tipología actual, duración elegida).  
Salida: **solo JSON** conforme a `ExportDirectives` (con `additionalProperties: false` si usamos JSON schema / parse estricto).

Temperatura baja (0.2–0.4). Validar y clampear rangos en código.

### Fallbacks

- Brief vacío → no llamar IA.
- JSON inválido → defaults + aviso suave.
- Offline / error DNS → igual que crónica: exportar con defaults.

---

## Fase 1 — Cimientos (compartido)

**Alcance**

1. Tipo `ExportDirectives` + `parseExportDirectives` + defaults + clamp.
2. `interpretExportBrief(brief, context) → ExportDirectives` en `src/lib/export-brief.ts`.
3. Endpoint `POST /api/export-brief` (opcional) o interpretación inline en cada export route.
4. Tests unitarios de parse/clamp y fixtures de briefs (“más fotos”, “sin texto en el vídeo”).

**No incluye** aún UI ni cambios visuales fuertes.

**Criterio de hecho:** dado un brief de prueba, el JSON sale estable y tipado.

---

## Fase 2 — Vídeo (reel) — alto ROI

El reel ya tiene knobs numéricos; el brief mapea casi 1:1.

### Aplicar en `export-reel.ts` / encode

| Directiva | Cambio |
|-----------|--------|
| `targetPhotoCount` | Ajusta techo de `maxFramesForDuration` (dentro de bandas seguras por duración) |
| `pacing` | Escala `REEL_BEAT_PATTERN` / mins-maxs de hold |
| `captionMode` | `none` / `placeOnly` / fuerza `fitCaptionsToClipHolds` más agresivo / permite story |
| `captionPlacement` | Variante de `drawStoryCaption` (bottom / center / sideAccent) |
| `transitionStyle` + `transitionSeconds` | `REEL_CROSSFADE_SECONDS` y set de transiciones |
| `heroBias` | Sube barra de `highlightScore` al seleccionar frames |

### UI

Textarea en `ExportReelPanel` + resumen interpretado antes de generar.

### Criterio de hecho

- Brief “pocas fotos, tranquilas, casi sin texto” → ≤~8 clips en 30 s, holds largos, captions null o solo lugar.
- Brief “ritmo rápido, textos cortos” → más clips, holds cortos, captions ≤ presupuesto.

---

## Fase 3 — HTML — peso visual

### Nuevos knobs de renderer (Magazine / Visual)

Extender CSS/HTML según `html.*`:

| Directiva | Efecto concreto |
|-----------|-----------------|
| `imageEmphasis: high` | `.story-media` más grande (aspect menos recortado / max-height mayor), menos padding de prosa |
| `imageEmphasis: low` | Fotos más compactas |
| `galleryEmphasis: high` | Galería justo tras El viaje (ya default) + tiles mayores / más columnas en desktop |
| `galleryEmphasis: low` | Galería al final o grid más denso/pequeño |
| `proseDensity: low` | Truncar/clamp prosa de día en `story-day-prose` (p. ej. 1 párrafo) |
| `proseDensity: high` | Mostrar prosa completa |
| `preferSectionOrder` | Reordenar middle sections **solo** si no contradice el selector de tipología de forma dura; o aplicar como soft bias |

Clases tipo `export-dir--images-high` en `<body>` o wrapper, generadas desde directives.

### UI

Misma textarea (o brief compartido viaje) en `ExportHtmlPanel`.

### Criterio de hecho

- Brief “máximo protagonismo fotográfico” → clases high en imágenes/galería y prosa reducida en El viaje.
- Tests de `buildExportHtml` comprueban clases / orden / ausencia de prosa larga.

---

## Fase 4 — PDF (posterior)

Mapear a `planPdfPages` / temas:

- `preferFullBleed` → más páginas bleed, menos featured con texto.
- `proseDensity` → clamp más agresivo en day-divider (ya hay clamp de notas).
- `mosaicBias` → umbral de mosaic más bajo/alto.

Menos flexible; hacerlo cuando HTML+reel estén estables.

---

## Fase 5 — Persistencia y pulido

1. `Travel.exportBrief` (+ migración `MIGRATE_DB=1`).
2. Recordar última `exportDirectives` para no re-interpretar en cada preview.
3. Botón «Aplicar brief» vs reinterpretar.
4. Copy de ayuda y 3 ejemplos de brief en la UI.
5. Telemetría ligera / logs de interpretación fallida (opcional).

---

## Orden de implementación sugerido

| Fase | Qué | Dependencias |
|------|-----|--------------|
| **1** | Tipos + interpretador + tests | — |
| **2** | Reel + UI panel | Fase 1 |
| **3** | HTML knobs visuales + UI | Fase 1 |
| **4** | PDF | 2–3 estables |
| **5** | Persistencia en Travel | Tras validar UX en panel |

No hace falta esperar tipologías/plantillas nuevas: el valor está en **modular el renderer**.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Brief ambiguo o contradictorio | Defaults + prioridad UI > brief; `interpretation` visible |
| IA inventa knobs desconocidos | Schema estricto + strip unknown keys |
| HTML “roto” por CSS extremo | Bandas clamp (tamaños min/max) |
| Coste/latencia al exportar | Cache directives; no llamar IA si brief vacío o sin cambios |
| Solape con tipología | Tipología sigue eligiendo mapa/stats; brief solo énfasis visual |

---

## Fuera de alcance (explícito)

- Generar plantillas HTML/CSS arbitrarias con IA.
- Editar fotograma a fotograma el MP4 a mano vía prompt.
- Sustituir tipología/plantilla por un único dropdown mágico.
- Traducir el brief a idiomas distintos del export.

---

## Relación con otros planes

- Crónica: `journalBrief` ya existe — mismo patrón UX; **no** mezclar textos (brief de crónica ≠ brief de export).
- `plan-export-html-next.md`: el brief HTML puede potenciar galería/lightbox; no bloquea scroll-spy ni Play.
- `plan-export-magazine.md`: Magazine sigue siendo el canvas; las directives son capas encima.

---

## Primer entregable concreto (cuando se implemente)

1. `src/lib/export-directives.ts` — tipos, defaults, clamp, apply helpers.  
2. `src/lib/export-brief.ts` — llamada IA + parse.  
3. Reel: aplicar directives en `buildReelManifest`.  
4. Textarea en `ExportReelPanel`.  
5. Doc de ejemplos de brief en este archivo (apéndice).

Luego HTML con clases `export-dir--*`.

---

## Apéndice — ejemplos de brief → efecto esperado

| Brief | Directivas esperadas |
|-------|----------------------|
| “Muchas fotos grandes, poca historia escrita” | html: images high, prose low, gallery high |
| “Reel de 30 s calmado, casi sin letras” | reel: 30s, calm, captionMode placeOnly/none, targetPhotoCount ~8 |
| “Textos claros abajo, transiciones suaves, pocas fotos” | captionPlacement bottom, softFade, 0.45s, count bajo |
| “Enfoca la galería; el mapa me da igual” | gallery high, map low |

---

## Estado

| Fase | Estado |
|------|--------|
| 0 — Plan | ✅ Este documento |
| 1 — Cimientos | Pendiente |
| 2 — Reel | Pendiente |
| 3 — HTML | Pendiente |
| 4 — PDF | Pendiente |
| 5 — Persistencia | Pendiente |
