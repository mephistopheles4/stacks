/**
 * Test-code complexity, measured for wayfinder ticket #239.
 *
 * Kept on esearch/239-test-complexity, which never merges. It imports the
 * repo's own counter rather than a second implementation, so its numbers and
 * the four product series mean the same thing.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/repo-root.ts';
import { complexityOf, countsFrom, MCCABE_CUT, type PerFunction } from './lib/complexity.ts';

const SKIP = new Set(['node_modules', 'dist', 'artifacts', '.git', '.stryker-tmp']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, dir))) {
    if (SKIP.has(entry)) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.ts') && !rel.endsWith('.d.ts') && !rel.endsWith('measure-test-complexity.ts')) out.push(rel);
  }
  return out;
}

const all = [...walk('packages'), ...walk('scripts'), ...walk('gates')];
const tests = all.filter((f) => f.endsWith('.test.ts'));
const source = all.filter((f) => !f.endsWith('.test.ts'));

const { scopes } = JSON.parse(readFileSync(join(REPO_ROOT, 'stryker.scopes.json'), 'utf8')) as {
  scopes: { name: string; glob: string }[];
};

function globRe(glob: string): RegExp {
  const src = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:[^/]+/)*')
    .replace(/(?<!\))\*/g, '[^/]*');
  return new RegExp(`^${src}$`);
}

function report(name: string, files: string[], fns: PerFunction[]): void {
  const c = countsFrom(fns);
  if (c === null) {
    console.log(`${name.padEnd(34)} files=${files.length}  EMPTY`);
    return;
  }
  const over = fns.filter((f) => f.complexity > MCCABE_CUT).length;
  const mean = (c.mass / c.functions).toFixed(2);
  console.log(
    `${name.padEnd(34)} files=${String(files.length).padStart(3)} fns=${String(c.functions).padStart(5)} mass=${String(c.mass).padStart(6)} mean=${mean.padStart(5)} max=${String(c.max).padStart(3)} over10=${String(over).padStart(3)} massOver10=${String(c.massOver10).padStart(5)}`,
  );
}

const cache = new Map<string, PerFunction[]>();
async function fnsFor(files: string[]): Promise<PerFunction[]> {
  const key = files.join('|');
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const got = await complexityOf(files);
  cache.set(key, got);
  return got;
}

console.log('=== whole-tree split ===');
report('ALL source (non-test)', source, await fnsFor(source));
report('ALL *.test.ts', tests, await fnsFor(tests));

console.log('\n=== the three test roots ===');
for (const root of ['gates', 'packages', 'scripts']) {
  const f = tests.filter((t) => t.startsWith(`${root}/`));
  report(`${root}/**/*.test.ts`, f, await fnsFor(f));
}

console.log('\n=== gates/ non-test helpers (what a scopes[] entry would actually measure) ===');
const helpers = source.filter((f) => f.startsWith('gates/'));
report('gates/**/*.ts minus tests', helpers, await fnsFor(helpers));

console.log('\n=== per declared scope: product vs its test twin ===');
for (const scope of scopes) {
  const re = globRe(scope.glob);
  const prod = source.filter((f) => re.test(f));
  const twin = tests.filter((f) => re.test(f.replace(/\.test\.ts$/, '.ts')));
  report(`${scope.name}`, prod, await fnsFor(prod));
  report(`  ^ tests`, twin, await fnsFor(twin));
}

console.log('\n=== worst test functions, top 15 ===');
const testFns = await fnsFor(tests);
for (const f of [...testFns].sort((a, b) => b.complexity - a.complexity).slice(0, 15)) {
  console.log(`  ${String(f.complexity).padStart(3)}  ${f.file}:${f.line}  ${f.label}`);
}

console.log('\n=== distribution ===');
const buckets = [1, 2, 3, 5, 11, 21];
for (const [i, lo] of buckets.entries()) {
  const hi = buckets[i + 1] ?? Infinity;
  const t = testFns.filter((f) => f.complexity >= lo && f.complexity < hi).length;
  const s = (await fnsFor(source)).filter((f) => f.complexity >= lo && f.complexity < hi).length;
  console.log(
    `  cc ${lo}${hi === Infinity ? '+' : `-${hi - 1}`}`.padEnd(12) +
      ` test=${String(t).padStart(5)} (${((t / testFns.length) * 100).toFixed(1)}%)  source=${String(s).padStart(5)} (${((s / (await fnsFor(source)).length) * 100).toFixed(1)}%)`,
  );
}
