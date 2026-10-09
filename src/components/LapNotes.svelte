<script lang="ts">
  import { feeds } from '../lib/api';
  import { flagInfo, lastName } from '../lib/format';
  import { clipsByLap, type Clip } from '../lib/normalize';
  import { fromAiNotes, fromLapNotes, type TimelineNote } from '../lib/notes';
  import { useFeed } from '../lib/poll.svelte';
  import type { ClipFeed, LapNotes, RaceNotesFeed } from '../lib/types';
  import FeedStatus from './FeedStatus.svelte';

  let {
    year,
    series,
    raceId,
    isLive,
    startMs,
    drivers,
  }: {
    year: number;
    series: number;
    raceId: number;
    isLive: boolean;
    startMs: number;
    /** Car number → driver name, so a "#34" filter finds notes that only use names. */
    drivers: Map<string, string>;
  } = $props();

  // NASCAR's timeline shows its AI race notes (categorized, with driver names and periodic race snapshots).
  const ai = useFeed<RaceNotesFeed>(
    () => feeds.raceNotes(year, raceId),
    () => (isLive ? 15_000 : null),
  );
  const aiNotes = $derived(ai.feed.data?.summary?.length ? fromAiNotes(ai.feed.data) : null);
  // Races without AI notes fall back to the reporters' lap notes.
  const fallback = $derived(ai.feed.state.status === 'unavailable' || (ai.feed.state.status === 'ok' && !aiNotes));
  const lapNotes = useFeed<LapNotes>(
    () => (fallback ? feeds.lapNotes(year, series, raceId) : null),
    () => (isLive && fallback ? 15_000 : null),
  );
  const notes = $derived(aiNotes ?? (lapNotes.feed.data ? fromLapNotes(lapNotes.feed.data) : []));
  const feedState = $derived(fallback ? lapNotes.feed.state : ai.feed.state);

  // Highlight clips get posted a few minutes after the moment; unchanged polls are cheap 304s.
  const clipFeed = useFeed<ClipFeed>(
    () => feeds.clips(year, series, raceId),
    () => (isLive ? 60_000 : null),
  );
  const clips = $derived(clipsByLap(clipFeed.feed.data, (startMs || 0) - 3600_000));

  let playing = $state<number | null>(null);
  let query = $state('');

  // Newest lap first; laps with a clip but no note still get a row.
  const groups = $derived.by(() => {
    const byLap = new Map<number, { lap: number; notes: TimelineNote[]; clips: Clip[] }>();
    for (const n of notes) {
      const g = byLap.get(n.lap) ?? { lap: n.lap, notes: [], clips: [] };
      g.notes.push(n);
      byLap.set(n.lap, g);
    }
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
    const num = /^#?(\d+)$/.exec(q)?.[1];
    const name = num ? drivers.get(num) : undefined;
    const carRe = num ? new RegExp(`(#|no\\.\\s?)${num}\\b`, 'i') : null;
    const hit = (text: string) => {
      const t = text.toLowerCase();
      if (!carRe) return t.includes(q);
      return carRe.test(text) || (!!name && (t.includes(name.toLowerCase()) || t.includes(lastName(name).toLowerCase())));
    };
    return groups
      .map((g) => ({ ...g, notes: g.notes.filter((n) => hit(n.text)), clips: g.clips.filter((c) => hit(c.title)) }))
      .filter((g) => g.notes.length || g.clips.length);
  });

  const MILESTONE = 1000;
  const tone = (flag: number) => (flag === MILESTONE ? 'milestone' : flagInfo(flag).tone);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
</script>

{#snippet paragraph(p: TimelineNote['paragraphs'][number])}
  <p>{#each p as s, i (i)}{#if s.strong}<strong>{s.text}</strong>{:else}{s.text}{/if}{/each}</p>
{/snippet}

<div class="card">
  {#if notes.length || clips.size}
    <div class="toolbar">
      <label class="visually-hidden" for="note-filter">Filter notes</label>
      <input id="note-filter" type="search" placeholder="Filter by driver, car # or keyword" bind:value={query} />
    </div>
    {#if filtered.length}
      <ol class="notes">
        {#each filtered as g (g.lap)}
          <li>
            <div class="lap num">{g.lap === 0 ? 'Pre-race' : `Lap ${g.lap}`}</div>
            <div class="items">
              {#each g.notes as n (n.id)}
                {@const t = tone(n.flag)}
                <div class="note {t}">
                  {#if n.section}
                    <span class="section">{n.section}</span>
                  {:else if t !== 'green' && t !== 'neutral'}
                    <span class="section">{flagInfo(n.flag).label}</span>
                  {/if}
                  {#if n.paragraphs.length}{@render paragraph(n.paragraphs[0])}{/if}
                  {#if n.paragraphs.length > 1}
                    <details>
                      <summary>More</summary>
                      {#each n.paragraphs.slice(1) as p, i (i)}{@render paragraph(p)}{/each}
                    </details>
                  {/if}
                </div>
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
    <FeedStatus state={feedState} unavailable="Lap notes appear once the race weekend gets under way." />
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
    gap: 10px;
  }
  .note {
    padding-left: 12px;
    border-left: 3px solid var(--good);
  }
  .note p {
    margin: 0;
  }
  .note p + p,
  details p {
    margin-top: 6px;
  }
  .note.yellow {
    border-left-color: var(--warning);
  }
  .note.red {
    border-left-color: var(--critical);
  }
  .note.milestone {
    border-left-color: var(--accent);
  }
  .note.neutral,
  .note.white,
  .note.checkered {
    border-left-color: var(--axis);
  }
  .section {
    display: block;
    margin-bottom: 2px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  details summary {
    margin-top: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
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
  @media (max-width: 640px) {
    li {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  }
</style>
