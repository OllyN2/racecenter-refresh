<script lang="ts">
  import { feeds } from '../lib/api';
  import { flagInfo } from '../lib/format';
  import { noteGroups } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import type { LapNotes } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';

  let { year, series, raceId, isLive }: { year: number; series: number; raceId: number; isLive: boolean } = $props();

  const notes = useFeed<LapNotes>(
    () => feeds.lapNotes(year, series, raceId),
    () => (isLive ? 15_000 : null),
  );

  let query = $state('');
  const groups = $derived(notes.feed.data ? noteGroups(notes.feed.data) : []);
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const carRe = /^#?\d+$/.test(q) ? new RegExp(`#${q.replace('#', '')}\\b`) : null;
    return groups
      .map((g) => ({ ...g, notes: g.notes.filter((n) => (carRe ? carRe.test(n.Note) : n.Note.toLowerCase().includes(q))) }))
      .filter((g) => g.notes.length);
  });
</script>

<div class="card">
  {#if notes.feed.data}
    <div class="toolbar">
      <label class="visually-hidden" for="note-filter">Filter notes</label>
      <input id="note-filter" type="search" placeholder="Filter by car # or keyword" bind:value={query} />
    </div>
    {#if filtered.length}
      <ol class="notes">
        {#each filtered as g (g.lap)}
          <li>
            <div class="lap num">{g.lap === 0 ? 'Pre-race' : `Lap ${g.lap}`}</div>
            <div class="items">
              {#each g.notes as n (n.NoteID)}
                {@const f = flagInfo(n.FlagState)}
                <p class="note {f.tone}">
                  {#if f.tone !== 'green' && f.tone !== 'neutral'}<span class="chip">{f.label}</span>{/if}
                  {n.Note}
                </p>
              {/each}
            </div>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="empty">{query ? 'No notes match that filter.' : 'No lap notes yet.'}</p>
    {/if}
  {:else}
    <FeedStatus state={notes.feed.state} unavailable="Lap notes appear once the race weekend gets under way." />
  {/if}
</div>

<style>
  .toolbar {
    padding: 12px;
    border-bottom: 1px solid var(--grid);
  }
  input {
    width: 100%;
    max-width: 320px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .notes {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--grid);
  }
  li:last-child {
    border-bottom: 0;
  }
  .lap {
    font-weight: 700;
    font-size: 13px;
    color: var(--ink-2);
    padding-top: 2px;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .note {
    margin: 0;
    padding-left: 12px;
    border-left: 3px solid var(--good);
  }
  .note.yellow {
    border-left-color: var(--warning);
  }
  .note.red {
    border-left-color: var(--critical);
  }
  .note.neutral,
  .note.white,
  .note.checkered {
    border-left-color: var(--axis);
  }
  .chip {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    margin-right: 6px;
    border-radius: 4px;
    background: var(--surface-3);
    color: var(--ink-2);
  }
  @media (max-width: 640px) {
    li {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  }
</style>
