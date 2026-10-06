<script lang="ts">
  import { feeds } from '../lib/api';
  import { sessionLabel } from '../lib/format';
  import { hasFinalResults, liveRows, resultRows, runRows, stageEnds, type BoardSource } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import { href, TABS, type Tab } from '../lib/route.svelte';
  import type { LiveFeed, RaceSummary, WeekendFeed } from '../lib/types';
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
    liveUpdatedAt,
    tab,
  }: { race: RaceSummary; live?: LiveFeed; liveUpdatedAt: Date | null; tab: Tab } = $props();

  const isLive = $derived(!!live);
  const year = $derived(race.race_season);

  const weekend = useFeed<WeekendFeed>(
    () => feeds.weekend(year, race.series_id, race.race_id),
    () => (isLive ? 30_000 : null),
  );
  const weekendRace = $derived(weekend.feed.data?.weekend_race[0]);

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
  {#each TABS as t (t.id)}
    <a href={href(race.series_id, race.race_id, t.id)} aria-current={t.id === tab ? 'page' : undefined}>{t.label}</a>
  {/each}
</nav>

<div class="panel">
  {#if tab === 'leaderboard'}
    {#if sources.length}
      <Leaderboard {sources} series={race.series_id} />
    {:else}
      <div class="card">
        <FeedStatus state={weekend.feed.state} unavailable="The entry list hasn't been published yet." />
        {#if weekend.feed.state.status === 'ok'}<p class="empty">The entry list hasn't been published yet.</p>{/if}
      </div>
    {/if}
  {:else if tab === 'notes'}
    <LapNotes {year} series={race.series_id} raceId={race.race_id} {isLive} />
  {:else if tab === 'pits'}
    <PitStops series={race.series_id} raceId={race.race_id} {isLive} />
  {:else if tab === 'chart'}
    <PositionChart series={race.series_id} raceId={race.race_id} {isLive} stageEnds={stageEnds(race)} />
  {:else if tab === 'stages'}
    <StagesPoints series={race.series_id} raceId={race.race_id} {isLive} {weekendRace} />
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
