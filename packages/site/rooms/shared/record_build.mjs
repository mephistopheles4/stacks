// #593 S4.11: refresh a room's build record from the disk.
//
//   node packages/site/rooms/shared/record_build.mjs <room>
//
// `packages/site/rooms/<room>/build.json` is written by hand for what a person decides (the bake
// and encode commands, the tool versions, the note) and by this script for what a machine can
// read: the SHA-256 of every bake input in `artifacts/rooms/<room>/` and of every served file in
// `packages/site/public/rooms/<room>/`. Run it after a rebake or an encode and commit the result;
// gates/room-build-record.test.ts holds the two to each other.
//
// It refuses an input whose bytes differ from inputs.json, so a record is never written over a
// bake that fetch_inputs.py would have refused.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const room = process.argv[2];
if (!room || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(room)) {
  throw new Error('usage: node record_build.mjs <room>');
}
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const repo = path.resolve(site, '..', '..');
const recordPath = path.join(site, 'rooms', room, 'build.json');
const inputsPath = path.join(site, 'rooms', room, 'inputs.json');
const served = path.join(site, 'public', 'rooms', room);
const inputsRoot = path.join(repo, 'artifacts', 'rooms', room);

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

function walk(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const entries = JSON.parse(fs.readFileSync(inputsPath, 'utf8')).inputs;

const inputs = {};
for (const e of entries) {
  const file = path.join(inputsRoot, ...e.dest.split('/'));
  if (!fs.existsSync(file))
    throw new Error(`input missing: ${e.dest} (run fetch_inputs.py ${room})`);
  const have = sha256(file);
  if (have !== e.sha256) throw new Error(`input ${e.dest} does not match inputs.json`);
  inputs[e.dest] = have;
}

const files = {};
for (const rel of walk(served)) files[rel] = sha256(path.join(served, ...rel.split('/')));

record.inputs = sorted(inputs);
record.files = sorted(files);
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  `[room] ${room}: recorded ${entries.length} inputs and ${Object.keys(files).length} served files`,
);
