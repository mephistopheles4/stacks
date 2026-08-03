/**
 * The key, if there is a value for it — and nothing at all if there is not.
 *
 * Spread it into an object literal to add a key conditionally:
 *
 * ```ts
 * const book: BookInput = {
 *   title: metadata.title,
 *   ...keyIfPresent('author', metadata.author),
 * };
 * ```
 *
 * **Absent is not the same as `undefined`, and that is the entire point.**
 * `{ author: undefined }` has an `author`: `Object.keys` lists it, `in` reports
 * it, and a spread carries it onward. So writing the key unconditionally puts
 * `"author": null` into `library.json`, and — near `updateBook`, where
 * `undefined` is a *deletion instruction* against a note in the owner's vault —
 * does something considerably worse. See `CONTEXT.md`, **Removal**.
 *
 * It existed six times under three names (`maybe` ×4, `optional`, `pick`)
 * before it existed once. Grepping for any one of them found a subset, which
 * is how each author concluded there wasn't one already and wrote it again.
 * `gates/key-if-present.test.ts` (G23) now matches on what the body *returns*
 * rather than on what it is called, so the seventh copy cannot hide behind a
 * seventh name.
 *
 * The cast is not avoidable: a computed key of a generic type widens to an
 * index signature, so TypeScript infers `{ [x: string]: V }` for the literal
 * and cannot see that the key is `K`. The `Partial` in the return type is what
 * callers actually need — some subset of `K`, never a union with an
 * uninhabited arm.
 *
 * Nothing is imported here, deliberately. If the site ever needs this as a
 * value, this module can become a pure subpath beside `@stacks/core/shelf-order`
 * without anything else moving.
 */
export function keyIfPresent<K extends string, V>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
