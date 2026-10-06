<script lang="ts">
  import { untrack } from 'svelte';
  import { lapTime, speed } from '../lib/format';
  import type { BoardSource, LeaderboardRow } from '../lib/normalize';
  import DriverName from './DriverName.svelte';
  import MakeBadge from './MakeBadge.svelte';

  let { sources }: { sources: BoardSource[] } = $props();

  let picked = $state<string | null>(null);
  const active = $derived(sources.find((s) => s.id === picked) ?? sources[0]);
  const mode = $derived(active?.mode);

  let flash = $state<Record<string, 'up' | 'down'>>({});
  let prevPos = new Map<string, number>();
  let prevSource = '';
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const src = active;
    if (!src) return;
    untrack(() => {
      const changed: Record<string, 'up' | 'down'> = {};
      if (src.id === prevSource) {
        for (const r of src.rows) {
          const before = prevPos.get(r.key);
          if (before != null && r.pos != null && before !== r.pos) changed[r.key] = r.pos < before ? 'up' : 'down';
        }
      }
      prevSource = src.id;
      prevPos = new Map(src.rows.filter((r) => r.pos != null).map((r) => [r.key, r.pos!]));
      if (Object.keys(changed).length) {
        flash = changed;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (flash = {}), 2500);
      }
    });
  });

  $effect(() => () => clearTimeout(flashTimer));

  function moved(r: LeaderboardRow): number | null {
    return r.pos != null && r.start != null ? r.start - r.pos : null;
  }
</script>

{#if sources.length > 1}
  <div class="pill-group sources" role="group" aria-label="Session">
    {#each sources as s (s.id)}
      <button class="pill" aria-pressed={s.id === active?.id} onclick={() => (picked = s.id)}>
        {#if s.live}<span class="live" aria-hidden="true"></span>{/if}{s.label}
      </button>
    {/each}
  </div>
{/if}

<div class="card">
  {#if !active || !active.rows.length}
    <p class="empty">No timing data yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            {#if mode !== 'entry'}<th class="r">Pos</th>{/if}
            {#if mode === 'race' || mode === 'final'}<th class="r wide" title="Positions gained or lost since the start">+/−</th>{/if}
            <th class="r">#</th>
            <th>Driver</th>
            <th class="wide">Make</th>
            {#if mode !== 'entry'}<th class="r">Gap</th>{/if}
            {#if mode === 'race'}
              <th class="r">Last lap</th>
              <th class="r wide">Best lap</th>
              <th class="r wide">Led</th>
              <th class="r wide">Pits</th>
            {:else if mode === 'timed'}
              <th class="r">Best lap</th>
              <th class="r wide">mph</th>
              <th class="r wide">Laps</th>
            {:else if mode === 'final'}
              <th class="r wide">Laps</th>
              <th class="r wide">Led</th>
              <th>Status</th>
              <th class="r wide">Pts</th>
            {:else}
              <th class="wide">Team</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each active.rows as r (r.key)}
            {@const d = moved(r)}
            <tr class={flash[r.key] ? `flash-${flash[r.key]}` : ''}>
              {#if mode !== 'entry'}<td class="r pos">{r.pos ?? '—'}</td>{/if}
              {#if mode === 'race' || mode === 'final'}
                <td class="r wide delta" class:up={d && d > 0} class:down={d && d < 0}>
                  {#if d}{d > 0 ? '▲' : '▼'} {Math.abs(d)}{:else}–{/if}
                </td>
              {/if}
              <td class="r car">{r.car}</td>
              <td class="driver-cell">
                <DriverName driver={r.driver} sub={r.sponsor || r.team} />
              </td>
              <td class="wide"><MakeBadge make={r.make} /></td>
              {#if mode !== 'entry'}
                <td class="r gap">
                  {#if active.live && r.onTrack === false}<span class="off">Off track</span>{/if}
                  {r.gap}
                </td>
              {/if}
              {#if mode === 'race'}
                <td class="r">{lapTime(r.lastLap)}</td>
                <td class="r wide">{lapTime(r.bestLap)}</td>
                <td class="r wide">{r.lapsLed || '–'}</td>
                <td class="r wide">{r.pits ?? '–'}</td>
              {:else if mode === 'timed'}
                <td class="r">{lapTime(r.bestLap)}</td>
                <td class="r wide">{speed(r.bestSpeed)}</td>
                <td class="r wide">{r.laps ?? '–'}</td>
              {:else if mode === 'final'}
                <td class="r wide">{r.laps ?? '–'}</td>
                <td class="r wide">{r.lapsLed || '–'}</td>
                <td class="status">{r.status}</td>
                <td class="r wide">{r.points ?? '–'}</td>
              {:else}
                <td class="wide team">{r.team}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .sources {
    margin-bottom: 12px;
  }
  .live {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--critical);
    margin-right: 6px;
    vertical-align: 1px;
  }
  .pos {
    font-weight: 700;
    width: 1%;
  }
  .car {
    font-weight: 600;
    color: var(--ink-2);
    width: 1%;
  }
  .driver-cell {
    width: 100%;
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
  .gap {
    font-weight: 600;
  }
  .off {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface-3);
    border-radius: 4px;
    padding: 2px 5px;
    margin-right: 6px;
  }
  .status {
    color: var(--ink-2);
  }
  .team {
    color: var(--ink-2);
  }
  tr.flash-up td {
    animation: flash-up 2.5s ease-out;
  }
  tr.flash-down td {
    animation: flash-down 2.5s ease-out;
  }
  @keyframes flash-up {
    from {
      background: var(--flash-up);
    }
  }
  @keyframes flash-down {
    from {
      background: var(--flash-down);
    }
  }
  @media (max-width: 640px) {
    .wide {
      display: none;
    }
  }
</style>
