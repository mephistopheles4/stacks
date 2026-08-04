/**
 * Where the repo starts, derived once.
 *
 * Eight scripts worked this out for themselves and four of them disagreed about
 * how: `join` in five places, `resolve` in one, and two that skipped the root
 * entirely and built a destination straight out of `import.meta.url`. Which
 * variant a script got was an accident of the month it was written in.
 *
 * `resolve` rather than `join`, which is the minority spelling and the correct
 * one: `join(dir, '..')` hands back a path with a literal `..` still in it, so
 * it prints as `…\scripts\..` in an error message and compares unequal to the
 * same directory named any other way. `resolve` normalises. Nothing depended on
 * the un-normalised form; it was just never noticed.
 *
 * `import.meta.dirname` rather than `dirname(fileURLToPath(import.meta.url))`,
 * which is the same value with two fewer imports. It needs Node 20.11 and this
 * package already requires 22.
 *
 * Two levels up, not one: this file lives in `scripts/lib/`.
 *
 * G24 keeps it the only derivation — no script outside this directory may work
 * the root out again.
 */

import { resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
