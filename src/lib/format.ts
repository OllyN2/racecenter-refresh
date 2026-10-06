export type FlagTone = 'green' | 'yellow' | 'red' | 'white' | 'checkered' | 'neutral';

const FLAGS: Record<number, { label: string; tone: FlagTone }> = {
  1: { label: 'Green', tone: 'green' },
  2: { label: 'Caution', tone: 'yellow' },
  3: { label: 'Red flag', tone: 'red' },
  4: { label: 'Checkered', tone: 'checkered' },
  5: { label: 'White flag', tone: 'white' },
  8: { label: 'Warm-up', tone: 'neutral' },
  9: { label: 'Not active', tone: 'neutral' },
};

export function flagInfo(code: number | null | undefined): { label: string; tone: FlagTone } {
  return (code != null && FLAGS[code]) || { label: 'No flag', tone: 'neutral' };
}

export const RUN_TYPES: Record<number, string> = { 1: 'Practice', 2: 'Qualifying', 3: 'Race' };

export const SERIES: Record<number, { name: string; short: string }> = {
  1: { name: 'Cup Series', short: 'Cup' },
  2: { name: "O'Reilly Auto Parts Series", short: "O'Reilly" },
  3: { name: 'Craftsman Truck Series', short: 'Trucks' },
};

/** "NOAPS Final Practice" → "Final Practice" */
export function sessionLabel(runName: string): string {
  return runName.replace(/^(NCS|NOAPS|NXS|NCTS|NCWTS)\s+/i, '').trim();
}

export function lapTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return sec.toFixed(3);
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, '0')}`;
}

export function speed(mph: number | string | null | undefined): string {
  const n = typeof mph === 'string' ? Number.parseFloat(mph) : mph;
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return n.toFixed(3);
}

/** Live-feed `delta`: seconds behind the leader, or negative whole laps when lapped. */
export function gap(delta: number | null | undefined, isLeader: boolean): string {
  if (isLeader) return 'Leader';
  if (delta == null || !Number.isFinite(delta)) return '—';
  if (delta < 0) {
    const laps = Math.round(-delta);
    return `−${laps} ${laps === 1 ? 'lap' : 'laps'}`;
  }
  return `+${delta.toFixed(3)}`;
}

export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '0';
}

const MAKES: Record<string, { short: string; name: string; key: 'chv' | 'frd' | 'tyt' | 'ram' | 'other' }> = {
  chv: { short: 'CHV', name: 'Chevrolet', key: 'chv' },
  chevrolet: { short: 'CHV', name: 'Chevrolet', key: 'chv' },
  frd: { short: 'FRD', name: 'Ford', key: 'frd' },
  ford: { short: 'FRD', name: 'Ford', key: 'frd' },
  tyt: { short: 'TYT', name: 'Toyota', key: 'tyt' },
  toyota: { short: 'TYT', name: 'Toyota', key: 'tyt' },
  ram: { short: 'RAM', name: 'Ram', key: 'ram' },
};

export function makeInfo(raw: string | null | undefined) {
  const k = (raw ?? '').trim().toLowerCase();
  return MAKES[k] ?? { short: (raw ?? '').slice(0, 3).toUpperCase() || '—', name: raw || 'Unknown', key: 'other' as const };
}

export interface DriverName {
  name: string;
  chase: boolean;
  rookie: boolean;
  ineligible: boolean;
}

/** NASCAR suffixes names with markers: "(C)" Chase contender, "#" rookie, "(i)" ineligible for points. */
export function parseDriver(raw: string | null | undefined): DriverName {
  const s = raw ?? '';
  const name = s
    .replace(/\(C\)|\(i\)|#|\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, chase: s.includes('(C)'), rookie: s.includes('#'), ineligible: s.includes('(i)') };
}

const NAME_PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'la', 'le', 'st.']);
const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

/** "Shane Van Gisbergen" → "Van Gisbergen", "Dale Earnhardt Jr." → "Earnhardt Jr." */
export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  let i = parts.length - 1;
  if (i > 0 && NAME_SUFFIXES.has(parts[i].toLowerCase())) i--;
  while (i > 1 && NAME_PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(Math.max(i, parts.length > 1 ? 1 : 0)).join(' ');
}

/** Feed timestamps carry 7 fractional digits; trim to milliseconds so every browser parses them. */
export function parseTimestamp(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  return Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
}

/** Schedule times are UTC but have no zone designator. */
export function parseUtc(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
}

export function localDateTime(ms: number, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(ms);
}

export function shortDate(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(ms);
}

export function clockTime(d: Date | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(d);
}
