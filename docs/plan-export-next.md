# Plan: siguientes mejoras de exportación (HTML / Reel / PDF)

Plan maestro que ordena el trabajo **después** de:

- Brief tipado → knobs (`plan-export-ai-brief.md`) — parcialmente hecho
- Catálogo HTML + structure lock (`plan-export-template-catalog.md`) — ✅ mergeado
- Presets de montaje Reel (`plan-export-reel-preset-catalog.md`) — ✅ mergeado
- Backlog HTML puntual (`plan-export-html-next.md`)

## Objetivo

Más **variedad percibida** y más **confianza** al exportar, sin romper la regla de producto:

> Knobs tipados + catálogos. **No** HTML/CSS/MP4 libres. La estructura HTML no cambia salvo petición expresa.

## Principios

1. `selector UI` > `Aplicar sugerencia` > brief knobs > defaults  
2. Duración del Reel: siempre manda el selector UI  
3. Tipografía = **packs tipados**, nunca fuente libre  
4. Un look nuevo preferiblemente = `layoutBase`/`pipeline` existente × theme/typo/preset pack  
5. Ser honestos en `unmet` cuando el brief pide algo que el formato no puede

---

## Estado actual (resumen)

| Superficie | Catálogo | Brief → knobs | Chip «Aplicar» | Persistencia brief |
|------------|----------|---------------|----------------|--------------------|
| HTML | 4 plantillas + structure lock | Sí | Sí | No (sesión) |
| Reel | 6 presets de montaje | Sí | Sí | No (sesión) |
| PDF | Temas legacy | Débil / parcial | No | No |

---

## Fases

### Fase A — Theme packs HTML (+ tipografía tipada)

**Por qué primero:** más variedad con el menor riesgo; no toca estructuras.

**Alcance**

1. Extraer tokens CSS por plantilla a `ThemePack`:
   - `light-paper`, `light-clean`, `dark-cinema` (ya implícitos)
   - + `warm-sunset`, `cool-coast` (opcional, 1 PR)
2. Pack tipográfico tipado (2–3, no más):

| Id | Uso |
|----|-----|
| `serif-editorial` | Títulos/cuerpo revista (Magazine / Editorial) |
| `sans-clean` | UI moderna (Visual / Dark) |
| `hybrid` | Display serif + UI sans |

3. Aplicar vía variables (`--font-display`, `--font-body`, `--bg`, `--accent`…) sobre el `layoutBase` actual  
4. Brief cues: «más revista / tipografía editorial» → `serif-editorial`; «moderno limpio» → `sans-clean`  
5. Panel: swatch o select corto de tipografía **opcional** (no grid enorme)

**Criterio de hecho**

- Dos exports misma plantilla + distinto `themePack`/`typePack` generan HTML distinto (clases/`data-theme`)  
- «Modo oscuro» en Magazine **sigue** siendo Magazine + tema oscuro (structure lock intacto)  
- Tests de string/snapshot mínimos  
- Sin selector de fuente libre

**Fuera de alcance:** layouts nuevos; Google Fonts arbitrarias; webfonts remotas obligatorias en ZIP offline (preferir stacks del sistema o fonts embebidas locales si hace falta)

---

### Fase B — PDF al mismo modelo (brief + presets)

**Por qué segundo:** es la superficie más atrasada; reutiliza el patrón Reel/HTML.

**Alcance**

1. `ExportPdfDirectives` ya tipadas → aplicar de verdad en layout/render (énfasis imagen, prosa, full-bleed, mosaico)  
2. Catálogo corto de **looks PDF** (4–6), no forks del pipeline:

| Id (propuesta) | Idea |
|----------------|------|
| `pdf-classic` | Claro, serif, equilibrado |
| `pdf-minimal` | Poca tinta, mucha prosa |
| `pdf-photo` | Full-bleed / mosaico alto |
| `pdf-dark` | Skin oscura imprimible-con-cuidado |
| `pdf-guide` | Más callouts / guía |

3. Matcher brief → preset PDF + chip en panel PDF  
4. Tipografía PDF = mismos **packs** que HTML cuando sea posible (Liberation serif/sans ya embebibles)

**Criterio de hecho**

- Brief «poca prosa, fotos grandes» cambia layout PDF vía knobs/preset  
- UI preset + «Aplicar sugerencia» como HTML/Reel  
- Tests de merge preset ⊕ brief  
- Sin CSS libre ni fuentes arbitrarias

---

### Fase C — Persistencia y UX unificada del panel

**Alcance**

1. Persistir en `Travel` (o equivalente):
   - `exportBrief`
   - última interpretación / directives cache
   - `htmlTemplateId`, `reelPresetId`, `pdfPresetId`, `typePackId` (opcionales)
2. Al reabrir el viaje, el panel recupera brief + elecciones  
3. Tras «Interpretar», **un solo resumen** compartido:
   - plantilla/preset sugerido  
   - knobs entendidos  
   - `unmet` claros  
4. Misma copy de prioridad en HTML / Reel / PDF

**Criterio de hecho**

- Cerrar y reabrir viaje: brief y preset siguen ahí  
- Reexportar sin reescribir el brief  
- Migración/backfill no rompe viajes viejos (campos nullable)

---

### Fase D — Calidad percibida (los tres formatos)

Orden interno sugerido:

1. **Picking de fotos** — más variedad día/lugar; menos casi-duplicados; highlights reales  
2. **Reel cover / primer segundo** — gancho visual; captions que no tapen sujeto  
3. **Mapas** — paridad leyenda/días HTML ↔ PDF ↔ Reel; trail GPS más útil (ver también `plan-export-html-next.md` D)  
4. **Preview HTML** más fiel al ZIP final (mismas clases de directives/theme)  
5. **Avisos de peso** — HTML único vs ZIP; límites honestos (`plan-export-html-next.md` C)

**Criterio de hecho (por ítem):** test o checklist manual reproducible + copy de UI cuando haga falta.

---

### Fase E — Layouts HTML nuevos (solo con demanda)

Solo si el matcher/`unmet` muestran mucha petición explícita de otra estructura:

- p. ej. `photo-essay`, índice mínimo, scrapbook  

Hasta entonces: **theme packs + typography packs**, no forks de `buildExportHtml`.

Ver `plan-export-template-catalog.md` fase 3.

---

## Qué no hacer

- Generar HTML/CSS/MP4 arbitrarios con IA  
- Selector de fuente libre o URL de font remota como requisito del export offline  
- Soft-switch Magazine → Dark Photo por «modo oscuro»  
- Prometer «cumple el 100% del brief»  
- 15 plantillas HTML independientes  
- Meter tipología (qué contar) dentro del look (cómo verse)

---

## Orden de PRs sugerido

| # | PR | Depende de |
|---|----|------------|
| 1 | Theme packs HTML + typography packs (Fase A) | main actual |
| 2 | PDF directives reales + catálogo PDF (Fase B.1–B.3) | A opcional pero deseable |
| 3 | Persistencia brief/presets (Fase C) | A o B en curso OK |
| 4 | Photo picking + Reel cover (Fase D.1–D.2) | independiente |
| 5 | Mapas / preview / peso (Fase D.3–D.5) | puede ir en paralelo |
| 6 | Layout HTML nuevo (Fase E) | solo con evidencia de demanda |

No estimar en días: cada PR es un entregable acotado con tests.

---

## Criterio global de éxito

Un usuario escribe un brief en los tres paneles y entiende:

1. Qué look/preset se usará  
2. Qué knobs se aplican  
3. Qué no se puede cumplir  
4. Que reexportar no le borra las elecciones  

Sin aumentar de forma relevante la superficie de bugs de estructura HTML.

---

## Relación con otros docs

| Doc | Rol |
|-----|-----|
| `plan-export-ai-brief.md` | Origen del brief tipado |
| `plan-export-template-catalog.md` | Catálogo HTML + structure lock |
| `plan-export-reel-preset-catalog.md` | Presets Reel |
| `plan-export-html-next.md` | Backlog táctico HTML (Relive, a11y, peso, GPS) |
| `plan-export-magazine.md` | Historia Magazine (mayormente hecho) |

Este doc **manda el orden estratégico**; los otros detallan cada frente.

---

## Primer entregable concreto (siguiente implementación)

**Fase A, PR único:**

1. `ThemePack` + `TypePack` tipados  
2. Magazine / Visual / Editorial / Dark consumen variables (sin cambiar DOM structure)  
3. Brief puede sugerir pack tipográfico  
4. Panel HTML: select opcional «Tipografía» (3 opciones)  
5. Tests: misma plantilla + packs distintos → CSS distinto; structure lock intacto  

Cuando eso esté estable → Fase B (PDF).
