<script lang="ts">
  import { lapTime, speed } from '../lib/format';
  import type { CarInsight, Stint } from '../lib/insights';
  import { telemetry } from '../lib/telemetry.svelte';
  import type { RawResult } from '../lib/types';
  import TelemetryStrip from './TelemetryStrip.svelte';

  let { insight, raw }: { insight: CarInsight; raw?: RawResult } = $props();

  const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
  const stageFinishes = $derived(
    raw ? [raw.S1Fin, raw.S2Fin, raw.S3Fin].map((p, i) => (p ? `S${i + 1} ${ordinal(p)}` : null)).filter(Boolean).join(' · ') : '',
  );
  const crew = $derived(
    raw
      ? [
          ['Crew chief', raw.CrewChiefNameTag],
          ['Spotter', raw.SpotterNameTag],
          ['Owner', raw.TeamOwner],
        ].filter(([, v]) => v)
      : [],
  );
  const pitCrew = $derived(
    raw
      ? [
          ['Jackman', raw.JackManNameTag],
          ['Front tires', raw.FrontTireChangerNameTag],
          ['Rear tires', raw.RearTireChangerNameTag],
          ['Tire carrier', raw.TireCarrierNameTag],
          ['Fueler', raw.GasManNameTag],
        ].filter(([, v]) => v)
      : [],
  );
  const secs = (n: number | null | undefined) => (n && n > 0 ? `${n.toFixed(1)}s` : '—');

  const s = $derived(insight.stats);
  const lastLap = $derived(insight.stints.at(-1)?.to ?? insight.green.at(-1)?.lap ?? 1);
  const best = $derived.by(() => {
    if (s?.best_lap_time) return { time: s.best_lap_time, lap: s.best_lap };
    const b = insight.green.reduce<{ time: number; lap: number } | null>((m, x) => (!m || x.time < m.time ? x : m), null);
    return b;
  });
  const restartTotal = $derived(insight.restarts.reduce((n, r) => n + r.gain, 0));

  // Trend line: green-flag lap times across the race, higher = faster, broken at cautions and stops.
  const W = 600;
  const H = 64;
  const spark = $derived.by(() => {
    const g = insight.green;
    if (g.length < 5) return null;
    const times = g.map((x) => x.time).sort((a, b) => a - b);
    const lo = times[0];
    const hi = times[Math.floor(times.length * 0.95)] ?? times.at(-1)!;
    const x = (lap: number) => ((lap - 1) / Math.max(1, lastLap - 1)) * W;
    const y = (t: number) => 4 + ((Math.min(t, hi) - lo) / Math.max(0.001, hi - lo)) * (H - 8);
    let d = '';
    let prev = -10;
    for (const p of g) {
      d += `${p.lap === prev + 1 ? 'L' : 'M'}${x(p.lap).toFixed(1)},${y(p.time).toFixed(1)}`;
      prev = p.lap;
    }
    return { d, lo, hi, stops: insight.stops.map((st) => x(st.lap + 1)) };
  });

  function tiresLabel(r: Stint): string {
    if (r.tires == null) return r.from === 1 ? 'Start' : '—';
    return r.tires === 0 ? 'None' : `${r.tires}`;
  }
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  // Live speed, throttle and brake, when the viewer has connected NASCAR's live GPS on the Track tab.
  $effect(() => telemetry.want([insight.car]));
  const tel = $derived(telemetry.status === 'live' ? telemetry.cars.get(insight.car) : undefined);
</script>

<div class="detail">
  <section>
    {#if tel}
      <h4>Live</h4>
      <div class="live"><TelemetryStrip t={tel} /></div>
    {/if}
    {#if spark}
      <h4>Green-flag lap times <span class="hint">higher is faster · ticks are pit stops</span></h4>
      <div class="spark">
        <span class="axis top">{lapTime(spark.lo)}</span>
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Lap times across the race">
          {#each spark.stops as sx, i (i)}
            <line class="stop" x1={sx} x2={sx} y1="0" y2={H} />
          {/each}
          <path d={spark.d} />
        </svg>
        <span class="axis bottom">{lapTime(spark.hi)}</span>
      </div>
    {/if}

    {#if insight.stints.length}
      <h4>Runs</h4>
      <table class="runs">
        <thead>
          <tr><th>Laps</th><th>Tires</th><th class="r">Avg lap</th><th class="r" title="Seconds lost per 10 laps as the tires wear">Falloff</th></tr>
        </thead>
        <tbody>
          {#each insight.stints as r (r.from)}
            <tr>
              <td>{r.from}–{r.to}</td>
              <td>{tiresLabel(r)}</td>
              <td class="r">{lapTime(r.avg)}</td>
              <td class="r">{r.falloff != null ? `${r.falloff >= 0 ? '+' : ''}${r.falloff.toFixed(2)}s / 10` : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section>
    {#if s || best}
      <h4>This race</h4>
      <dl class="stats">
        {#if s}
          <div><dt>Avg position</dt><dd>{s.average_running_position.toFixed(1)}</dd></div>
          {#if insight.passesKnown}
            <div title="Green-flag passes made, and times passed">
              <dt>Passes</dt><dd>{s.passes_made} <span class="unit">/ {s.times_passed} · {signed(s.passing_differential)}</span></dd>
            </div>
            <div title="Green-flag passes of cars running in the top 15"><dt>Quality passes</dt><dd>{s.quality_passes}</dd></div>
          {/if}
          <div title="Laps on which this car was the fastest on track"><dt>Fastest laps</dt><dd>{s.fastest_laps_run}</dd></div>
          {#if s.average_restart_speed > 0}
            <div><dt>Restart speed</dt><dd>{speed(s.average_restart_speed)} <span class="unit">mph</span></dd></div>
          {/if}
        {/if}
        {#if best}
          <div><dt>Best lap</dt><dd>{lapTime(best.time)} <span class="unit">lap {best.lap}</span></dd></div>
        {/if}
        {#if raw?.LapsInTop10 != null}
          <div title="Laps run inside the top 5 and top 10">
            <dt>Laps in top 10</dt><dd>{raw.LapsInTop10} <span class="unit">top 5: {raw.LapsInTop5 ?? 0}</span></dd>
          </div>
        {/if}
        {#if raw?.PosGL10L != null}
          <div title="Positions gained or lost over the last 10 laps"><dt>Last 10 laps</dt><dd>{signed(raw.PosGL10L)}</dd></div>
        {/if}
        {#if stageFinishes}
          <div><dt>Stages</dt><dd class="small">{stageFinishes}</dd></div>
        {/if}
      </dl>
    {/if}

    {#if raw?.TotalPitStops}
      <h4>Pit road <span class="hint">{raw.TotalPitStops} {raw.TotalPitStops === 1 ? 'stop' : 'stops'} · {secs(raw.TotalTimeOnPitRoad)} on pit road</span></h4>
      <p class="line">
        Last stop lap {raw.LastStopCompLap}: {raw.LastStopTireCount ? `${raw.LastStopTireCount} tires` : 'fuel only'},
        {secs(raw.LastStopTime)} stopped, {secs(raw.LastStopRollingTime)} rolling
      </p>
    {/if}

    {#if insight.restarts.length}
      <h4>Restarts <span class="hint">net {signed(restartTotal)} over {insight.restarts.length}</span></h4>
      <ul class="restarts">
        {#each insight.restarts as r (r.lap)}
          <li class:up={r.gain > 0} class:down={r.gain < 0}>Lap {r.lap} <strong>{signed(r.gain)}</strong></li>
        {/each}
      </ul>
    {/if}
    {#if raw?.LastChooseLine}
      {@const side = { I: 'inside', O: 'outside' }[raw.LastChooseLine.trim().toUpperCase()] ?? raw.LastChooseLine.toLowerCase()}
      <p class="line muted">Last restart: chose the {side} line{raw.LastChooseRowNumber ? `, row ${raw.LastChooseRowNumber}` : ''}</p>
    {/if}

    {#if crew.length}
      <h4>Team</h4>
      <p class="line">{#each crew as [k, v], i (k)}{i ? ' · ' : ''}<span class="muted">{k}</span> {v}{/each}</p>
      {#if pitCrew.length}
        <details>
          <summary>Pit crew</summary>
          <p class="line">{#each pitCrew as [k, v], i (k)}{i ? ' · ' : ''}<span class="muted">{k}</span> {v}{/each}</p>
        </details>
      {/if}
    {/if}
  </section>
</div>

<style>
  .detail {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 20px;
    padding: 6px 4px 10px;
    white-space: normal;
  }
  section {
    min-width: 0;
  }
  .live {
    margin-bottom: 12px;
  }
  h4 {
    margin: 6px 0 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-2);
  }
  .hint {
    font-weight: 500;
    color: var(--muted);
    margin-left: 6px;
  }
  .spark {
    position: relative;
    padding-left: 52px;
    margin-bottom: 12px;
  }
  .spark svg {
    display: block;
    width: 100%;
    height: 64px;
  }
  .spark path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .spark .stop {
    stroke: var(--axis);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    position: absolute;
    left: 0;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .axis.top {
    top: 0;
  }
  .axis.bottom {
    bottom: 0;
  }
  .runs {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .runs th {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--grid);
  }
  .runs td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--grid);
  }
  .runs .r {
    text-align: right;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 8px;
    margin: 0 0 12px;
  }
  .stats div {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 7px 9px;
  }
  dt {
    font-size: 11px;
    color: var(--muted);
  }
  dd {
    margin: 2px 0 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
  }
  .line {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .muted {
    color: var(--muted);
  }
  dd.small {
    font-size: 13px;
  }
  details summary {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    margin-bottom: 4px;
  }
  .restarts {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .restarts li {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .restarts li.up strong {
    color: var(--up-text);
  }
  .restarts li.down strong {
    color: var(--down-text);
  }
  @media (max-width: 640px) {
    .detail {
      grid-template-columns: 1fr;
      gap: 8px;
      position: sticky;
      left: 0;
      max-width: calc(100vw - 2 * var(--gutter) - 16px);
    }
  }
</style>
