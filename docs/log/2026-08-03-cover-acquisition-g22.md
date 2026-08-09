# Cover acquisition — G22

Three commands each rebuilt the same four steps around `cacheCover`
([#26](https://github.com/mephistopheles4/stacks/issues/26)). The issue proposed
a new `acquireCover` module; what shipped is smaller, because reading the three
copies did not support the premise.

**They had not drifted.** `add-book.ts` and `enrich.ts` held byte-identical
candidate expressions, and the importer's differs because it does something
different — it runs a `lookup` to find a print cover and prepends it. Two
orderings, not three, and the third is not a copy. What *had* diverged was the
write path, and the cause is not cover logic: `writeBook` takes a `BookInput` in
the domain vocabulary (`coverSource`), `updateBook` takes `FrontmatterChanges` in
the file vocabulary (`cover_source`), and `enrich` is the only caller that has to
cross that boundary. That is what produced the third assembly.

So: `cacheCover` now takes `readonly (string | undefined)[]` and does its own
filtering, which deletes the duplicated guard at all three sites; `coverUrls()`
in `metadata/types.ts` states *large before small* once; and
`covers/cover-keys.ts` shapes a `CachedCover` into its three keys for the two
callers that build a `BookInput`. **`enrich` stays hand-written**, deliberately —
its "never overwrite a hand-set spine colour" guard and its `filled` reporting
are its own, and a shaper flexible enough to serve them would assert less than
one that only serves creation. Two of three is the honest outcome.

`--dry-run` keeps its own "was a URL on offer" check for the same reason: that is
the difference between reporting a cover it *would* have fetched and one it never
could, and it is the command's reporting concern, not the downloader's.

G22 is structural because the failure it guards is silent — see
[`gates.md`](../gates.md). `pnpm test` went 308 → 323: two new spec files, no
existing one changed.

**Still open**

- **One helper, six copies, three names.** `add-book`, `import/audible`,
  `metadata/google-books` and `metadata/open-library` call it `maybe`;
  `frontmatter` calls it `optional`; `library` calls it `pick`. Identical
  bodies. A bigger and more G10-shaped duplication than the one above — and
  grepping for `maybe` finds four of the six, which is how it stayed six.

  It is **not** dead weight written for `exactOptionalPropertyTypes`, which is
  not enabled: omitting a key and setting it to `undefined` differ for
  `Object.keys`, `in`, and spreading, and `frontmatter.ts` documents that as the
  reason. So this is a consolidation, not a deletion, and it carries an
  exception that has to be stated rather than discovered: `undefined` in a
  `FrontmatterChanges` *removes* the key, so near `updateBook` the distinction
  is load-bearing in the opposite direction.

  Filed as [#29](https://github.com/mephistopheles4/stacks/issues/29). Not among
  the six candidates of the architecture review that produced #26 — and the
  three names are why: any search anchored on one of them finds a subset and
  reads as too small to be worth a candidate. Which is also how it reached six.
