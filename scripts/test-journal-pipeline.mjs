import assert from "node:assert/strict";
import {
  assembleBlogJournalMarkdown,
  assembleJournalMarkdown,
  buildLocalBlogSections,
  buildLocalJournalMarkdown,
  journalPipelineVoiceRules,
  journalPromptContextAddon,
  sanitizeDaySummaryProse,
  sanitizeJournalDayProse,
} from "../src/lib/journal-pipeline.ts";
import { resolveExportJournalMarkdown } from "../src/lib/journal-kind.ts";
import { SYSTEM_PROMPT } from "../src/lib/journal.ts";

assert.match(journalPipelineVoiceRules(), /BLOG/i);
assert.match(journalPipelineVoiceRules(), /curiosidad/i);
assert.match(journalPipelineVoiceRules(), /PROHIBIDO inventar lo que SE VE/i);
assert.match(SYSTEM_PROMPT, /curiosidades/i);
assert.match(SYSTEM_PROMPT, /Krakow|destino/i);

const ctx = {
  title: "Test Trip",
  participants: ["Ada"],
  dateRange: { start: "2026-08-01", end: "2026-08-02" },
  flights: { outbound: null, inbound: null },
  places: [],
  tripNotes: [{ text: "Primera nota", author: "Ada" }],
  brief: "Enfoque: más tips prácticos.",
  destination: { name: "Cracovia", themes: ["Historia"] },
  days: [
    {
      date: "2026-08-01",
      dayNotes: [{ text: "Playa", author: "Ada" }],
      places: [],
      photos: [
        {
          url: "/uploads/a.jpg",
          author: "Ada",
          comments: ["Oleaje"],
          exifDateTime: "2026-08-01T12:00:00.000Z",
          isTransportStart: false,
          isTransportEnd: false,
        },
      ],
    },
  ],
};

// Regression: must not recurse (Maximum call stack size exceeded).
const addon = journalPromptContextAddon(ctx);
assert.match(addon, /INDICACIONES DEL USUARIO/);
assert.match(addon, /FICHA DESTINO/);
assert.match(addon, /Cracovia/);

assert.equal(
  sanitizeDaySummaryProse('Pasamos la mañana en la plaza.\n\n> "Flipé con el tamaño"\n\nLuego comimos.'),
  "Pasamos la mañana en la plaza.\n\nLuego comimos."
);
assert.ok(!sanitizeDaySummaryProse('Ada: "Hola literal"\n\nSeguimos.').includes("Hola literal"));

const dirtyDay = `### lunes, 1 de agosto de 2026

Irene estaba feliz.

> **Irene:** Plaza medieval enorme

![Foto](/x.jpg)

*Irene*
`;
const cleaned = sanitizeJournalDayProse(dirtyDay);
assert.ok(cleaned.includes("Irene estaba feliz"));
assert.ok(!cleaned.includes("Plaza medieval enorme"));
assert.ok(cleaned.includes("![Foto](/x.jpg)"), "images preserved");

const markdown = assembleJournalMarkdown(
  ctx,
  "Intro del viaje.",
  [
    {
      date: "2026-08-01",
      summary: 'Día de playa.\n\n> "Oleaje brutal"\n\nAda: "Qué frío"',
    },
  ],
  [{ url: "/uploads/a.jpg", caption: "Oleaje suave" }],
  "Fin del viaje."
);

assert.match(markdown, /# Test Trip/);
assert.match(markdown, /!\[Oleaje suave\]\(\/uploads\/a\.jpg\)/);
assert.match(markdown, /Intro del viaje/);
assert.match(markdown, /Día de playa/);
assert.ok(!markdown.includes("Oleaje brutal"), "no literal photo quote in day prose");
assert.ok(!markdown.includes('Ada: "Qué frío"'), "no author:quote dump");

const local = buildLocalJournalMarkdown(ctx);
assert.match(local, /sin IA/i);
assert.match(local, /Test Trip/);

const blog = assembleBlogJournalMarkdown(
  ctx,
  "Gancho del destino.",
  [
    {
      title: "Free tours por el casco",
      summary: "Recorrido por la plaza y el casco antiguo.",
      placeHints: [],
      dayKeys: ["2026-08-01"],
    },
    {
      title: "Excursión a las minas",
      summary: "Visita a las minas de sal.",
      placeHints: ["Bochnia"],
      dayKeys: [],
    },
  ],
  [{ url: "/uploads/a.jpg", caption: "Oleaje suave" }],
  "Reserva tiempo para perderte por las calles."
);
assert.match(blog, /## Free tours por el casco/);
assert.match(blog, /## Excursión a las minas/);
assert.match(blog, /## Si vas/);
assert.ok(!blog.includes("### "), "blog has no day ### headers");
assert.ok(!blog.includes("día a día"), "blog is not day-diary section");
assert.ok(!blog.includes("## El viaje\n"), "blog no longer uses single El viaje dump");

const localBlog = buildLocalJournalMarkdown(ctx, "blog");
assert.match(localBlog, /## Si vas/);
assert.ok(!localBlog.includes("### "), "local blog has no day headers");

const themed = buildLocalBlogSections({
  ...ctx,
  places: [
    { name: "Rynek", type: "LANDMARK", comment: null, alias: "Ada" },
    { name: "Auschwitz", type: "MUSEUM", comment: "excursión", alias: "Ada" },
    { name: "Bochnia", type: "OTHER", comment: "minas de sal", alias: "Ada" },
  ],
});
assert.ok(
  themed.some((s) => /auschwitz/i.test(s.title)),
  "local sections include Auschwitz"
);
assert.ok(
  themed.some((s) => /bochnia/i.test(s.title)),
  "local sections separate Bochnia from Auschwitz"
);
assert.ok(
  themed.some((s) => /descubrir|rynek|ciudad/i.test(s.title)),
  "local sections include city theme"
);
const resolved = resolveExportJournalMarkdown({
  journalMarkdown: markdown,
  journalBlogMarkdown: blog,
  htmlJournalSource: "blog",
});
assert.equal(resolved.source, "blog");
assert.match(resolved.markdown, /Si vas/);

console.log("journal-pipeline assemble/local ok");
