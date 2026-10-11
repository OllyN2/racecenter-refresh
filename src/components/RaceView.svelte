<script lang="ts">
  import { untrack } from 'svelte';
  import { feeds } from '../lib/api';
  import { parseDriver, sessionLabel } from '../lib/format';
  import { analyzeRace } from '../lib/insights';
  import { LapHistory } from '../lib/laps.svelte';
  import {
    cautionsFromFlags,
    hasFinalResults,
    liveRows,
    pointsMatchEntries,
    raceStageEnds,
    raceStartMs,
    resultRows,
    runRows,
    type BoardSource,
  } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import { href, TABS, type Tab } from '../lib/route.svelte';
  import { telemetry } from '../lib/telemetry.svelte';
  import type {
    AltLeaderboards,
    LapTimes,
    LiveFeed,
    LiveFlag,
    PitStop,
    PointsRow,
    RaceSummary,
    WeekendFeed,
    Weather,
  } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';
  import Leaderboard from './Leaderboard.svelte';
  import LapNotes from './LapNotes.svelte';
  import PitStops from './PitStops.svelte';
  import PositionChart from './PositionChart.svelte';
  import RaceHeader from './RaceHeader.svelte';
  import StagesPoints from './StagesPoints.svelte';

  let {
    race,
    live,
    snapshot,
    liveUpdatedAt,
    tab,
  }: {
    race: RaceSummary;
    live?: LiveFeed;
    /** The live feed for this race even after it ends (holds loop data like passes until the next session). */
    snapshot?: LiveFeed;
    liveUpdatedAt: Date | null;
    tab: Tab;
  } = $props();

  function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const rad = Math.PI / 180;
    const a =
      Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }

  const isLive = $derived(!!live);
  const year = $derived(race.race_season);

  const weekend = useFeed<WeekendFeed>(
    () => feeds.weekend(year, race.series_id, race.race_id),
    () => (isLive ? 30_000 : null),
  );
  const weekendRace = $derived(weekend.feed.data?.weekend_race[0]);

  const raceLive = $derived(live?.run_type === 3 ? live : undefined);
  const raceFeed = $derived(raceLive ?? (snapshot?.run_type === 3 ? snapshot : undefined));
  // Live GPS and telemetry only stream during the race.
  const liveRaceId = $derived(raceLive?.race_id ?? null);
  $effect(() => telemetry.setRace(liveRaceId));

  // Cautions for the header's lap bar and the Stages tab. The weekend feed only lists them after the race, so
  // until it does they come from live-flag-data (<1 KB).
  const weekendCautions = $derived(weekendRace?.caution_segments ?? []);
  const flagFeed = useFeed<LiveFlag[]>(
    () =>
      raceLive || (hasFinalResults(weekendRace) && !weekendCautions.length) ? feeds.flags(race.series_id, race.race_id) : null,
    () => (raceLive ? 15_000 : null),
  );
  // Car number → driver name (entry list, then the live feed), for searching notes that only use names.
  const drivers = $derived(
    new Map([
      ...(weekendRace?.results ?? []).map((r) => [r.car_number, parseDriver(r.driver_fullname).name] as const),
      ...(raceFeed?.vehicles ?? []).map((v) => [v.vehicle_number, parseDriver(v.driver.full_name).name] as const),
    ]),
  );

  const cautions = $derived(
    weekendCautions.length ? weekendCautions : cautionsFromFlags(flagFeed.feed.data ?? [], raceLive?.lap_number ?? 0),
  );

  // This race's driver points: the Stages tab's standings, and who's in the Chase for finished races (results
  // don't say; live rows get it from the live feed, so a running race's leaderboard doesn't need this file).
  let wantPoints = $state(false);
  $effect(() => {
    if (tab === 'stages' || (tab === 'leaderboard' && !raceLive && hasFinalResults(weekendRace))) wantPoints = true;
  });
  const pointsFeed = useFeed<PointsRow[]>(
    () => (wantPoints ? feeds.points(race.series_id, race.race_id) : null),
    () => (raceLive && tab === 'stages' ? 30_000 : null),
  );
  // Before a race the per-race file can still hold another series' standings; only trust it if it matches.
  const points = $derived.by(() => {
    const rows = pointsFeed.feed.data;
    const entered = new Set(weekendRace?.results.map((r) => r.driver_id) ?? []);
    return rows && pointsMatchEntries(rows, entered) ? rows : null;
  });
  const chaseIds = $derived(new Set((points ?? []).filter((p) => p.is_in_chase).map((p) => p.driver_id)));

  // Weather (35 KB) during a race, or for one starting within two days (the file forecasts today and tomorrow).
  // It's for whatever track NASCAR is at this weekend, so it's only shown within 30 km of this race's track.
  const raceStart = $derived(raceStartMs(race));
  const weatherWanted = $derived(
    !!raceLive || (!hasFinalResults(weekendRace) && raceStart > Date.now() - 6 * 3600_000 && raceStart < Date.now() + 48 * 3600_000),
  );
  const trackFile = useFeed<{ center: [number, number] | null }>(
    () => (weatherWanted ? `./tracks/${race.track_id}.json` : null),
    () => null,
  );
  const weatherFeed = useFeed<Weather>(
    () => (weatherWanted ? feeds.weather() : null),
    () => (raceLive ? 600_000 : null),
  );
  const weather = $derived.by(() => {
    const w = weatherFeed.feed.data;
    const c = trackFile.feed.data?.center;
    return w && c && distanceKm(w.location.lat, w.location.lon, c[0], c[1]) < 30 ? w : null;
  });

  // NASCAR's alternate leaderboards (12 KB) for the running race: official 10-lap averages, fastest laps and
  // gainers since the restart. One global file with no race id, so it's only trusted when its cars are this
  // field and its fastest lap isn't from beyond the current lap.
  const altFeed = useFeed<AltLeaderboards>(
    () => (raceLive ? feeds.altLeaderboards() : null),
    () => (raceLive ? 30_000 : null),
  );
  const official = $derived.by(() => {
    const a = altFeed.feed.data;
    if (!a || !raceLive) return null;
    const field = new Set(raceLive.vehicles.map((v) => v.vehicle_number));
    const list = a.AvgLaptimeLast10 ?? [];
    const ours = list.length ? list.filter((x) => field.has(x.CarNum)).length / list.length : 0;
    const fresh = (a.FastestLaps ?? []).every((f) => f.LapsCompleted <= raceLive.lap_number + 1);
    return ours >= 0.8 && fresh ? a : null;
  });

  // The race's fastest lap earns a bonus point. While running: the quickest best lap in the live feed (already
  // polled; matched NASCAR's own flag all night at Charlotte). Afterwards: that flag, from the race's points file.
  const fastestLap = $derived.by(() => {
    if (raceLive) {
      const o = [...(official?.FastestLaps ?? [])].sort((a, b) => a.LastLapTime - b.LastLapTime)[0];
      if (o) return { car: o.Number, time: o.LastLapTime, lap: o.LapsCompleted };
      const v = raceLive.vehicles.filter((x) => x.best_lap_time > 0).sort((a, b) => a.best_lap_time - b.best_lap_time)[0];
      return v ? { car: v.vehicle_number, time: v.best_lap_time, lap: v.best_lap || null } : null;
    }
    const p = points?.find((x) => x.is_fastest_lap_point);
    if (!p) return null;
    const v = raceFeed?.vehicles.find((x) => x.vehicle_number === p.car_number);
    if (v?.best_lap_time) return { car: p.car_number, time: v.best_lap_time, lap: v.best_lap || null };
    const best = history.data?.laps
      .find((c) => c.Number === p.car_number)
      ?.Laps.reduce<{ Lap: number; LapTime: number } | null>(
        (m, l) => (l.LapTime && l.LapTime > 0 && (!m || l.LapTime < m.LapTime) ? { Lap: l.Lap, LapTime: l.LapTime } : m),
        null,
      );
    return { car: p.car_number, time: best?.LapTime ?? null, lap: best?.Lap ?? null };
  });

  // Lap times and pit data are shared by the leaderboard, Positions and Pit stops tabs. They start loading on
  // the first visit to a tab that needs them and are kept for the rest of the visit.
  let wantLaps = $state(false);
  let wantPits = $state(false);
  $effect(() => {
    if (tab === 'leaderboard' || tab === 'chart') wantLaps = true;
    if (tab === 'leaderboard' || tab === 'pits' || tab === 'track') wantPits = true;
  });

  const pitFeed = useFeed<PitStop[]>(
    () => (wantPits ? feeds.pits(race.series_id, race.race_id) : null),
    () => (raceLive ? 15_000 : null),
  );

  // Downloaded once, then extended lap by lap from the live feed (see LapHistory).
  const lapFeed = useFeed<LapTimes>(
    () => (wantLaps ? feeds.lapTimes(race.series_id, race.race_id) : null),
    () => null,
  );
  const history = new LapHistory();
  $effect(() => {
    const data = lapFeed.feed.data;
    if (!data) return;
    untrack(() => {
      history.load(data);
      if (raceLive) history.ingest(raceLive);
    });
  });
  $effect(() => {
    const l = raceLive;
    if (l) untrack(() => history.ingest(l));
  });
  let lastRefill = 0;
  $effect(() => {
    void history.data;
    if (!raceLive || !history.hasGaps || Date.now() - lastRefill < 120_000) return;
    lastRefill = Date.now();
    untrack(() => lapFeed.feed.refresh());
  });

  const insights = $derived(
    raceLive || hasFinalResults(weekendRace)
      ? analyzeRace({
          laps: history.data,
          pits: pitFeed.feed.data,
          vehicles: raceFeed?.vehicles,
          inProgress: !!raceLive && raceLive.flag_state !== 4,
          flag: raceLive?.flag_state ?? null,
          results: weekendRace?.results,
          official,
        })
      : null,
  );

  const sources = $derived.by(() => {
    const out: BoardSource[] = [];
    if (live) {
      out.push({
        id: 'live',
        label: sessionLabel(live.run_name) || 'Live',
        mode: live.run_type === 3 ? 'race' : 'timed',
        rows: liveRows(live),
        live: true,
      });
    }
    if (weekendRace && hasFinalResults(weekendRace) && live?.run_type !== 3) {
      out.push({ id: 'race', label: 'Race results', mode: 'final', rows: resultRows(weekendRace) });
    }
    const runs = [...(weekend.feed.data?.weekend_runs ?? [])].filter((r) => r.results.length).reverse();
    for (const [i, run] of runs.entries()) {
      out.push({ id: `run-${i}-${run.run_name}`, label: sessionLabel(run.run_name), mode: 'timed', rows: runRows(run) });
    }
    if (!out.length && weekendRace?.results.length) {
      out.push({ id: 'entry', label: 'Entry list', mode: 'entry', rows: resultRows(weekendRace) });
    }
    return out;
  });
</script>

<RaceHeader {race} {weekendRace} {live} {cautions} {weather} updatedAt={liveUpdatedAt} />

<nav class="tabs" aria-label="Race views">
  {#each TABS.filter((t) => t.id !== 'track' || raceLive || tab === 'track') as t (t.id)}
    <a href={href(race.series_id, race.race_id, t.id)} aria-current={t.id === tab ? 'page' : undefined}>{t.label}</a>
  {/each}
</nav>

<div class="panel">
  {#if tab === 'leaderboard'}
    {#if sources.length}
      <Leaderboard {sources} series={race.series_id} raceId={race.race_id} {insights} {chaseIds} {fastestLap} />
    {:else}
      <div class="card">
        <FeedStatus state={weekend.feed.state} unavailable="The entry list hasn't been published yet." />
        {#if weekend.feed.state.status === 'ok'}<p class="empty">The entry list hasn't been published yet.</p>{/if}
      </div>
    {/if}
  {:else if tab === 'track'}
    {#if raceLive}
      <!-- Only during a live race, so its code (and the GPS fitting) loads when the tab is opened. -->
      {#await import('./TrackMap.svelte')}
        <div class="card"><p class="empty">Loading track…</p></div>
      {:then { default: TrackMap }}
        <TrackMap live={raceLive} {insights} />
      {/await}
    {:else}
      <div class="card"><p class="empty">The track map runs during a live race.</p></div>
    {/if}
  {:else if tab === 'notes'}
    <LapNotes {year} series={race.series_id} raceId={race.race_id} {isLive} startMs={raceStartMs(race)} {drivers} />
  {:else if tab === 'pits'}
    <PitStops series={race.series_id} feedState={pitFeed.feed.state} />
  {:else if tab === 'chart'}
    <PositionChart laps={history.data} feedState={lapFeed.feed.state} stageEnds={raceStageEnds(race, raceLive?.laps_in_race ?? (race.actual_laps || race.scheduled_laps))} />
  {:else if tab === 'stages'}
    <StagesPoints
      series={race.series_id}
      raceId={race.race_id}
      {year}
      {isLive}
      {weekendRace}
      vehicles={raceFeed?.vehicles}
      {cautions}
      {points}
      pointsState={pointsFeed.feed.state}
    />
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    margin: 16px 0 12px;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--grid);
  }
  .tabs a {
    padding: 10px 12px;
    color: var(--ink-2);
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .tabs a:hover {
    color: var(--ink);
  }
  .tabs a[aria-current='page'] {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
</style>
