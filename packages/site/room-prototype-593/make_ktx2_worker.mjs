// PROTOTYPE #593: three's KTX2 transcoder worker, written out as a file of its own.
//
//   node packages/site/room-prototype-593/make_ktx2_worker.mjs
//
// KTX2Loader builds this same script in the page and starts it from a blob: URL, and a blob: worker
// takes the page's CSP. The transcoder's embind glue builds functions with `new Function`, which
// that policy refuses, so the room drew white. Served from its own same-origin URL, the worker takes
// its policy from its own response headers instead (`public/_headers` gives it a narrow one, with
// eval and nothing to reach), and the page keeps no eval at all.
//
// The body is KTX2Loader's own, joined the way its `init()` joins it, from the three installed here;
// regenerate it whenever three is bumped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const { KTX2Loader } = await import(
  new URL('../node_modules/three/examples/jsm/loaders/KTX2Loader.js', import.meta.url).href
);
const basis = path.join(site, 'node_modules/three/examples/jsm/libs/basis');
const out = path.join(site, 'public/room-prototype-593/basis');

const fn = KTX2Loader.BasisWorker.toString();
const body = [
  '/* three KTX2Loader worker, written by make_ktx2_worker.mjs */',
  '/* constants */',
  'let _EngineFormat = ' + JSON.stringify(KTX2Loader.EngineFormat),
  'let _EngineType = ' + JSON.stringify(KTX2Loader.EngineType),
  'let _TranscoderFormat = ' + JSON.stringify(KTX2Loader.TranscoderFormat),
  'let _BasisFormat = ' + JSON.stringify(KTX2Loader.BasisFormat),
  '/* basis_transcoder.js */',
  fs.readFileSync(path.join(basis, 'basis_transcoder.js'), 'utf8'),
  '/* worker */',
  fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
].join('\n');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ktx2-worker.js'), body);
fs.copyFileSync(path.join(basis, 'basis_transcoder.wasm'), path.join(out, 'basis_transcoder.wasm'));
fs.rmSync(path.join(out, 'basis_transcoder.js'), { force: true });
console.log(
  `[room] wrote ${path.relative(site, path.join(out, 'ktx2-worker.js'))}: ${body.length} bytes`,
);
