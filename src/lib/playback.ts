// Smooth playback of NASCAR's live car data (the Ably `vehicle{number}` channels).
//
// Measured over the 2026-10-11 Charlotte Cup race (138k messages): each car reports every ~1.7 s, and its GPS is
// clean (it agrees with the reported speed to ±2% and the heading to a few degrees). But a fix is 0.9–3 s old when
// it arrives, varying from message to message and car to car, and ~1% of messages repeat an old fix. Drawing each
// message as it arrives makes cars lurch, cut corners on straight lines between fixes, and sit seconds apart in time
// from the car beside them. So every car is drawn at one shared moment a few seconds back, between the two fixes
// either side of it: on a curve through them that follows their own heading and speed (within ~1 m of where the car
// really was, against ~12 m for a straight line), with speed, throttle, brake, rpm and steering eased between the
// same two samples.

export interface Fix {
  /** When the fix was taken (NASCAR's clock, ms). */
  t: number;
  lat: number;
  lon: number;
  mph: number;
  /** Degrees clockwise from north, when reported. */
  heading: number | null;
  /** 0–100 */
  throttle: number | null;
  /** 0–100: brake pressure / 250, as nascar.com shows it. */
  brake: number | null;
  rpm: number | null;
  gear: number | null;
  /** Steering wheel angle, degrees; positive is left. */
  steer: number | null;
}

export type CarState = Omit<Fix, 't' | 'heading'>;

const RAD = Math.PI / 180;
const M_PER_DEG = 111_195;
const MPS = 0.44704;
/** No curve across a longer hole in the data. */
const MAX_GAP = 5000;
/** How long a car carries on past its last fix before waiting for the next. */
const MAX_AHEAD = 1500;
const KEEP = 20;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** An angle folded into (−π, π]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Direction from a to b, radians clockwise from north. */
const bearing = (a: Fix, b: Fix) => Math.atan2((b.lon - a.lon) * Math.cos(a.lat * RAD), b.lat - a.lat);
const metres = (a: Fix, b: Fix) => Math.hypot((b.lon - a.lon) * Math.cos(a.lat * RAD), b.lat - a.lat) * M_PER_DEG;
const mix = (a: number | null, b: number | null, u: number) => (a == null ? b : b == null ? a : a + (b - a) * u);

/** One `VehicleData` message, cleaned up; null without a usable position. */
export function toFix(d: Record<string, unknown>): Fix | null {
  const loc = Array.isArray(d.location) ? d.location.map(num) : [];
  const [lat, lon] = loc;
  // `timestamp` comes in ms or µs from one message to the next; `locationTimestamp` is the fix's own, in ms.
  const ts = num(d.timestamp);
  const t = num(d.locationTimestamp) ?? (ts != null && ts > 1e14 ? ts / 1000 : ts);
  const mph = num(d.mph);
  if (lat == null || lon == null || t == null || mph == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  // `Speed` and `Heading` are finer than `mph` but drop out (both 0, or never sent by some cars); `mph` doesn't.
  const speed = num(d.Speed);
  const fine = speed != null && speed > 0 && Math.abs(speed - mph) <= 5;
  const heading = num(d.Heading);
  const throttle = num(d['Throttle Position']);
  const brake = num(d['Brake Pressure']);
  const rpm = num(d['Engine Speed']);
  const steer = num(d.aSteering);
  return {
    t,
    lat,
    lon,
    mph: fine ? speed : mph,
    heading: fine ? heading : null,
    throttle: throttle == null ? null : clamp(throttle, 0, 100),
    brake: brake == null ? null : clamp(brake / 2.5, 0, 100),
    // Some cars' rpm sticks near 0 for laps at a time.
    rpm: rpm == null || (rpm < 500 && mph > 30) ? null : rpm,
    gear: num(d.nGear),
    // ±360 is a glitch. Past 90° is real, but only at walking pace in the pits.
    steer: steer == null || Math.abs(steer) >= 360 ? null : steer,
  };
}

const state = (f: Fix, lat = f.lat, lon = f.lon): CarState => ({
  lat,
  lon,
  mph: f.mph,
  throttle: f.throttle,
  brake: f.brake,
  rpm: f.rpm,
  gear: f.gear,
  steer: f.steer,
});

/** One car's recent fixes, and where it was at any moment between them. */
export class CarTrack {
  readonly fixes: Fix[] = [];
  #rejected = 0;

  /** Adds a fix. False for a repeat, one out of order, a frozen position or an impossible jump. */
  add(f: Fix): boolean {
    const last = this.fixes.at(-1);
    if (last) {
      if (f.t <= last.t || (f.lat === last.lat && f.lon === last.lon)) return false;
      // Over 120 m/s (270 mph) since the last fix: this one's bad, unless the next is too (then the last was).
      const dt = (f.t - last.t) / 1000;
      if (dt < MAX_GAP / 1000 && metres(last, f) / dt > 120 && ++this.#rejected < 2) return false;
    }
    this.#rejected = 0;
    this.fixes.push(f);
    if (this.fixes.length > KEEP) this.fixes.shift();
    return true;
  }

  /** The car at time `t` (NASCAR's clock), or null before its first fix. */
  at(t: number): CarState | null {
    const f = this.fixes;
    if (!f.length || t < f[0].t) return null;
    let k = f.length - 1;
    while (f[k].t > t) k--;
    const a = f[k];
    const b = f[k + 1];
    if (!b || b.t - a.t > MAX_GAP) return this.#ahead(k, t);

    // Cubic Hermite curve from a to b, in metres east and north of a, leaving and arriving along each fix's
    // direction of travel.
    const span = (b.t - a.t) / 1000;
    const u = (t - a.t) / (b.t - a.t);
    const kx = M_PER_DEG * Math.cos(a.lat * RAD);
    const bx = (b.lon - a.lon) * kx;
    const by = (b.lat - a.lat) * M_PER_DEG;
    const chord = Math.hypot(bx, by);
    // Tangents kept near the chord's length, so an odd speed reading can't throw the curve wide.
    const tangent = ([vx, vy]: [number, number]): [number, number] => {
      const m = Math.hypot(vx, vy) * span;
      if (!m) return [0, 0];
      const k = clamp(m, 0.7 * chord, 1.4 * chord) / m;
      return [vx * span * k, vy * span * k];
    };
    const [ax0, ay0] = tangent(this.#velocity(k));
    const [bx1, by1] = tangent(this.#velocity(k + 1));
    const u2 = u * u;
    const u3 = u2 * u;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const x = h10 * ax0 + h01 * bx + h11 * bx1;
    const y = h10 * ay0 + h01 * by + h11 * by1;
    return {
      lat: a.lat + y / M_PER_DEG,
      lon: a.lon + x / kx,
      mph: mix(a.mph, b.mph, u)!,
      throttle: mix(a.throttle, b.throttle, u),
      brake: mix(a.brake, b.brake, u),
      rpm: mix(a.rpm, b.rpm, u),
      gear: u < 0.5 ? a.gear : b.gear,
      steer: mix(a.steer, b.steer, u),
    };
  }

  /** Velocity at fix k, m/s east and north: its own heading and speed, or else its direction through its neighbours. */
  #velocity(k: number): [number, number] {
    const f = this.fixes;
    const x = f[k];
    const v = x.mph * MPS;
    let dir = x.heading == null ? null : x.heading * RAD;
    if (dir == null) {
      /** Fix i, if it's within a normal gap of fix i + 1. */
      const before = (i: number) => (i >= 0 && f[i + 1].t - f[i].t <= MAX_GAP ? f[i] : null);
      const p = before(k - 1);
      const n = k + 1 < f.length && f[k + 1].t - x.t <= MAX_GAP ? f[k + 1] : null;
      if (p && n) {
        // On a steady curve the direction at a point is parallel to the chord between its neighbours.
        dir = bearing(p, n);
      } else if (p) {
        // At the end of an arc it's turned half as far again as the last chord did from the one before.
        const pp = before(k - 2);
        const last = bearing(p, x);
        dir = pp ? last + wrap(last - bearing(pp, p)) / 2 : last;
      } else if (n) {
        dir = bearing(x, n);
      } else {
        return [0, 0];
      }
    }
    return [v * Math.sin(dir), v * Math.cos(dir)];
  }

  /** Past the last fix (or before a hole in the data): carry on round the same curve for a moment, then wait. */
  #ahead(k: number, t: number): CarState {
    const a = this.fixes[k];
    const [vx, vy] = this.#velocity(k);
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return state(a);
    const s = Math.min(t - a.t, MAX_AHEAD) / 1000;
    const dir = Math.atan2(vx, vy);
    let turn = 0;
    const p = this.fixes[k - 1];
    if (p && a.t - p.t <= MAX_GAP) {
      const [px, py] = this.#velocity(k - 1);
      if (Math.hypot(px, py) >= 1) turn = wrap(dir - Math.atan2(px, py)) / ((a.t - p.t) / 1000);
    }
    let x: number;
    let y: number;
    if (Math.abs(turn) < 1e-3) {
      x = vx * s;
      y = vy * s;
    } else {
      const r = speed / turn;
      x = r * (Math.cos(dir) - Math.cos(dir + turn * s));
      y = r * (Math.sin(dir + turn * s) - Math.sin(dir));
    }
    return state(a, a.lat + y / M_PER_DEG, a.lon + x / (M_PER_DEG * Math.cos(a.lat * RAD)));
  }
}

/**
 * How far behind the fixes to play. The fix after the playback moment should have arrived already, so the delay
 * follows how long after a car's fix its next one turns up (90th percentile, typically 4.5–5 s), timed on this
 * browser's clock, which also takes up any difference between it and NASCAR's. That's no later than drawing each
 * message as it came: cars were then ~4.8 s behind too, gliding towards fixes already ~3 s old. When a fix is later
 * still, the car carries on round its curve until it comes (half a second of that is out by ~0.6 m).
 */
export class PlaybackClock {
  #seen: number[] = [];
  #next = 0;
  #count = 0;
  #target = 0;
  #delay = 0;
  #at = 0;

  /** A car's fix taken at `t` (NASCAR's clock) arrived `now`; `prev` is when its previous fix was taken. */
  arrived(now: number, t: number, prev: number | null) {
    // Old fixes (Ably replaying the last few seconds on attach) say nothing about live timing.
    if (now - t > 4000) return;
    // Until a car's second fix, assume the usual 1.7 s between them.
    this.#seen[this.#next] = prev != null && t - prev <= MAX_GAP ? now - prev : now - t + 1700;
    this.#next = (this.#next + 1) % 400;
    if (this.#count++ % 20 === 0) {
      const s = [...this.#seen].sort((a, b) => a - b);
      this.#target = s[Math.floor(0.9 * (s.length - 1))] + 100;
    }
  }

  /** The playback moment at wall time `now`. A new delay is eased in at a tenth of real time, so playback never jumps. */
  time(now: number): number {
    if (!this.#target) return now;
    if (!this.#delay || now - this.#at > 5000) this.#delay = this.#target;
    else {
      const step = Math.max(0, now - this.#at) * 0.1;
      this.#delay += clamp(this.#target - this.#delay, -step, step);
    }
    this.#at = now;
    return now - this.#delay;
  }

  get delay(): number {
    return this.#delay;
  }
}
