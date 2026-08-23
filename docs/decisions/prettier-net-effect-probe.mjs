// Is Prettier net-negative for G41, as #235 argues?
//
// Their case: one pass closes the emphasis hole AND opens the padding hole.
// True against the UNREPAIRED pattern. But `md-all` requires `gr-first` in the
// box — it is a measured edge, not an option — so the pattern under test is the
// repaired one.
//
// ⚠️ My earlier probe was unrepresentative and this fixes it: it used a table
// whose widest Gate cell WAS `**G41**`, so no padding was ever applied and the
// unrepaired pattern passed for the wrong reason. This table mixes G1 and G41
// so the narrow rows must be padded.
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PRETTIER =
  'C:/Users/mephi/WebstormProjects/stacks/.claude/worktrees/wayfinder-eagle-eye-skills-f10e8a/node_modules/prettier/bin/prettier.cjs';

const G41_MAIN = /^\| \*\*(G\d+)\*\* \| `([^`]+)`/gm;
const G41_REPAIRED = /^\|\s*\*\*(G\d+)\*\*\s*\|\s*`([^`]+)`/gm;
const found = (re, t) => [...t.matchAll(new RegExp(re.source, 'gm'))].map((m) => m[1]).join(',');

// Four rows. G1/G2 are narrow so they get padded; G41 is written __underscore__
// so it exercises the emphasis hole; the slug column varies in width too.
const table = [
  '| Gate | Slug | Rule |',
  '| --- | --- | --- |',
  '| **G1** | `adapter-boundary` | all vault access goes through the adapter |',
  '| **G2** | `public-build` | note bodies are private |',
  '| __G41__ | `gate-register` | the register and the scoreboard agree |',
  '| **G45** | `deploy-flags` | every flag is documented |',
  '',
].join('\n');

writeFileSync('net-sample.md', table);
const before = readFileSync('net-sample.md', 'utf8');
console.log('--- BEFORE ---\n' + before);
console.log(`  unrepaired sees: [${found(G41_MAIN, before)}]`);
console.log(`  repaired   sees: [${found(G41_REPAIRED, before)}]`);

execFileSync('node', [PRETTIER, '--write', 'net-sample.md'], { stdio: 'pipe' });
const after = readFileSync('net-sample.md', 'utf8');
console.log('\n--- AFTER prettier --write ---\n' + after);
console.log(`  unrepaired sees: [${found(G41_MAIN, after)}]`);
console.log(`  repaired   sees: [${found(G41_REPAIRED, after)}]`);

console.log('\n--- the question ---');
console.log('padding actually applied? ', /\| \*\*G1\*\* {2,}\|/.test(after));
console.log('emphasis normalised?      ', after.includes('**G41**') && !after.includes('__G41__'));
console.log('\nThe honest comparison is md-none+gr-first vs md-all+gr-first,');
console.log('because md-all requires gr-first. Both rows above use the repaired pattern.');
