/**
 * G21's installation, and nothing else.
 *
 * Deliberately one line in its own file: `no-live-network.ts` must stay free of
 * import-time side effects, or its spec installs the guard merely by importing
 * it and can no longer tell a wired-up gate from an unwired one. See the note
 * on `installNetworkGuard`.
 */

import { installNetworkGuard } from './no-live-network.ts';

installNetworkGuard();
