<script lang="ts">
  import { parseTimestamp } from '../lib/format';
  import type { RaceInsights } from '../lib/insights';
  import type { LiveFeed } from '../lib/types';

  let { live, insights }: { live: LiveFeed; insights: RaceInsights | null } = $props();

  interface Track {
    name: string;
    line: string;
    pit: string | null;
    finish: [number, number] | null;
  }

  // One small file per track, split out of NASCAR's map config by scripts/tracks.mjs.
  let track = $state<Track | null>(null);
  let missing = $state(false);
  $effect(() => {
    const id = live.track_id;
    let cancelled = false;
    track = null;
    missing = false;
    fetch(`./tracks/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((t: Track) => {
        if (!cancelled) track = t;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  let lineEl = $state<SVGPathElement>();
  let pitEl = $state<SVGPathElement>();
  const geo = $derived.by(() => {
    if (!track || !lineEl) return null;
    const b = lineEl.getBBox();
    const pad = Math.max(b.width, b.height) * 0.06;
    return {
      len: lineEl.getTotalLength(),
      pitLen: pitEl?.getTotalLength() ?? 0,
      box: `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
      r: Math.max(b.width, b.height) * 0.017,
    };
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const RED = 3;
  const dots = $derived.by(() => {
    if (!geo || !lineEl) return [];
    // Race clock now = the snapshot's clock plus real time since NASCAR stamped it (capped, and frozen under red).
    const stamped = parseTimestamp(live.time_of_day_os);
    const extra = live.flag_state === RED || !Number.isFinite(stamped) ? 0 : Math.min(90, Math.max(0, (now - stamped) / 1000));
    const clock = live.elapsed_time + extra;
    const laps = live.vehicles.map((v) => v.last_lap_time).filter((t) => t > 0).sort((a, b) => a - b);
    const typical = laps[laps.length >> 1] || 30;

    return live.vehicles
      .filter((v) => v.status === 1)
      .map((v) => {
        const ins = insights?.cars.get(v.vehicle_number);
        let p: DOMPoint;
        if (ins?.onPitRoad && pitEl && geo.pitLen) {
          p = pitEl.getPointAtLength(geo.pitLen * 0.5);
        } else {
          const lapTime = v.last_lap_time > 0 ? v.last_lap_time : typical;
          let frac = (clock - v.vehicle_elapsed_time) / lapTime;
          // Past one lap with no new crossing: keep going round once, then hold just short of the line.
          frac = !(frac >= 0) ? 0 : frac < 2 ? frac % 1 : 0.995;
          p = lineEl!.getPointAtLength(frac * geo.len);
        }
        return { car: v.vehicle_number, pos: v.running_position, lapped: v.delta < 0, pit: !!ins?.onPitRoad, x: p.x, y: p.y };
      })
      .sort((a, b) => b.pos - a.pos); // leader drawn last, on top
  });
  const onPit = $derived(dots.filter((d) => d.pit).sort((a, b) => a.pos - b.pos));
</script>

<div class="card">
  {#if missing}
    <p class="empty">There's no track map for this track yet.</p>
  {:else if !track}
    <p class="empty">Loading track…</p>
  {:else}
    <svg viewBox={geo?.box ?? '0 0 1 1'} role="img" aria-label="Estimated truck positions around {track.name}">
      <path bind:this={lineEl} class="line" d={track.line} />
      {#if track.pit}<path bind:this={pitEl} class="pit" d={track.pit} />{/if}
      {#if geo && track.finish}
        <line class="finish" x1={track.finish[0]} x2={track.finish[0]} y1={track.finish[1] - geo.r * 1.6} y2={track.finish[1] + geo.r * 2.4} />
      {/if}
      {#if geo}
        {#each dots as d (d.car)}
          <g class="car" class:leader={d.pos === 1} class:lapped={d.lapped} class:pit={d.pit} style:transform="translate({d.x}px, {d.y}px)">
            <title>P{d.pos} #{d.car}{d.pit ? ' · on pit road' : ''}</title>
            <circle r={geo.r} />
            <text dy="0.35em" font-size={geo.r * 1.05}>{d.car}</text>
          </g>
        {/each}
      {/if}
    </svg>
    <p class="note">
      Estimated from lap timing, which NASCAR updates about every 30 seconds.
      {#if onPit.length}<span class="pits">On pit road: {onPit.map((d) => `#${d.car}`).join(', ')}</span>{/if}
    </p>
  {/if}
</div>

<style>
  svg {
    display: block;
    width: 100%;
    max-height: 70vh;
    padding: 8px;
  }
  .line {
    fill: none;
    stroke: var(--surface-3);
    stroke-width: 22;
    stroke-linejoin: round;
  }
  .pit {
    fill: none;
    stroke: var(--grid);
    stroke-width: 8;
    stroke-dasharray: 10 8;
  }
  .finish {
    stroke: var(--ink);
    stroke-width: 4;
  }
  .car {
    transition: transform 0.25s linear;
  }
  .car circle {
    fill: var(--surface);
    stroke: var(--ink-2);
    stroke-width: 2.5;
  }
  .car text {
    text-anchor: middle;
    font-weight: 700;
    fill: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .car.leader circle {
    fill: var(--accent);
    stroke: var(--accent);
  }
  .car.leader text {
    fill: #fff;
  }
  .car.lapped {
    opacity: 0.55;
  }
  .car.pit circle {
    stroke-dasharray: 4 3;
  }
  .note {
    margin: 0;
    padding: 0 16px 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .pits {
    display: block;
    margin-top: 4px;
    color: var(--ink-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .car {
      transition: none;
    }
  }
</style>
