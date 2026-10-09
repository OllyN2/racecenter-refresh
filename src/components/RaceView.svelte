<script lang="ts">
  import { untrack } from 'svelte';
  import { feeds } from '../lib/api';
  import { sessionLabel } from '../lib/format';
  import { analyzeRace } from '../lib/insights';
  import { LapHistory } from '../lib/laps.svelte';
  import { hasFinalResults, liveRows, raceStageEnds, raceStartMs, resultRows, runRows, type BoardSource } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import { href, TABS, type Tab } from '../lib/route.svelte';
  import type { LapTimes, LiveFeed, PitStop, RaceSummary, WeekendFeed } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';
  import Leaderboard from './Leaderboard.svelte';
  import LapNotes from './LapNotes.svelte';
  import PitStops from './PitStops.svelte';
  import PositionChart from './PositionChart.svelte';
  import RaceHeader from './RaceHeader.svelte';
  import StagesPoints from './StagesPoints.svelte';
  import TrackMap from './TrackMap.svelte';

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

  const isLive = $derived(!!live);
  const year = $derived(race.race_season);

  const weekend = useFeed<WeekendFeed>(
    () => feeds.weekend(year, race.series_id, race.race_id),
    () => (isLive ? 30_000 : null),
  );
  const weekendRace = $derived(weekend.feed.data?.weekend_race[0]);

  const raceLive = $derived(live?.run_type === 3 ? live : undefined);
  const raceFeed = $derived(raceLive ?? (snapshot?.run_type === 3 ? snapshot : undefined));

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

<RaceHeader {race} {weekendRace} {live} updatedAt={liveUpdatedAt} />

<nav class="tabs" aria-label="Race views">
  {#each TABS.filter((t) => t.id !== 'track' || raceLive || tab === 'track') as t (t.id)}
    <a href={href(race.series_id, race.race_id, t.id)} aria-current={t.id === tab ? 'page' : undefined}>{t.label}</a>
  {/each}
</nav>

<div class="panel">
  {#if tab === 'leaderboard'}
    {#if sources.length}
      <Leaderboard {sources} series={race.series_id} raceId={race.race_id} {insights} />
    {:else}
      <div class="card">
        <FeedStatus state={weekend.feed.state} unavailable="The entry list hasn't been published yet." />
        {#if weekend.feed.state.status === 'ok'}<p class="empty">The entry list hasn't been published yet.</p>{/if}
      </div>
    {/if}
  {:else if tab === 'track'}
    {#if raceLive}
      <TrackMap live={raceLive} {insights} />
    {:else}
      <div class="card"><p class="empty">The track map runs during a live race.</p></div>
    {/if}
  {:else if tab === 'notes'}
    <LapNotes {year} series={race.series_id} raceId={race.race_id} {isLive} startMs={raceStartMs(race)} />
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
      currentLap={raceLive?.lap_number ?? 0}
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
