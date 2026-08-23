// Two questions #235's MD050 finding raises for THIS ticket.
//
// 1. Does the `gr-first` repair on research/236-maximal survive `__G41__`?
//    It loosened whitespace. It did not touch the hardcoded `\*\*`.
// 2. Does Prettier NORMALISE `__G41__` to `**G41**`? If it does, formatting
//    Markdown *protects* the gate from this defect, which cuts against the
//    recommendation rather than for it.
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROW = (m) => `| ${m}G41${m} | \`gate-register\` | the register and the scoreboard agree | yes |`;

// Exactly as they appear in the repo, before and after the repair.
const G41_MAIN = /^\| \*\*(G\d+)\*\* \| `([^`]+)`/gm;
const G41_REPAIRED = /^\|\s*\*\*(G\d+)\*\*\s*\|\s*`([^`]+)`/gm;

const hits = (re, text) => [...text.matchAll(new RegExp(re.source, 'gm'))].length;

console.log('--- 1. does either pattern see a __strong__ row? ---');
for (const [label, marker] of [['**asterisk**', '**'], ['__underscore__', '__']]) {
  const row = ROW(marker);
  console.log(
    `  ${label.padEnd(16)} main=${hits(G41_MAIN, row)}  repaired=${hits(G41_REPAIRED, row)}`,
  );
}

console.log('\n--- 2. what does Prettier do to each marker? ---');
const sample = [
  '| Gate | Slug | Rule | Armed |',
  '| --- | --- | --- | --- |',
  ROW('**'),
  ROW('__'),
  '',
  'Prose with *emphasis* and _emphasis_ and **strong** and __strong__.',
  '',
].join('\n');
writeFileSync('strong-sample.md', sample);
const PRETTIER =
  'C:/Users/mephi/WebstormProjects/stacks/.claude/worktrees/wayfinder-eagle-eye-skills-f10e8a/node_modules/prettier/bin/prettier.cjs';
execFileSync('node', [PRETTIER, '--write', 'strong-sample.md'], { stdio: 'inherit' });
const out = readFileSync('strong-sample.md', 'utf8');
console.log(out);

console.log('--- 3. do the patterns see the FORMATTED rows? ---');
console.log(`  main=${hits(G41_MAIN, out)}  repaired=${hits(G41_REPAIRED, out)}   (2 = both rows visible)`);
