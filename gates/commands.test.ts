/**
 * G14 — the documented commands are the commands that exist.
 *
 * CLAUDE.md's Commands block — the file was called that until #166 — listed
 * five scripts and none of the CLI's six subcommands, having been written when
 * both were true and never revisited.
 * `enrich`, `order`, `build --watch` and `dev:watch` all shipped without
 * reaching it, so the first thing a cold session read about how to run this
 * project was wrong about half of it.
 *
 * Both directions, because the two failures are different: an undocumented
 * command is invisible, and a documented one that no longer exists sends
 * whoever trusted the file chasing something that was deleted.
 *
 * See docs/gates.md, row G14 (commands).
 */

import { describe, expect, it } from 'vitest';
import { AGENTS_DOC, extractAll, expectFound, markdownSection, readRepoFile } from './repo.ts';

/**
 * `.command('add')` in the CLI's commander setup — **in either quote form**.
 *
 * It read one quote character until #252, which made this gate an accidental
 * quote checker with an unreachable remedy: `.command("add")` extracted nothing
 * and the red said the extraction found 0 CLI subcommands, naming neither the
 * quote nor the line. Widened rather than flipped, and both forms are planted
 * below — the seven live calls are single-quoted, so a flip would be as green
 * here as a widen and blind to all of them.
 */
const CLI_COMMAND = /\.command\(\s*['"]([a-z][a-z-]*)['"]/;

// package.json is read with JSON.parse rather than a regex. The first attempt
// matched `^\s{4}"name":` and duly collected every devDependency, because they
// sit at the same indentation — a reminder that "extract with a pattern" is the
// right tool for prose and the wrong one for a file with a parser.

/**
 * Scripts that exist for another script to call, not for a person to run.
 *
 * `stacks` is the CLI entry point itself — documented as `pnpm stacks <cmd>`
 * rather than by name, because running it bare only prints help.
 */
const NOT_FOR_HUMANS = new Set<string>([]);

function documentedCommandsSection(): string {
  return markdownSection(readRepoFile(AGENTS_DOC), 'Commands', AGENTS_DOC);
}

function cliCommands(): string[] {
  return extractAll(readRepoFile('packages/cli/src/index.ts'), CLI_COMMAND);
}

function packageScripts(): string[] {
  const manifest = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> };
  return Object.keys(manifest.scripts ?? {})
    .filter((name) => !NOT_FOR_HUMANS.has(name))
    .sort();
}

describe('G14 — documented commands', () => {
  it('extracts a plausible number from each side', () => {
    // Three regexes, any of which could stop matching after a reformat and
    // turn every check below into a comparison against nothing.
    expectFound(cliCommands(), 'CLI subcommands', 4);
    expectFound(packageScripts(), 'package.json scripts', 6);
    expect(documentedCommandsSection().length).toBeGreaterThan(200);
  });

  it('extracts a subcommand written in either quote form', () => {
    // Planted, because the repair is otherwise invisible in a tree whose seven
    // live calls are all single-quoted. Until #252 the regex above hardcoded
    // one quote character, so a contributor who hand-wrote `.command("add")`
    // got "extraction found 0 CLI subcommands" — a message naming neither the
    // quote nor the line, and a remedy nobody could reach from it. #231
    // measured exactly that break under a whole-tree reformat, and #229 cites
    // this gate as the measured warrant for admitting style rules at all.
    //
    // **Both forms, not only the one that was blind.** A regex flipped from `'`
    // to `"` rather than widened satisfies a double-quote-only assertion and
    // goes blind to every call this gate actually reads — trading one silent
    // half for the other, with a green plant to show for it.
    expect(extractAll(`.command("add")`, CLI_COMMAND)).toEqual(['add']);
    expect(extractAll(`.command('add')`, CLI_COMMAND)).toEqual(['add']);
  });

  it('documents every CLI subcommand', () => {
    // Anchored to the start of a line, which is where the CLI block puts a
    // command name. A bare `\bname\b` search over the whole section was the
    // first attempt and it had a false negative immediately: adding a `covers`
    // command passed undocumented, because `status`'s description happens to
    // read "covers still missing". A gate that matches prose matches anything.
    const documented = documentedCommandsSection();
    const missing = cliCommands().filter(
      (name) => !new RegExp(`^${name}\\s{2,}\\S`, 'm').test(documented),
    );

    expect(
      missing,
      `registered by the CLI but absent from AGENTS.md's Commands block: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('documents every pnpm script', () => {
    const documented = documentedCommandsSection();
    const missing = packageScripts().filter(
      (name) => !documented.includes(`pnpm ${name}`) && !documented.includes(`pnpm run ${name}`),
    );

    expect(
      missing,
      `in package.json but absent from AGENTS.md's Commands block: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('documents nothing that no longer exists', () => {
    const real = new Set([...cliCommands(), ...packageScripts(), 'install', 'stacks']);
    const claimed = extractAll(documentedCommandsSection(), /^\s*pnpm ([a-z][a-z0-9:-]*)/m);

    const ghosts = claimed.filter((name) => !real.has(name));
    expect(
      ghosts,
      `documented in AGENTS.md but not a real script or command: ${ghosts.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the four gate commands documented, by name', () => {
    // CONTRIBUTING.md calls these four "the contract". Named individually so
    // that dropping one from the docs cannot be masked by the set comparisons
    // above, which only ever check what still exists against what is written.
    const documented = documentedCommandsSection();
    for (const command of ['pnpm test', 'pnpm build', 'pnpm gate:public', 'pnpm smoke:render']) {
      expect(documented, `${command} is the contract and must stay documented`).toContain(command);
    }
  });
});
