// Does MD049 actually fight Prettier, or only at a non-default style?
//
// #235 says it adopts MD049 (emphasis-style) and that this makes #236's
// Markdown exclusion load-bearing. MD060 turned out to be permissive at its
// default, so check MD049 for the same shape before repeating the claim.
//
// Prettier rewrites *word* to _word_. If MD049's default is `consistent`, a
// fully Prettier-formatted file is consistently underscore and PASSES.
import { lint } from 'markdownlint/promise';
import { readFileSync } from 'node:fs';

const FILES = { 'main (hand-set)': 'compact.md', 'prettier-formatted': 'aligned.md' };
const STYLES = ['consistent', 'asterisk', 'underscore'];

const emphasisOf = (text) => ({
  asterisk: (text.match(/(^|[^*\w])\*[^*\s][^*]*\*(?![*\w])/g) ?? []).length,
  underscore: (text.match(/(^|[^_\w])_[^_\s][^_]*_(?![_\w])/g) ?? []).length,
});

console.log('emphasis markers actually present:');
for (const [label, file] of Object.entries(FILES)) {
  console.log(' ', label.padEnd(20), JSON.stringify(emphasisOf(readFileSync(file, 'utf8'))));
}

const rows = [];
for (const style of STYLES) {
  for (const [label, file] of Object.entries(FILES)) {
    const res = await lint({ files: [file], config: { default: false, MD049: { style } } });
    rows.push({
      style,
      input: label,
      MD049: (res[file] ?? []).filter((e) => e.ruleNames.includes('MD049')).length,
    });
  }
}
console.table(rows);

// The default, whatever it is, stated explicitly rather than assumed.
for (const [label, file] of Object.entries(FILES)) {
  const res = await lint({ files: [file], config: { default: false, MD049: true } });
  const n = (res[file] ?? []).filter((e) => e.ruleNames.includes('MD049')).length;
  console.log(`MD049 at its DEFAULT config, ${label}: ${n}`);
}

console.log(rows.some((r) => r.MD049 > 0) ? 'OK — the rule fires' : 'INVALID — rule never fired');
