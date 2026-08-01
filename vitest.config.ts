import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `gates/` holds the repo-level gates: rules about the shape of the whole
    // tree (which files may import what, which documented keys must exist)
    // rather than about one package's behaviour. They live outside `packages/`
    // because they belong to no package — they read CLAUDE.md, .env.example and
    // the source tree itself. See docs/gates.md.
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts'],
    environment: 'node',
  },
});
