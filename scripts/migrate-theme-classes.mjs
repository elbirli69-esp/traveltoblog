#!/usr/bin/env node
/**
 * Migrates common light/dark Tailwind pairs to semantic theme classes.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");

const REPLACEMENTS = [
  [
    "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-black/20",
    "surface p-6",
  ],
  [
    "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-black/20",
    "surface p-5",
  ],
  [
    "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-black/20",
    "surface p-4",
  ],
  [
    "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-black/20",
    "surface",
  ],
  ["text-slate-900 dark:text-slate-100", "text-fg"],
  ["text-slate-800 dark:text-slate-200", "text-fg"],
  ["text-slate-700 dark:text-slate-300", "text-fg-secondary"],
  ["text-slate-600 dark:text-slate-300", "text-fg-secondary"],
  [
    "text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500",
    "text-fg-secondary",
  ],
  ["text-slate-500 dark:text-slate-400", "text-fg-secondary"],
  ["text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500", "text-fg-tertiary"],
  ["text-slate-400 dark:text-slate-500", "text-fg-tertiary"],
  ["font-medium text-teal-600 hover:underline", "link-accent"],
  ["text-sm text-teal-600 hover:underline", "text-sm link-accent"],
  ["text-teal-600 hover:underline", "link-accent"],
  [
    "rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900",
    "callout callout-success text-sm",
  ],
  [
    "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950",
    "callout callout-warning text-sm",
  ],
  [
    "rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950",
    "callout callout-warning text-sm",
  ],
  [
    "mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900",
    "callout callout-success mb-4 text-sm",
  ],
  [
    "mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3",
    "callout callout-warning mb-4",
  ],
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
  }
}

console.log(`Updated ${changed} files`);
