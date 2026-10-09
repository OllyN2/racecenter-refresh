import { gap, parseDriver, parseTimestamp, parseUtc, type DriverName } from './format';
import type {
  ClipFeed,
  LapNote,
  LapNotes,
  LapTimes,
  LiveFeed,
  LiveVehicle,
  PitStop,
  PointsRow,
  RaceSummary,
  WeekendRace,
  WeekendRun,
} from './types';

export type BoardMode = 'race' | 'timed' | 'final' | 'entry';

export interface LeaderboardRow {
  key: string;
  pos: number | null;
  start: number | null;
  car: string;
  driverId: number;
  driver: DriverName;
  make: string;
  sponsor: string;
  team: string;
  gap: string;
  lastLap: number | null;
  bestLap: number | null;
  bestSpeed: number | null;
  laps: number | null;
  lapsLed: number | null;
  pits: number | null;
  status: string;
  onTrack: boolean | null;
  points: number | null;
}

export interface BoardSource {
  id: string;
  label: string;
  mode: BoardMode;
  rows: LeaderboardRow[];
  live?: boolean;
}

const LIVE_STALE_MS = 15 * 60_000;

const FLAG_INACTIVE = 9;

/**
 * The live feed keeps serving (and re-stamping) the last session for days after it ends,
 * so a session counts as live only while it's ticking and not flagged inactive.
 */
export function isSessionActive(live: LiveFeed, now = Date.now()): boolean {
  const t = parseTimestamp(live.time_of_day_os);
  return Number.isFinite(t) && now - t < LIVE_STALE_MS && live.flag_state !== FLAG_INACTIVE;
}

/** Ranges start at lap 0 for whoever led the field to green; only completed laps count as led. */
export function lapsLedCount(ranges: LiveVehicle['laps_led']): number {
  return (ranges ?? []).reduce((n, r) => n + Math.max(0, r.end_lap - Math.max(r.start_lap, 1) + 1), 0);
}

/** The feed repeats pit stop entries; count distinct pit-in times. */
export function pitCount(stops: LiveVehicle['pit_stops']): number {
  return new Set((stops ?? []).map((s) => s.pit_in_elapsed_time)).size;
}

const blank = {
  sponsor: '',
  team: '',
  gap: '—',
  lastLap: null,
  bestLap: null,
  bestSpeed: null,
  laps: null,
  lapsLed: null,
  pits: null,
  status: '',
  onTrack: null,
  points: null,
  start: null,
} satisfies Partial<LeaderboardRow>;

export function liveRows(live: LiveFeed): LeaderboardRow[] {
  return [...live.vehicles]
    .sort((a, b) => a.running_position - b.running_position)
    .map((v, i) => ({
      ...blank,
      key: String(v.driver.driver_id || v.vehicle_number),
      pos: v.running_position,
      start: v.starting_position || null,
      car: v.vehicle_number,
      driverId: v.driver.driver_id,
      driver: parseDriver(v.driver.full_name),
      make: v.vehicle_manufacturer,
      sponsor: v.sponsor_name,
      // Before a car completes a lap the feed reports a 0 delta for everyone.
      gap: i === 0 ? gap(v.delta, true) : v.laps_completed > 0 ? gap(v.delta, false) : '—',
      lastLap: v.last_lap_time || null,
      bestLap: v.best_lap_time || null,
      bestSpeed: v.best_lap_speed || null,
      laps: v.laps_completed,
      lapsLed: lapsLedCount(v.laps_led),
      pits: pitCount(v.pit_stops),
      onTrack: v.is_on_track,
    }));
}

/** Pit-feed rows that are race stops: lap 0 rows are every car leaving pit road before the start, and rows under the checkered flag are post-race. */
export function isRaceStop(p: PitStop): boolean {
  return p.lap_count > 0 && p.pit_in_flag_status !== 4;
}

/** Leader timeline from the live feed, for when the weekend feed hasn't filled in race_leaders yet. */
export function leadersFromLive(vehicles: LiveVehicle[]): { start_lap: number; end_lap: number; car_number: string }[] {
  return vehicles
    .flatMap((v) => (v.laps_led ?? []).map((r) => ({ start_lap: Math.max(r.start_lap, 1), end_lap: r.end_lap, car_number: v.vehicle_number })))
    .filter((r) => r.end_lap >= r.start_lap)
    .sort((a, b) => a.start_lap - b.start_lap);
}

export function hasFinalResults(race: WeekendRace | undefined): boolean {
  return !!race?.results.some((r) => r.finishing_position > 0);
}

export function resultRows(race: WeekendRace): LeaderboardRow[] {
  const finished = hasFinalResults(race);
  return [...race.results]
    .sort((a, b) => (a.finishing_position || 999) - (b.finishing_position || 999) || a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))
    .map((r) => {
      let g = '—';
      if (r.finishing_position === 1) g = 'Winner';
      else if (r.diff_laps > 0) g = `−${r.diff_laps} ${r.diff_laps === 1 ? 'lap' : 'laps'}`;
      else if (r.diff_time > 0) g = `+${(r.diff_time / 1000).toFixed(3)}`;
      return {
        ...blank,
        key: String(r.driver_id || r.car_number),
        pos: r.finishing_position || null,
        start: r.starting_position || null,
        car: r.car_number,
        driverId: r.driver_id,
        driver: parseDriver(r.driver_fullname),
        make: r.car_make,
        sponsor: r.sponsor,
        team: r.team_name,
        gap: g,
        laps: finished ? r.laps_completed : null,
        lapsLed: finished ? r.laps_led : null,
        status: finished ? r.finishing_status || 'DNQ' : '',
        points: finished ? r.points_earned : null,
      };
    });
}

export function runRows(run: WeekendRun): LeaderboardRow[] {
  return [...run.results]
    .sort((a, b) => (a.finishing_position || 999) - (b.finishing_position || 999))
    .map((r, i) => ({
      ...blank,
      key: String(r.driver_id || r.car_number),
      pos: r.finishing_position || null,
      car: r.car_number,
      driverId: r.driver_id,
      driver: parseDriver(r.driver_name),
      make: r.manufacturer,
      gap: i === 0 ? 'Fastest' : r.best_lap_time > 0 ? `+${Math.abs(r.delta_leader).toFixed(3)}` : '—',
      bestLap: r.best_lap_time || null,
      bestSpeed: r.best_lap_speed || null,
      laps: r.laps_completed,
    }));
}

/** Cumulative lap at which each stage ends, e.g. [45, 90, 201]. */
export function stageEnds(race: Pick<RaceSummary, 'stage_1_laps' | 'stage_2_laps' | 'stage_3_laps' | 'stage_4_laps'>): number[] {
  const lens = [race.stage_1_laps, race.stage_2_laps, race.stage_3_laps, race.stage_4_laps ?? 0].filter((n) => n > 0);
  let sum = 0;
  return lens.map((n) => (sum += n));
}

/**
 * Stage ends for a race of `totalLaps`. The schedule can disagree with the live feed (Charlotte's 2026 truck race
 * was listed at 167 laps with a 107-lap final stage but ran 134), so the final stage always ends at `totalLaps`.
 */
export function raceStageEnds(race: Parameters<typeof stageEnds>[0], totalLaps: number): number[] {
  const ends = stageEnds(race);
  if (!totalLaps) return ends;
  return [...ends.slice(0, -1).filter((e) => e < totalLaps), totalLaps];
}

export function raceStartMs(race: RaceSummary): number {
  const ev = race.schedule?.find((e) => e.run_type === 3);
  return parseUtc(ev?.start_time_utc);
}

/** The race to open by default: the live one, else the next upcoming, else the most recent. */
export function defaultRace(races: RaceSummary[], live: LiveFeed | undefined, now = Date.now()): RaceSummary | undefined {
  if (live && isSessionActive(live, now)) {
    const r = races.find((x) => x.race_id === live.race_id);
    if (r) return r;
  }
  const sorted = [...races].sort((a, b) => raceStartMs(a) - raceStartMs(b));
  const upcoming = sorted.find((r) => raceStartMs(r) + 4 * 3600_000 > now);
  return upcoming ?? sorted.at(-1);
}

export interface LapNoteGroup {
  lap: number;
  notes: LapNote[];
}

export function noteGroups(notes: LapNotes): LapNoteGroup[] {
  return Object.entries(notes.laps ?? {})
    .map(([lap, list]) => ({ lap: Number(lap), notes: list }))
    .filter((g) => Number.isFinite(g.lap) && g.notes.length)
    .sort((a, b) => b.lap - a.lap);
}

export interface Clip {
  id: number;
  title: string;
  seconds: number;
  src: string;
}

/**
 * Highlight clips keyed by the lap they show (from their "lap N" tag). The feed for an upcoming race is pre-filled
 * with the previous race's clips, so anything published before this race started is ignored.
 */
export function clipsByLap(feed: ClipFeed | undefined, notBefore: number): Map<number, Clip[]> {
  const out = new Map<number, Clip[]>();
  for (const c of Object.values(feed?.tracks ?? {}).flat()) {
    if (c.type !== 'snap' || c.expired || c.status !== 'active' || !(c.created_at >= notBefore)) continue;
    const lap = Number(c.tags?.map((t) => /^lap (\d+)$/i.exec(t.trim())?.[1]).find(Boolean));
    const files = (c.downloads ?? []).filter((d) => d.url.endsWith('.mp4') && d.resolution !== '0x0');
    // "-high" is 720p at ~700 kbps (about 6 MB a minute), the same size as the 270p "-mid" file despite its label;
    // "-hd" is 1080p at ten times the size.
    const file = files.find((d) => d.url.endsWith('-high.mp4')) ?? files.sort((a, b) => Number(a.bitrate) - Number(b.bitrate))[0];
    if (!Number.isInteger(lap) || !file) continue;
    const list = out.get(lap) ?? [];
    list.push({ id: c.id, title: c.title, seconds: c.video_duration, src: file.url });
    out.set(lap, list);
  }
  return out;
}

export interface PositionSeries {
  car: string;
  driverId: number;
  driver: DriverName;
  make: string;
  finalPos: number;
  /** positions[lap] = running position after that lap. */
  positions: (number | null)[];
}

export function positionSeries(lt: LapTimes): { series: PositionSeries[]; maxLap: number; cautionLaps: Set<number> } {
  let maxLap = 0;
  const series = lt.laps.map((d) => {
    const positions: (number | null)[] = [];
    for (const l of d.Laps) {
      positions[l.Lap] = l.RunningPos > 0 ? l.RunningPos : null;
      if (l.Lap > maxLap) maxLap = l.Lap;
    }
    return {
      car: d.Number,
      driverId: d.NASCARDriverID,
      driver: parseDriver(d.FullName),
      make: d.Manufacturer,
      finalPos: d.RunningPos,
      positions,
    };
  });
  series.sort((a, b) => a.finalPos - b.finalPos);
  const cautionLaps = new Set(lt.flags.filter((f) => f.FlagState === 2 || f.FlagState === 3).map((f) => f.LapsCompleted));
  return { series, maxLap, cautionLaps };
}

/**
 * Before a race starts the per-race points URL can still hold another series' standings.
 * Only trust it when most of its drivers are entered in this race.
 */
export function pointsMatchEntries(points: PointsRow[], entryDriverIds: Set<number>): boolean {
  if (!points.length) return false;
  if (!entryDriverIds.size) return true;
  const top = points.slice(0, 20);
  const hits = top.filter((p) => entryDriverIds.has(p.driver_id)).length;
  return hits / top.length >= 0.5;
}
