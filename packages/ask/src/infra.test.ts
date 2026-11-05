import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The repo-side half of C16 (docs/spec/ask-the-library.md): `infra/` holds no
 * email address and pins its tools exactly. What Cloudflare holds after an apply
 * is read back by the owner at S13 step 8.
 */
const DIR = 'infra';
// The committed files by name. Listing the folder would read local state, plan and
// variable files after an apply, and a failure message quotes what it read.
const tracked = ['main.tf', '.terraform.lock.hcl', 'README.md'];
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');

describe('infra/ (C16, repo side)', () => {
  it('holds the Terraform, its lock file and its README', () => {
    expect(readdirSync(DIR)).toEqual(expect.arrayContaining(tracked));
  });

  it.each(tracked)('%s holds no email address', (name) => {
    expect(read(name)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  });

  it('pins Terraform and the provider to one exact version each', () => {
    const main = read('main.tf');
    expect(main).toMatch(/required_version\s*=\s*"=\s*\d+\.\d+\.\d+"/);
    expect(main).toMatch(/^\s*version\s*=\s*"=\s*\d+\.\d+\.\d+"/m);
  });

  it('takes the alert recipient from a sensitive variable with no default', () => {
    const main = read('main.tf');
    const block =
      /variable\s+"[a-z_]*(?:email|recipient)[a-z_]*"\s*\{[^}]*\}/i.exec(main)?.[0] ?? '';
    expect(block).toContain('sensitive');
    expect(block).not.toMatch(/^\s*default\s*=/m);
  });
});
