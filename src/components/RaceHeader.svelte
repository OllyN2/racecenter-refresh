<script lang="ts">
  import { clockTime, localDateTime, parseDriver, RUN_TYPES, SERIES, sessionLabel, speed } from '../lib/format';
  import { hasFinalResults, raceStartMs, stageEnds } from '../lib/normalize';
  import type { LiveFeed, RaceSummary, WeekendRace } from '../lib/types';
  import FlagPill from './FlagPill.svelte';

  let {
    race,
    weekendRace,
    live,
    updatedAt,
  }: { race: RaceSummary; weekendRace?: WeekendRace; live?: LiveFeed; updatedAt: Date | null } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const series = $derived(SERIES[race.series_id]);
  const start = $derived(raceStartMs(race));
  const ends = $derived(stageEnds(race));
  const finished = $derived(hasFinalResults(weekendRace));
  const liveRace = $derived(live?.run_type === 3);
  const winner = $derived(weekendRace?.results.find((r) => r.finishing_position === 1));
  const summary = $derived(weekendRace ?? race);

  const totalLaps = $derived(liveRace && live ? live.laps_in_race : race.actual_laps || race.scheduled_laps);
  const progressLap = $derived(liveRace && live ? live.lap_number : finished ? totalLaps : 0);

  function countdown(ms: number): string {
    const diff = ms - now;
    if (!Number.isFinite(diff) || diff <= 0) return '';
    const h = Math.floor(diff / 3600_000);
    const m = Math.floor((diff % 3600_000) / 60_000);
    if (h >= 48) return `in ${Math.round(h / 24)} days`;
    return h ? `in ${h}h ${m}m` : `in ${m}m`;
  }

  function elapsed(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

</script>

<header class="race-header card">
  <div class="eyebrow">
    <span class="series">{series?.name ?? 'NASCAR'}</span>
    {#if race.playoff_round > 0}<span class="round">Chase · Round {race.playoff_round}</span>{/if}
  </div>
  <h1>{race.race_name}</h1>
  <p class="meta">
    {race.track_name}
    {#if Number.isFinite(start)}· {localDateTime(start)}{/if}
    {#if race.television_broadcaster}· {race.television_broadcaster}{/if}
  </p>

  <div class="status">
    {#if live}
      <FlagPill code={live.flag_state} />
      <span class="session">{sessionLabel(live.run_name) || RUN_TYPES[live.run_type]}</span>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="updated">Live · updated {clockTime(updatedAt)}</span>
    {:else if finished}
      <FlagPill tone="checkered" label="Final" />
      {#if summary.total_race_time}<span class="session">Race time {summary.total_race_time}</span>{/if}
    {:else}
      <FlagPill tone="neutral" label="Scheduled" />
      {#if countdown(start)}<span class="session">Green flag {countdown(start)}</span>{/if}
    {/if}
  </div>

  <dl class="stats">
    {#if live && liveRace}
      <div><dt>Lap</dt><dd><strong>{live.lap_number}</strong> / {live.laps_in_race}</dd></div>
      <div><dt>To go</dt><dd>{Math.max(0, live.laps_to_go)}</dd></div>
      <div><dt>Stage</dt><dd>{live.stage.stage_num} <span class="unit">ends lap {live.stage.finish_at_lap}</span></dd></div>
      <div><dt>Cautions</dt><dd>{live.number_of_caution_segments} <span class="unit">{live.number_of_caution_laps} laps</span></dd></div>
      <div><dt>Lead changes</dt><dd>{live.number_of_lead_changes} <span class="unit">{live.number_of_leaders} leaders</span></dd></div>
    {:else if live}
      <div><dt>Elapsed</dt><dd>{elapsed(live.elapsed_time)}</dd></div>
      <div><dt>Cars</dt><dd>{live.vehicles.length}</dd></div>
      <div><dt>On track</dt><dd>{live.vehicles.filter((v) => v.is_on_track).length}</dd></div>
      <div><dt>Race</dt><dd>{race.scheduled_laps} <span class="unit">laps</span></dd></div>
    {:else if finished}
      {#if winner}
        <div class="wide"><dt>Winner</dt><dd>#{winner.car_number} {parseDriver(winner.driver_fullname).name}</dd></div>
      {/if}
      <div><dt>Margin</dt><dd>{summary.margin_of_victory || '—'} <span class="unit">sec</span></dd></div>
      <div><dt>Avg speed</dt><dd>{speed(summary.average_speed)} <span class="unit">mph</span></dd></div>
      <div><dt>Cautions</dt><dd>{summary.number_of_cautions} <span class="unit">{summary.number_of_caution_laps} laps</span></dd></div>
      <div><dt>Lead changes</dt><dd>{summary.number_of_lead_changes} <span class="unit">{summary.number_of_leaders} leaders</span></dd></div>
    {:else}
      <div><dt>Laps</dt><dd>{race.scheduled_laps}</dd></div>
      <div><dt>Distance</dt><dd>{race.scheduled_distance} <span class="unit">mi</span></dd></div>
      <div><dt>Stages</dt><dd>{[race.stage_1_laps, race.stage_2_laps, race.stage_3_laps, race.stage_4_laps ?? 0].filter(Boolean).join(' / ')}</dd></div>
    {/if}
  </dl>

  {#if totalLaps > 0 && totalLaps < 999 && (liveRace || finished)}
    {@const cautionSegs = weekendRace?.caution_segments ?? []}
    <div class="progress" role="img" aria-label="Lap {progressLap} of {totalLaps}">
      <div class="track">
        {#each cautionSegs as c (c.start_lap)}
          <span
            class="caution"
            style:left="{((c.start_lap - 1) / totalLaps) * 100}%"
            style:width="{Math.max(0.4, ((c.end_lap - c.start_lap + 1) / totalLaps) * 100)}%"
          ></span>
        {/each}
        <span class="fill" style:width="{Math.min(100, (progressLap / totalLaps) * 100)}%"></span>
        {#each ends.slice(0, -1) as end (end)}
          <span class="marker" style:left="{(end / totalLaps) * 100}%"></span>
        {/each}
      </div>
      <div class="labels">
        {#each ends as end, i (end)}
          <span style:left="{(end / totalLaps) * 100}%">{i === ends.length - 1 ? 'Finish' : `S${i + 1}`} · {end}</span>
        {/each}
      </div>
    </div>
  {/if}
</header>

<style>
  .race-header {
    padding: 20px;
  }
  .eyebrow {
    display: flex;
    gap: 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .round {
    color: var(--accent);
  }
  h1 {
    font-size: clamp(22px, 4vw, 30px);
    font-weight: 700;
    margin-top: 6px;
    letter-spacing: -0.01em;
  }
  .meta {
    margin: 4px 0 0;
    color: var(--ink-2);
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
  }
  .session {
    font-weight: 600;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--critical);
    margin-left: auto;
    animation: pulse 1.6s ease-in-out infinite;
  }
  .updated {
    font-size: 13px;
    color: var(--muted);
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    margin: 18px 0 0;
  }
  .stats div {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .stats .wide {
    grid-column: span 2;
  }
  dt {
    font-size: 12px;
    color: var(--muted);
  }
  dd {
    margin: 2px 0 0;
    font-size: 18px;
    font-weight: 600;
  }
  dd strong {
    font-size: 22px;
  }
  .unit {
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  .progress {
    margin-top: 18px;
  }
  .track {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--accent);
    opacity: 0.85;
    border-radius: 0 4px 4px 0;
    transition: width 0.6s ease;
  }
  .caution {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--warning);
    z-index: 1;
  }
  .marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--surface);
    z-index: 2;
  }
  .labels {
    position: relative;
    height: 18px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .labels span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .labels span:last-child {
    transform: translateX(-100%);
  }
  @media (max-width: 640px) {
    .race-header {
      padding: 16px;
    }
    .stats .wide {
      grid-column: 1 / -1;
    }
  }
</style>
