<script lang="ts">
  import { feeds } from '../lib/api';
  import { flagInfo, parseDriver } from '../lib/format';
  import { useFeed } from '../lib/poll.svelte';
  import type { PitStop } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';

  let { series, raceId, isLive }: { series: number; raceId: number; isLive: boolean } = $props();

  const pits = useFeed<PitStop[]>(
    () => feeds.pits(series, raceId),
    () => (isLive ? 15_000 : null),
  );

  let car = $state('');
  const stops = $derived(
    [...(pits.feed.data ?? [])].sort((a, b) => b.pit_in_race_time - a.pit_in_race_time),
  );
  const cars = $derived.by(() => {
    const m = new Map<string, string>();
    for (const s of stops) m.set(s.vehicle_number, parseDriver(s.driver_name).name);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  });
  const shown = $derived(car ? stops.filter((s) => s.vehicle_number === car) : stops);
  const fastest = $derived(
    stops.filter((s) => s.pit_stop_duration > 0).reduce<PitStop | null>((best, s) => (!best || s.pit_stop_duration < best.pit_stop_duration ? s : best), null),
  );

  function tires(s: PitStop): string {
    const lf = s.left_front_tire_changed, lr = s.left_rear_tire_changed;
    const rf = s.right_front_tire_changed, rr = s.right_rear_tire_changed;
    const n = [lf, lr, rf, rr].filter(Boolean).length;
    if (n === 4) return '4 tires';
    if (n === 0) return 'No tires';
    if (rf && rr && n === 2) return 'Right side';
    if (lf && lr && n === 2) return 'Left side';
    return `${n} tire${n === 1 ? '' : 's'}`;
  }

  const secs = (n: number) => (n > 0 ? `${n.toFixed(1)}s` : '—');
</script>

<div class="card">
  {#if pits.feed.data}
    <div class="toolbar">
      <label>
        <span class="visually-hidden">Car</span>
        <select bind:value={car}>
          <option value="">All cars</option>
          {#each cars as [num, name] (num)}<option value={num}>#{num} {name}</option>{/each}
        </select>
      </label>
      <span class="summary">
        {stops.length} stops
        {#if fastest}· fastest service #{fastest.vehicle_number} {fastest.pit_stop_duration.toFixed(1)}s{/if}
      </span>
    </div>
    {#if shown.length}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th class="r">Lap</th>
              <th class="r">#</th>
              <th>Driver</th>
              <th class="wide">Under</th>
              <th>Tires</th>
              <th class="r">Service</th>
              <th class="r wide">Pit road</th>
              <th class="r wide">In → out</th>
              <th class="r">+/−</th>
            </tr>
          </thead>
          <tbody>
            {#each shown as s, i (`${s.vehicle_number}-${s.pit_in_race_time}-${i}`)}
              {@const t = tires(s)}
              <tr>
                <td class="r">{s.lap_count || '—'}</td>
                <td class="r car">{s.vehicle_number}</td>
                <td class="name">{parseDriver(s.driver_name).name}</td>
                <td class="wide">{flagInfo(s.pit_in_flag_status).label}</td>
                <td>
                  <span class="tires" title={t}>
                    <span class="grid" aria-hidden="true">
                      <i class:on={s.left_front_tire_changed}></i><i class:on={s.right_front_tire_changed}></i>
                      <i class:on={s.left_rear_tire_changed}></i><i class:on={s.right_rear_tire_changed}></i>
                    </span>
                    <span class="tlabel">{t}</span>
                  </span>
                </td>
                <td class="r">{secs(s.pit_stop_duration)}</td>
                <td class="r wide">{secs(s.total_duration)}</td>
                <td class="r wide">{s.pit_in_rank} → {s.pit_out_rank}</td>
                <td class="r delta" class:up={s.positions_gained_lost > 0} class:down={s.positions_gained_lost < 0}>
                  {#if s.positions_gained_lost}{s.positions_gained_lost > 0 ? '▲' : '▼'} {Math.abs(s.positions_gained_lost)}{:else}–{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">No pit stops yet.</p>
    {/if}
  {:else}
    <FeedStatus state={pits.feed.state} unavailable="Pit stop data appears once cars hit pit road." />
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--grid);
  }
  select {
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    max-width: 100%;
  }
  .summary {
    font-size: 13px;
    color: var(--muted);
  }
  .car {
    font-weight: 600;
    color: var(--ink-2);
  }
  .name {
    font-weight: 600;
    width: 100%;
  }
  .tires {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: 7px 7px;
    gap: 2px;
  }
  .grid i {
    width: 7px;
    height: 9px;
    border-radius: 2px;
    background: var(--surface-3);
  }
  .grid i.on {
    background: var(--ink-2);
  }
  .tlabel {
    font-size: 12px;
    color: var(--ink-2);
  }
  .delta {
    font-size: 12px;
    color: var(--faint);
  }
  .delta.up {
    color: var(--up-text);
  }
  .delta.down {
    color: var(--down-text);
  }
  @media (max-width: 640px) {
    .wide,
    .tlabel {
      display: none;
    }
  }
</style>
