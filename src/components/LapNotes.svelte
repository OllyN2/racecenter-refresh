<script lang="ts">
  import { feeds } from '../lib/api';
  import { flagInfo } from '../lib/format';
  import { clipsByLap, noteGroups, type Clip } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import type { ClipFeed, LapNote, LapNotes } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';

  let {
    year,
    series,
    raceId,
    isLive,
    startMs,
  }: { year: number; series: number; raceId: number; isLive: boolean; startMs: number } = $props();

  const notes = useFeed<LapNotes>(
    () => feeds.lapNotes(year, series, raceId),
    () => (isLive ? 15_000 : null),
  );
  // Highlight clips get posted a few minutes after the moment; unchanged polls are cheap 304s.
  const clipFeed = useFeed<ClipFeed>(
    () => feeds.clips(year, series, raceId),
    () => (isLive ? 60_000 : null),
  );
  const clips = $derived(clipsByLap(clipFeed.feed.data, (startMs || 0) - 3600_000));

  let playing = $state<number | null>(null);
  let query = $state('');

  // Laps with a clip but no written note still get a row.
  const groups = $derived.by(() => {
    const byLap = new Map<number, { lap: number; notes: LapNote[]; clips: Clip[] }>();
    for (const g of notes.feed.data ? noteGroups(notes.feed.data) : []) byLap.set(g.lap, { ...g, clips: [] });
    for (const [lap, list] of clips) {
      const g = byLap.get(lap) ?? { lap, notes: [], clips: [] };
      g.clips = list;
      byLap.set(lap, g);
    }
    return [...byLap.values()].sort((a, b) => b.lap - a.lap);
  });
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const carRe = /^#?\d+$/.test(q) ? new RegExp(`#${q.replace('#', '')}\\b`) : null;
    const hit = (text: string) => (carRe ? carRe.test(text) : text.toLowerCase().includes(q));
    return groups
      .map((g) => ({ ...g, notes: g.notes.filter((n) => hit(n.Note)), clips: g.clips.filter((c) => hit(c.title)) }))
      .filter((g) => g.notes.length || g.clips.length);
  });

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
</script>

<div class="card">
  {#if notes.feed.data || clips.size}
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
              {#each g.clips as c (c.id)}
                <div class="clip">
                  <button class="watch" aria-expanded={playing === c.id} onclick={() => (playing = playing === c.id ? null : c.id)}>
                    <span class="play" aria-hidden="true">{playing === c.id ? '■' : '▶'}</span>
                    <span class="title">{c.title}</span>
                    {#if c.seconds > 0}<span class="len">{mmss(c.seconds)}</span>{/if}
                  </button>
                  {#if playing === c.id}
                    <!-- svelte-ignore a11y_media_has_caption NASCAR doesn't publish captions for these clips. -->
                    <video src={c.src} controls autoplay playsinline preload="none"></video>
                  {/if}
                </div>
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
  .clip {
    padding-left: 15px;
  }
  .watch {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    max-width: 100%;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--ink);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .watch:hover {
    background: var(--surface-3);
  }
  .play {
    color: var(--accent);
    font-size: 11px;
  }
  .len {
    font-weight: 500;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  video {
    display: block;
    width: 100%;
    max-width: 560px;
    aspect-ratio: 16 / 9;
    margin-top: 8px;
    border-radius: 8px;
    background: #000;
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
