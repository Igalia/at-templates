import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/parse.ts";

const ref = (name: string) => ({ type: "reference", name });
const prop = (base: any, ...path: string[]) => ({ type: "property", base, path });
const transform = (base: any, name: string) => ({ type: "transform", base, name });
const remote = (base: any, ...path: string[]) => ({ type: "remote", base, path });

function expr(template: string) {
  const { expressions } = parse(template);
  assert.equal(expressions.length, 1, `expected exactly one expression in ${template}`);
  return expressions[0];
}

describe("parse", () => {
  describe("literal parts", () => {
    it("returns the whole string as one part when there are no expressions", () => {
      assert.deepEqual(parse("hello world"), {
        parts: ["hello world"],
        expressions: [],
        hasRemote: false,
      });
    });

    it("treats the empty template as a single empty part", () => {
      assert.deepEqual(parse(""), {
        parts: [""],
        expressions: [],
        hasRemote: false,
      });
    });

    it("splits the literal text around a single expression", () => {
      const { parts } = parse("xy{a}");
      assert.deepEqual(parts, ["xy", ""]);
    });

    it("captures trailing literal text after an expression", () => {
      const { parts } = parse("{a}xyz");
      assert.deepEqual(parts, ["", "xyz"]);
    });

    it("produces empty parts between adjacent expressions", () => {
      const { parts } = parse("{a}{b}");
      assert.deepEqual(parts, ["", "", ""]);
    });

    it("interleaves literals and expressions for a real URL template", () => {
      const { parts, expressions } = parse("https://example.com/{repo}/{rkey}");
      assert.deepEqual(parts, ["https://example.com/", "/", ""]);
      assert.deepEqual(expressions, [ref("repo"), ref("rkey")]);
    });

    it("keeps parts.length === expressions.length + 1", () => {
      for (const t of ["", "abc", "{a}", "{a}{b}", "x{a}y{b}z", "{a}{b}{c}"]) {
        const { parts, expressions } = parse(t);
        assert.equal(
          parts.length,
          expressions.length + 1,
          `invariant broken for ${JSON.stringify(t)}`,
        );
      }
    });
  });

  describe("identifier", () => {
    it("parses a bare alphanumeric identifier", () => {
      assert.deepEqual(expr("{value}"), ref("value"));
    });

    it("trims surrounding whitespace inside the braces", () => {
      assert.deepEqual(expr("{  value  }"), ref("value"));
    });
  });

  describe("property access", () => {
    it("parses a single-segment path", () => {
      assert.deepEqual(expr("{value.foo}"), prop(ref("value"), "foo"));
    });

    it("parses a multi-segment path", () => {
      assert.deepEqual(expr("{value.foo.bar}"), prop(ref("value"), "foo", "bar"));
    });
  });

  describe("transform", () => {
    it("parses a transform on a bare identifier", () => {
      assert.deepEqual(expr("{value|fn}"), transform(ref("value"), "fn"));
    });

    it("parses a transform applied to a property access", () => {
      assert.deepEqual(
        expr("{value.subject.uri|atUriRkey}"),
        transform(prop(ref("value"), "subject", "uri"), "atUriRkey"),
      );
    });

    it("chains transforms left-to-right", () => {
      assert.deepEqual(expr("{a|f|g}"), transform(transform(ref("a"), "f"), "g"));
    });
  });

  describe("remote access", () => {
    it("parses a remote access with a single segment", () => {
      assert.deepEqual(
        expr("{value.publication.uri->url}"),
        remote(prop(ref("value"), "publication", "uri"), "url"),
      );
    });

    it("parses a remote access with a multi-segment path", () => {
      assert.deepEqual(
        expr("{value.uri->site.domain}"),
        remote(prop(ref("value"), "uri"), "site", "domain"),
      );
    });

    it("chains remote accesses left-to-right", () => {
      assert.deepEqual(
        expr("{value.document.uri->site->url}"),
        remote(remote(prop(ref("value"), "document", "uri"), "site"), "url"),
      );
    });
  });

  describe("mixed operators", () => {
    it("applies a transform after a remote access", () => {
      assert.deepEqual(expr("{a->b|f}"), transform(remote(ref("a"), "b"), "f"));
    });

    it("applies a remote access after a transform", () => {
      assert.deepEqual(expr("{a|f->b}"), remote(transform(ref("a"), "f"), "b"));
    });
  });

  describe("hasRemote flag", () => {
    it("is false when no expression uses a remote access", () => {
      assert.equal(parse("https://example.com/{repo}/{rkey}").hasRemote, false);
      assert.equal(parse("{value.subject.uri|atUriRkey}").hasRemote, false);
    });

    it("is true when any expression uses a remote access", () => {
      assert.equal(parse("{value.publication.uri->url}").hasRemote, true);
      // remote only in the second of two expressions
      assert.equal(parse("{repo}/{value.uri->url}").hasRemote, true);
    });
  });

  describe("real handler templates", () => {
    it("parses the atmo.rsvp template", () => {
      const { parts, expressions, hasRemote } = parse(
        "https://atmo.rsvp/p/{value.subject.uri|atUriAuthority}/e/{value.subject.uri|atUriRkey}",
      );
      assert.deepEqual(parts, ["https://atmo.rsvp/p/", "/e/", ""]);
      assert.deepEqual(expressions, [
        transform(prop(ref("value"), "subject", "uri"), "atUriAuthority"),
        transform(prop(ref("value"), "subject", "uri"), "atUriRkey"),
      ]);
      assert.equal(hasRemote, false);
    });

    it("parses the pckt cross-record template", () => {
      const { expressions, hasRemote } = parse(
        "{value.document.uri->site->url}{value.document.uri->path}",
      );
      assert.deepEqual(expressions, [
        remote(remote(prop(ref("value"), "document", "uri"), "site"), "url"),
        remote(prop(ref("value"), "document", "uri"), "path"),
      ]);
      assert.equal(hasRemote, true);
    });
  });

  describe("errors", () => {
    it("throws on an unclosed expression", () => {
      assert.throws(() => parse("{value"), /Unclosed expression/);
    });

    it("throws on an empty expression", () => {
      assert.throws(() => parse("{}"), /Expected identifier/);
    });

    it("throws on a whitespace-only expression", () => {
      assert.throws(() => parse("{   }"), /Expected identifier/);
    });

    it("throws on a trailing dot in a property path", () => {
      assert.throws(() => parse("{a.}"), /Expected identifier/);
    });

    it("throws on a remote access with no path", () => {
      assert.throws(() => parse("{a->}"), /Expected identifier/);
    });

    it("throws on an unexpected character", () => {
      assert.throws(() => parse("{a!b}"), /Unexpected character '!'/);
    });

    it("rejects underscores and hyphens in identifiers", () => {
      assert.throws(() => parse("{a_b}"), /Unexpected character '_'/);
      assert.throws(() => parse("{a-b}"), /Unexpected character/);
    });
  });
});
