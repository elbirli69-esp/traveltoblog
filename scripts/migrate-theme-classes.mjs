#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");

const REPLACEMENTS = [
  // Pass 1 — surfaces & callouts
  ["rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60/80 px-4 py-8 text-center", "empty-state"],
  ["rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-4 py-8 text-center text-sm text-fg-secondary", "empty-state text-sm text-fg-secondary"],
  ["rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4", "surface-inset p-4"],
  ["rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-2.5", "surface-inset px-3 py-2.5"],
  ["rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60/80 p-3 space-y-2", "surface-inset p-3 space-y-2"],
  ["rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800", "callout callout-success text-sm font-medium"],
  ["rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800", "callout callout-warning text-sm"],
  ["rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700", "callout callout-error text-sm"],
  ["rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700", "callout callout-error text-sm"],
  ["rounded-xl border border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-900", "callout callout-warning text-center text-sm"],
  ["rounded-xl bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900", "callout callout-success text-xs"],
  ["rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900", "callout callout-warning text-xs"],
  ["rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950", "callout callout-warning text-sm"],

  // Pass 2 — typography & buttons
  ["font-medium text-teal-700", "text-alias"],
  ["text-sm font-semibold text-teal-700", "text-sm font-semibold text-accent-mint"],
  ["text-[10px] font-semibold text-teal-700", "text-[10px] font-semibold text-accent-mint"],
  ["text-xs font-medium text-teal-700", "text-xs font-medium text-accent-mint"],
  ["text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline", "text-link-subtle"],
  ["text-xs text-teal-700", "text-xs text-accent-mint"],
  ["text-sm text-red-600", "text-sm text-danger"],
  ["text-xs text-red-600", "text-xs text-danger"],
  ["text-xs font-medium text-red-600 hover:text-red-800", "text-xs font-medium text-danger"],
  ["text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50", "text-xs font-medium text-danger disabled:opacity-50"],
  ["rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50", "btn-primary px-4 py-2 text-sm disabled:opacity-50"],
  ["rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50", "btn-primary px-3 py-1.5 text-xs disabled:opacity-50"],
  ["w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50", "btn-primary w-full py-3 text-sm disabled:opacity-50"],
  ["w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50", "btn-primary w-full py-3 text-sm disabled:opacity-50"],
  ["rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white", "btn-primary px-6 py-2 text-sm"],
  ["block rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-semibold text-white", "btn-primary block w-full py-3 text-center text-sm"],
  ["rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50", "btn-primary px-4 py-2 text-sm disabled:opacity-50"],
  ["rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 disabled:opacity-40", "btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"],
  ["rounded-xl bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-fg-secondary ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 dark:bg-slate-950/60", "btn-secondary px-4 py-2 text-sm"],
  ["rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-fg-secondary ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 dark:bg-slate-950/60", "btn-secondary px-3 py-1.5 text-xs"],
  ["rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-slate-50 dark:hover:bg-slate-800/60 dark:bg-slate-950/60", "btn-secondary px-3 py-1.5 text-xs"],
  ["block rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-center text-sm font-medium text-fg-secondary", "btn-secondary block w-full py-3 text-center text-sm"],
  ["shrink-0 text-xs font-semibold text-teal-700", "shrink-0 text-xs font-semibold text-accent-cyan"],
  ["font-mono text-2xl font-bold tracking-widest text-teal-700", "share-code"],
  ["mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2", "btn-primary mt-4 inline-flex items-center gap-1.5"],

  // Pass 3 — inputs & borders
  ["w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20", "form-input input-focus"],
  ["w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none", "form-input input-focus"],
  ["w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20", "form-input form-input-lg input-focus"],
  ["w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 font-mono text-lg tracking-wider text-fg focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20", "form-input form-input-lg input-focus font-mono text-lg tracking-wider"],
  ["mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20", "form-input input-focus mt-2"],
  ["w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 font-mono text-sm leading-relaxed text-fg focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20", "form-input input-focus rounded-2xl px-4 py-3 font-mono leading-relaxed"],
  ["border-t border-slate-100 dark:border-slate-800/80", "border-t border-divider"],
  ["rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3", "surface p-4 space-y-3"],
  ["rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900", "surface"],
  ["rounded-xl bg-slate-50 dark:bg-slate-950/60 px-3 py-2 text-sm text-fg-secondary", "surface-inset px-3 py-2 text-sm text-fg-secondary"],
  ["group relative overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700", "group relative ring-photo"],
  ["h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800", "h-[420px] w-full overflow-hidden rounded-2xl border border-[var(--border)]"],
  ["inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-teal-600", "spinner-accent h-3.5 w-3.5"],
  ["fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 pb-8 shadow-2xl space-y-6", "sheet-bottom space-y-6"],
  [": \"border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900\"", ": \"place-row\""],
  ["w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50", "btn-pdf disabled:opacity-50"],
  ["border-violet-500 ring-2 ring-violet-500/20", "select-card-violet-active"],
  ["border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700", "border-[var(--border)] hover:border-[var(--border-strong)]"],
  ["journal-prose prose prose-slate mb-10 max-w-none prose-headings:font-semibold prose-a:text-teal-600 prose-img:rounded-xl", "journal-prose"],
  ["rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50", "btn-primary px-3 py-1.5 text-xs disabled:opacity-50"],
  ["mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white shadow-lg", "mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl btn-primary text-3xl shadow-lg"],
  ["flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-teal-700", "btn-primary flex w-full items-center justify-center px-6 py-4 text-center text-base shadow-md"],
  ["min-w-0 flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1 py-0.5 text-[10px]", "form-input form-input-sm min-w-0 flex-1"],
  ["ml-2 text-amber-600", "ml-2 text-warning-inline"],
  ["text-[10px] font-medium text-amber-200", "text-overlay-warn"],
  ["text-[10px] font-medium text-amber-300", "text-overlay-warn"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (path.endsWith(".tsx")) files.push(path);
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  let content = readFileSync(file, "utf8");
  const original = content;
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  if (content !== original) {
    writeFileSync(file, content);
    changed++;
    console.log("  updated:", file.replace(ROOT + "/", ""));
  }
}

console.log(`\nDone: updated ${changed} files`);
