# Plan: catálogo tipado de plantillas de export (brief → match)

## Contexto actual

Hoy el export HTML tiene **4 plantillas** (no 3):

| Id | Rol |
|----|-----|
| `magazine` | Blog/editorial claro; El viaje + galería + guía |
| `visual-journey` | Visual, mapa full-bleed, galería |
| `editorial-clean` | Texto/serif; sin galería rica |
| `dark-photo-journey` | Oscuro cinematográfico |

Además existen:

- **Tipologías** (city break, road trip…) → mapa, stats, énfasis de contenido.
- **Brief libre** → `ExportDirectives` (énfasis, tema, prosa…) aplicadas como knobs CSS / soft-switch de tema.

El brief ya puede soft-cambiar Magazine → Dark Photo Journey si pide modo oscuro. Falta un **catálogo declarativo** y un **matcher** brief → entrada del catálogo.

---

## Veredicto: ¿15 plantillas?

**Sí al catálogo de ~12–15 entradas tipadas. No a 15 implementaciones HTML independientes.**

| Enfoque | Veredicto |
|---------|-----------|
| 15 forks de `buildExportHtml` / CSS casi iguales | Malo: mantenimiento, bugs, drift |
| 4–5 **bases de layout** × packs de **tokens/tema** + presets de directrices = 12–15 *looks* | Bueno: variedad percibida, código compartido |
| IA genera HTML/CSS libre | Fuera de alcance (ya descartado) |

**Objetivo de producto:** el usuario escribe lo que quiere; el sistema elige la entrada del catálogo que mejor encaja y explica por qué. La UI de plantilla sigue existiendo y **manda** si el usuario elige a mano.

---

## Principio

```
Brief NL  →  criterios tipados  →  score(catálogo)  →  TemplateCatalogEntry
                                                      ├─ layoutBase
                                                      ├─ themeTokens
                                                      └─ defaultDirectives
                         ↓
              buildExportHtml(layoutBase, tokens, directives)
```

Misma filosofía que el brief actual: **no** CSS libre; **sí** aterrizaje a knobs reales.

Prioridad de conflicto (sin cambios):

`selector UI explícito` > `match del brief` > `default tipología/plantilla`.

---

## Modelo de datos (tipado)

### Archivo propuesto

`src/lib/export/template-catalog.ts` (+ JSON opcional `src/lib/export/template-catalog.json` si preferís datos sin recompilar).

### Schema

```ts
type LayoutBase =
  | "magazine"       // hero + El viaje unificado + galería + guía
  | "visual"         // mapa outer + story visual + galería
  | "editorial"      // crónica texto-first (paridad galería = fase posterior)
  | "photo-essay";   // (nuevo, fase 2) fotos full-bleed, prosa mínima

type ThemePack =
  | "light-paper"
  | "light-clean"
  | "dark-cinema"
  | "dark-ink"
  | "warm-sunset"    // tokens solo; no “otro HTML”
  | "cool-coast";

type TemplateCapability =
  | "gallery"
  | "guide"
  | "map-explorer"
  | "map-compact"
  | "unified-story"
  | "journal-article"
  | "lightbox"
  | "play-mode";

interface TemplateCriteria {
  /** Ejes que el matcher puntúa (0–1 o low|medium|high). */
  theme: "light" | "dark" | "either";
  imageEmphasis: Emphasis;      // protagonismo fotográfico
  proseDensity: Emphasis;       // peso de crónica
  galleryEmphasis: Emphasis;
  guideEmphasis: Emphasis;
  mapEmphasis: Emphasis;
  energy: "calm" | "balanced" | "punchy";  // ritmo visual / densidad de secciones
  audience: "friends" | "public" | "print-like";
}

interface TemplateCatalogEntry {
  id: string;                     // slug estable: "midnight-gallery"
  version: 1;
  label: string;                  // UI
  tagline: string;                // 1 línea
  description: string;
  /** Layout codepath en buildExportHtml */
  layoutBase: LayoutBase;
  /** CSS variables / skin */
  themePack: ThemePack;
  /** Qué secciones/features ofrece de verdad */
  capabilities: TemplateCapability[];
  /** Perfil ideal para matching */
  criteria: TemplateCriteria;
  /** Directrices por defecto al elegir esta entrada (el brief puede afinar encima) */
  defaultDirectives: ExportHtmlDirectives;
  /** Tags libres para heurística / UI filtros */
  tags: string[];
  /** false = solo match automático / lab; no en grid UI */
  featuredInUi: boolean;
  /** Orden en el panel (menor = primero) */
  uiOrder: number;
}
```

### Relación con `ExportTemplateId` actual

Fase 1: cada entrada del catálogo **mapea** a un `layoutBase` ya implementado + `themePack` (al inicio, packs = skins de las 4 plantillas actuales).

```ts
// Compat bridge
function resolveRuntimeTemplate(entry: TemplateCatalogEntry): ExportTemplateId {
  if (entry.layoutBase === "magazine" && entry.themePack === "light-paper") return "magazine";
  if (entry.layoutBase === "visual" && entry.themePack === "light-clean") return "visual-journey";
  // ...
}
```

Fase 2: `buildExportHtml` recibe `{ layoutBase, themePack, directives }` y deja de ramificar solo por el id legacy.

---

## Catálogo objetivo (~12–15 looks)

No hace falta implementar 15 layouts. Propuesta de **entradas** (variedad percibida):

### Ya cubiertas (4) — tipar ya

1. **Magazine Classic** — light-paper, prosa media, guía on  
2. **Visual Journey** — light-clean, fotos altas, mapa explorer  
3. **Editorial Clean** — light-clean/serif, prosa alta, galería baja/off  
4. **Dark Photo Journey** — dark-cinema, fotos altas, prosa baja  

### Nuevas vía themePack + directives (sin layout nuevo) — +6

5. **Midnight Gallery** — dark-ink + gallery high + prose low (misma base `visual`)  
6. **Coast Light** — cool-coast tokens + magazine  
7. **Sunset Road** — warm-sunset + visual + map high  
8. **Quiet Chronicle** — magazine + prose high + images medium  
9. **Guide First** — magazine + guide high + gallery medium + section order guía temprano  
10. **Map Lead** — visual + map high + gallery medium  

### Nuevas que sí piden layout/código — +3–5 (fase 2)

11. **Photo Essay** — layout `photo-essay`: full-bleed, poca prosa, sin guía  
12. **Minimal Index** — magazine stripped: hero + galería + cierre  
13. **Family Scrapbook** — magazine + callouts high + prose medium + warm tokens  
14. **City Night** — dark + map + guide (urbano)  
15. **Print Cousin** — editorial + densidades pensadas para PDF parity (opcional)

**Recomendación de arranque:** tipar las **4 actuales** + **4 packs** (8 looks) antes de escribir layouts nuevos. Subir a ~12 cuando el matcher y la UX de “Elegimos X porque…” estén validados.

---

## Matcher (brief → catálogo)

### Entrada

```ts
interface TemplateMatchInput {
  brief: string;
  directives: ExportHtmlDirectives;  // ya interpretadas
  uiTemplate?: ExportTemplateId | null; // si el usuario eligió a mano
  typology?: string;
  photoCount?: number;
  hasJournal?: boolean;
}
```

### Salida

```ts
interface TemplateMatchResult {
  entry: TemplateCatalogEntry;
  score: number;                 // 0–1
  reasons: string[];             // chips: "modo oscuro", "fotos grandes"
  unmet: string[];               // "pedías guía densa; esta plantilla la atenúa"
  fromBrief: boolean;
}
```

### Algoritmo (determinista, testable)

1. Si `uiTemplate` está fijado por el usuario **y** no hay brief → esa plantilla.  
2. Si hay brief → `interpretExportBrief` → directrices.  
3. Para cada entrada del catálogo, score:

| Señal | Peso sugerido |
|-------|----------------|
| `theme` exacto | 0.25 |
| `imageEmphasis` distancia | 0.20 |
| `proseDensity` distancia | 0.15 |
| `galleryEmphasis` | 0.10 |
| `guideEmphasis` / capabilities | 0.10 |
| `mapEmphasis` | 0.10 |
| tags ∩ keywords del brief | 0.10 |

4. Elegir top-1; si empate, preferir `featuredInUi` y `uiOrder`.  
5. Fusionar: `directives = merge(entry.defaultDirectives, briefDirectives)` (brief gana en conflictos de énfasis).  
6. Soft-apply solo si UI sigue en default (`magazine`) **o** el usuario pulsó “Usar sugerencia del brief”.

### IA vs heurística

- Reutilizar `interpretExportBrief` (ya existe).  
- El matcher **no** necesita otra llamada IA: puntúa el JSON tipado.  
- Opcional P2: una frase `matchRationale` generada para UI (“Elegimos Midnight Gallery porque pediste oscuro y poca crónica”).

---

## UX

### Panel Export HTML

1. Grid de plantillas: mostrar solo `featuredInUi` (6–8), resto en “Más looks”.  
2. Textarea brief (ya existe).  
3. Tras Interpretar / al exportar:  
   - Chip: **Sugerencia: Midnight Gallery** (score)  
   - Botón: **Aplicar sugerencia**  
   - Lista corta de `reasons` / `unmet`.  
4. Si el usuario ya eligió plantilla ≠ default: no pisar; mostrar “Tu elección manda; el brief solo afina énfasis”.

### Copy

Evitar “cumple todos los criterios”. Preferir:

> Encaja mejor con lo que pediste (oscuro, fotos grandes). No aplica: guía muy densa.

---

## Fases de implementación

### Fase 0 — Plan + schema (este doc)

- [x] Dec de plan  
- [ ] PR de schema TS + catálogo con las **4** entradas actuales tipadas  
- [ ] Tests de parse/score con fixtures de brief  

**Criterio de hecho:** `matchTemplateCatalog(brief)` estable sin cambiar el HTML generado (bridge a ids legacy).

### Fase 1 — Catálogo tipado + matcher + UI chips

**Alcance**

1. `TemplateCatalogEntry` + `TEMPLATE_CATALOG` (4→8 entradas).  
2. `scoreTemplateEntry` / `matchTemplateCatalog`.  
3. Bridge `entry → ExportTemplateId`.  
4. Panel: sugerencia + aplicar.  
5. Export API: si `brief` y UI default → usar match (o flag `applyBriefTemplate: true`).  

**No incluye** layouts nuevos ni 15 skins.

**Criterio de hecho**

- Brief “modo oscuro, poca crónica, fotos grandes” → Dark Photo / Midnight, no Magazine claro.  
- Brief vacío + UI Magazine → Magazine.  
- Tests de score con 5–6 briefs fijos.

### Fase 2 — Theme packs (variedad sin forks)

1. Extraer CSS variables por `ThemePack` (`--bg`, `--text`, `--accent`, `--card`, tipografía).  
2. `layoutBase` + `themePack` en `buildExportHtml`.  
3. Añadir 4 packs (warm-sunset, cool-coast, dark-ink, …) = ~8–10 looks totales.  
4. Capturas de preview en el panel (static PNG o CSS swatch).  

**Criterio de hecho:** dos entradas con mismo `layoutBase` y distinto `themePack` generan HTML distinto (clases/`data-theme`) y tests de snapshot/string.

### Fase 3 — Layout bases nuevas (solo si el matcher las pide mucho)

1. `photo-essay` (full-bleed, prose clamp fuerte).  
2. Paridad Editorial (galería/lightbox) o deprecar.  
3. Subir catálogo a ~12–15 **entradas** (no 15 bases).  

### Fase 4 — Reel / PDF (opcional, mismo catálogo de “look”)

- Campos `reelPreset` / `pdfPreset` en la entrada, o catálogos hermanos.  
- No bloquear HTML.

---

## Archivos a tocar (fase 0–1)

| Archivo | Cambio |
|---------|--------|
| `src/lib/export/template-catalog.ts` | Schema + catálogo inicial |
| `src/lib/export/template-match.ts` | Scoring |
| `src/lib/export-brief.ts` | (opcional) devolver `suggestedTemplateId` |
| `src/lib/export-html.ts` | Bridge entry → runtime |
| `src/app/api/export-html/route.ts` | Aplicar match si procede |
| `src/app/api/export-brief/route.ts` | Devolver match preview |
| `src/components/ExportHtmlPanel.tsx` | UI sugerencia |
| `scripts/test-template-catalog.mjs` | Fixtures |
| `docs/plan-export-template-catalog.md` | Este plan |

---

## Qué no hacer

- Generar plantillas HTML/CSS arbitrarias con IA.  
- Duplicar `buildExportHtml` por cada look.  
- Prometer “cumple el 100% del brief”.  
- Meter 15 opciones en el grid principal (fatiga); curated 6–8 + “más”.  
- Mezclar tipología (qué contar) con look (cómo verse): tipología sigue aparte.

---

## Respuesta directa a “¿vamos a por 15?”

- **Sí** a un catálogo tipado que **crezca hasta ~12–15 looks**.  
- **No** a implementar 15 plantillas HTML distintas de golpe.  
- Orden sano: **tipar 4 → matcher → 4 theme packs (≈8) → layouts nuevos solo con demanda**.  

Eso da el efecto “muchas plantillas” con el coste de mantenimiento de **4 bases + N skins**, que es lo sostenible en este codebase.

---

## Primer entregable concreto (siguiente PR)

1. `TemplateCatalogEntry` + catálogo de las 4 plantillas actuales.  
2. `matchTemplateCatalog` + tests con briefs (“oscuro”, “poca crónica”, “mapa grande”).  
3. API brief devuelve `{ suggestedTemplateId, reasons, unmet }`.  
4. Panel: chip de sugerencia (sin cambiar aún el export automático salvo default Magazine + brief).  

Cuando eso esté estable, abrir fase 2 (theme packs).
