import { readdirSync, readFileSync } from "node:fs";

const handlersDir = new URL("./handlers/", import.meta.url);

const readJSON = (url) => JSON.parse(readFileSync(url, "utf8"));

// Map from a record collection (NSID) to the ways an app can open it. A
// collection can be handled by more than one app (e.g. app.bsky.* opens in both
// Bluesky and Blacksky), and a single app can offer more than one destination for
// a collection (e.g. a list-item opens either the list or the added member), so
// each value is an array of { appName, urlTemplate, label? } entries.
const handlersByCollection = new Map();

for (const file of readdirSync(handlersDir)) {
  if (!file.endsWith(".json")) continue;
  const handler = readJSON(new URL(file, handlersDir));
  for (const { collection, template, label } of handler.targets) {
    const entry = { appName: handler.name, urlTemplate: template };
    if (label !== undefined) entry.label = label;
    const existing = handlersByCollection.get(collection);
    if (existing) existing.push(entry);
    else handlersByCollection.set(collection, [entry]);
  }
}

export default handlersByCollection;
