// Builds index.json: a map from a record collection (NSID) to a template that
// produces a short, human-readable preview of such a record. Preview definitions
// live under previews/, organized into subfolders; the layout is purely
// organizational — each collection is read from the file's `collection` field.
/**
 * @import {RecordPreview} from "@igalia-experiments/at-record-previews";
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const previewsDir = new URL("../previews/", import.meta.url);
const outFile = new URL("../index.json", import.meta.url);

/** @type {Record<string, string>} */
const byCollection = {};

/**
 * @param {URL} dir
 * @returns {undefined}
 */
function collect(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      collect(new URL(`${ent.name}/`, dir));
    } else if (ent.name.endsWith(".json")) {
      /** @type {RecordPreview} */
      const { collection, template } = JSON.parse(
        readFileSync(new URL(ent.name, dir), "utf8"),
      );
      byCollection[collection] = template;
    }
  }
}

collect(previewsDir);

const sorted = Object.fromEntries(
  Object.entries(byCollection).sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(outFile, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${outFile.pathname} (${Object.keys(sorted).length} previews)`);
