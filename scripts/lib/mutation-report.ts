/**
 * One scored mutation report, printed for a person: the terminal table
 * `pnpm mutation:score` prints, and the Markdown job summary the nightly writes.
 *
 * **Both surfaces build their score table from `scoreRows`**, so the summary
 * cannot show a number the terminal does not — and `metrics:emit` reads the same
 * `scoreRun` underneath, so neither can disagree with the trend record either.
 *
 * ⚠️ **This is a library and not a script, and the reason is a hash.** A new
 * `scripts/*.ts` run by `tsx` would need an exclusion in `stryker.scopes.json`,
 * which moves `configHash` and resets the calibration window — or it would sit in
 * the `scripts` scope as pure `NoCoverage` weight, the failure
 * `mutation-score.ts`'s header records. So the entry point is a `--markdown` flag
 * on `scripts/mutation-scopes.ts`, which is already excluded, and every line with
 * a branch lives here, where `mutation-report.test.ts` reaches it in-process.
 *
 * ⚠️ **Nothing here is a gate.** A score is a trend; the summary step exits 0
 * whatever it finds, and the job's own final check is what fails a bad night.
 */

import {
  scoreLabel,
  scoreRun,
  survivorsOf,
  total,
  totalOf,
  type FileSurvivors,
  type MutationReport,
  type ScoredRun,
  type Scope,
  type SurvivingMutant,
  type Tally,
} from './mutation-score.ts';

const HEADER = [
  'scope',
  'mutants',
  'score',
  'killed',
  'timeout',
  'survived',
  'no cov',
  'static',
  'excl',
];

/** The widths the terminal has always used, one per `HEADER` column. */
const WIDTHS = [0, 7, 7, 6, 7, 8, 6, 6, 4];

function row(name: string, tally: Tally, exclusions: number): string[] {
  return [
    name,
    String(total(tally)),
    scoreLabel(tally),
    String(tally.killed),
    String(tally.timeout),
    String(tally.survived),
    String(tally.noCoverage),
    String(tally.statics),
    String(exclusions),
  ];
}

/** The score table as cells: the header, one row per scope, then `all declared`. */
export function scoreRows(run: ScoredRun): string[][] {
  const rows = run.scopes.map((scope) => {
    const tally = run.perScope.get(scope.name);
    if (tally === undefined) throw new Error(`no tally for scope ${scope.name}`);
    return row(scope.name, tally, scope.exclusions.length);
  });
  return [HEADER, ...rows, row('all declared', totalOf(run), run.declaredExclusions)];
}

/** The score table exactly as `pnpm mutation:score` prints it. */
export function terminalTable(run: ScoredRun): string[] {
  const rows = scoreRows(run);
  const nameWidth = Math.max(...rows.map((cells) => cells[0]?.length ?? 0));
  return rows.map((cells) =>
    cells
      .map((text, index) => text.padStart(index === 0 ? nameWidth : (WIDTHS[index] ?? 0)))
      .join('  '),
  );
}

/**
 * A report's text, parsed — or a throw naming what is wrong with it.
 *
 * Checks only the one thing every reader needs, that `files` is an object. An
 * interrupted run can leave a truncated file, and the summary has to say *that*
 * rather than crash on the first property access.
 */
export function parseReport(text: string): MutationReport {
  const parsed: unknown = JSON.parse(text);
  const files: unknown =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as { files?: unknown }).files
      : undefined;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) {
    throw new Error('the report carries no `files` object');
  }
  return parsed as MutationReport;
}

export type ReportState =
  | { kind: 'missing'; path: string }
  | { kind: 'unparseable'; path: string; reason: string }
  | { kind: 'parsed'; report: MutationReport };

export interface SummaryInput {
  state: ReportState;
  scopes: Scope[];
  /** `YYYY-MM-DD`, passed in so a render is a function of its input. */
  date: string;
  commit: string;
  /** The mutation step's exit status as the workflow recorded it; `''` if none. */
  mutationStatus: string;
  /** The upload step's `artifact-url` output; `''` when it uploaded nothing. */
  artifactUrl: string;
}

export interface SummaryOptions {
  /**
   * GitHub documents 1 MiB per step summary. The default leaves a margin, and
   * the guard cuts the mutant lists — never the score table — to stay under it.
   */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 900 * 1024;
const FILES_PER_SCOPE = 5;
const MUTANTS_PER_FILE = 50;
const REPLACEMENT_CHARS = 200;

/** Tighter and tighter mutant caps, tried in turn until the summary fits. */
const CAPS = [MUTANTS_PER_FILE, 20, 5, 0];

/**
 * HTML-escaped, which is safe in both places text lands: a Markdown table cell
 * and the HTML table inside a `<details>` block. `|` and the backtick are encoded
 * too, since a raw `|` splits a Markdown row and replacement text is source code.
 */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\|/g, '&#124;')
    .replace(/`/g, '&#96;');
}

/** One line, so a multi-line replacement cannot break the row it sits in. */
function oneLine(text: string): string {
  const flat = text.replace(/\s*\r?\n\s*/g, ' ⏎ ');
  return flat.length > REPLACEMENT_CHARS ? `${flat.slice(0, REPLACEMENT_CHARS)}…` : flat;
}

/**
 * A Markdown code span. Entities do not decode inside one, so its text is never
 * HTML-escaped — only a backtick, which would close the span, is swapped out.
 */
function code(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

function heading(input: SummaryInput): string {
  const commit = input.commit === '' ? 'unknown commit' : code(input.commit.slice(0, 7));
  return `## Mutation report — nightly, ${escape(input.date)}, ${commit}`;
}

function warning(text: string): string {
  return `> ⚠️ ${text}`;
}

function artifactLine(url: string): string {
  return url === ''
    ? 'No report artifact was uploaded for this run.'
    : `[Download the full report](${url}) — open \`mutation.html\` for every mutant in its source.`;
}

function markdownRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function scoreTable(run: ScoredRun): string {
  const [header = [], ...rows] = scoreRows(run);
  return [
    markdownRow(header.map(escape)),
    markdownRow(header.map((_, index) => (index === 0 ? '---' : '---:'))),
    ...rows.map((cells) => markdownRow(cells.map(escape))),
  ].join('\n');
}

function mutantRow(mutant: SurvivingMutant): string {
  const cells = [
    mutant.line === null ? '—' : String(mutant.line),
    mutant.status,
    escape(mutant.mutatorName ?? '—'),
    mutant.replacement === null ? '—' : `<code>${escape(oneLine(mutant.replacement))}</code>`,
  ];
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}

function mutantBlock(file: FileSurvivors, cap: number): string {
  const shown = file.mutants.slice(0, cap);
  const hidden = file.mutants.length - shown.length;
  return [
    `<details><summary>${escape(file.file)} — ${String(file.mutants.length)} mutant(s)</summary>`,
    '',
    '<table>',
    '<tr><th>line</th><th>status</th><th>mutator</th><th>replacement</th></tr>',
    ...shown.map(mutantRow),
    '</table>',
    ...(hidden > 0 ? ['', `…and ${String(hidden)} more — see \`mutation.html\``] : []),
    '',
    '</details>',
  ].join('\n');
}

function scopeSection(name: string, files: FileSurvivors[], cap: number): string {
  if (files.length === 0) return `No surviving or uncovered mutants in ${code(name)}.`;
  const table = [
    markdownRow(['file', 'survived', 'no coverage']),
    markdownRow(['---', '---:', '---:']),
    ...files.map((file) =>
      markdownRow([escape(file.file), String(file.survived), String(file.noCoverage)]),
    ),
  ].join('\n');
  const blocks = cap > 0 ? files.map((file) => mutantBlock(file, cap)) : [];
  return [`#### ${escape(name)}`, table, ...blocks].join('\n\n');
}

function statusWarning(status: string): string[] {
  if (status === '0') return [];
  if (status === '') {
    return [warning('The mutation step reported no exit status — it may not have run.')];
  }
  return [
    warning(
      `The mutation step exited with status ${escape(status)}. The report below is whatever it wrote before stopping.`,
    ),
  ];
}

function render(input: SummaryInput, report: MutationReport, cap: number): string {
  const run = scoreRun(report, input.scopes);
  const pending = totalOf(run).pending;
  const survivors = survivorsOf(report, input.scopes, FILES_PER_SCOPE);

  const warnings = [
    ...statusWarning(input.mutationStatus),
    ...(pending > 0
      ? [
          warning(
            `${String(pending)} mutant(s) still Pending — this report is from a run that did not finish, and every score below covers only the part that completed.`,
          ),
        ]
      : []),
  ];
  const cutNote =
    cap < MUTANTS_PER_FILE
      ? [
          cap === 0
            ? warning(
                'Mutant lists were cut to fit GitHub’s step-summary size limit; the full list is in the artifact.',
              )
            : warning(
                `Mutant lists were cut to fit GitHub’s step-summary size limit: at most ${String(cap)} per file here, every one in the artifact.`,
              ),
        ]
      : [];

  return [
    heading(input),
    ...warnings,
    scoreTable(run),
    ...cutNote,
    '### Where the survivors are',
    ...input.scopes.map((scope) => scopeSection(scope.name, survivors.get(scope.name) ?? [], cap)),
    artifactLine(input.artifactUrl),
  ].join('\n\n');
}

/**
 * The nightly's job summary, as Markdown.
 *
 * In order: a heading, the warnings, the per-scope score table, then per scope
 * the top files by `survived + noCoverage` with their mutants collapsed, then
 * the artifact link. A missing or unparseable report says which and stops —
 * there is no table to draw from a file that is not there.
 *
 * ⚠️ **The size guard only ever removes mutant detail.** It retries with a
 * tighter per-file cap and, at the last, none at all; the score table is the
 * first read and survives every cut, even one that still does not fit.
 */
export function renderSummary(input: SummaryInput, options: SummaryOptions = {}): string {
  const { state } = input;
  if (state.kind !== 'parsed') {
    const unreadable =
      state.kind === 'missing'
        ? `No mutation report at ${code(state.path)} — the run stopped before Stryker wrote one, so there is nothing to score.`
        : `The mutation report at ${code(state.path)} did not parse, so nothing below it is scored: ${escape(state.reason)}`;
    return [
      heading(input),
      warning(unreadable),
      ...statusWarning(input.mutationStatus),
      artifactLine(input.artifactUrl),
    ].join('\n\n');
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let summary = '';
  for (const cap of CAPS) {
    summary = render(input, state.report, cap);
    if (Buffer.byteLength(summary, 'utf8') <= maxBytes) return summary;
  }
  return summary;
}
