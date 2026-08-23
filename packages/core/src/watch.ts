import { watch, type FSWatcher } from "node:fs";

/**
 * Watching a vault for changes worth rebuilding for.
 *
 * Observes paths only — it never opens a note. Reading vault *content* still
 * goes through the adapter (invariant 4); this just decides when to ask.
 *
 * Debounced because Obsidian autosaves while you type: without it a single
 * sentence triggers dozens of rebuilds. The quiet period also sidesteps most
 * partial writes, since a note caught mid-save parses as malformed and would
 * make a book blink off the shelf and back.
 */

export interface WatchOptions {
  /** How long the vault must be quiet before rebuilding. */
  readonly debounceMs?: number;
  /** Injected in tests so they need no timers or real files. */
  readonly watcher?: (
    path: string,
    listener: (filename: string | null) => void,
  ) => Closeable;
}

export interface Closeable {
  close(): void;
}

const DEFAULT_DEBOUNCE_MS = 500;

/** Notes and cover art. Everything else in a vault is Obsidian's business. */
const INTERESTING = /\.(md|jpe?g|png|webp)$/i;

/**
 * Obsidian's own directories, and the swap files editors leave behind.
 *
 * `.obsidian/` alone changes on every pane resize and every plugin tick, which
 * would keep the vault permanently "busy" and rebuild forever.
 */
const IGNORED = /(^|[\\/])(\.obsidian|\.trash|\.git|node_modules)([\\/]|$)/i;

export function isRebuildTrigger(filename: string | null): boolean {
  if (filename === null || filename.length === 0) return false;
  if (IGNORED.test(filename)) return false;
  return INTERESTING.test(filename);
}

/**
 * Calls `onChange` once the vault has been quiet for `debounceMs`.
 *
 * Never runs two rebuilds at once: a change arriving mid-rebuild schedules
 * another pass rather than starting one on top.
 */
export function watchVault(
  vaultPath: string,
  onChange: () => Promise<void> | void,
  options: WatchOptions = {},
): Closeable {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;

  const run = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await onChange();
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void run();
      }
    }
  };

  const schedule = (filename: string | null): void => {
    if (!isRebuildTrigger(filename)) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, debounceMs);
  };

  const started: Closeable =
    options.watcher?.(vaultPath, schedule) ??
    (watch(vaultPath, { recursive: true }, (_event, filename) =>
      schedule(typeof filename === "string" ? filename : null),
    ) as FSWatcher);

  return {
    close(): void {
      if (timer !== undefined) clearTimeout(timer);
      started.close();
    },
  };
}
