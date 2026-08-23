// Does MD060 hold G41's and G31's input stable, and does it fight Prettier?
//
// Two inputs: docs/gates.md as `main` has it (one space at the pipe) and as
// research/236-maximal has it (Prettier's aligned padding). Four styles.
//
// A crash must not read as a pass. The previous run of this probe reported six
// zeros that were an ERR_MODULE_NOT_FOUND, so this asserts the rule actually
// ran by first proving it CAN fail.
import { lint } from 'markdownlint/promise';
import { readFileSync } from 'node:fs';

const FILES = { 'compact (main)': 'compact.md', 'aligned (prettier)': 'aligned.md' };
const STYLES = ['any', 'compact', 'aligned', 'tight'];

async function run(file, style) {
  const res = await lint({
    files: [file],
    config: { default: false, MD060: { style } },
  });
  return (res[file] ?? []).filter((e) => e.ruleNames.includes('MD060')).length;
}

const rows = [];
for (const style of STYLES) {
  for (const [label, file] of Object.entries(FILES)) {
    rows.push({ style, input: label, violations: await run(file, style) });
  }
}
console.table(rows);

// Sanity: the rule must be capable of firing at all, or every zero above is
// meaningless. `tight` accepts neither input, so it must report violations.
const canFail = rows.some((r) => r.violations > 0);
console.log(canFail ? 'OK — the rule fires, so the zeros above are real' : 'INVALID — rule never fired');

// And confirm the two inputs really differ, so we are not comparing a file to itself.
const a = readFileSync('compact.md', 'utf8');
const b = readFileSync('aligned.md', 'utf8');
console.log(a === b ? 'INVALID — the two inputs are identical' : 'OK — the two inputs differ');
