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

It contains information abuot which apps can open which collections at which URL.

The data is available either at `@igalia-experiments/at-app-handlers`:
```jsonc
{
  "app.bsky.feed.post": [
    {
      "appName": "Bluesky",
      "urlTemplate": "https://bsky.app/profile/{repo}/post/{rkey}",
      "label": "View post"
    },
    {
      "appName": "Blacksky",
      "urlTemplate": "https://blacksky.app/profile/{repo}/post/{rkey}",
      "label": "View post"
    }
  ],
  // ...
}
```
or in individual per-app files, such as `@igalia-experiments/at-app-handlers/handlers/app.bsky.json`:
```jsonc
{
  "appName": "Bluesky",
  "handlers": [
    {
      "collection": "app.bsky.feed.post",
      "urlTemplate": "https://bsky.app/profile/{repo}/post/{rkey}",
      "label": "View post"
    },
    // ...
  ]
}
```

### [`packages/at-record-previews`](packages/at-record-previews) — `@igalia-experiments/at-record-previews`

It contains information about how to show a human-friendly preview of a record.

The data is available at `@igalia-experiments/at-record-previews` as a map from collection to a template:

```jsonc
{
  "app.bsky.feed.post": {
    "template": "{value.text}",
    "label": "Post text"
  },
  // ...
}
```

or in individual per-collection files, such as `@igalia-experiments/at-record-previews/previews/app/bsky/app.bsky.feed.post.json`:

```jsonc
{
  "template": "{value.text}",
  "label": "Post text"
}
```

### [`lexicons/`](lexicons)

The `com.example.app.handlers` (handler) and `com.example.record.preview` (preview)
Lexicon schemas.

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
