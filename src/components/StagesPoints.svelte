<script lang="ts">
  import { feeds } from '../lib/api';
  import { parseDriver } from '../lib/format';
  import { leadersFromLive, stagesFromLive } from '../lib/normalize';
  import { useFeed, type FeedState } from '../lib/poll.svelte';
  import type { LiveStage, LiveVehicle, ManufacturerPoints, PointsRow, WeekendRace } from '../lib/types';
  import CarNumber from './CarNumber.svelte';
  import DriverName from './DriverName.svelte';
  import FastestLapBadge from './FastestLapBadge.svelte';
  import MakeBadge from './MakeBadge.svelte';
  import FeedStatus from './FeedStatus.svelte';

  let {
    series,
    raceId,
    isLive,
    weekendRace,
    vehicles,
    year,
    cautions,
    points: allPoints,
    pointsState,
  }: {
    series: number;
    raceId: number;
    isLive: boolean;
    weekendRace?: WeekendRace;
    vehicles?: LiveVehicle[];
    year: number;
    /** From the weekend feed after the race, live-flag-data during it (see RaceView). */
    cautions: WeekendRace['caution_segments'];
    /** This race's points, already checked against the entry list (see RaceView). */
    points: PointsRow[] | null;
    pointsState: FeedState<PointsRow[]>;
  } = $props();

  // The weekend feed only fills in stage results after the race; live-stage-points has them live.
  // Season manufacturer standings (1 KB); NASCAR updates them after each race.
  const makes = useFeed<ManufacturerPoints[]>(
    () => feeds.manufacturerPoints(year, series),
    () => null,
  );

  const liveStages = useFeed<LiveStage[]>(
    () => (isLive ? feeds.stagePoints(year, series, raceId) : null),
    () => (isLive ? 30_000 : null),
  );

  const points = $derived(
    // The truck file lists drivers with no number and no points, several sharing driver_id 0; they add nothing.
    allPoints?.filter((p) => p.points > 0 || p.car_number).sort((a, b) => a.points_position - b.points_position) ?? null,
  );
  const hasChase = $derived(!!points?.some((p) => p.is_in_chase));
  // A bold line under the last Chase driver separates the Chase field from everyone else.
  const lastChase = $derived(points ? points.reduce((last, p, i) => (p.is_in_chase ? i : last), -1) : -1);

  // Top 20 by default; the rest (often 90+ part-timers) behind a toggle.
  const TOP = 20;
  let showAll = $state(false);
  const shown = $derived(points ? (showAll ? points : points.slice(0, TOP)) : []);

  const nameByCar = $derived(new Map(weekendRace?.results.map((r) => [r.car_number, parseDriver(r.driver_fullname).name]) ?? []));
  const stages = $derived(weekendRace?.stage_results?.length ? weekendRace.stage_results : stagesFromLive(liveStages.feed.data ?? []));
  // The weekend feed fills in race_leaders after the race; during it, build the timeline from the live feed.
  const leaders = $derived(weekendRace?.race_leaders?.length ? weekendRace.race_leaders : leadersFromLive(vehicles ?? []));
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
                <td class="wrap">{c.reason || 'Caution'}{c.comment ? ` · ${c.comment}` : ''}</td>
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
            {#each shown as p, i (`${p.driver_id}-${p.points_position}`)}
              <tr class:chase={p.is_in_chase} class:cut={i === lastChase}>
                <td class="r pos">{p.points_position}</td>
                <td class="car"><CarNumber {series} number={p.car_number} /></td>
                {#snippet fastest()}
                  {#if p.is_fastest_lap_point}<FastestLapBadge eligible={p.is_points_eligible} />{/if}
                {/snippet}
                <td>
                  <DriverName
                    driver={{ ...parseDriver(`${p.first_name} ${p.last_name}`), chase: p.is_in_chase, rookie: p.is_rookie }}
                    badges={fastest}
                  />
                </td>
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
      {#if points.length > TOP}
        <button class="more" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
          {showAll ? `Show top ${TOP}` : `Show all ${points.length} drivers`}
          <span class="chevron" aria-hidden="true">{showAll ? '▴' : '▾'}</span>
        </button>
      {/if}
      {#if hasChase || shown.some((p) => p.is_fastest_lap_point)}
        <p class="note">
          {#if hasChase}<span class="item"><span class="swatch" aria-hidden="true"></span>Drivers in the Chase</span>{/if}
          {#if shown.some((p) => p.is_fastest_lap_point)}<span class="item"><FastestLapBadge sample /> Fastest lap (bonus point)</span>{/if}
        </p>
      {/if}
    {:else if pointsState.status === 'ok'}
      <p class="empty">Points for this race haven't been published yet.</p>
    {:else}
      <FeedStatus state={pointsState} unavailable="Points for this race haven't been published yet." />
    {/if}
  </section>

  {#if makes.feed.data?.length}
    <section class="card full">
      <h2>Manufacturer standings</h2>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr><th class="r">Pos</th><th>Make</th><th class="r">Points</th><th class="r">Behind</th><th class="r">Wins</th></tr>
          </thead>
          <tbody>
            {#each makes.feed.data as m (m.manufacturer)}
              <tr>
                <td class="r pos">{m.position}</td>
                <td><MakeBadge make={m.manufacturer} /></td>
                <td class="r strong">{m.points}</td>
                <td class="r">{m.delta_leader === 'LEADER' || !Number(m.delta_leader) ? '—' : `-${Math.abs(Number(m.delta_leader))}`}</td>
                <td class="r">{m.wins}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
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
  tr.chase td {
    background: var(--chase-wash);
  }
  tr.chase:hover td {
    background: var(--chase-wash-strong);
  }
  /* Beats the shared "no border on the last row" rule, so the line shows even when the list is collapsed. */
  tr.cut td {
    border-bottom: 2px solid var(--accent);
  }
  .more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border: 0;
    border-top: 1px solid var(--grid);
    background: none;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .more:hover {
    background: var(--surface-2);
  }
  .chevron {
    font-size: 11px;
  }
  .note .item {
    display: inline-flex;
    align-items: center;
  }
  .swatch {
    display: inline-block;
    width: 14px;
    height: 10px;
    margin-right: 6px;
    vertical-align: -1px;
    border-radius: 2px;
    background: var(--chase-wash-strong);
  }
  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    margin: 0;
    padding: 10px 14px 14px;
    font-size: 12px;
    color: var(--muted);
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
