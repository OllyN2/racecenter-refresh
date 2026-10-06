<script lang="ts">
  import { shortDate } from '../lib/format';
  import { raceStartMs } from '../lib/normalize';
  import { href, type Tab } from '../lib/route.svelte';
  import type { RaceSummary } from '../lib/types';

  let {
    races,
    current,
    liveRaceId,
    tab,
  }: { races: RaceSummary[]; current: RaceSummary; liveRaceId: number | null; tab: Tab } = $props();

  const list = $derived([...races].sort((a, b) => raceStartMs(a) - raceStartMs(b)));
  const idx = $derived(list.findIndex((r) => r.race_id === current.race_id));
  const prev = $derived(idx > 0 ? list[idx - 1] : null);
  const next = $derived(idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null);

  function go(e: Event) {
    const id = Number((e.currentTarget as HTMLSelectElement).value);
    const r = list.find((x) => x.race_id === id);
    if (r) location.hash = href(r.series_id, r.race_id, tab);
  }

  function label(r: RaceSummary): string {
    const live = r.race_id === liveRaceId ? 'LIVE · ' : '';
    return `${live}${shortDate(raceStartMs(r))} · ${r.track_name} — ${r.race_name}`;
  }
</script>

<div class="picker">
  <a class="step" class:disabled={!prev} href={prev ? href(prev.series_id, prev.race_id, tab) : undefined} aria-label="Previous race">‹</a>
  <label class="select">
    <span class="visually-hidden">Race</span>
    <select value={current.race_id} onchange={go}>
      {#each list as r (r.race_id)}
        <option value={r.race_id}>{label(r)}</option>
      {/each}
    </select>
  </label>
  <a class="step" class:disabled={!next} href={next ? href(next.series_id, next.race_id, tab) : undefined} aria-label="Next race">›</a>
</div>

<style>
  .picker {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .select {
    flex: 1;
    min-width: 0;
  }
  select {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    text-overflow: ellipsis;
  }
  .step {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    font-size: 20px;
    line-height: 1;
  }
  .step:hover {
    background: var(--surface-2);
  }
  .step.disabled {
    opacity: 0.35;
    pointer-events: none;
  }
</style>
