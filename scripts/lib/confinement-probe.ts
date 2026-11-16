/**
 * The worker confinement probe (room spec S6.7, C6).
 *
 * The KTX2 worker runs under `default-src 'none'; script-src 'unsafe-eval' 'wasm-unsafe-eval'`,
 * so eval is allowed in a worker that can reach nothing. Whether a browser applies that policy
 * to a worker loaded from a URL, and whether Cloudflare Pages serves the `_headers` block on the
 * worker's path, cannot be read off the text: the probe asks a browser. It is a script served
 * **at the worker's path in a scratch folder alone**, which tries `fetch`, a second worker and
 * `importScripts`, and the check is red if any of them gets through.
 *
 * ⚠️ **Never in `public/` and never in a production `dist/`.** A production build that held it
 * would have a worker that tries to reach out under a policy that admits eval. G20 refuses the
 * probe's marker anywhere in `dist/` and any file under `rooms/` named `*probe*`.
 * `preview:fixture --probe` writes these files into its scratch copy after G20 has passed on it.
 *
 * The probe page carries the real page's own `<meta>` policy, so a browser that applied the
 * page's policy to the worker instead (S6.10, the Safari question) shows up as eval blocked.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFINEMENT_PROBE_MARKER, KTX2_WORKER_PATH, KTX2_WORKER_POLICY } from './public-build.ts';

/** What the worker tries to reach, a same-origin script that exists in the scratch folder. */
export const PROBE_TARGET_PATH = '/rooms/basis/probe-target.js';
export const PROBE_PAGE_PATH = '/probe.html';
export const PROBE_PAGE_SCRIPT_PATH = '/probe-page.js';

/** The attempts that must fail, and the one that must succeed to show the worker's own policy applies. */
export const BLOCKED_ATTEMPTS = ['fetch', 'worker', 'importScripts'] as const;
export const CONTROL_ATTEMPT = 'eval';

export type Attempt = 'reached' | 'blocked';
export type ProbeResults = Readonly<Record<string, Attempt | undefined>>;

/** The probe worker, served at the worker's path. Plain script: a worker is loaded as a classic one. */
export const PROBE_WORKER_SOURCE = `// ${CONFINEMENT_PROBE_MARKER}
// Served at the KTX2 worker's path in a scratch folder only. Tries to reach out and reports.
(function () {
  var results = {};
  var attempt = function (name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(
        function (reached) { results[name] = reached === 'timeout' ? 'timeout' : reached ? 'reached' : 'blocked'; },
        function () { results[name] = 'blocked'; },
      );
  };
  attempt('${CONTROL_ATTEMPT}', function () { return new Function('return 1')() === 1; })
    .then(function () {
      return attempt('fetch', function () {
        return fetch('${PROBE_TARGET_PATH}').then(function (reply) { return reply.ok; });
      });
    })
    .then(function () {
      return attempt('worker', function () {
        return new Promise(function (resolve) {
          var nested;
          try {
            nested = new Worker('${PROBE_TARGET_PATH}');
          } catch (error) {
            resolve(false);
            return;
          }
          nested.onmessage = function () { nested.terminate(); resolve(true); };
          nested.onerror = function () { nested.terminate(); resolve(false); };
          // No answer is not a refusal: it is recorded as such and the probe cannot pass on it.
          setTimeout(function () { nested.terminate(); resolve('timeout'); }, 1500);
        });
      });
    })
    .then(function () {
      return attempt('importScripts', function () {
        importScripts('${PROBE_TARGET_PATH}');
        return self.__probeTarget === 1;
      });
    })
    .then(function () { postMessage({ marker: '${CONFINEMENT_PROBE_MARKER}', results: results }); });
})();
`;

/** What the probe's attempts run: a script that says it ran, in either a page worker or the main worker. */
export const PROBE_TARGET_SOURCE = `// ${CONFINEMENT_PROBE_MARKER}
self.__probeTarget = 1;
if (typeof postMessage === 'function') postMessage('alive');
`;

/**
 * The page script: starts the probe worker from the worker's path, as the room's loader does, and
 * writes what it reports into the page, raw. `#probe-result` holds the JSON; `data-state` is
 * \`done\` once it has. A worker that fails to start is shown as an error and never as a pass.
 */
export const PROBE_PAGE_SCRIPT = `// ${CONFINEMENT_PROBE_MARKER}
(function () {
  var out = document.getElementById('probe-result');
  var finish = function (text, state) {
    out.textContent = text;
    out.setAttribute('data-state', state);
  };
  try {
    var worker = new Worker('${KTX2_WORKER_PATH}');
    worker.onmessage = function (event) { finish(JSON.stringify(event.data), 'done'); };
    worker.onerror = function () { finish('the probe worker did not start', 'error'); };
  } catch (error) {
    finish('the probe worker was refused', 'error');
  }
  setTimeout(function () {
    if (!out.getAttribute('data-state')) finish('no answer in 10 seconds', 'error');
  }, 10000);
})();
`;

/** The page's own policy meta tag, as the built index carries it, or `undefined`. */
export function policyMetaOf(indexHtml: string): string | undefined {
  return /<meta\s+http-equiv="content-security-policy"[^>]*>/i.exec(indexHtml)?.[0];
}

/**
 * The probe page. It carries the real page's policy meta, which allows its own script by hash:
 * the page script is therefore external (`'self'`), and the policy's `script-src` must admit it,
 * so the page's meta is used as given and the script is served from the same origin.
 */
export function probePage(policyMeta: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>probe</title>
${policyMeta}
</head>
<body>
<pre id="probe-result"></pre>
<script src="${PROBE_PAGE_SCRIPT_PATH}"></script>
</body>
</html>
`;
}

/**
 * Green only when the control attempt got through and every other attempt was blocked. Three
 * different reds, because they send you to different places: something got out (the confinement
 * failed), eval was blocked (the worker's own policy was not the one applied, S6.10), and an
 * answer of a shape nobody asked for.
 */
export function judgeProbe(results: unknown): { readonly ok: boolean; readonly line: string } {
  if (results === null || typeof results !== 'object') {
    return { ok: false, line: 'probe red: no results object' };
  }
  const read = results as Record<string, unknown>;
  const state = (name: string): Attempt | undefined =>
    read[name] === 'reached' || read[name] === 'blocked' ? read[name] : undefined;
  const missing = [CONTROL_ATTEMPT, ...BLOCKED_ATTEMPTS].filter(
    (name) => state(name) === undefined,
  );
  if (missing.length > 0)
    return { ok: false, line: `probe red: no answer for ${missing.join(', ')}` };
  const out = BLOCKED_ATTEMPTS.filter((name) => state(name) === 'reached');
  if (out.length > 0) {
    return { ok: false, line: `probe red: the worker reached out by ${out.join(', ')}` };
  }
  if (state(CONTROL_ATTEMPT) !== 'reached') {
    return {
      ok: false,
      line: 'probe red: eval was blocked, so the worker did not run under its own policy (S6.10)',
    };
  }
  return {
    ok: true,
    line: 'probe green: eval ran, and fetch, a second worker and importScripts were blocked',
  };
}

/**
 * Puts the probe into a scratch copy: the worker's path now serves the probe, the target and the
 * page are beside it. `control` loosens the scratch `_headers` block so the worker CAN fetch, and
 * the probe must then come back red (C6's "red on a worker that can fetch").
 */
export function writeProbe(scratch: string, control: boolean): void {
  const at = (path: string): string => join(scratch, ...path.split('/').filter((s) => s !== ''));
  const meta = policyMetaOf(readFileSync(join(scratch, 'index.html'), 'utf8'));
  if (meta === undefined) throw new Error('the scratch index.html carries no policy meta tag');
  writeFileSync(at(KTX2_WORKER_PATH), PROBE_WORKER_SOURCE);
  writeFileSync(at(PROBE_TARGET_PATH), PROBE_TARGET_SOURCE);
  writeFileSync(at(PROBE_PAGE_SCRIPT_PATH), PROBE_PAGE_SCRIPT);
  writeFileSync(at(PROBE_PAGE_PATH), probePage(meta));
  if (control) {
    const headers = join(scratch, '_headers');
    const text = readFileSync(headers, 'utf8');
    if (!text.includes(KTX2_WORKER_POLICY)) {
      throw new Error('the scratch _headers has no worker policy to loosen');
    }
    // No `default-src 'none'`: fetch, a worker and importScripts fall back to no restriction.
    writeFileSync(headers, text.replace(KTX2_WORKER_POLICY, "script-src 'self' 'unsafe-eval'"));
  }
}
