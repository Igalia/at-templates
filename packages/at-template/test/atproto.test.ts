import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/parse.ts";
import { evaluateRecord } from "../src/atproto.ts";

// A baseline record context, with per-test overrides.
const ctx = (over: Record<string, any> = {}) => ({
  did: "did:plc:ab",
  handle: "alice.test",
  repo: "alice.test",
  collection: "com.whtwnd.blog.entry",
  rkey: "3kx",
  value: {},
  ...over,
});

// fetchRecord that fails the test if a non-remote template tries to dereference.
const noFetch = async (): Promise<any> => {
  throw new Error("fetchRecord should not be called");
};

describe("evaluateRecord", () => {
  it("fills a non-remote template without fetching", async () => {
    const result = await evaluateRecord(
      parse("https://whtwnd.com/{repo}/{rkey}"),
      ctx(),
      { fetchRecord: noFetch },
    );
    assert.equal(result, "https://whtwnd.com/alice.test/3kx");
  });

  it("applies the default at:// transforms (no fetch needed)", async () => {
    const result = await evaluateRecord(
      parse("/p/{value.subject.uri|atUriAuthority}/post/{value.subject.uri|atUriRkey}"),
      ctx({ value: { subject: { uri: "at://did:plc:zz/app.bsky.feed.post/xyz" } } }),
      { fetchRecord: noFetch },
    );
    assert.equal(result, "/p/did:plc:zz/post/xyz");
  });

  it("dereferences a remote record for `->`", async () => {
    const seen: string[] = [];
    const fetchRecord = async (atUri: string) => {
      seen.push(atUri);
      return { url: "https://pckt.app/p/1" };
    };
    const result = await evaluateRecord(
      parse("{value.publication.uri->url}"),
      ctx({ value: { publication: { uri: "at://did:plc:pub/blog.pckt.publication/1" } } }),
      { fetchRecord },
    );
    assert.equal(result, "https://pckt.app/p/1");
    // fetchRecord receives the at:// uri the record points at
    assert.deepEqual(seen, ["at://did:plc:pub/blog.pckt.publication/1"]);
  });

  it("follows chained `->` hops, fetching each in order", async () => {
    const seen: string[] = [];
    const fetchRecord = async (atUri: string) => {
      seen.push(atUri);
      return atUri === "at://a" ? { site: "at://b" } : { url: "https://site/x" };
    };
    const result = await evaluateRecord(
      parse("{value.document.uri->site->url}"),
      ctx({ value: { document: { uri: "at://a" } } }),
      { fetchRecord },
    );
    assert.equal(result, "https://site/x");
    assert.deepEqual(seen, ["at://a", "at://b"]);
  });

  it("uses custom transforms when provided (replacing the defaults)", async () => {
    const result = await evaluateRecord(parse("{repo|shout}"), ctx(), {
      fetchRecord: noFetch,
      transforms: { shout: (s: string) => `${s}!` },
    });
    assert.equal(result, "alice.test!");
  });

  it("rejects when a referenced property is missing (default onMissing throws)", async () => {
    await assert.rejects(
      evaluateRecord(parse("{value.nope}"), ctx({ value: {} }), {
        fetchRecord: noFetch,
      }),
      /Missing property nope/,
    );
  });

  it("passes onMissing through", async () => {
    const result = await evaluateRecord(parse("{value.nope}"), ctx({ value: {} }), {
      fetchRecord: noFetch,
      onMissing: () => "fallback",
    });
    assert.equal(result, "fallback");
  });

  it("resolves a DID to a handle by dereferencing its DID document", async () => {
    // a bare DID (not an at:// URI) is routed to fetchDidDocument; alsoKnownAs[0]
    // is the handle (an at:// URI), and atUriAuthority strips it.
    const seen: string[] = [];
    const fetchDidDocument = async (did: string) => {
      seen.push(did);
      return { alsoKnownAs: ["at://alice.test"], service: [] }; // a DID document
    };
    const result = await evaluateRecord(
      parse("{value.subject->alsoKnownAs.0|atUriAuthority}"),
      ctx({
        collection: "app.bsky.graph.follow",
        value: { subject: "did:plc:followed" },
      }),
      { fetchRecord: noFetch, fetchDidDocument },
    );
    assert.equal(result, "alice.test");
    assert.deepEqual(seen, ["did:plc:followed"]);
  });

  it("routes at:// references to fetchRecord, not fetchDidDocument", async () => {
    const didCall = async () => {
      throw new Error("fetchDidDocument should not be called for an at:// ref");
    };
    const result = await evaluateRecord(
      parse("{value.uri->title}"),
      ctx({ value: { uri: "at://did:plc:x/com.example/1" } }),
      { fetchRecord: async () => ({ title: "Hello" }), fetchDidDocument: didCall },
    );
    assert.equal(result, "Hello");
  });
});
