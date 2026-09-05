import assert from "node:assert/strict";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import {
  TEMPLATE_CATALOG,
  getTemplateCatalogEntry,
  layoutBaseForTemplate,
} from "../src/lib/export/template-catalog.ts";
import {
  detectExplicitStructureChange,
  matchTemplateCatalog,
} from "../src/lib/export/template-match.ts";

assert.equal(TEMPLATE_CATALOG.length, 4);
assert.equal(layoutBaseForTemplate("magazine"), "magazine");
assert.equal(layoutBaseForTemplate("visual-journey"), "visual");
assert.equal(layoutBaseForTemplate("dark-photo-journey"), "visual");
assert.equal(layoutBaseForTemplate("editorial-clean"), "editorial");
assert.ok(getTemplateCatalogEntry("magazine")?.capabilities.includes("guide"));

// --- structure lock: dark brief on magazine stays magazine ---
const darkBrief = groundExportBriefHeuristically(
  "Quiero modo oscuro, fotos grandes y poca crónica",
  { target: "html" }
);
assert.equal(darkBrief.html?.theme, "dark");

const locked = matchTemplateCatalog({
  brief: "Quiero modo oscuro, fotos grandes y poca crónica",
  directives: darkBrief.html,
  uiTemplate: "magazine",
  lockStructure: true,
});
assert.equal(locked.suggestedTemplateId, "magazine");
assert.equal(locked.structureLocked, true);
assert.equal(locked.layoutBase, "magazine");
assert.ok(locked.reasons.some((r) => /estructura/i.test(r)));
assert.ok(
  locked.unmet.some((u) => /otra estructura|look oscuro|oscuro nativo/i.test(u)),
  "should note native dark look exists elsewhere"
);

assert.equal(
  detectExplicitStructureChange(
    "Quiero modo oscuro, fotos grandes",
    "magazine"
  ),
  false
);

// --- same layoutBase: visual + dark may suggest dark-photo-journey ---
const visualDark = matchTemplateCatalog({
  brief: "modo oscuro, fotos grandes, poca prosa",
  directives: darkBrief.html,
  uiTemplate: "visual-journey",
});
assert.equal(visualDark.layoutBase, "visual");
assert.equal(visualDark.suggestedTemplateId, "dark-photo-journey");
assert.equal(visualDark.differsFromUi, true);
assert.equal(visualDark.structureLocked, true);

assert.equal(
  detectExplicitStructureChange(
    "Cambia la estructura a Visual Journey",
    "magazine"
  ),
  true
);
assert.equal(
  detectExplicitStructureChange("quiero la plantilla dark photo", "magazine"),
  true
);

const unlocked = matchTemplateCatalog({
  brief: "Cambia a Dark Photo Journey, modo oscuro y fotos grandes",
  directives: darkBrief.html,
  uiTemplate: "magazine",
});
assert.equal(unlocked.structureLocked, false);
assert.equal(unlocked.suggestedTemplateId, "dark-photo-journey");
assert.equal(unlocked.layoutBase, "visual");

const mapBrief = groundExportBriefHeuristically("mapa grande y guía destacada", {
  target: "html",
});
const mapMatch = matchTemplateCatalog({
  brief: "mapa grande y guía destacada",
  directives: mapBrief.html,
  uiTemplate: "magazine",
});
assert.equal(mapMatch.suggestedTemplateId, "magazine");
assert.ok(mapMatch.reasons.some((r) => /mapa|guía|estructura/i.test(r)));

const proseBrief = groundExportBriefHeuristically(
  "más crónica, mucho texto, leer bien",
  { target: "html" }
);
const editorialLocked = matchTemplateCatalog({
  brief: "más crónica, mucho texto",
  directives: proseBrief.html,
  uiTemplate: "editorial-clean",
});
assert.equal(editorialLocked.suggestedTemplateId, "editorial-clean");

const editorialUnlock = matchTemplateCatalog({
  brief: "cambia la plantilla a editorial clean, más crónica",
  directives: proseBrief.html,
  uiTemplate: "magazine",
});
assert.equal(editorialUnlock.structureLocked, false);
assert.equal(editorialUnlock.suggestedTemplateId, "editorial-clean");

console.log("template-catalog ok", {
  locked: locked.suggestedTemplateId,
  visualDark: visualDark.suggestedTemplateId,
  unlocked: unlocked.suggestedTemplateId,
});
