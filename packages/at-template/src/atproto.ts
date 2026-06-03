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
  onMissing?: (obj: any, property: string) => void;
};

// Evaluate a parsed handler template against a record, fetching any referenced
// records (`->`) as needed.
export function evaluateRecord(
  template: Template,
  context: RecordContext,
  options: EvaluateRecordOptions = {},
): Promise<string> {
  return evaluateAsync(template, {
    context,
    transforms: options.transforms ?? defaultTransforms,
    fetchRemote: options.fetchRecord ?? getRecordValue,
    onMissing: options.onMissing,
  });
}

// Minimal AT Protocol helpers over plain fetch — public XRPC, no auth, no SDK.
// Resolves a DID's PDS and reads records, so a template can dereference the
// `at://` URIs a record points at.

const pdsCache = new Map<string, string | null>();

// Resolve a DID (or did:web) to its PDS service endpoint, or null if not found.
async function pdsFor(authority: string): Promise<string | null> {
  if (pdsCache.has(authority)) return pdsCache.get(authority)!;
  let pds: string | null = null;
  try {
    const doc = await getJSON(
      authority.startsWith("did:web:")
        ? `https://${authority.slice("did:web:".length).replace(/:/g, "/")}/.well-known/did.json`
        : `https://plc.directory/${authority}`,
    );
    pds =
      (doc.service || []).find(
        (s: any) => s.type === "AtprotoPersonalDataServer",
      )?.serviceEndpoint ?? null;
  } catch {
    pds = null;
  }
  pdsCache.set(authority, pds);
  return pds;
}

const recordCache = new Map<string, any>();

// Fetch a single record's value by at:// URI, used to dereference references.
// Returns null if the record can't be resolved.
async function getRecordValue(atUri: string): Promise<any> {
  if (recordCache.has(atUri)) return recordCache.get(atUri);

  let value = null;
  try {
    const [authority, collection, rkey] = atUri
      .replace(/^at:\/\//, "")
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
