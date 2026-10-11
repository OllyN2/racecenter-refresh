<script lang="ts">
  import { telemetry } from '../lib/telemetry.svelte';

  // One car's speed, gear, rpm, pedals and steering, eased between NASCAR's samples (~1.7 s apart) in step with its
  // dot on the map (see playback.ts).
  let { car }: { car: string } = $props();

  $effect(() => telemetry.animate());
  const t = $derived(telemetry.at(car));

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  const quiet = $derived(Math.round((now - (telemetry.seen.get(car) ?? now)) / 1000));

  const pct = (n: number | null | undefined) => (n == null ? null : Math.max(0, Math.min(100, Math.round(n))));
  const throttle = $derived(pct(t?.throttle));
  const brake = $derived(pct(t?.brake));
  const gear = $derived(t?.gear == null ? '–' : t.gear < 0 ? 'R' : t.gear === 0 ? 'N' : String(t.gear));
  // Degrees of steering wheel, + left. On an oval the wheel sits right of centre on the straights.
  const steer = $derived(t?.steer == null ? null : Math.round(t.steer));
</script>

<div class="tel" class:stale={quiet > 8} aria-live="off">
  <span class="mph"><b>{t ? Math.round(t.mph) : '–'}</b> mph</span>
  <span>Gear <b>{gear}</b></span>
  <span><b>{t?.rpm != null ? (Math.round(t.rpm / 10) * 10).toLocaleString() : '–'}</b> rpm</span>
  <span class="g">
    Throttle
    <span class="bar" aria-hidden="true"><span class="fill on" style:width="{throttle ?? 0}%"></span></span>
    <b>{throttle ?? '–'}%</b>
  </span>
  <span class="g">
    Brake
    <span class="bar" aria-hidden="true"><span class="fill brake" style:width="{brake ?? 0}%"></span></span>
    <b>{brake ?? '–'}%</b>
  </span>
  <span class="g">
    Steering
    <svg class="wheel" viewBox="-10 -10 20 20" aria-hidden="true" style:transform="rotate({-(steer ?? 0)}deg)">
      <circle r="8.5" />
      <path d="M-8.5 0H8.5M0 0v8.5" />
    </svg>
    <b class="steer">{steer == null ? '–' : `${Math.abs(steer)}°${steer > 0 ? ' L' : steer < 0 ? ' R' : ''}`}</b>
  </span>
  {#if quiet > 8}<span class="muted">no signal for {quiet}s</span>{/if}
</div>

<style>
  .tel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tel.stale {
    opacity: 0.6;
  }
  b {
    color: var(--ink);
    font-weight: 700;
  }
  .mph b {
    display: inline-block;
    min-width: 3ch;
    text-align: right;
    font-size: 18px;
  }
  .g {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .g b {
    min-width: 4ch;
    text-align: right;
  }
  .g b.steer {
    min-width: 5ch;
    text-align: left;
  }
  .bar {
    width: 56px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .fill.on {
    background: var(--good);
  }
  .fill.brake {
    background: var(--critical);
  }
  .wheel {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  .muted {
    color: var(--faint);
  }
</style>
