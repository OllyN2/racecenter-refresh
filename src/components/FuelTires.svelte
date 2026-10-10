<script lang="ts">
  import type { TireFuelStatus } from '../lib/types';

  let { status }: { status: TireFuelStatus } = $props();

  // Percentages and colors are NASCAR's own (racinginsights tire and fuel status), not computed here.
  const tone = (c: string) => (c === 'Red' ? 'red' : c === 'Yellow' ? 'yellow' : 'green');
  const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const fuelTitle = $derived(
    `${pct(status.FuelPctRemain)}% fuel left. Last fueled on lap ${status.Fueled}, ` +
      `${status.LapsSinceFuel} ${status.LapsSinceFuel === 1 ? 'lap' : 'laps'} ago.`,
  );
  const tireTitle = $derived(
    `${pct(status.TirePctRemain)}% tire life left. ` +
      (status.LeftsChanged === status.RightsChanged
        ? `4 tires on lap ${status.RightsChanged}`
        : `Rights changed on lap ${status.RightsChanged}, lefts on lap ${status.LeftsChanged}`) +
      `; ${status.LapsSinceTiresChanged} ${status.LapsSinceTiresChanged === 1 ? 'lap' : 'laps'} on them.`,
  );
</script>

<div class="ft">
  <span class="g" title={fuelTitle}>
    <span class="k" aria-hidden="true">Fuel</span>
    <span class="bar" aria-hidden="true"><span class="fill {tone(status.FuelColor)}" style:width="{pct(status.FuelPctRemain)}%"></span></span>
    <span class="n" aria-hidden="true">{pct(status.FuelPctRemain)}%</span>
    <span class="visually-hidden">{fuelTitle}</span>
  </span>
  <span class="g" title={tireTitle}>
    <span class="k" aria-hidden="true">Tires</span>
    <span class="bar" aria-hidden="true"><span class="fill {tone(status.TireColor)}" style:width="{pct(status.TirePctRemain)}%"></span></span>
    <span class="n" aria-hidden="true">{pct(status.TirePctRemain)}%</span>
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
    grid-template-columns: 30px 44px 32px;
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
</style>
