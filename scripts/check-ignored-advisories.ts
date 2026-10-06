/**
 * The `ignoreGhsas` guard step in `gates.yml`'s `audit` job (G63).
 *
 * For each id in `auditConfig.ignoreGhsas`, reads the advisory from GitHub and
 * its packages' versions from npm, and exits 1 when a fix is published or when
 * any lookup cannot be trusted. Every decision is in `scripts/lib/ignore-ghsas.ts`;
 * this file is only the I/O around it, and is verified by planting, not by a
 * unit test — see docs/gate-register.md, G63.
 *
 * Run as `pnpm exec tsx scripts/check-ignored-advisories.ts`. `GITHUB_TOKEN`
 * lifts GitHub's advisory API from 60 requests an hour per runner IP; the
 * workflow passes `github.token` through `env:`. Optional when run locally.
 *
 * ⚠️ **Never `pnpm audit --ignore-unfixable` here.** It treats an advisory as
 * fixable because its range is open-ended, ignored nothing on 2026-10-06, and
 * wrote `auditConfig: {}` into `pnpm-workspace.yaml`.
 */

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  judgeFixPublished,
  npmEntriesOf,
  npmRange,
  readIgnoreEntries,
  type FixLookup,
} from './lib/ignore-ghsas.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const WORKSPACE = join(REPO_ROOT, 'pnpm-workspace.yaml');

/**
 * `npm view <spec> <field> --json`, as a list of strings.
 *
 * npm prints a bare string for one match, an array for several, and **nothing
 * with exit 0 for none** — the shape a wrong package name or a broken registry
 * read also has, which is why the judgement fails closed on an empty list.
 *
 * On Windows `npm` is a `.cmd` shim and needs a shell, under which a range such
 * as `<= 3.0.3` is a redirection and a word split; the spec is quoted there so
 * the invocation means the same thing it means in CI, which uses none. The line
 * is one string, as `shellCommand` requires (ADR-0030). `spec` came from outside,
 * so `npmEntriesOf` has already checked the name and range against strict
 * patterns: nothing in it can reach the shell as anything but a comparator.
 */
function npmView(spec: string, field: 'version' | 'versions'): string[] {
  // The sink re-checks what its callers were meant to guarantee: nothing outside
  // these characters can be a comparator, and none of them is special inside quotes.
  if (!/^[A-Za-z0-9@/._~<>=|^*+ -]+$/.test(spec) || spec.startsWith('-')) {
    throw new Error(`refusing to run npm view on an unexpected spec: ${JSON.stringify(spec)}`);
  }
  const options: { encoding: 'utf8'; stdio: ['ignore', 'pipe', 'pipe'] } = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const out = (
    process.platform === 'win32'
      ? execSync(shellCommand('npm', ['view', `"${spec}"`, field, '--json']), options)
      : execFileSync('npm', ['view', spec, field, '--json'], options)
  ).trim();
  if (out === '') return [];
  const parsed: unknown = JSON.parse(out);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.every((item): item is string => typeof item === 'string')) {
    throw new Error(`npm view ${spec} ${field} returned something other than version strings`);
  }
  return list;
}

async function fetchAdvisory(id: string): Promise<unknown> {
  const token = process.env['GITHUB_TOKEN'];
  const response = await fetch(`https://api.github.com/advisories/${id}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token === undefined || token === '' ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for advisory ${id}`);
  return response.json();
}

async function main(): Promise<number> {
  const { entries, problems } = readIgnoreEntries(readFileSync(WORKSPACE, 'utf8'));
  const failures = [...problems];

  for (const entry of entries) {
    try {
      const advisory = await fetchAdvisory(entry.id);
      const lookups: FixLookup[] = npmEntriesOf(advisory).map(({ name, range }) => ({
        name,
        range,
        all: npmView(name, 'versions'),
        affected: npmView(`${name}@${npmRange(range)}`, 'version'),
      }));
      const found = judgeFixPublished(entry.id, lookups);
      failures.push(...found);
      if (found.length === 0) {
        const summary = lookups
          .map(
            (l) => `${l.name} ${l.range}: ${l.affected.length} affected versions read, none fixed`,
          )
          .join('; ');
        console.log(`ok   ${entry.id}  ${summary}`);
      }
    } catch (error) {
      failures.push(
        `${entry.id}: lookup failed — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (entries.length === 0 && failures.length === 0) console.log('ok   no ignoreGhsas entries');
  for (const failure of failures) console.error(`FAIL ${failure}`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main();
