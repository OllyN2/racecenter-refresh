// NASCAR's live car GPS and telemetry, streamed over Ably to nascar.com. Ably only issues tokens to nascar.com, so
// the viewer brings one from their own visit there; it never leaves this browser except to go to Ably.
// This is a minimal client for Ably's JSON WebSocket protocol: connect, attach `vehicle{number}` channels and
// `VehicleEntryList` (NASCAR's leaderboard push), read messages. It's closed while the tab is hidden and whenever
// nothing on screen wants live data. Cars are played back smoothly a few seconds behind (see playback.ts).

import { CarTrack, PlaybackClock, toFix, type CarState } from './playback';
import type { EntryList, EntryListCar } from './types';

export type { CarState };

export type TelemetryStatus = 'off' | 'connecting' | 'live' | 'expired';

export const TOKEN_URL = 'https://f2akd1igr7.execute-api.us-east-1.amazonaws.com/Prod?nlbwa=1';
const HOST = 'wss://main.realtime.ably.net/';
const STORE = 'rcr.ablyToken';
/** Tokens NASCAR issues last an hour; when the pasted text has no expiry, assume that. */
const TOKEN_LIFE = 3600_000;

// Ably protocol actions.
const CONNECTED = 4, DISCONNECTED = 6, ERROR = 9, ATTACH = 10, DETACH = 12, DETACHED = 13, MESSAGE = 15;
const BOUNCE = 22, BOUNCED = 23; // heartbeats=bounce: echo the id back
const BOARD = 'VehicleEntryList';

interface Stored {
  token: string;
  expires: number;
}

/**
 * Accepts the JSON the token URL returns (which also says when it expires), the raw token, or anything with the
 * token in it, such as the object the browser console prints.
 */
export function parseToken(input: string): Stored | null {
  const s = input.trim().replace(/^['"`]+|['"`]+$/g, '');
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s);
      if (typeof j.token === 'string') {
        return { token: j.token, expires: Number.isFinite(j.expires) ? j.expires : Date.now() + TOKEN_LIFE };
      }
    } catch {
      /* not JSON: look for the token in it below */
    }
  }
  if (/^[\w.-]{20,}$/.test(s)) return { token: s, expires: Date.now() + TOKEN_LIFE };
  // NASCAR's tokens are JWEs: five dot-separated base64url parts, the second empty. A console preview that cut the
  // token short ("…") won't match.
  const token = s.match(/eyJ[\w-]+\.[\w-]*\.[\w-]+\.[\w-]+\.[\w-]+/)?.[0];
  if (!token) return null;
  const exp = Number(s.match(/expires['"]?\s*:\s*(\d{12,})/)?.[1]);
  return { token, expires: Number.isFinite(exp) ? exp : Date.now() + TOKEN_LIFE };
}

function decode(m: { data?: unknown; encoding?: string }): unknown {
  let d = m.data;
  const steps = (m.encoding ?? '').split('/').filter(Boolean);
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] === 'base64' && typeof d === 'string') d = atob(d);
    else if (steps[i] === 'json' && typeof d === 'string') d = JSON.parse(d);
    else if (steps[i] !== 'utf-8') return null;
  }
  return d;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The parts of a `VehicleEntryList` message that are used (times in ms). */
interface RawEntryList {
  et?: number;
  run?: { race_uid?: number; laps_rem?: number };
  flgs?: { flg?: number }[];
  riRun?: { Cautions?: number; CautionLaps?: number; LeadChanges?: number };
  results?: {
    no?: string;
    ps?: number;
    lap?: number;
    lap_tm?: number;
    spd?: number;
    best_tm?: number;
    best_spd?: number;
    delta_tm?: number;
    delta_lap?: number;
    riData?: { IsOnTrack?: number };
  }[];
}

class Telemetry {
  status = $state<TelemetryStatus>('off');
  hasToken = $state(false);
  /** Why the last connection failed, in words for the viewer. */
  problem = $state('');
  expires = $state<number | null>(null);
  /** When each car's latest fix arrived (local ms). */
  seen = $state.raw<ReadonlyMap<string, number>>(new Map());
  /** The latest leaderboard push for the live race, while connected. */
  board = $state.raw<EntryList | null>(null);
  /** The moment cars are shown at (NASCAR's clock, ms), moved on every frame while something animates. */
  playhead = $state(0);

  #token = '';
  #raceId: number | null = null;
  #ws: WebSocket | null = null;
  #wants = new Set<Set<string>>();
  #boardWants = 0;
  /** Channel names. */
  #attached = new Set<string>();
  #tracks = new Map<string, CarTrack>();
  #clock = new PlaybackClock();
  #pending = new Map<string, number>();
  #flush = 0;
  #animating = 0;
  #frame = 0;
  #retry = 0;
  #retryTimer = 0;
  #retrying = false;
  #idleTimer = 0;
  #expiryTimer = 0;
  #queued = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Stored | null;
      if (s?.token && s.expires > Date.now()) this.#use(s);
      else localStorage.removeItem(STORE);
    } catch {
      /* storage blocked: the viewer can paste a token again */
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? this.#close() : this.#sync()));
  }

  /** Returns an error to show, or null once the token is accepted. */
  setToken(input: string): string | null {
    const t = parseToken(input);
    if (!t) return "That doesn't look like a token. Paste exactly what the console copied.";
    if (t.expires <= Date.now()) return 'That token has already expired. Get a fresh one.';
    try {
      localStorage.setItem(STORE, JSON.stringify(t));
    } catch {
      /* fine: it lasts for this visit */
    }
    this.#close();
    this.#use(t);
    this.#sync();
    return null;
  }

  forget() {
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* nothing stored */
    }
    this.#token = '';
    this.hasToken = false;
    this.expires = null;
    clearTimeout(this.#expiryTimer);
    this.#close();
    this.status = 'off';
    this.problem = '';
    this.#reset();
  }

  /** Only stream during a live race, and drop anything from another race. */
  setRace(id: number | null) {
    if (id === this.#raceId) return;
    this.#raceId = id;
    this.#reset();
    this.board = null;
    this.#queue();
  }

  #reset() {
    this.seen = new Map();
    this.#tracks.clear();
    this.#pending.clear();
    this.#clock = new PlaybackClock();
  }

  /** Keep `playhead` moving while the caller is on screen. Returns the function that stops it. */
  animate(): () => void {
    if (!this.#animating++) this.#tick(performance.now());
    return () => {
      if (!--this.#animating) cancelAnimationFrame(this.#frame);
    };
  }

  // Timed from the frame's own timestamp, not from when this happens to run within it, which varies by a few ms and
  // made cars stutter.
  #tick = (frame: number) => {
    this.playhead = this.#clock.time(performance.timeOrigin + frame);
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** A car where it was at `playhead`, with its speed, pedals, rpm, gear and steering then. */
  at(car: string): CarState | null {
    return this.#tracks.get(car)?.at(this.playhead) ?? null;
  }

  /** Ask for live data for these cars while the caller is on screen. Returns the function that stops it. */
  want(cars: Iterable<string>): () => void {
    const set = new Set(cars);
    this.#wants.add(set);
    this.#queue();
    return () => {
      this.#wants.delete(set);
      this.#queue();
    };
  }

  /** Ask for NASCAR's leaderboard push (`board`) while the caller is on screen. Returns the function that stops it. */
  wantBoard(): () => void {
    this.#boardWants++;
    this.#queue();
    return () => {
      this.#boardWants--;
      this.#queue();
    };
  }

  #use(t: Stored) {
    this.#token = t.token;
    this.hasToken = true;
    this.expires = t.expires;
    this.problem = '';
    if (this.status === 'expired') this.status = 'off';
    clearTimeout(this.#expiryTimer);
    this.#expiryTimer = window.setTimeout(() => this.#expire(), Math.min(2 ** 31 - 1, t.expires - Date.now()));
  }

  #expire(problem = 'Your NASCAR token expired.') {
    this.#token = '';
    this.hasToken = false;
    clearTimeout(this.#expiryTimer);
    this.#close();
    this.status = 'expired';
    this.problem = problem;
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* nothing stored */
    }
  }

  // Wants change in pairs (an effect's cleanup, then its re-run), so settle them once per tick.
  #queue() {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#sync();
    });
  }

  /** Channel names. */
  #desired(): Set<string> {
    const all = new Set<string>();
    if (this.#raceId == null) return all;
    if (this.#boardWants > 0) all.add(BOARD);
    for (const s of this.#wants) for (const c of s) all.add(`vehicle${c}`);
    return all;
  }

  #sync() {
    const want = this.#desired();
    clearTimeout(this.#idleTimer);
    if (!want.size || !this.#token || document.hidden) {
      // Nothing to show: let go of the connection after a short grace period (switching tabs back is common).
      if (this.#ws) this.#idleTimer = window.setTimeout(() => this.#close(), want.size ? 0 : 15_000);
      return;
    }
    if (!this.#ws) {
      if (!this.#retrying) this.#connect();
      return;
    }
    if (this.status !== 'live') return;
    for (const c of want) {
      // Ably resends the last leaderboard and the last few seconds of each car, so they show at once instead of at
      // the next push (up to 15 s later) or once playback reaches the first fix (~3 s).
      if (!this.#attached.has(c)) this.#send({ action: ATTACH, channel: c, params: { rewind: c === BOARD ? '1' : '6s' } });
    }
    for (const c of this.#attached) {
      if (!want.has(c)) {
        this.#send({ action: DETACH, channel: c });
        if (c === BOARD) this.board = null;
      }
    }
    this.#attached = new Set(want);
  }

  #connect() {
    clearTimeout(this.#retryTimer);
    this.status = 'connecting';
    const ws = new WebSocket(`${HOST}?access_token=${encodeURIComponent(this.#token)}&format=json&heartbeats=bounce&v=6`);
    this.#ws = ws;
    this.#attached = new Set();
    ws.onmessage = (e) => {
      if (this.#ws === ws) this.#receive(e.data);
    };
    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      if (this.status === 'expired' || !this.#token) return;
      // Dropped: try again, backing off up to 30 s.
      this.status = 'connecting';
      if (this.#retry >= 4) this.problem = "Can't reach NASCAR's live data. Still trying.";
      const wait = Math.min(30_000, 1000 * 2 ** this.#retry++);
      this.#retrying = true;
      this.#retryTimer = window.setTimeout(() => {
        this.#retrying = false;
        this.#sync();
      }, wait);
    };
  }

  #close() {
    clearTimeout(this.#retryTimer);
    this.#retrying = false;
    clearTimeout(this.#idleTimer);
    const ws = this.#ws;
    this.#ws = null;
    this.#attached = new Set();
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    if (this.status === 'live' || this.status === 'connecting') this.status = 'off';
    this.board = null;
  }

  #send(msg: object) {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(msg));
  }

  #receive(raw: string) {
    let p: {
      action: number;
      id?: string;
      channel?: string;
      error?: { code?: number; statusCode?: number; message?: string };
      messages?: { data?: unknown; encoding?: string }[];
    };
    try {
      p = JSON.parse(raw);
    } catch {
      return;
    }
    switch (p.action) {
      case CONNECTED:
        this.status = 'live';
        this.problem = '';
        this.#retry = 0;
        this.#sync();
        break;
      case BOUNCE:
        this.#send({ action: BOUNCED, id: p.id });
        break;
      case MESSAGE:
        if (p.channel === BOARD) for (const m of p.messages ?? []) this.#board(m);
        else if (p.channel?.startsWith('vehicle')) for (const m of p.messages ?? []) this.#vehicle(p.channel.slice(7), m);
        break;
      case DETACHED:
        if (p.channel) this.#attached.delete(p.channel);
        break;
      case ERROR:
      case DISCONNECTED: {
        const code = p.error?.code ?? 0;
        // 401xx: the token expired, was revoked or isn't valid for this.
        if (code >= 40100 && code < 40200) this.#expire(code === 40142 ? 'Your NASCAR token expired.' : "NASCAR's live data didn't accept that token.");
        else if (p.channel) this.#attached.delete(p.channel);
        else if (p.error?.message) this.problem = p.error.message;
        break;
      }
    }
  }

  #board(m: { data?: unknown; encoding?: string }) {
    let d: RawEntryList;
    try {
      d = decode(m) as RawEntryList;
    } catch {
      return;
    }
    const race = num(d?.run?.race_uid);
    if (race == null || race !== this.#raceId || !Array.isArray(d.results)) return;
    const cars: EntryListCar[] = [];
    for (const r of d.results) {
      const pos = num(r.ps);
      const laps = num(r.lap);
      if (typeof r.no !== 'string' || pos == null || laps == null) continue;
      const onTrack = num(r.riData?.IsOnTrack);
      cars.push({
        car: r.no,
        pos,
        laps,
        last_time: (num(r.lap_tm) ?? 0) / 1000,
        last_speed: num(r.spd) ?? 0,
        best_time: (num(r.best_tm) ?? 0) / 1000,
        best_speed: num(r.best_spd) ?? 0,
        laps_down: num(r.delta_lap) ?? 0,
        gap: (num(r.delta_tm) ?? 0) / 1000,
        on_track: onTrack == null ? null : onTrack !== 0,
      });
    }
    // Now and then a push catches the order mid-update, with two cars in one place; keep the last good one.
    const order = new Set(cars.map((c) => c.pos));
    if (order.size !== cars.length || !cars.every((c) => c.pos >= 1 && c.pos <= cars.length)) return;
    const et = num(d.et);
    this.board = {
      at: Date.now(),
      race_id: race,
      elapsed: et == null ? null : et / 1000,
      laps_to_go: num(d.run?.laps_rem),
      flag_state: num(d.flgs?.at(-1)?.flg),
      cautions: num(d.riRun?.Cautions),
      caution_laps: num(d.riRun?.CautionLaps),
      lead_changes: num(d.riRun?.LeadChanges),
      cars,
    };
  }

  #vehicle(car: string, m: { data?: unknown; encoding?: string }) {
    let d: Record<string, unknown>;
    try {
      d = decode(m) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!d || typeof d !== 'object') return;
    const race = num(d.raceID);
    if (race != null && race !== this.#raceId) return;
    const fix = toFix(d);
    if (!fix) return;
    let track = this.#tracks.get(car);
    if (!track) this.#tracks.set(car, (track = new CarTrack()));
    const prev = track.fixes.at(-1)?.t ?? null;
    if (!track.add(fix)) return;
    // The same steady clock as the frames (Date.now() can be stepped by the system).
    this.#clock.arrived(performance.timeOrigin + performance.now(), fix.t, prev);
    this.#pending.set(car, Date.now());
    // Hand arrivals to the page at most 4 times a second (positions come from `at`, every frame).
    this.#flush ||= window.setTimeout(() => {
      this.#flush = 0;
      const next = new Map(this.seen);
      for (const [k, v] of this.#pending) next.set(k, v);
      this.#pending.clear();
      this.seen = next;
    }, 250);
  }
}

export const telemetry = new Telemetry();
