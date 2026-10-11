<script lang="ts">
  import type { CarTelemetry } from '../lib/telemetry.svelte';

  let { t }: { t: CarTelemetry } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const pct = (n: number | null) => (n == null ? null : Math.max(0, Math.min(100, Math.round(n))));
  const throttle = $derived(pct(t.throttle));
  const brake = $derived(pct(t.brake));
  const stale = $derived(now - t.at > 8000);
</script>

<div class="tel" class:stale aria-live="off">
  <span class="mph"><b>{t.mph != null ? Math.round(t.mph) : '–'}</b> mph</span>
  <span>Gear <b>{t.gear ?? '–'}</b></span>
  <span><b>{t.rpm != null ? Math.round(t.rpm).toLocaleString() : '–'}</b> rpm</span>
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
  {#if stale}<span class="muted">no signal for {Math.round((now - t.at) / 1000)}s</span>{/if}
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
    transition: width 0.25s linear;
  }
  .fill.on {
    background: var(--good);
  }
  .fill.brake {
    background: var(--critical);
  }
  .muted {
    color: var(--faint);
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
