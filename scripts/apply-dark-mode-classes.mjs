#!/usr/bin/env node
/**
 * Adds dark: Tailwind variants to common light-only utility classes.
 * Idempotent: skips lines that already contain "dark:" for that property.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");

const REPLACEMENTS = [
  [/(\bbg-white\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-slate-900"],
  [/(\bbg-slate-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-slate-950/60"],
  [/(\bbg-slate-100\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-slate-800/80"],
  [/(\btext-slate-900\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-100"],
  [/(\btext-slate-800\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-200"],
  [/(\btext-slate-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-300"],
  [/(\btext-slate-600\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-300"],
  [/(\btext-slate-500\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-400"],
  [/(\btext-slate-400\b)(?!.*\bdark:text-)/g, "$1 dark:text-slate-500"],
  [/(\bborder-slate-200\b)(?!.*\bdark:border-)/g, "$1 dark:border-slate-800"],
  [/(\bborder-slate-100\b)(?!.*\bdark:border-)/g, "$1 dark:border-slate-800/80"],
  [/(\bborder-slate-300\b)(?!.*\bdark:border-)/g, "$1 dark:border-slate-700"],
  [/(\bdivide-slate-200\b)(?!.*\bdark:divide-)/g, "$1 dark:divide-slate-800"],
  [/(\bring-slate-200\b)(?!.*\bdark:ring-)/g, "$1 dark:ring-slate-700"],
  [/(\bshadow-sm\b)(?!.*\bdark:shadow-)/g, "$1 dark:shadow-black/20"],
  [/(\bhover:bg-slate-50\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-slate-800/60"],
  [/(\bhover:bg-slate-100\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-slate-800"],
  [/(\bhover:bg-white\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-slate-800"],
  [/(\bbg-amber-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-amber-950/35"],
  [/(\bbg-teal-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-teal-950/35"],
  [/(\bbg-indigo-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-indigo-950/35"],
  [/(\bbg-emerald-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-emerald-950/35"],
  [/(\bbg-red-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-red-950/35"],
  [/(\bbg-violet-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-violet-950/35"],
  [/(\bbg-orange-50\b)(?!.*\bdark:bg-)/g, "$1 dark:bg-orange-950/35"],
  [/(\btext-amber-950\b)(?!.*\bdark:text-)/g, "$1 dark:text-amber-100"],
  [/(\btext-amber-900\b)(?!.*\bdark:text-)/g, "$1 dark:text-amber-200"],
  [/(\btext-amber-800\b)(?!.*\bdark:text-)/g, "$1 dark:text-amber-200"],
  [/(\btext-amber-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-amber-300"],
  [/(\btext-teal-800\b)(?!.*\bdark:text-)/g, "$1 dark:text-teal-300"],
  [/(\btext-teal-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-teal-300"],
  [/(\btext-indigo-900\b)(?!.*\bdark:text-)/g, "$1 dark:text-indigo-200"],
  [/(\btext-indigo-800\b)(?!.*\bdark:text-)/g, "$1 dark:text-indigo-200"],
  [/(\btext-indigo-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-indigo-300"],
  [/(\btext-red-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-red-300"],
  [/(\btext-emerald-900\b)(?!.*\bdark:text-)/g, "$1 dark:text-emerald-200"],
  [/(\btext-emerald-700\b)(?!.*\bdark:text-)/g, "$1 dark:text-emerald-300"],
  [/(\bborder-amber-200\b)(?!.*\bdark:border-)/g, "$1 dark:border-amber-900/60"],
  [/(\bborder-teal-200\b)(?!.*\bdark:border-)/g, "$1 dark:border-teal-900/60"],
  [/(\bborder-indigo-200\b)(?!.*\bdark:border-)/g, "$1 dark:border-indigo-900/60"],
  [/(\bborder-indigo-100\b)(?!.*\bdark:border-)/g, "$1 dark:border-indigo-900/50"],
  [/(\bborder-teal-100\b)(?!.*\bdark:border-)/g, "$1 dark:border-teal-900/50"],
  [/(\bborder-red-200\b)(?!.*\bdark:border-)/g, "$1 dark:border-red-900/60"],
  [/(\bring-indigo-200\b)(?!.*\bdark:ring-)/g, "$1 dark:ring-indigo-800"],
  [/(\bring-red-200\b)(?!.*\bdark:ring-)/g, "$1 dark:ring-red-900/60"],
  [/(\bhover:bg-indigo-50\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-indigo-950/50"],
  [/(\bhover:bg-teal-50\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-teal-950/50"],
  [/(\bhover:bg-teal-100\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-teal-900/40"],
  [/(\bhover:bg-amber-50\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-amber-950/50"],
  [/(\bhover:bg-red-100\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-red-950/50"],
  [/(\bhover:bg-emerald-50\b)(?!.*\bdark:hover:bg-)/g, "$1 dark:hover:bg-emerald-950/50"],
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
  const original = readFileSync(file, "utf8");
  let next = original;
  for (const [pattern, replacement] of REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  if (next !== original) {
    writeFileSync(file, next);
    changed += 1;
    console.log("updated", file.replace(ROOT + "/", ""));
  }
}
console.log(`Done. ${changed} files updated.`);
