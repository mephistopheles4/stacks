/**
 * The one write `pnpm duplication:report --history` makes: `jscpd.history.json`.
 *
 * ⚠️ **A module of its own so the vault boundary keeps watching the script.**
 * G1 (`adapter-boundary`) exempts a file from its check as a whole, so a write
 * in `scripts/duplication-report.ts` would have exempted everything that script
 * may ever read. Here the exemption covers one fixed filename at the repository
 * root and nothing else ([#454](https://github.com/mephistopheles4/stacks/issues/454)).
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_FILE } from './duplication-history.ts';
import { REPO_ROOT } from './repo-root.ts';

/** Write the serialised backfill to `jscpd.history.json`, as UTF-8 with LF line endings. */
export function writeHistoryFile(bytes: string, root: string = REPO_ROOT): void {
  writeFileSync(join(root, HISTORY_FILE), bytes, 'utf8');
}
