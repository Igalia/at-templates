import type { Transforms } from "./evaluate.ts";

// Default template transforms for AT Protocol records. These are applied with the
// `{value.<path>|fn}` syntax and pull the pieces out of an `at://` URI that a
// record points at, e.g. a like's subject post or a follow's subject account.
//
// An at:// URI looks like:
//
//   at://<authority>/<collection>/<rkey>
//        └ a DID or handle
//
// `<collection>` and `<rkey>` are optional (a bare `at://<authority>` is valid).

// Split an at:// URI into its `/`-separated segments, or return null if the value
// is not an at:// URI.
function atUriParts(value: unknown): string[] | null {
  const uri = String(value);
  if (!uri.startsWith("at://")) return null;
  return uri.slice("at://".length).split("/");
}

// at://<authority>/<collection>/<rkey> -> <authority> (a DID or handle)
export const atUriAuthority = (value: unknown): string | null =>
  atUriParts(value)?.[0] ?? null;

// at://<authority>/<collection>/<rkey> -> <collection>
export const atUriCollection = (value: unknown): string | null =>
  atUriParts(value)?.[1] ?? null;

// at://<authority>/<collection>/<rkey> -> <rkey> (the last segment)
export const atUriRkey = (value: unknown): string | null =>
  atUriParts(value)?.at(-1) ?? null;

// The default set of transforms, ready to pass as the `transforms` option to
// `evaluateSync` / `evaluateAsync`.
export const defaultTransforms = {
  atUriAuthority,
  atUriCollection,
  atUriRkey,
} satisfies Transforms;
