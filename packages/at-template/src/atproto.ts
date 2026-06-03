import type { Template } from "./parse.ts";
import { evaluateAsync, type Transforms } from "./evaluate.ts";
import { defaultTransforms } from "./transforms.ts";

// The evaluation context derived from a single atproto record, matching the
// placeholders a handler URL template can use.
export type RecordContext = {
  did: string;
  handle: string;
  repo: string; // handle || did
  collection: string;
  rkey: string;
  value: unknown;
};

export type EvaluateRecordOptions = {
  // Defaults to `defaultTransforms` (the at:// URI helpers).
  transforms?: Transforms;
  // Resolves an `at://` URI to the referenced record's value (for `->`).
  // Defaults to `getRecordValue` (public XRPC over fetch).
  fetchRecord?: (atUri: string) => Promise<any>;
  // Resolves a bare DID to its DID document (for `->`).
  // Defaults to `getDidDocument` (DID resolution over fetch).
  fetchDidDocument?: (did: string) => Promise<any>;
  onMissing?: (obj: any, property: string) => void;
};

// Evaluate a parsed handler template against a record, dereferencing references
// (`->`) as needed: an `at://` URI resolves to a record, a bare DID to its DID
// document.
export function evaluateRecord(
  template: Template,
  context: RecordContext,
  {
    transforms = defaultTransforms,
    fetchRecord = getRecordValue,
    fetchDidDocument = getDidDocument,
    onMissing,
  }: EvaluateRecordOptions = {},
): Promise<string> {
  return evaluateAsync(template, {
    context,
    transforms,
    fetchRemote: (ref: string) =>
      ref.startsWith("at://") ? fetchRecord(ref) : fetchDidDocument(ref),
    onMissing,
  });
}

// Minimal AT Protocol helpers over plain fetch — public XRPC, no auth, no SDK.
// Resolves a DID's PDS and reads records, so a template can dereference the
// `at://` URIs (and DIDs) a record points at.

const docCache = new Map<string, any>();

// Resolve a DID (or did:web) to its DID document, or null if not found.
async function getDidDocument(did: string): Promise<any> {
  if (docCache.has(did)) return docCache.get(did);
  let doc = null;
  try {
    doc = await getJSON(
      did.startsWith("did:web:")
        ? `https://${did.slice("did:web:".length).replace(/:/g, "/")}/.well-known/did.json`
        : `https://plc.directory/${did}`,
    );
  } catch {
    doc = null;
  }
  docCache.set(did, doc);
  return doc;
}

// Resolve a DID to its PDS service endpoint, or null if not found.
async function pdsFor(authority: string): Promise<string | null> {
  const doc = await getDidDocument(authority);
  return (
    (doc?.service || []).find(
      (s: any) => s.type === "AtprotoPersonalDataServer",
    )?.serviceEndpoint ?? null
  );
}

const recordCache = new Map<string, any>();

// Resolve an `at://<authority>/<collection>/<rkey>` URI to that record's value,
// or null if it can't be resolved.
async function getRecordValue(atUri: string): Promise<any> {
  if (recordCache.has(atUri)) return recordCache.get(atUri);

  let value = null;
  try {
    const [authority, collection, rkey] = atUri
      .slice("at://".length)
      .split("/");
    const pds = await pdsFor(authority);
    if (pds) {
      const u = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
      u.searchParams.set("repo", authority);
      u.searchParams.set("collection", collection);
      u.searchParams.set("rkey", rkey);
      const res = await fetch(u);
      if (res.ok) value = ((await res.json()) as any).value;
    }
  } catch {
    value = null;
  }
  recordCache.set(atUri, value);
  return value;
}

async function getJSON(url: string | URL): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
