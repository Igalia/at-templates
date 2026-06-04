/**
 * @import {AppHandlers, CollectionHandle, CollectionHandlers} from "@igalia-experiments/at-app-handlers";
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const handlersDir = new URL("../handlers/", import.meta.url);
const outFile = new URL("../index.json", import.meta.url);

/** @type {CollectionHandlers} */
const byCollection = {};

for (const file of readdirSync(handlersDir)) {
  if (!file.endsWith(".json")) continue;
  /** @type {AppHandlers} */
  const handler = JSON.parse(readFileSync(new URL(file, handlersDir), "utf8"));
  for (const { collection, template, label } of handler.targets) {
    /** @type {CollectionHandle} */
    const entry = { appName: handler.name, urlTemplate: template };
    if (label !== undefined) entry.label = label;
    (byCollection[collection] ??= []).push(entry);
  }
}

const sortedByCollection = Object.fromEntries(
  Object.entries(byCollection).sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(outFile, JSON.stringify(sortedByCollection, null, 2) + "\n");
console.log(`wrote ${outFile.pathname} (${Object.keys(sortedByCollection).length} collections)`);
