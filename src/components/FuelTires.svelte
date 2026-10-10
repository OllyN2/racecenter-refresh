<script lang="ts">
  import type { RawResult, RawRun } from '../lib/types';

  let { run, car }: { run: RawRun; car: RawResult } = $props();

  type Tone = 'green' | 'yellow' | 'red';
  // NASCAR's raw feed rates a tank and a set of tires in green-flag laps for this track, with its own yellow/red
  // thresholds for laps left. Caution laps burn far less, so (like the feed) they don't count against the window.
  function gauge(max: number, used: number | null, yellow: number, red: number) {
    const left = Math.max(0, max - (used ?? 0));
    const tone: Tone = left <= red ? 'red' : left <= yellow ? 'yellow' : 'green';
    return { left, pct: max > 0 ? Math.min(100, (left / max) * 100) : 0, tone };
  }
  const fuel = $derived(gauge(run.FuelMax, car.GreenFlagLapsSincePit, run.FuelYellowLaps, run.FuelRedLaps));
  const tires = $derived(gauge(run.TireMax, car.GreenFlagLapsSinceLast4TirePit, run.TireYellowLaps, run.TireRedLaps));
  const finishes = $derived(run.LapsToGo > 0 && fuel.left >= run.LapsToGo);

  const fuelTitle = $derived(
    `≈${fuel.left} green-flag laps of fuel left. ${car.GreenFlagLapsSincePit ?? 0} green and ` +
      `${car.YellowFlagLapsSincePit ?? 0} caution laps since the last stop; a full tank is ≈${run.FuelMax} here.` +
      (finishes ? ' Enough to finish.' : ''),
  );
  const tireTitle = $derived(
    `≈${tires.left} laps of tire life left. ${car.GreenFlagLapsSinceLast4TirePit ?? 0} green-flag laps since ` +
      `the last 4-tire stop; a set is good for ≈${run.TireMax} here.` +
      (car.LastStopTireCount === 2 ? ' Last stop was 2 tires.' : ''),
  );
</script>

<div class="ft">
  <span class="g" title={fuelTitle}>
    <span class="k" aria-hidden="true">Fuel</span>
    <span class="bar" aria-hidden="true"><span class="fill {fuel.tone}" style:width="{fuel.pct}%"></span></span>
    <span class="n" class:ok={finishes}>{fuel.left}</span>
    <span class="visually-hidden">{fuelTitle}</span>
  </span>
  <span class="g" title={tireTitle}>
    <span class="k" aria-hidden="true">Tires</span>
    <span class="bar" aria-hidden="true"><span class="fill {tires.tone}" style:width="{tires.pct}%"></span></span>
    <span class="n">{tires.left}</span>
    <span class="visually-hidden">{tireTitle}</span>
  </span>
</div>

<style>
  .ft {
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
  }
  .g {
    display: grid;
    grid-template-columns: 30px 44px 20px;
    align-items: center;
    gap: 5px;
    cursor: help;
  }
  .k {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    text-align: right;
  }
  .bar {
    height: 5px;
    border-radius: 3px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .fill.green {
    background: var(--good);
  }
  .fill.yellow {
    background: var(--warning);
  }
  .fill.red {
    background: var(--critical);
  }
  .n {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .n.ok {
    font-weight: 700;
    color: var(--up-text);
  }
</style>
