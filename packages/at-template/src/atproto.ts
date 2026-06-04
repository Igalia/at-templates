import type {fetchDidDocument, fetchRecord} from "./unsafe-atproto-helpers.ts"
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
  /**
   * Resolve an `at://` URI to the referenced record’s value (for `->`).
   *
   * See {@linkcode fetchRecord} for an example, that does a simple unsafe
   * public XRPC over fetch.
   *
   * @param atUri
   *   `at://` URI (example: `at://did:example:alice/app.bsky.feed.post/123`).
   * @returns
   *   Promise that resolves to the referenced record’s value.
   */
  fetchRecord?: (atUri: string) => Promise<any>;
  /**
   * Resolve a bare DID to its DID document (for `->`).
   *
   * See {@linkcode fetchDidDocument} for an example, that does a simple unsafe
   * DID resolution over fetch.
   *
   * @param did
   *   DID (example: `did:example:alice`).
   * @returns
   *   Promise that resolves to DID document (example: `{ "@context": "https://www.w3.org/ns/did/v1", id: "did:example:alice", … }`).
   */
  fetchDidDocument?: (did: string) => Promise<any>;
  onMissing?: (obj: any, property: string) => void;
};

const unsupported = (message: string) => () => {
  throw new Error(`Unsupported: please provide an implementation for ${message}`);
}

// Evaluate a parsed handler template against a record, dereferencing references
// (`->`) as needed: an `at://` URI resolves to a record, a bare DID to its DID
// document.
export function evaluateRecord(
  template: Template,
  context: RecordContext,
  {
    transforms = defaultTransforms,
    fetchRecord = unsupported("fetchRecord"),
    fetchDidDocument = unsupported("fetchDidDocument"),
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
