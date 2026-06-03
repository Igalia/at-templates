# @igalia-experiments/at-template

A tiny template language for turning an AT Protocol record into a URL (or any
string), with optional cross-record resolution.

## Template language

A template is literal text with `{ … }` placeholders:

```
https://bsky.app/profile/{repo}/post/{rkey}
```

Inside a placeholder, an expression is built from:

| Syntax | Name | Meaning |
| --- | --- | --- |
| `value` | reference | a name looked up in the context |
| `value.foo.bar` | property | a dotted path into the referenced value |
| `expr\|fn` | transform | apply a named function to the result (chainable) |
| `expr->foo.bar` | remote | dereference `expr` (at URI to a record, or DID to DID doc), read `foo.bar` (chainable) |

Identifiers are `[a-zA-Z0-9]+`. Examples:

```
{value.subject.uri|atUriRkey}                  # a field, with a transform
{value.publication.uri->url}                   # follow an at:// URI, read .url
{value.document.uri->site->url}                # two hops
{value.subject->alsoKnownAs.0|atUriAuthority}  # a bare DID → its DID doc → handle
```

## Install

```bash
pnpm add @igalia-experiments/at-template
```

## API

### `parse(template: string): Template`

Splits a template into literal `parts` and parsed `expressions`.

```ts
import { parse } from "@igalia-experiments/at-template";

parse("https://x/{repo}/{rkey}");
// {
//   parts: ["https://x/", "/", ""],
//   expressions: [ {type:"reference", name:"repo"}, {type:"reference", name:"rkey"} ],
//   hasRemote: false,
// }
```

The number of `parts` is always one more than the number of `expressions`. `hasRemote` is
`true` if any expression uses `->`, meaning that evaluation needs network access and cannot
be done synchronously.

### `evaluateRecord(template, context, options?): Promise<string>`

The AT Protocol entry point: evaluate a parsed template against a record, resolving
references over public XRPC when a `->` is encountered — an `at://` URI to the
referenced record, or a bare DID to its DID document.

```ts
import { parse, evaluateRecord } from "@igalia-experiments/at-template";

const url = await evaluateRecord(
  parse("https://bsky.app/profile/{repo}/post/{rkey}"),
  {
    did: "did:plc:…",
    handle: "alice.test",
    repo: "alice.test",           // handle || did
    collection: "app.bsky.feed.post",
    rkey: "3kx…",
    value: { /* the record body */ },
  },
);
```

`RecordContext` is `{ did, handle, repo, collection, rkey, value }`. Options:

- `transforms` — override the function set (default: `defaultTransforms`, the
  `at://` helpers below).
- `fetchRecord(atUri) => Promise<any>` — how `->` resolves an `at://` URI to the
  referenced record's `value`.
- `fetchDidDocument(did) => Promise<any>` — how `->` resolves a bare DID (`did:…`)
  to its DID document.
- `onMissing(obj, property)` — called when a property read misses; by default it
  throws. Its return value is used as the resolved value, so you can supply a
  fallback or a sentinel.

### Lower-level: `evaluateSync` / `evaluateAsync`

`evaluateRecord` is sugar over these context-agnostic evaluators (also exported
from `./evaluate.ts`):

- `evaluateSync(template, { context, transforms?, onMissing? }): string` — throws
  if the template needs remote resolution.
- `evaluateAsync(template, { fetchRemote, context, transforms?, onMissing? }): Promise<string>`
  — `fetchRemote(ref)` resolves each `->` hop; `ref` is whatever the left side evaluated to.

`context` is a plain `{ [name]: any }`; `transforms` is `{ [name]: (arg) => any }`.

### Transforms (`./transforms.ts`)

Default `|fn` functions for pulling pieces out of an `at://` URI
(`at://<authority>/<collection>/<rkey>`):

- `atUriAuthority` → `<authority>` (a DID or handle)
- `atUriCollection` → `<collection>`
- `atUriRkey` → `<rkey>`

Each returns `null` for a non-`at://` value.
