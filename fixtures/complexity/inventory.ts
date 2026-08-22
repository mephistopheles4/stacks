/**
 * The total-inventory fixture: every construct ESLint's `complexity` rule
 * counts, and every function-shaped node the roll-up must see as a function,
 * each at least once.
 *
 * **This file is read by a counter and executed by nothing.** Its expected
 * per-function totals live in `scripts/lib/complexity.ts` as `INVENTORY`, and
 * `scripts/lib/complexity.test.ts` holds the two to each other. That is what
 * makes an ESLint upgrade which changes the count **red** instead of a quiet
 * movement of every series at once.
 *
 * ⚠️ **It lives under `fixtures/` and not beside its spec, and the placement is
 * load-bearing.** A `.ts` file under `scripts/` is matched by `scripts/**\/*.ts`,
 * which is both a declared Stryker scope and a complexity population — so the
 * fixture would be counted into the very `scripts` series it exists to pin, and
 * every edit to it would move that series. `fixtures/` is in none of
 * `scope-check.ts`'s `SOURCE_ROOTS` and in no scope glob, so nothing counts
 * this file and Stryker never mutates it.
 *
 * **It is typechecked, though** — `fixtures/complexity/` is named in
 * `tsconfig.json`'s `include`, because *TypeScript strict everywhere* has no
 * fixture exemption. Being outside the measured populations says what does not
 * measure this file, not that it may rot. `pnpm typecheck` covers it and
 * counts it not at all.
 *
 * ⚠️ **Total, not sampled** — an un-sampled construct is exactly the silent
 * change this fixture exists to catch. Adding a construct to the rule means
 * adding it here. Every function below carries its arithmetic in a comment;
 * the comment is the derivation and `INVENTORY` is the assertion.
 */

// ── Branch constructs ───────────────────────────────────────────────────────

/** `if`, `?:`, `&&`, `||`, `??`. 1 + 5 = 6. */
export function declaration(a: number, b: number): number {
  if (a > 0) return 1; // +1  if
  const t = a > b ? 1 : 2; // +1  ?:
  const u = a && b; // +1  &&
  const v = a || b; // +1  ||
  const w = a ?? b; // +1  ??
  return t + u + v + w;
}

/** Every loop kind: `for`, `for-in`, `for-of`, `while`, `do-while`. 1 + 5 = 6. */
export function loops(items: number[], record: Record<string, number>): number {
  let total = 0;
  for (let i = 0; i < items.length; i += 1) total += 1; // +1  for
  for (const key in record) total += key.length; // +1  for-in
  for (const item of items) total += item; // +1  for-of
  while (total < 10) total += 1; // +1  while
  do total += 1;
  while (total < 20); // +1  do-while
  return total;
}

/**
 * `case` and `catch`. 1 + 3 = 4.
 *
 * **Two cases, not three.** Under `variant: 'classic'` each `case` carrying a
 * test is a branch and the `switch` itself is not; `default` has no test and
 * counts nothing. Under `modified` the whole statement would count once
 * regardless — which is the clause the variant pin exists to hold still.
 */
export function switchAndCatch(kind: string): number {
  switch (kind) {
    case 'a':
      return 1; // +1  case
    case 'b':
      return 2; // +1  case
    default:
      break; // +0  no test
  }
  try {
    return 3;
  } catch {
    return 4; // +1  catch
  }
}

/** The three logical assignment forms. 1 + 3 = 4. */
export function logicalAssignment(seed: number): number {
  let value: number | null = seed;
  value &&= 2; // +1  &&=
  value ||= 3; // +1  ||=
  value ??= 4; // +1  ??=
  return value;
}

/**
 * Optional chaining. 1 + 3 = 4.
 *
 * **Every link, not every chain** — `?.a`, `?.b` and `?.()` are three branches
 * in one expression. This is the clause the prototype's hand-rolled walk did
 * not have, and the one that moved `parseNote` from 11 to 12.
 */
export function optionalChain(input?: { a?: { b?: () => number } }): number | undefined {
  return input?.a?.b?.(); // +3  three links
}

/**
 * Defaults, in a parameter and in a destructuring pattern. 1 + 2 = 3.
 *
 * A default is an implicit branch (ESLint PR #18152, in v9.0.0). Both shapes
 * are `AssignmentPattern` to the rule, which is why one of each is here.
 */
export function defaults(first = 1, { second = 2 }: { second?: number }): number {
  return first + second; // +1 parameter default, +1 destructuring default
}

/** Above McCabe's cut, so the roll-up's `mass-over-10` has something to hold. 1 + 12 = 13. */
export function overTheCut(n: number): number {
  let total = 0;
  if (n === 1) total += 1;
  if (n === 2) total += 1;
  if (n === 3) total += 1;
  if (n === 4) total += 1;
  if (n === 5) total += 1;
  if (n === 6) total += 1;
  if (n === 7) total += 1;
  if (n === 8) total += 1;
  if (n === 9) total += 1;
  if (n === 10) total += 1;
  if (n === 11) total += 1;
  if (n === 12) total += 1;
  return total;
}

// ── Function-shaped nodes ───────────────────────────────────────────────────

/** A function expression. 1 + 1 = 2. */
export const expression = function namedExpression(flag: boolean): number {
  return flag ? 1 : 2; // +1
};

/** An arrow function. 1 + 1 = 2. */
export const arrow = (flag: boolean): number => (flag ? 1 : 2); // +1

/**
 * The decorated labels, which are why the kind lookup matches substrings.
 *
 * ESLint prepends modifiers to a function's rendered name — `Async function`,
 * `Generator function`, `Async arrow function`, `Static method`. A prefix match
 * would drop all four into `unknown`, and `arrow function` has to be tested
 * before `function` because an async arrow contains both. Nothing here is about
 * counting; these exist so that lookup is exercised rather than asserted.
 */
export async function asyncDeclaration(flag: boolean): Promise<number> {
  return flag ? 1 : 2; // +1
}

export function* generatorDeclaration(flag: boolean): Generator<number> {
  yield flag ? 1 : 2; // +1
}

export const asyncArrow = async (flag: boolean): Promise<number> => (flag ? 1 : 2); // +1

/**
 * Nesting: a nested function's branches never count toward its parent.
 *
 * Two functions, 2 each — never one function of 3.
 */
export function outer(flag: boolean): number {
  const inner = (x: boolean): number => (x ? 1 : 2); // +1, its own scope
  return flag ? inner(flag) : 0; // +1
}

/** A method, a constructor, an accessor pair, a field initialiser and a static block. */
export class Inventory {
  /** A class field initialiser — an implicit function to ESLint. 1 + 1 = 2. */
  readonly seed: number = Number.isFinite(1) ? 1 : 2; // +1

  static registered: boolean; // no initialiser, so no implicit function

  /** A class static block — an implicit function to ESLint. 1 + 0 = 1. */
  static {
    Inventory.registered = true;
  }

  #count: number;

  /** A constructor. 1 + 1 = 2. */
  constructor(count: number) {
    this.#count = count > 0 ? count : 0; // +1
  }

  /** A method. 1 + 2 = 3. */
  method(flag: boolean): number {
    return flag && this.#count ? 1 : 0; // +1 &&, +1 ?:
  }

  /** A static method — `Static method 'x'`, another decorated label. 1 + 1 = 2. */
  static make(count: number): Inventory {
    return new Inventory(count > 0 ? count : 0); // +1
  }

  /** A getter. 1 + 1 = 2. */
  get value(): number {
    return this.#count > 0 ? this.#count : 0; // +1
  }

  /** A setter. 1 + 1 = 2. */
  set value(next: number) {
    this.#count = next ?? 0; // +1 ??
  }
}
