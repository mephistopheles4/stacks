import { DAILY_LIMIT } from './limits.ts';

/**
 * Reduces an address to what is counted: an IPv4 address as itself, an IPv6
 * address to its /64 (the first four groups, zero-padded, lower case), and an
 * IPv4-mapped IPv6 address to the IPv4 address. `undefined` for anything else,
 * which refuses (S5 step 4: a missing address refuses).
 */
export function normaliseAddress(address: string | null | undefined): string | undefined {
  if (!address) return undefined;
  const text = address.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return ipv4(text);
  if (!text.includes(':')) return undefined;
  return ipv6Prefix(text);
}

function ipv4(text: string): string | undefined {
  const parts = text.split('.').map(Number);
  if (parts.some((p) => p > 255)) return undefined;
  return parts.join('.');
}

function ipv6Prefix(text: string): string | undefined {
  let rest = text.replace(/%.*$/, '');
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(rest);
  if (dotted) {
    const v4 = ipv4(dotted[1]!);
    if (v4 === undefined) return undefined;
    const [a, b, c, d] = v4.split('.').map(Number) as [number, number, number, number];
    rest = rest.slice(0, dotted.index) + `${hex(a * 256 + b)}:${hex(c * 256 + d)}`;
  }
  const halves = rest.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return undefined;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return undefined;
  const padded = groups.map((g) => g.padStart(4, '0'));
  // ::ffff:a.b.c.d is an IPv4 client reaching us through a mapped address.
  if (padded.slice(0, 5).every((g) => g === '0000') && padded[5] === 'ffff') {
    const hi = parseInt(padded[6]!, 16);
    const lo = parseInt(padded[7]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return padded.slice(0, 4).join(':');
}

const hex = (n: number): string => n.toString(16);

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** HMAC-SHA-256, hex, of the counted address and the UTC day (S4). */
export async function visitorKey(address: string, day: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${address}|${day}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The slice of Durable Object storage the counter uses. */
export interface CounterStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
}

export interface CounterState {
  readonly storage: CounterStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

/**
 * One object per visitor key per day. The count lives in memory and is raised
 * synchronously, so parallel requests cannot all pass the same check (C6); the
 * write follows. An alarm at the next UTC midnight deletes the record.
 */
export class VisitorCounter {
  private count = 0;
  private readonly ready: Promise<void>;

  constructor(
    private readonly state: CounterState,
    _env: unknown,
    private readonly now: () => Date = () => new Date(),
  ) {
    // The runtime holds requests until this settles; awaiting it in fetch keeps
    // the same order where nothing holds them.
    this.ready = state.blockConcurrencyWhile(async () => {
      this.count = (await state.storage.get<number>('count')) ?? 0;
    });
  }

  async fetch(_request: Request): Promise<Response> {
    await this.ready;
    if (this.count >= DAILY_LIMIT) return Response.json({ allowed: false, count: this.count });
    this.count += 1;
    const allowed = this.count;
    await this.state.storage.put('count', allowed);
    // Whenever none is set, not only at the first hit, so a failed write cannot
    // leave a record that outlives its day.
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(nextMidnight(this.now()));
    }
    return Response.json({ allowed: true, count: allowed });
  }

  async alarm(): Promise<void> {
    await this.ready;
    this.count = 0;
    await this.state.storage.deleteAll();
  }
}

export function nextMidnight(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}
