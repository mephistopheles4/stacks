/**
 * Builds the 50-book fixture site for the device check and judges it (#618, amendment 1).
 *
 *     pnpm exec tsx scripts/build-device-fixture.ts --out <folder>
 *
 * The `build` job of `.github/workflows/devices.yml` runs this and uploads the folder. **It holds
 * no secret**: the judgement (`judgeFixtureDist`, which loads sharp) happens here, before the
 * upload, so the key-holding job installs no package and judges nothing. It refuses to leave a
 * folder behind that was not judged ok. Not a `pnpm` script: it exists for that one job.
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFixtureDist, judgeFixtureDist } from './lib/fixture-dist.ts';

const at = process.argv.indexOf('--out');
const out = at === -1 ? undefined : process.argv[at + 1];
if (process.argv.length !== 4 || out === undefined || out.startsWith('--')) {
  console.error('usage: build-device-fixture.ts --out <folder>');
  process.exit(1);
}

const dist = resolve(out);
buildFixtureDist(dist);
const judged = await judgeFixtureDist(dist);
for (const line of judged.lines) console.log(line);
if (!judged.ok) {
  rmSync(dist, { recursive: true, force: true });
  console.error('the fixture build is not servable; nothing is kept');
  process.exit(1);
}
