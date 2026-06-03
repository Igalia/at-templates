# at-template

Given an [AT Protocol](https://atproto.com) record, figure out _which app(s) can
open it_ and build a deep link to each — entirely over public XRPC, no SDK and no
auth.

A record's collection (e.g. `app.bsky.feed.post`, `com.whtwnd.blog.entry`) tells
you what kind of thing it is, but not where a human can view it. This project
closes that gap with two pieces: a curated set of per-collection _URL templates_,
and a small template engine that fills them in — following references to other
records when a template needs to.

The goal is to eventually upstream the definitions to something like
[`community.lexicons.app`](https://github.com/lexicon-community/lexicon/pull/76),
but for now we're maintaining them here.


## Packages

### [`packages/at-template`](packages/at-template) — `@igalia-experiments/at-template`

The template engine. Parses a template like
`https://bsky.app/profile/{repo}/post/{rkey}` and evaluates it against a record,
dereferencing `at://` URIs (`{value.publication.uri->url}`) over public XRPC when
needed. See its [README](packages/at-template/README.md) for the language and API.

### [`packages/at-app-handlers`](packages/at-app-handlers) — `@igalia-experiments/at-app-handlers`

The data: one JSON file per app, listing which record collections it can open and
the URL template for each. The package's `index.js` reads them all and exports a

```
Map<collection, Array<{ appName, urlTemplate, label? }>>
```

A collection can map to several apps (e.g. `app.bsky.feed.post` opens in both
Bluesky and Blacksky), and one app can offer several destinations for a collection
(e.g. a list-item opens either the list or the added member) — hence an array.

### [`lexicons/`](lexicons)

The `com.example.app.handlers` Lexicon schema describing a handler record.

## Usage

```ts
import { parse, evaluateRecord } from "@igalia-experiments/at-template";
import handlersByCollection from "@igalia-experiments/at-app-handlers" with { type: "json" };

const record = {
  collection: "app.bsky.feed.post",
  uri: "at://did:example:alice/app.bsky.feed.post/12345",
  value: {
    publication: {
      uri: "at://did:example:alice/app.bsky.feed.post/12345",
    },
  },
};

const handlers = handlersByCollection[record.collection] ?? [];
for (const { appName, urlTemplate, label } of handlers) {
  const url = await evaluateRecord(parse(urlTemplate), context);
  console.log(appName, label ?? "", url);
}
```

## License

[MIT](LICENSE) © Igalia
