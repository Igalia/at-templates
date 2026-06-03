import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/parse.ts";
import { evaluateSync, evaluateAsync } from "../src/evaluate.ts";

// Most cases parse a template and evaluate it in one go; these helpers keep the
// assertions focused on the input string + context rather than the AST.
const sync = (template: string, context: any, functions?: any) =>
  evaluateSync(parse(template), { context, functions });

describe("evaluate", () => {
  describe("evaluateSync", () => {
    it("returns a template with no expressions unchanged", () => {
      assert.equal(sync("hello world", {}), "hello world");
    });

    it("substitutes a single reference", () => {
      assert.equal(sync("{value}", { value: "x" }), "x");
    });

    it("interpolates references into the surrounding literals", () => {
      assert.equal(
        sync("https://example.com/{repo}/{rkey}", { repo: "alice", rkey: "abc" }),
        "https://example.com/alice/abc",
      );
    });

    it("stringifies non-string values", () => {
      assert.equal(sync("{n}", { n: 42 }), "42");
      assert.equal(sync("{b}", { b: true }), "true");
    });

    it("resolves a nested property path", () => {
      assert.equal(
        sync("{value.foo.bar}", { value: { foo: { bar: "deep" } } }),
        "deep",
      );
    });

    it("throws by default on a missing property", () => {
      assert.throws(() => sync("{value.nope}", { value: {} }), /Missing property nope/);
    });

    it("throws by default when walking into a non-object", () => {
      assert.throws(() => sync("{value.a.b}", { value: { a: 5 } }), /Missing property b/);
    });

    it("applies a function to a value", () => {
      assert.equal(
        sync("{value|up}", { value: "hi" }, { up: (s: string) => s.toUpperCase() }),
        "HI",
      );
    });

    it("applies a function to a property access", () => {
      assert.equal(
        sync(
          "{value.subject.uri|rkey}",
          { value: { subject: { uri: "at://did/coll/xyz" } } },
          { rkey: (s: string) => s.split("/").at(-1) },
        ),
        "xyz",
      );
    });

    it("chains functions left-to-right", () => {
      assert.equal(
        sync("{a|inc|double}", { a: 1 }, { inc: (x: number) => x + 1, double: (x: number) => x * 2 }),
        "4",
      );
    });

    it("throws on an undefined reference", () => {
      assert.throws(() => sync("{missing}", {}), /Undefined reference: missing/);
    });

    it("distinguishes a missing reference from one set to undefined", () => {
      // the key exists, so it is not an "undefined reference" error
      assert.equal(sync("{value}", { value: undefined }), "undefined");
    });

    it("throws on an undefined function", () => {
      assert.throws(() => sync("{a|nope}", { a: 1 }), /Undefined function: nope/);
    });

    it("throws when the template needs remote resolution", () => {
      assert.throws(
        () => sync("{value.uri->url}", { value: { uri: "at://x" } }),
        /requires remote values/,
      );
    });
  });

  describe("evaluateAsync", () => {
    // fetchRemote is never called for these, but the signature requires it.
    const noRemote = async () => {
      throw new Error("fetchRemote should not be called");
    };

    it("resolves non-remote templates just like evaluateSync", async () => {
      assert.equal(
        await evaluateAsync(parse("https://example.com/{repo}"), {
          fetchRemote: noRemote,
          context: { repo: "alice" },
        }),
        "https://example.com/alice",
      );
    });

    it("fetches a remote record and reads a property off it", async () => {
      const seen: string[] = [];
      const fetchRemote = async (name: string) => {
        seen.push(name);
        return { url: "https://pckt.app/p/123" };
      };
      const result = await evaluateAsync(parse("{value.uri->url}"), {
        fetchRemote,
        context: { value: { uri: "at://did/pub/123" } },
      });
      assert.equal(result, "https://pckt.app/p/123");
      // fetchRemote receives the resolved base value (the at:// uri), not the path
      assert.deepEqual(seen, ["at://did/pub/123"]);
    });

    it("follows chained remote accesses, fetching each hop in order", async () => {
      const seen: string[] = [];
      const fetchRemote = async (name: string) => {
        seen.push(name);
        return name === "at://a" ? { mid: "at://b" } : { leaf: "done" };
      };
      const result = await evaluateAsync(parse("{root.uri->mid->leaf}"), {
        fetchRemote,
        context: { root: { uri: "at://a" } },
      });
      assert.equal(result, "done");
      assert.deepEqual(seen, ["at://a", "at://b"]);
    });

    it("applies a function after a remote access", async () => {
      const fetchRemote = async () => ({ url: "https://example.com/Path" });
      const result = await evaluateAsync(parse("{value.uri->url|down}"), {
        fetchRemote,
        context: { value: { uri: "at://x" } },
        functions: { down: (s: string) => s.toLowerCase() },
      });
      assert.equal(result, "https://example.com/path");
    });

    it("rejects on an undefined reference", async () => {
      await assert.rejects(
        evaluateAsync(parse("{missing->url}"), { fetchRemote: noRemote, context: {} }),
        /Undefined reference: missing/,
      );
    });

    it("propagates errors thrown by fetchRemote", async () => {
      const boom = async () => {
        throw new Error("network down");
      };
      await assert.rejects(
        evaluateAsync(parse("{value.uri->url}"), {
          fetchRemote: boom,
          context: { value: { uri: "at://x" } },
        }),
        /network down/,
      );
    });
  });

  describe("onMissing option", () => {
    it("is not called when every property along the path exists", () => {
      const calls: unknown[] = [];
      const onMissing = (obj: any, prop: string) => {
        calls.push([obj, prop]);
      };
      evaluateSync(parse("{value.foo.bar}"), {
        context: { value: { foo: { bar: "ok" } } },
        onMissing,
      });
      assert.deepEqual(calls, []);
    });

    it("receives the object and the missing property name", () => {
      const calls: unknown[] = [];
      const onMissing = (obj: any, prop: string) => {
        calls.push([obj, prop]);
      };
      evaluateSync(parse("{value.foo}"), {
        context: { value: { other: 1 } },
        onMissing,
      });
      assert.deepEqual(calls, [[{ other: 1 }, "foo"]]);
    });

    it("uses its return value as the resolved value", () => {
      const result = evaluateSync(parse("{value.foo}"), {
        context: { value: { other: 1 } },
        onMissing: () => "fallback",
      });
      assert.equal(result, "fallback");
    });

    it("short-circuits the path: it is called once per missing read", () => {
      const calls: unknown[] = [];
      const onMissing = (obj: any, prop: string) => {
        calls.push([obj, prop]);
      };
      evaluateSync(parse("{value.a.b}"), { context: { value: {} }, onMissing });
      assert.deepEqual(calls, [[{}, "a"]]);
    });

    it("fires when reading a property off a non-object value", () => {
      const calls: unknown[] = [];
      const onMissing = (obj: any, prop: string) => {
        calls.push([obj, prop]);
      };
      evaluateSync(parse("{value.a}"), { context: { value: 5 }, onMissing });
      assert.deepEqual(calls, [[5, "a"]]);
    });

    it("fires for missing properties on a fetched remote record", async () => {
      const calls: unknown[] = [];
      const onMissing = (obj: any, prop: string) => {
        calls.push([obj, prop]);
      };
      const fetchRemote = async () => ({ title: "hello" });
      await evaluateAsync(parse("{value.uri->url}"), {
        fetchRemote,
        context: { value: { uri: "at://x" } },
        onMissing,
      });
      assert.deepEqual(calls, [[{ title: "hello" }, "url"]]);
    });
  });
});
