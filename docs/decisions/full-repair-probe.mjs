// #235's challenge to follow-up 5: is the 4-of-4 result the formatter's work,
// or my own half-finished repair measuring itself?
//
// Three patterns, not two. The third is the FULL repair this ticket already
// recommended in follow-up 3 — loose whitespace AND (?:\*\*|__) — which nothing
// has yet measured.
//
// If the full-repair row reads 4/4 both before and after, the formatter's
// contribution is zero and follow-up 5's reach argument was an artifact.
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PRETTIER =
  'C:/Users/mephi/WebstormProjects/stacks/.claude/worktrees/wayfinder-eagle-eye-skills-f10e8a/node_modules/prettier/bin/prettier.cjs';

const PATTERNS = {
  'main        (exact space, ** only)': /^\| \*\*(G\d+)\*\* \| `([^`]+)`/gm,
  'gr-first    (loose space, ** only)': /^\|\s*\*\*(G\d+)\*\*\s*\|\s*`([^`]+)`/gm,
  'full repair (loose space, **|__)': /^\|\s*(?:\*\*|__)(G\d+)(?:\*\*|__)\s*\|\s*`([^`]+)`/gm,
};

const seen = (re, t) => [...t.matchAll(new RegExp(re.source, 'gm'))].map((m) => m[1]);

const table = [
  '| Gate | Slug | Rule |',
  '| --- | --- | --- |',
  '| **G1** | `adapter-boundary` | all vault access goes through the adapter |',
  '| **G2** | `public-build` | note bodies are private |',
  '| __G41__ | `gate-register` | the register and the scoreboard agree |',
  '| **G45** | `deploy-flags` | every flag is documented |',
  '',
].join('\n');

writeFileSync('full-sample.md', table);
const before = readFileSync('full-sample.md', 'utf8');
execFileSync('node', [PRETTIER, '--write', 'full-sample.md'], { stdio: 'pipe' });
const after = readFileSync('full-sample.md', 'utf8');

// Guards: both effects must actually be present, or every row below is noise.
if (!/\| \*\*G1\*\* {2,}\|/.test(after)) throw new Error('padding did not happen');
if (!after.includes('**G41**') || after.includes('__G41__')) throw new Error('emphasis not normalised');

console.table(
  Object.entries(PATTERNS).map(([name, re]) => {
    const b = seen(re, before).length;
    const a = seen(re, after).length;
    return { pattern: name, before: `${b}/4`, after: `${a}/4`, 'formatter delta': a - b };
  }),
);
