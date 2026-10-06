<script lang="ts">
  import { feeds } from '../lib/api';
  import { parseDriver } from '../lib/format';
  import { pointsMatchEntries } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import type { PointsRow, WeekendRace } from '../lib/types';
  import CarNumber from './CarNumber.svelte';
  import DriverName from './DriverName.svelte';
  import FeedStatus from './FeedStatus.svelte';

  let {
    series,
    raceId,
    isLive,
    weekendRace,
  }: { series: number; raceId: number; isLive: boolean; weekendRace?: WeekendRace } = $props();

  const pointsFeed = useFeed<PointsRow[]>(
    () => feeds.points(series, raceId),
    () => (isLive ? 30_000 : null),
  );

  const entryIds = $derived(new Set(weekendRace?.results.map((r) => r.driver_id) ?? []));
  const points = $derived.by(() => {
    const rows = pointsFeed.feed.data;
    if (!rows || !pointsMatchEntries(rows, entryIds)) return null;
    return [...rows].sort((a, b) => a.points_position - b.points_position);
  });
  const chaseCut = $derived(points ? points.findIndex((p) => !p.is_in_chase) : -1);
  const hasChase = $derived(!!points?.some((p) => p.is_in_chase));

  const nameByCar = $derived(new Map(weekendRace?.results.map((r) => [r.car_number, parseDriver(r.driver_fullname).name]) ?? []));
  const stages = $derived(weekendRace?.stage_results ?? []);
  const cautions = $derived(weekendRace?.caution_segments ?? []);
  const leaders = $derived(weekendRace?.race_leaders ?? []);
</script>

<div class="layout">
  <section class="card">
    <h2>Stage results</h2>
    {#if stages.length}
      <div class="stages">
        {#each stages as st (st.stage_number)}
          <div class="stage">
            <h3>Stage {st.stage_number}</h3>
            <ol>
              {#each st.results.slice(0, 10) as r (r.driver_id)}
                <li>
                  <span class="pos num">{r.finishing_position}</span>
                  <span class="car"><CarNumber {series} number={r.car_number} height={20} /></span>
                  <span class="nm">{parseDriver(r.driver_fullname).name}</span>
                  <span class="pts num">{r.stage_points} pts</span>
                </li>
              {/each}
            </ol>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">Stage results appear as each stage ends.</p>
    {/if}
  </section>

  <section class="card">
    <h2>Cautions</h2>
    {#if cautions.length}
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Laps</th><th>Reason</th><th class="wide">Free pass</th></tr></thead>
          <tbody>
            {#each cautions as c (c.start_lap)}
              <tr>
                <td class="num">{c.start_lap}–{c.end_lap}</td>
                <td class="wrap">{c.reason}{c.comment ? ` · ${c.comment}` : ''}</td>
                <td class="wide">{c.beneficiary_car_number ? `#${c.beneficiary_car_number}` : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">No cautions recorded.</p>
    {/if}

    <h2 class="sub">Leaders</h2>
    {#if leaders.length}
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Laps</th><th>Car</th><th>Driver</th><th class="r">Laps led</th></tr></thead>
          <tbody>
            {#each leaders as l, i (`${l.start_lap}-${i}`)}
              <tr>
                <td class="num">{l.start_lap}–{l.end_lap}</td>
                <td class="car"><CarNumber {series} number={l.car_number} height={20} /></td>
                <td>{nameByCar.get(l.car_number) ?? ''}</td>
                <td class="r">{l.end_lap - l.start_lap + 1}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">Lead changes appear once the race is under way.</p>
    {/if}
  </section>

  <section class="card full">
    <h2>Points standings {#if isLive}<span class="badge">Live</span>{/if}</h2>
    {#if points}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th class="r">Pos</th>
              <th class="r">#</th>
              <th>Driver</th>
              <th class="r">Points</th>
              <th class="r">Behind</th>
              <th class="r wide">This race</th>
              <th class="r wide">Stage pts</th>
              <th class="r wide">Wins</th>
              <th class="r wide">Top 5</th>
            </tr>
          </thead>
          <tbody>
            {#each points as p, i (p.driver_id)}
              <tr class:cut={hasChase && i === chaseCut}>
                <td class="r pos">{p.points_position}</td>
                <td class="car"><CarNumber {series} number={p.car_number} /></td>
                <td><DriverName driver={{ ...parseDriver(`${p.first_name} ${p.last_name}`), chase: p.is_in_chase, rookie: p.is_rookie }} /></td>
                <td class="r strong">{p.points}</td>
                <td class="r">{p.delta_leader ? p.delta_leader : '—'}</td>
                <td class="r wide">{p.points_earned_this_race || '–'}</td>
                <td class="r wide">{p.stage_1_points + p.stage_2_points + p.stage_3_points || '–'}</td>
                <td class="r wide">{p.wins}</td>
                <td class="r wide">{p.top_5}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if hasChase}<p class="note">The line marks the Chase cutoff; <abbr title="In the Chase">C</abbr> = in the Chase.</p>{/if}
    {:else if pointsFeed.feed.data}
      <p class="empty">Points for this race haven't been published yet.</p>
    {:else}
      <FeedStatus state={pointsFeed.feed.state} unavailable="Points for this race haven't been published yet." />
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .full {
    grid-column: 1 / -1;
  }
  section {
    min-width: 0;
  }
  h2 {
    font-size: 15px;
    font-weight: 700;
    padding: 14px 14px 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2.sub {
    border-top: 1px solid var(--grid);
    margin-top: 6px;
  }
  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--accent-wash);
    color: var(--accent);
  }
  .stages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 4px 16px;
    padding: 0 14px 14px;
  }
  h3 {
    font-size: 13px;
    color: var(--muted);
    margin: 8px 0 4px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 22px 30px 1fr auto;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--grid);
    font-size: 14px;
  }
  li:first-child .nm {
    font-weight: 700;
  }
  .pos {
    font-weight: 700;
    text-align: right;
  }
  .car {
    color: var(--ink-2);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pts {
    color: var(--muted);
    font-size: 12px;
  }
  .wrap {
    white-space: normal;
  }
  .strong {
    font-weight: 700;
  }
  tr.cut td {
    border-top: 2px solid var(--accent);
  }
  .note {
    margin: 0;
    padding: 10px 14px 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .note abbr {
    text-decoration: none;
  }
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .wide {
      display: none;
    }
  }
</style>
