import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The repo-side half of C16 (docs/spec/ask-the-library.md): `infra/` holds no
 * email address and pins its tools exactly. What Cloudflare holds after an apply
 * is read back by the owner at S13 step 8.
 */
const DIR = 'infra';
// The committed files, from git: a new tracked file holding an address is read too, and local
// state, plan and variable files after an apply are not, because they are not tracked (a failure
// message quotes what it read).
const tracked = execFileSync('git', ['ls-files', '--', DIR], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((path) => path !== '')
  .map((path) => path.slice(DIR.length + 1));
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');

describe('infra/ (C16, repo side)', () => {
  it('holds the Terraform, its lock file and its README', () => {
    expect(tracked).toEqual(
      expect.arrayContaining(['main.tf', '.terraform.lock.hcl', 'README.md']),
    );
    expect(readdirSync(DIR)).toEqual(expect.arrayContaining(tracked));
  });

  it.each(tracked)('%s holds no email address', (name) => {
    expect(read(name)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  });

  it('pins Terraform and the provider to one exact version each', () => {
    const main = read('main.tf');
    expect(main).toMatch(/required_version\s*=\s*"=\s*\d+\.\d+\.\d+"/);
    // Every provider `source =` has its own exact `version =`, so a second, unpinned provider fails
    // too, on one line or on several (integrity F12).
    const sources = main.match(/(?<![\w-])source\s*=/g) ?? [];
    const versions = main.match(/(?<![\w-])version\s*=\s*[^,}\n]*/g) ?? [];
    expect(sources.length).toBeGreaterThan(0);
    expect(versions).toHaveLength(sources.length);
    for (const v of versions) expect(v).toMatch(/version\s*=\s*"=\s*\d+\.\d+\.\d+"/);
  });

  it('takes the alert recipient from a sensitive variable with no default', () => {
    const main = read('main.tf');
    const block =
      /variable\s+"[a-z_]*(?:email|recipient)[a-z_]*"\s*\{[^}]*\}/i.exec(main)?.[0] ?? '';
    expect(block).toContain('sensitive');
    expect(block).not.toMatch(/^\s*default\s*=/m);
  });
});
