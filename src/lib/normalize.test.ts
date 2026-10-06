import { describe, expect, it } from 'vitest';
import liveFixture from './__fixtures__/live-feed-practice.json';
import weekendFixture from './__fixtures__/weekend-feed-final.json';
import lapTimesFixture from './__fixtures__/lap-times.json';
import lapNotesFixture from './__fixtures__/lap-notes.json';
import pointsFixture from './__fixtures__/points.json';
import { parseTimestamp } from './format';
import {
  hasFinalResults,
  isSessionActive,
  liveRows,
  noteGroups,
  pointsMatchEntries,
  positionSeries,
  resultRows,
  runRows,
  stageEnds,
} from './normalize';
import type { LapNotes, LapTimes, LiveFeed, PointsRow, WeekendFeed } from './types';

const live = liveFixture as unknown as LiveFeed;
const weekend = weekendFixture as unknown as WeekendFeed;

describe('live feed', () => {
  it('is active only while the timing clock is recent', () => {
    const t = parseTimestamp(live.time_of_day_os);
    expect(isSessionActive(live, t + 60_000)).toBe(true);
    expect(isSessionActive(live, t + 3600_000)).toBe(false);
  });

  it('builds ordered rows with a leader and de-duplicated pit stops', () => {
    const rows = liveRows(live);
    expect(rows.map((r) => r.pos)).toEqual([1, 2, 3, 4]);
    expect(rows[0].gap).toBe('Leader');
    expect(rows[1].gap).toMatch(/^\+\d+\.\d{3}$/);
    expect(rows[0].pits).toBe(2);
    expect(rows[1].driver.chase).toBe(true);
  });
});

describe('weekend feed', () => {
  const race = weekend.weekend_race[0];

  it('orders final results with non-starters last', () => {
    expect(hasFinalResults(race)).toBe(true);
    const rows = resultRows(race);
    expect(rows[0]).toMatchObject({ pos: 1, gap: 'Winner', status: 'Running' });
    expect(rows[1].gap).toBe('+0.780');
    expect(rows.at(-1)).toMatchObject({ pos: null, status: 'DNQ' });
  });

  it('shows gaps to the fastest lap for practice and qualifying runs', () => {
    const rows = runRows(weekend.weekend_runs[0]);
    expect(rows[0].gap).toBe('Fastest');
    expect(rows[1].gap).toBe('+0.103');
  });

  it('computes cumulative stage ends', () => {
    expect(stageEnds({ stage_1_laps: 45, stage_2_laps: 45, stage_3_laps: 111, stage_4_laps: 0 })).toEqual([45, 90, 201]);
  });
});

describe('lap data', () => {
  it('groups lap notes newest first', () => {
    const groups = noteGroups(lapNotesFixture as LapNotes);
    expect(groups[0].lap).toBeGreaterThan(groups.at(-1)!.lap);
    expect(groups.at(-1)!.notes[0].Note).toContain('Practice');
  });

  it('builds per-driver position series', () => {
    const { series, maxLap } = positionSeries(lapTimesFixture as LapTimes);
    expect(maxLap).toBe(7);
    expect(series[0].finalPos).toBeLessThanOrEqual(series[1].finalPos);
    expect(series[0].positions[1]).toBeTypeOf('number');
  });
});

describe('points sanity check', () => {
  const points = pointsFixture as PointsRow[];
  it('accepts points whose drivers are entered in the race', () => {
    expect(pointsMatchEntries(points, new Set(points.map((p) => p.driver_id)))).toBe(true);
  });
  it('rejects points from another series', () => {
    expect(pointsMatchEntries(points, new Set([1, 2, 3]))).toBe(false);
  });
});
