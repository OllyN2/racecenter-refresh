import type { LapTimes, LiveFeed } from './types';

type CarLaps = LapTimes['laps'][number];

/**
 * Lap-by-lap history for one race. lap-times.json is big (~600 KB by the end of a Cup race) and the CDN
 * doesn't compress it, so it's downloaded once; after that each live-feed poll appends the laps cars just
 * completed. Laps missed while the tab was hidden are left empty and `hasGaps` asks for a re-download.
 */
export class LapHistory {
  /** Bumped on every change; read it (via `data`) so derived values recompute. */
  #version = $state(0);
  #data: LapTimes | null = null;
  #byCar = new Map<string, CarLaps>();
  hasGaps = false;

  get data(): LapTimes | null {
    void this.#version;
    return this.#data;
  }

  /** Replaces everything with a fresh download (authoritative up to its last lap). */
  load(lt: LapTimes) {
    const copy: LapTimes = {
      laps: lt.laps.map((c) => ({ ...c, Laps: [...c.Laps] })),
      flags: [...lt.flags],
    };
    this.#data = copy;
    this.#byCar = new Map(copy.laps.map((c) => [c.Number, c]));
    this.hasGaps = false;
    this.#version++;
  }

  /** Appends laps completed since the last poll. Only meaningful for a live race of this history. */
  ingest(live: LiveFeed) {
    const data = this.#data;
    if (!data) return;
    let changed = false;
    let leaderLaps = 0;
    for (const v of live.vehicles) {
      leaderLaps = Math.max(leaderLaps, v.laps_completed);
      let car = this.#byCar.get(v.vehicle_number);
      if (!car) {
        car = {
          Number: v.vehicle_number,
          FullName: v.driver.full_name,
          Manufacturer: v.vehicle_manufacturer,
          RunningPos: v.running_position,
          NASCARDriverID: v.driver.driver_id,
          Laps: [],
        };
        data.laps.push(car);
        this.#byCar.set(car.Number, car);
      }
      const last = car.Laps.at(-1)?.Lap ?? -1;
      if (v.laps_completed <= last) continue;
      for (let lap = last + 1; lap < v.laps_completed; lap++) {
        car.Laps.push({ Lap: lap, LapTime: null, LapSpeed: null, RunningPos: 0 });
        this.hasGaps = true;
      }
      car.Laps.push({
        Lap: v.laps_completed,
        LapTime: v.last_lap_time || null,
        LapSpeed: v.last_lap_speed ? String(v.last_lap_speed) : null,
        RunningPos: v.running_position,
      });
      car.RunningPos = v.running_position;
      changed = true;
    }
    const lastFlag = data.flags.at(-1)?.LapsCompleted ?? -1;
    for (let lap = lastFlag + 1; lap <= leaderLaps; lap++) {
      data.flags.push({ LapsCompleted: lap, FlagState: live.flag_state });
      changed = true;
    }
    if (changed) this.#version++;
  }
}
