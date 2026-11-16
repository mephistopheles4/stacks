// three's KTX2 transcoder worker, written out as a file of its own (#601, spec S6.5).
//
//   node packages/site/rooms/basis/make_ktx2_worker.mjs
//
// Rerun it on every three upgrade, and commit what it writes: the bytes under
// `public/rooms/basis/` are the bytes the page serves and the bytes that were tested.
//
// Why a file. three's `KTX2Loader` builds this same script in the page and starts it from a
// `blob:` URL, and a `blob:` worker inherits the page's Content-Security-Policy. The transcoder's
// embind glue builds functions with `new Function`, which that policy refuses, so the room draws
// white. Loaded from its own same-origin URL a dedicated worker takes the policy of its own
// response instead: `public/_headers` gives that one path `default-src 'none'; script-src
// 'unsafe-eval' 'wasm-unsafe-eval'`, so eval lives in a worker that can reach nothing, and the page
// never gains `'unsafe-eval'`.
//
// The body is KTX2Loader's own, joined the way its `init()` joins it. The page fetches the wasm and
// posts the bytes in (`room-ktx2.ts`), because the worker may fetch nothing.
//
// Provenance. `basis_transcoder.js` and `basis_transcoder.wasm` are the Basis Universal transcoder
// (Binomial LLC, Apache-2.0) as three ships it under `examples/jsm/libs/basis/`; the worker body
// is three's (MIT). Both licences allow redistribution, and `public/rooms/basis/ktx2-worker.js`
// opens with a line naming the three release it came from.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const out = path.join(site, 'public/rooms/basis');

// The site package's own three, so the three that is built is the three that is read.
const threeDir = path.join(site, 'node_modules/three');
const version = JSON.parse(readFileSync(path.join(threeDir, 'package.json'), 'utf8')).version;
const jsm = path.join(threeDir, 'examples/jsm');
const { KTX2Loader } = await import(pathToFileURL(path.join(jsm, 'loaders/KTX2Loader.js')).href);
const basis = path.join(jsm, 'libs/basis');

const fn = KTX2Loader.BasisWorker.toString();
const body = [
  `/* three ${version} KTX2Loader worker, written by packages/site/rooms/basis/make_ktx2_worker.mjs */`,
  '/* constants */',
  'let _EngineFormat = ' + JSON.stringify(KTX2Loader.EngineFormat),
  'let _EngineType = ' + JSON.stringify(KTX2Loader.EngineType),
  'let _TranscoderFormat = ' + JSON.stringify(KTX2Loader.TranscoderFormat),
  'let _BasisFormat = ' + JSON.stringify(KTX2Loader.BasisFormat),
  '/* basis_transcoder.js */',
  readFileSync(path.join(basis, 'basis_transcoder.js'), 'utf8'),
  '/* worker */',
  fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
].join('\n');

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'ktx2-worker.js'), body);
copyFileSync(path.join(basis, 'basis_transcoder.wasm'), path.join(out, 'basis_transcoder.wasm'));
rmSync(path.join(out, 'basis_transcoder.js'), { force: true });
console.log(
  `[room] three ${version}: wrote ${path.relative(site, path.join(out, 'ktx2-worker.js'))}: ${body.length} bytes`,
);
