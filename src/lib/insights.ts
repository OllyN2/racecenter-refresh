import { lapTime, lastName, parseDriver } from './format';
import { isRaceStop } from './normalize';
import type { LapTimes, LiveVehicle, PitStop, ResultRow } from './types';

const GREEN = 1;
const isCaution = (f: number | undefined) => f === 2 || f === 3;

/** Front-of-field cutoff for restart stats; deeper cars are often lapped, and their lap numbers don't line up with the leader's. */
const RESTART_FIELD = 20;
const BATTLE_GAP = 1.0;
/** The table only calls out battles near the front where a car is closing in or they're side by side. */
const NOTABLE_FROM = 15;
const SIDE_BY_SIDE = 0.15;
const CLOSING = 0.02;
const LONG_RUN_FROM = 10;

export interface Stop {
  lap: number;
  /** Tires changed; null when only the live feed knows about the stop (it doesn't say). */
  tires: number | null;
  side: 'left' | 'right' | null;
  underGreen: boolean | null;
  /** Seconds stationary in the box. */
  duration: number | null;
  gained: number | null;
}

export interface LapSample {
  lap: number;
  time: number;
}

export interface Stint {
  from: number;
  to: number;
  /** Tires put on at the start of the run; null for the race start. */
  tires: number | null;
  avg: number | null;
  /** Seconds lost per 10 laps over the run. */
  falloff: number | null;
}

export interface CarInsight {
  car: string;
  name: string;
  /** Laps on the current tires and how many were changed; `fromStart` when they haven't been changed yet. */
  tire: { laps: number; tires: number | null; fromStart: boolean } | null;
  stops: Stop[];
  green: LapSample[];
  pace: number | null;
  fastest: boolean;
  /** Interval to the car ahead (lead lap, green flag, under a second); `rate` > 0 means closing, in s/lap. */
  battle: { gap: number; rate: number | null; aheadPos: number; notable: boolean } | null;
  stints: Stint[];
  longRun: number | null;
  restarts: { lap: number; gain: number }[];
  onPitRoad: boolean;
  dvp: boolean;
  /** Loop data (passes, average position, …) from the live feed for this race, if there is one. */
  stats: LiveVehicle | null;
  /** NASCAR leaves passing stats at 0 for the whole field until after the race; hide them until they're filled in. */
  passesKnown: boolean;
}

export interface InsightCard {
  id: 'fastest' | 'battle' | 'longrun' | 'restart' | 'mover';
  label: string;
  car: string;
  title: string;
  value: string;
  note: string;
}

export interface RaceInsights {
  cars: Map<string, CarInsight>;
  cards: InsightCard[];
}

export interface RaceInput {
  laps: LapTimes | null;
  pits: PitStop[] | undefined;
  /** Live-feed vehicles for this race: in progress, or the final snapshot after it. */
  vehicles: LiveVehicle[] | undefined;
  /** True while the race is running (pace, battles and pit-road status only make sense then). */
  inProgress: boolean;
  flag: number | null;
  results?: ResultRow[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Least-squares slope of time against lap. */
function slope(samples: LapSample[]): number {
  const mx = mean(samples.map((s) => s.lap));
  const my = mean(samples.map((s) => s.time));
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.lap - mx) * (s.time - my);
    den += (s.lap - mx) ** 2;
  }
  return den ? num / den : 0;
}

export const shortName = (car: string, fullName: string) => `#${car} ${lastName(parseDriver(fullName).name)}`;

function stopsFromPitFeed(pits: PitStop[]): Map<string, Stop[]> {
  const out = new Map<string, Stop[]>();
  for (const p of pits) {
    if (!isRaceStop(p)) continue;
    const changed = [p.left_front_tire_changed, p.left_rear_tire_changed, p.right_front_tire_changed, p.right_rear_tire_changed];
    const tires = changed.filter(Boolean).length;
    const side = tires === 2 && changed[2] && changed[3] ? 'right' : tires === 2 && changed[0] && changed[1] ? 'left' : null;
    const list = out.get(p.vehicle_number) ?? [];
    if (list.some((s) => s.lap === p.lap_count)) continue;
    list.push({
      lap: p.lap_count,
      tires,
      side,
      underGreen: p.pit_in_flag_status === GREEN,
      duration: p.pit_stop_duration > 0 ? p.pit_stop_duration : null,
      gained: p.positions_gained_lost,
    });
    out.set(p.vehicle_number, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.lap - b.lap);
  return out;
}

/** The live feed lists stops sooner than the pit feed but repeats entries and has zeroed placeholders. */
function stopsFromLive(v: LiveVehicle, raceOver: boolean): Stop[] {
  const seen = new Set<number>();
  const out: Stop[] = [];
  for (const s of v.pit_stops ?? []) {
    if (s.pit_in_lap_count <= 0 || seen.has(s.pit_in_elapsed_time)) continue;
    if (raceOver && s.pit_in_lap_count >= v.laps_completed) continue;
    seen.add(s.pit_in_elapsed_time);
    out.push({ lap: s.pit_in_lap_count, tires: null, side: null, underGreen: null, duration: null, gained: s.positions_gained_lossed });
  }
  return out.sort((a, b) => a.lap - b.lap);
}

function mergeStops(fromPits: Stop[] | undefined, fromLive: Stop[]): Stop[] {
  if (!fromPits?.length) return fromLive;
  const last = fromPits.at(-1)!.lap;
  return [...fromPits, ...fromLive.filter((s) => s.lap > last)];
}

/** Green-flag laps that reflect pace: not the first lap after a restart, not in/out laps, not incident laps. */
function greenLaps(car: LapTimes['laps'][number], flags: Map<number, number>, stops: Stop[]): LapSample[] {
  const pitLaps = new Set(stops.flatMap((s) => [s.lap + 1, s.lap + 2]));
  const cand: LapSample[] = [];
  for (const l of car.Laps) {
    if (!l.LapTime || l.LapTime <= 0 || l.Lap < 2 || pitLaps.has(l.Lap)) continue;
    if (flags.get(l.Lap) !== GREEN || flags.get(l.Lap - 1) !== GREEN) continue;
    cand.push({ lap: l.Lap, time: l.LapTime });
  }
  if (!cand.length) return cand;
  const cap = median(cand.map((s) => s.time)) * 1.07;
  return cand.filter((s) => s.time <= cap);
}

function pace(green: LapSample[], n: number): number | null {
  const last = green.slice(-n);
  return last.length >= Math.min(3, n) ? mean(last.map((s) => s.time)) : null;
}

function stints(green: LapSample[], stops: Stop[], lastLap: number): Stint[] {
  const starts = stops.filter((s) => s.tires !== 0);
  const out: Stint[] = [];
  let from = 1;
  let tires: number | null = null;
  for (const b of [...starts, null]) {
    const to = b ? b.lap : lastLap;
    if (to >= from) {
      const g = green.filter((s) => s.lap >= from && s.lap <= to);
      out.push({
        from,
        to,
        tires,
        avg: g.length >= 3 ? mean(g.map((s) => s.time)) : null,
        falloff: g.length >= 8 ? slope(g) * 10 : null,
      });
    }
    if (b) {
      from = b.lap + 1;
      tires = b.tires;
    }
  }
  return out;
}

function restartLaps(flags: Map<number, number>): number[] {
  const out: number[] = [];
  for (const [lap, f] of flags) if (f === GREEN && isCaution(flags.get(lap - 1))) out.push(lap);
  return out.sort((a, b) => a - b);
}

export function analyzeRace(input: RaceInput): RaceInsights {
  const { laps, vehicles, inProgress } = input;
  const flags = new Map((laps?.flags ?? []).map((f) => [f.LapsCompleted, f.FlagState]));
  const pitStops = input.pits ? stopsFromPitFeed(input.pits) : new Map<string, Stop[]>();
  const byCarLive = new Map((vehicles ?? []).map((v) => [v.vehicle_number, v]));
  const restarts = restartLaps(flags);
  const passesKnown = (vehicles ?? []).some((v) => v.passes_made > 0);
  const cars = new Map<string, CarInsight>();

  const carNumbers = new Set([...(laps?.laps.map((c) => c.Number) ?? []), ...byCarLive.keys()]);
  for (const num of carNumbers) {
    const lapCar = laps?.laps.find((c) => c.Number === num);
    const v = byCarLive.get(num);
    const stops = mergeStops(pitStops.get(num), v ? stopsFromLive(v, !inProgress) : []);
    const green = lapCar ? greenLaps(lapCar, flags, stops) : [];
    const lastLap = v?.laps_completed ?? lapCar?.Laps.at(-1)?.Lap ?? 0;
    const runs = stints(green, stops, lastLap);

    const lastTireStop = [...stops].reverse().find((s) => s.tires !== 0);
    const tire = lastLap > 0 ? { laps: lastLap - (lastTireStop?.lap ?? 0), tires: lastTireStop?.tires ?? null, fromStart: !lastTireStop } : null;

    const long = runs.flatMap((r) => green.filter((s) => s.lap >= r.from + LONG_RUN_FROM && s.lap <= r.to));

    const pos = new Map(lapCar?.Laps.map((l) => [l.Lap, l.RunningPos]) ?? []);
    const gains: { lap: number; gain: number }[] = [];
    for (const r of restarts) {
      const before = pos.get(r - 1);
      const after = pos.get(r + 1);
      if (!before || !after || before > RESTART_FIELD || flags.get(r + 1) !== GREEN) continue;
      if (stops.some((s) => s.lap >= r - 1 && s.lap <= r + 1)) continue;
      gains.push({ lap: r, gain: before - after });
    }

    const name = v?.driver.full_name ?? lapCar?.FullName ?? '';
    cars.set(num, {
      car: num,
      name,
      tire,
      stops,
      green,
      pace: inProgress ? pace(green, 5) : null,
      fastest: false,
      battle: null,
      stints: runs,
      longRun: long.length >= 10 ? mean(long.map((s) => s.time)) : null,
      restarts: gains,
      // A running car that isn't on track is on pit road (checked against the 2026-10-09 Charlotte pit cycles).
      // The pit_stops list only gains an entry once the car has left pit road, so it can't tell.
      onPitRoad: inProgress && !!v && v.status === 1 && v.laps_completed > 0 && !v.is_on_track,
      dvp: inProgress && !!v?.is_on_dvp,
      stats: v && v.laps_completed > 0 ? v : null,
      passesKnown,
    });
  }

  // Fastest on track: best recent average among running cars. Under green, a car whose last green lap is
  // long gone (parked, in the garage) has a stale pace and is skipped.
  let paceRank: CarInsight[] = [];
  if (inProgress && vehicles) {
    paceRank = vehicles
      .filter((v) => v.status === 1)
      .map((v) => cars.get(v.vehicle_number))
      .filter((c): c is CarInsight => !!c && c.pace != null)
      .filter((c) => input.flag !== GREEN || (c.green.at(-1)?.lap ?? 0) >= (c.stats?.laps_completed ?? 0) - 8)
      .sort((a, b) => a.pace! - b.pace!);
    if (paceRank[0]) paceRank[0].fastest = true;

    // Battles: interval to the car ahead on the lead lap, and how fast it's shrinking (+ = closing).
    if (input.flag === GREEN) {
      const order = [...vehicles].sort((a, b) => a.running_position - b.running_position);
      for (let i = 1; i < order.length; i++) {
        const a = order[i - 1];
        const b = order[i];
        if (a.delta < 0 || b.delta < 0) continue;
        const gap = b.delta - a.delta;
        if (!(gap >= 0) || gap >= BATTLE_GAP) continue;
        const pa = pace(cars.get(a.vehicle_number)?.green ?? [], 3);
        const pb = pace(cars.get(b.vehicle_number)?.green ?? [], 3);
        const c = cars.get(b.vehicle_number);
        const rate = pa != null && pb != null ? pa - pb : null;
        const notable = a.running_position <= NOTABLE_FROM && ((rate ?? 0) > CLOSING || gap < SIDE_BY_SIDE);
        if (c) c.battle = { gap, rate, aheadPos: a.running_position, notable };
      }
    }
  }

  return { cars, cards: pickCards(cars, input, paceRank) };
}

function pickCards(cars: Map<string, CarInsight>, input: RaceInput, paceRank: CarInsight[]): InsightCard[] {
  const all = [...cars.values()];
  const cards: InsightCard[] = [];
  const title = (c: CarInsight) => shortName(c.car, c.name);

  if (input.inProgress) {
    const [best, next] = paceRank;
    if (best) {
      cards.push({
        id: 'fastest',
        label: 'Fastest right now',
        car: best.car,
        title: title(best),
        value: lapTime(best.pace),
        note: next ? `5-lap average · ${(next.pace! - best.pace!).toFixed(3)}s quicker than ${lastName(parseDriver(next.name).name)}` : '5-lap average',
      });
    }

    // Prefer a car closing in near the front; a fight for 18th matters less than one for 2nd.
    const battles = all.filter((c) => c.battle);
    const closing = (c: CarInsight) => (c.battle!.rate ?? 0) > CLOSING;
    const tiers = [
      battles.filter((c) => c.battle!.aheadPos <= 10 && closing(c)),
      battles.filter((c) => c.battle!.aheadPos <= RESTART_FIELD && closing(c)),
      battles.filter((c) => c.battle!.aheadPos <= 10),
    ];
    const pick = tiers.find((t) => t.length)?.sort((a, b) => a.battle!.gap - b.battle!.gap)[0];
    if (pick) {
      const b = pick.battle!;
      const ahead = all.find((c) => c.stats?.running_position === b.aheadPos);
      const on = ahead ? `on ${lastName(parseDriver(ahead.name).name)} ` : '';
      cards.push({
        id: 'battle',
        label: 'Closest battle',
        car: pick.car,
        title: title(pick),
        value: `${b.gap.toFixed(3)}s`,
        note: `${on}for P${b.aheadPos} · ${closing(pick) ? `closing ${b.rate!.toFixed(2)}s a lap` : 'holding steady'}`,
      });
    }
  }

  const longRun = all.filter((c) => c.longRun != null).sort((a, b) => a.longRun! - b.longRun!)[0];
  if (longRun) {
    cards.push({
      id: 'longrun',
      label: 'Best long-run pace',
      car: longRun.car,
      title: title(longRun),
      value: lapTime(longRun.longRun),
      note: `average lap ${LONG_RUN_FROM}+ laps into a run`,
    });
  }

  const restarter = all
    .filter((c) => c.restarts.length >= 2)
    .map((c) => ({ c, total: c.restarts.reduce((n, r) => n + r.gain, 0) }))
    .sort((a, b) => b.total - a.total)[0];
  if (restarter && restarter.total > 0) {
    cards.push({
      id: 'restart',
      label: 'Best restarter',
      car: restarter.c.car,
      title: title(restarter.c),
      value: `+${restarter.total}`,
      note: `positions over ${restarter.c.restarts.length} restarts`,
    });
  }

  if (!input.inProgress && input.results?.length) {
    const mover = input.results
      .filter((r) => r.finishing_position > 0 && r.starting_position > 0)
      .sort((a, b) => b.starting_position - b.finishing_position - (a.starting_position - a.finishing_position))[0];
    if (mover && mover.starting_position > mover.finishing_position) {
      cards.push({
        id: 'mover',
        label: 'Biggest mover',
        car: mover.car_number,
        title: shortName(mover.car_number, mover.driver_fullname),
        value: `+${mover.starting_position - mover.finishing_position}`,
        note: `started ${ordinal(mover.starting_position)}, finished ${ordinal(mover.finishing_position)}`,
      });
    }
  }
  return cards.slice(0, 4);
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}
