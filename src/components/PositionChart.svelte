<script lang="ts">
  import { feeds } from '../lib/api';
  import { flagInfo, lastName } from '../lib/format';
  import { positionSeries, type PositionSeries } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import type { LapTimes } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';

  let {
    series: seriesId,
    raceId,
    isLive,
    stageEnds,
  }: { series: number; raceId: number; isLive: boolean; stageEnds: number[] } = $props();

  const lapFeed = useFeed<LapTimes>(
    () => feeds.lapTimes(seriesId, raceId),
    () => (isLive ? 30_000 : null),
  );

  const MAX_PICKS = 3;
  const SLOT_VARS = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

  const model = $derived(lapFeed.feed.data ? positionSeries(lapFeed.feed.data) : null);
  const all = $derived(model?.series.filter((s) => s.positions.some((p) => p != null)) ?? []);
  const maxLap = $derived(Math.max(1, model?.maxLap ?? 1));
  const maxPos = $derived(Math.max(2, ...all.flatMap((s) => s.positions.filter((p): p is number => p != null))));

  // Slots are fixed so a driver keeps its color when others are added or removed.
  let slots = $state<(number | null)[]>([null, null, null]);
  let seeded = false;
  $effect(() => {
    if (seeded || !all.length) return;
    seeded = true;
    slots = all.slice(0, MAX_PICKS).map((s) => s.driverId);
  });

  const picked = $derived(
    slots
      .map((id, slot) => ({ slot, s: all.find((x) => x.driverId === id) }))
      .filter((p): p is { slot: number; s: PositionSeries } => !!p.s),
  );
  const full = $derived(picked.length >= MAX_PICKS);

  function toggle(id: number) {
    const i = slots.indexOf(id);
    if (i >= 0) slots[i] = null;
    else {
      const free = slots.indexOf(null);
      if (free >= 0) slots[free] = id;
    }
  }

  let view = $state<'chart' | 'table'>('chart');
  let width = $state(800);
  let hoverLap = $state<number | null>(null);

  const narrow = $derived(width < 520);
  const m = $derived({ t: 22, r: narrow ? 96 : 150, b: 34, l: 34 });
  const ph = $derived(Math.min(460, Math.max(280, all.length * 11)));
  const pw = $derived(Math.max(100, width - m.l - m.r));
  const height = $derived(ph + m.t + m.b);

  const x = (lap: number) => m.l + (lap / maxLap) * pw;
  const y = (pos: number) => m.t + ((pos - 1) / (maxPos - 1)) * ph;

  function pathFor(s: PositionSeries): string {
    let d = '';
    let pen = false;
    for (let lap = 0; lap <= maxLap; lap++) {
      const p = s.positions[lap];
      if (p == null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(lap).toFixed(1)},${y(p).toFixed(1)}`;
      pen = true;
    }
    return d;
  }

  function lastPoint(s: PositionSeries): { lap: number; pos: number } | null {
    for (let lap = s.positions.length - 1; lap >= 0; lap--) {
      const p = s.positions[lap];
      if (p != null) return { lap, pos: p };
    }
    return null;
  }

  const cautionRanges = $derived.by(() => {
    const laps = [...(model?.cautionLaps ?? [])].sort((a, b) => a - b);
    const out: [number, number][] = [];
    for (const l of laps) {
      const last = out.at(-1);
      if (last && l === last[1] + 1) last[1] = l;
      else out.push([l, l]);
    }
    return out;
  });

  const yTicks = $derived([1, ...Array.from({ length: Math.floor(maxPos / 5) }, (_, i) => (i + 1) * 5).filter((v) => v <= maxPos)]);
  const xTicks = $derived.by(() => {
    const target = narrow ? 4 : 8;
    const step = [5, 10, 20, 25, 50, 100].find((s) => maxLap / s <= target) ?? 100;
    return Array.from({ length: Math.floor(maxLap / step) + 1 }, (_, i) => i * step);
  });

  const endLabels = $derived.by(() => {
    const items = picked
      .map(({ slot, s }) => {
        const lp = lastPoint(s);
        return lp ? { slot, s, ex: x(lp.lap), ey: y(lp.pos), ly: y(lp.pos) } : null;
      })
      .filter((v) => v !== null)
      .sort((a, b) => a.ey - b.ey);
    const gapPx = 16;
    for (let i = 1; i < items.length; i++) items[i].ly = Math.max(items[i].ly, items[i - 1].ly + gapPx);
    const overflow = (items.at(-1)?.ly ?? 0) - (m.t + ph);
    if (overflow > 0) for (const it of items) it.ly -= overflow;
    return items;
  });

  const leaderAt = (lap: number) => all.find((s) => s.positions[lap] === 1);
  const flagAt = (lap: number) => model?.cautionLaps.has(lap);

  function onPointer(e: PointerEvent) {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const lap = Math.round(((e.clientX - rect.left) / rect.width) * maxLap);
    hoverLap = Math.min(maxLap, Math.max(0, lap));
  }

  function onKey(e: KeyboardEvent) {
    const cur = hoverLap ?? maxLap;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') hoverLap = Math.max(0, cur - step);
    else if (e.key === 'ArrowRight') hoverLap = Math.min(maxLap, cur + step);
    else if (e.key === 'Home') hoverLap = 0;
    else if (e.key === 'End') hoverLap = maxLap;
    else return;
    e.preventDefault();
  }

  const tipLeft = $derived(hoverLap == null ? 0 : x(hoverLap) > width - 200 ? x(hoverLap) - 192 : x(hoverLap) + 12);
</script>

<div class="card">
  {#if model && all.length}
    <div class="toolbar">
      <div class="pill-group" role="group" aria-label="View">
        <button class="pill" aria-pressed={view === 'chart'} onclick={() => (view = 'chart')}>Chart</button>
        <button class="pill" aria-pressed={view === 'table'} onclick={() => (view = 'table')}>Table</button>
      </div>
      <span class="hint">Pick up to {MAX_PICKS} drivers to highlight{full ? ' — remove one to swap' : ''}.</span>
    </div>

    <div class="legend" role="group" aria-label="Highlighted drivers">
      {#each all as s (s.driverId)}
        {@const slot = slots.indexOf(s.driverId)}
        <button
          class="chip"
          aria-pressed={slot >= 0}
          disabled={slot < 0 && full}
          onclick={() => toggle(s.driverId)}
        >
          <span class="key" style:background={slot >= 0 ? SLOT_VARS[slot] : 'var(--line-muted)'} aria-hidden="true"></span>
          <span class="num">#{s.car}</span>
          {lastName(s.driver.name)}
        </button>
      {/each}
    </div>

    {#if view === 'chart'}
      <div class="chart" bind:clientWidth={width}>
        <svg {width} {height} role="img" aria-label="Running position by lap for {all.length} drivers">
          {#each cautionRanges as [a, b] (a)}
            <rect class="caution" x={x(a - 1)} y={m.t} width={Math.max(1, x(b) - x(a - 1))} height={ph} />
          {/each}

          {#each yTicks as t (t)}
            <line class="grid" x1={m.l} x2={m.l + pw} y1={y(t)} y2={y(t)} />
            <text class="tick" x={m.l - 8} y={y(t)} dy="0.32em" text-anchor="end">{t}</text>
          {/each}
          {#each xTicks as t (t)}
            <text class="tick" x={x(t)} y={m.t + ph + 20} text-anchor="middle">{t}</text>
          {/each}
          {#each stageEnds.filter((e) => e < maxLap) as end, i (end)}
            <line class="stage" x1={x(end)} x2={x(end)} y1={m.t - 4} y2={m.t + ph} />
            <text class="tick" x={x(end)} y={m.t - 8} text-anchor="middle">S{i + 1}</text>
          {/each}

          <g class="field">
            {#each all as s (s.driverId)}
              {#if !slots.includes(s.driverId)}<path d={pathFor(s)} />{/if}
            {/each}
          </g>

          {#each picked as { slot, s } (s.driverId)}
            <path class="hl" d={pathFor(s)} style:stroke={SLOT_VARS[slot]} />
          {/each}

          {#each endLabels as l (l.s.driverId)}
            {#if Math.abs(l.ly - l.ey) > 2 || l.ex < m.l + pw - 1}
              <line class="leader" x1={l.ex + 6} y1={l.ey} x2={m.l + pw + 8} y2={l.ly} />
            {/if}
            <circle class="end" cx={l.ex} cy={l.ey} r="4" style:fill={SLOT_VARS[l.slot]} />
            <text class="end-label" x={m.l + pw + 12} y={l.ly} dy="0.32em">
              P{lastPoint(l.s)?.pos} #{l.s.car} {narrow ? '' : lastName(l.s.driver.name)}
            </text>
          {/each}

          {#if hoverLap != null}
            <line class="crosshair" x1={x(hoverLap)} x2={x(hoverLap)} y1={m.t} y2={m.t + ph} />
            {#each picked as { slot, s } (s.driverId)}
              {@const p = s.positions[hoverLap]}
              {#if p != null}<circle class="end" cx={x(hoverLap)} cy={y(p)} r="4" style:fill={SLOT_VARS[slot]} />{/if}
            {/each}
          {/if}

          <rect
            class="hit"
            x={m.l}
            y={m.t}
            width={pw}
            height={ph}
            role="slider"
            tabindex="0"
            aria-label="Lap"
            aria-valuemin={0}
            aria-valuemax={maxLap}
            aria-valuenow={hoverLap ?? maxLap}
            onpointermove={onPointer}
            onpointerdown={onPointer}
            onpointerleave={() => (hoverLap = null)}
            onfocus={() => (hoverLap = maxLap)}
            onblur={() => (hoverLap = null)}
            onkeydown={onKey}
          />
        </svg>

        {#if hoverLap != null}
          {@const leader = leaderAt(hoverLap)}
          <div class="tip" style:left="{tipLeft}px" style:top="{m.t}px">
            <div class="tip-head">
              Lap {hoverLap}
              {#if flagAt(hoverLap)}<span class="tip-flag">{flagInfo(2).label}</span>{/if}
            </div>
            {#each picked as { slot, s } (s.driverId)}
              <div class="tip-row">
                <span class="tip-key" style:background={SLOT_VARS[slot]}></span>
                <strong>{s.positions[hoverLap] != null ? `P${s.positions[hoverLap]}` : '—'}</strong>
                <span>#{s.car} {lastName(s.driver.name)}</span>
              </div>
            {/each}
            {#if leader}
              <div class="tip-row muted"><span class="tip-key blank"></span><strong>P1</strong><span>#{leader.car} {lastName(leader.driver.name)}</span></div>
            {/if}
          </div>
        {/if}
        <p class="axis-label">Lap{#if cautionRanges.length} · <span class="caution-key"></span> caution{/if}</p>
      </div>
    {:else}
      <div class="table-wrap tall">
        <table class="data">
          <thead>
            <tr>
              <th class="r">Lap</th>
              <th>Flag</th>
              <th>Leader</th>
              {#each picked as { s } (s.driverId)}<th class="r">#{s.car} {lastName(s.driver.name)}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each Array.from({ length: maxLap + 1 }, (_, i) => maxLap - i) as lap (lap)}
              {@const leader = leaderAt(lap)}
              <tr>
                <td class="r">{lap}</td>
                <td>{flagAt(lap) ? 'Caution' : ''}</td>
                <td>{leader ? `#${leader.car} ${lastName(leader.driver.name)}` : '—'}</td>
                {#each picked as { s } (s.driverId)}<td class="r">{s.positions[lap] ?? '—'}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if model}
    <p class="empty">Lap-by-lap positions appear once the race starts.</p>
  {:else}
    <FeedStatus state={lapFeed.feed.state} unavailable="Lap-by-lap positions appear once the race starts." />
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 0;
  }
  .hint {
    font-size: 13px;
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 12px;
    border-bottom: 1px solid var(--grid);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: none;
    color: var(--ink-2);
    cursor: pointer;
  }
  .chip:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .chip[aria-pressed='true'] {
    border-color: var(--border);
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }
  .chip:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .key {
    width: 14px;
    height: 3px;
    border-radius: 2px;
  }
  .chip .num {
    color: var(--muted);
  }
  .chart {
    position: relative;
    padding: 4px 0 8px;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .stage {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .tick {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .caution {
    fill: var(--caution-wash);
  }
  .field path {
    fill: none;
    stroke: var(--line-muted);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .hl {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .end {
    stroke: var(--surface);
    stroke-width: 2;
  }
  .leader {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .end-label {
    font-size: 12px;
    font-weight: 600;
    fill: var(--ink);
  }
  .crosshair {
    stroke: var(--ink-2);
    stroke-width: 1;
    opacity: 0.5;
  }
  .hit {
    fill: transparent;
    cursor: crosshair;
    outline: none;
  }
  .hit:focus-visible {
    stroke: var(--accent);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    width: 180px;
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    padding: 8px 10px;
    font-size: 12px;
  }
  .tip-head {
    font-weight: 600;
    color: var(--ink-2);
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
  }
  .tip-flag {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--caution-wash);
  }
  .tip-row {
    display: grid;
    grid-template-columns: 14px 32px 1fr;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    white-space: nowrap;
  }
  .tip-row strong {
    font-variant-numeric: tabular-nums;
  }
  .tip-row span:last-child {
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tip-key {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }
  .tip-key.blank {
    background: var(--line-muted);
  }
  .muted {
    border-top: 1px solid var(--grid);
    margin-top: 4px;
    padding-top: 4px;
  }
  .axis-label {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .caution-key {
    display: inline-block;
    width: 12px;
    height: 10px;
    vertical-align: -1px;
    background: var(--caution-wash);
    border: 1px solid var(--warning);
    border-radius: 2px;
  }
  .tall {
    max-height: 520px;
    overflow-y: auto;
  }
</style>
