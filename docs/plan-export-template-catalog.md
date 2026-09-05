# Plan: catálogo tipado de plantillas de export (brief → match)

## Principio de estructura (obligatorio)

La **estructura HTML base** de cada plantilla es correcta y **no se cambia** salvo que el usuario lo pida **expresamente** en el brief (p. ej. «cambia la estructura», «usa Visual Journey», «sin guía»).

| Pedido | Efecto |
|--------|--------|
| Modo oscuro / fotos grandes / poca prosa | Knobs CSS / directrices **sobre la plantilla actual** |
| Misma `layoutBase`, otro skin (p. ej. Visual → Dark Photo) | Permitido: no es cambio de estructura |
| Magazine + oscuro → Dark Photo Journey | **Prohibido** sin petición explícita (rompe guía/estructura magazine) |
| «Cambia a Dark Photo Journey» | Desbloquea match cross-layout |

Prioridad: `selector UI` > `aplicar sugerencia del brief` > defaults. El matcher **sugiere**; no pisa la UI solo.

---

## Contexto actual

4 plantillas:

| Id | `layoutBase` | Rol |
|----|--------------|-----|
| `magazine` | `magazine` | Blog/editorial; El viaje + galería + guía |
| `visual-journey` | `visual` | Visual, mapa explorer, galería |
| `editorial-clean` | `editorial` | Texto/serif |
| `dark-photo-journey` | `visual` | Skin oscura de la base visual |

Brief libre → `ExportDirectives` (énfasis, tema…) como knobs. El tema **no** soft-switch de plantilla.

---

## Veredicto: ¿15 plantillas?

**Sí** a ~12–15 *looks* tipados. **No** a 15 forks HTML.

Orden: tipar 4 → matcher + candado de estructura → theme packs → layouts nuevos solo con demanda explícita.

---

## Modelo

Ver `src/lib/export/template-catalog.ts` y `src/lib/export/template-match.ts`.

- `TemplateCatalogEntry`: layoutBase, themePack, criteria, capabilities, defaultDirectives
- `matchTemplateCatalog`: score determinista; filtra por `layoutBase` si `structureLocked`
- `detectExplicitStructureChange`: desbloquea solo con cues explícitos

---

## Fases

### Fase 1 (este PR)

- [x] Schema + catálogo de las 4
- [x] Matcher con structure lock
- [x] API brief → `templateMatch`
- [x] Panel: chip sugerencia + Aplicar
- [x] Quitar soft-switch magazine+dark → dark-photo; CSS `export-dir--theme-dark` sobre la estructura actual

### Fase 2 — Theme packs (sin layouts nuevos)

### Fase 3 — Layout bases nuevas solo si el usuario las pide mucho

---

## Qué no hacer

- Cambiar estructura HTML por tema u énfasis del brief
- Generar HTML/CSS libre con IA
- Duplicar `buildExportHtml` por cada look
- Prometer cumplimiento 100% del brief
