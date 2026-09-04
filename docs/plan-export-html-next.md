# Plan: siguientes mejoras del export HTML

Continuación de `plan-export-magazine.md` y del ciclo **HTML P1** (mapa offline estático, vídeo reproducible, tipologías reales en Magazine).

## Hecho en P1 (este ciclo)

| Ítem | Estado |
|------|--------|
| Mapa estático offline (PNG Mapbox + fallback si no hay tiles) | ✅ |
| Vídeos reproducibles en Recorrido / Galería (ZIP) | ✅ |
| Tipologías Magazine respetan `sectionOrder` + `mapConfig` | ✅ |

## Backlog (prioridad sugerida)

### A — Relive / sync
1. **«Reproducir» en Magazine** — Hoy el scrubber se desactiva en Magazine; además no mueve el mapa de trayecto en dual maps.
2. **Scroll-spy mapa ↔ crónica** — Al hacer scroll del recorrido, el mapa sigue el día/lugar activo (sobre todo móvil).

### B — Calidad / confianza
3. **Suite de tests del export HTML** — Fixtures de `buildExportHtml` (magazine, dual maps, vídeo, tipologías). Hoy casi todo el riesgo está sin cobertura.
4. **Lightbox / a11y** — Escape, `aria-modal`, focus trap, teclado en galería/tablet/TV.

### C — Formato y peso
5. **HTML único más honesto** — Límites claros, ZIP como default recomendado, avisar antes de incrustar decenas de fotos en base64.
6. **Paridad de plantillas** — Completar Editorial Clean (galería/lightbox) o retirarla / marcarla como “texto”.

### D — GPS y paridad
7. **GPS trail más útil** — Default más visible; click en card de trail → zoom al trazado.
8. **Paridad dual maps HTML ↔ PDF ↔ app** — Misma decisión de dual / leyendas / copy en los tres superficies.

## Notas de diseño
- El mapa offline P1 es **fallback estático**, no tiles embebidos. Bundling de tiles sigue siendo opción “large” si hace falta zoom offline real.
- Los vídeos en HTML único siguen siendo solo poster (tamaño); el archivo canónico es el ZIP.
- Magazine sigue sin Play mode a propósito hasta el ítem A1.

## Relacionado
- Brief creativo de export (IA → énfasis visual / ritmo de reel): [`plan-export-ai-brief.md`](./plan-export-ai-brief.md)
