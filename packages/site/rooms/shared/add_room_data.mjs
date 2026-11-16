// #593 S7.2, S7.3, S8: write a room's camera and live lights into its GLB as named empties.
//
//   node packages/site/rooms/shared/add_room_data.mjs <room>
//
// `packages/site/rooms/<room>/room-data.json` says where the camera opens, the box it stays in and
// the live lights; the page reads them off the GLB (`view_open`, `bounds_min`, `bounds_max`,
// `live_ambient`, `live_key`, `live_fill`, `live_lamp`), so no room position lives in code. This adds
// them to the JSON chunk of the packed GLB and leaves the binary chunk, and so every mesh, untouched:
// the room's look cannot change by it. Run by `build_room.py --pack` as its last step, and by hand
// after editing the data. Idempotent: an empty of the same name is replaced, never doubled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const room = process.argv[2];
if (!room || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(room)) {
  throw new Error('usage: node add_room_data.mjs <room>');
}
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(site, 'rooms', room, 'room-data.json'), 'utf8'));
const served = path.join(site, 'public', 'rooms', room);
const glbs = fs.readdirSync(served).filter((name) => name.endsWith('.glb'));
if (glbs.length !== 1) throw new Error(`expected one .glb in ${served}, found ${glbs.length}`);
const glbPath = path.join(served, glbs[0]);

const empties = [
  {
    name: 'view_open',
    translation: data.view_open.position,
    extras: {
      target: data.view_open.target,
      span: data.view_open.span,
      height: data.view_open.height,
      aspect: data.view_open.aspect,
    },
  },
  { name: 'bounds_min', translation: data.bounds_min },
  { name: 'bounds_max', translation: data.bounds_max },
  ...Object.entries(data.lights).map(([name, { position = [0, 0, 0], ...extras }]) => ({
    name,
    translation: position,
    extras,
  })),
];

const file = fs.readFileSync(glbPath);
if (file.readUInt32LE(0) !== 0x46546c67 || file.readUInt32LE(4) !== 2) {
  throw new Error(`${glbPath} is not a glTF 2 binary`);
}
const jsonLength = file.readUInt32LE(12);
if (file.readUInt32LE(16) !== 0x4e4f534a) throw new Error('the first chunk is not JSON');
const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
const rest = file.subarray(20 + jsonLength);

// An empty of one of these names, from an earlier run, goes; the others keep their index.
const ours = new Set(empties.map((e) => e.name));
const scene = json.scenes[json.scene ?? 0];
const dropped = new Set();
json.nodes.forEach((node, i) => {
  if (ours.has(node.name) && node.mesh === undefined && !node.children) dropped.add(i);
});
if (dropped.size > 0) {
  const renumber = new Map();
  const kept = [];
  json.nodes.forEach((node, i) => {
    if (dropped.has(i)) return;
    renumber.set(i, kept.length);
    kept.push(node);
  });
  json.nodes = kept;
  for (const node of json.nodes) {
    if (node.children) node.children = node.children.map((c) => renumber.get(c));
  }
  for (const s of json.scenes)
    s.nodes = s.nodes.filter((n) => !dropped.has(n)).map((n) => renumber.get(n));
}
for (const empty of empties) {
  scene.nodes.push(json.nodes.length);
  json.nodes.push(empty);
}

let body = Buffer.from(JSON.stringify(json), 'utf8');
body = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + body.length + rest.length, 8);
header.writeUInt32LE(body.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
fs.writeFileSync(glbPath, Buffer.concat([header, body, rest]));
console.log(`[room] ${room}: wrote ${empties.length} empties into ${path.basename(glbPath)}`);
