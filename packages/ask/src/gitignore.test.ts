import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * C17 of docs/spec/ask-the-library.md: every path the Worker's tooling can write
 * is ignored before it can exist on a build branch. `git check-ignore` reads the
 * real `.gitignore`, so a pattern that never matches fails here.
 */
const PATHS = [
  'infra/terraform.tfstate',
  'infra/terraform.tfstate.backup',
  'infra/.terraform/providers/x',
  'infra/prod.tfvars',
  'infra/prod.auto.tfvars',
  'infra/out.tfplan',
  'packages/ask/.dev.vars',
  'packages/ask/.dev.vars.local',
  'packages/ask/.wrangler/state/x',
];

describe('C17: the Worker and Terraform leave no tracked secret', () => {
  it.each(PATHS)('%s is ignored', (path) => {
    // check-ignore exits 0 when ignored and 1 when not; execFileSync throws on 1.
    expect(() => execFileSync('git', ['check-ignore', '-q', '--', path])).not.toThrow();
  });

  it('a committed brand file is not swept in', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', '--', 'infra/main.tf'])).toThrow();
  });
});
