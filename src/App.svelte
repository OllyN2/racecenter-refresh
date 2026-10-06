<script lang="ts">
  import { feeds } from './lib/api';
  import { SERIES, sessionLabel } from './lib/format';
  import { defaultRace, isSessionActive } from './lib/normalize';
  import { useFeed } from './lib/poll.svelte';
  import { href, route } from './lib/route.svelte';
  import type { LiveFeed, RaceSummary } from './lib/types';
  import FeedStatus from './components/FeedStatus.svelte';
  import RacePicker from './components/RacePicker.svelte';
  import RaceView from './components/RaceView.svelte';

  const year = new Date().getFullYear();

  const liveFeed = useFeed<LiveFeed>(
    () => feeds.live(),
    (): number => (liveActive && current?.race_id === liveData?.race_id ? 5_000 : 60_000),
  );
  const liveData = $derived(liveFeed.feed.data);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  const liveActive = $derived(!!liveData && isSessionActive(liveData, now));
  const liveSettled = $derived(liveFeed.feed.state.status !== 'loading');

  // Only one series' schedule is loaded. With no series in the URL, wait for the live feed and use its series.
  const series: number | null = $derived(route.current.series ?? (liveSettled ? (liveData?.series_id ?? 1) : null));

  const raceList = useFeed<RaceSummary[]>(
    () => (series ? feeds.raceList(year, series) : null),
    () => null,
  );
  const races = $derived(raceList.feed.data ?? []);

  const current = $derived(races.find((r) => r.race_id === route.current.raceId));

  // Land on the live (or next) race of the series when the URL doesn't name one.
  $effect(() => {
    const { raceId, tab } = route.current;
    if (raceId || !races.length || !liveSettled) return;
    const pick = defaultRace(races, liveData);
    if (pick) route.replace(pick.series_id, pick.race_id, tab);
  });

  // An empty race segment keeps the current tab through the redirect above.
  function seriesHref(id: number): string {
    return route.current.tab === 'leaderboard' ? `#/${id}` : `#/${id}//${route.current.tab}`;
  }

  type Theme = 'system' | 'light' | 'dark';
  function readTheme(): Theme {
    try {
      const t = localStorage.getItem('theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  }
  let theme = $state<Theme>(readTheme());
  $effect(() => {
    const el = document.documentElement;
    if (theme === 'system') delete el.dataset.theme;
    else el.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* storage unavailable: theme just won't persist */
    }
  });
  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const themeLabel: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

  $effect(() => {
    document.title = current ? `${current.race_name} · Race Center` : 'Race Center';
  });
</script>

<div class="shell">
  <header class="top">
    <a class="brand" href="#/">
      <span class="logo" aria-hidden="true"></span>
      Race Center
      <span class="unofficial">unofficial</span>
    </a>
    <nav class="series" aria-label="Series">
      {#each [1, 2, 3] as id (id)}
        <a href={seriesHref(id)} aria-current={series === id ? 'page' : undefined}>{SERIES[id].short}</a>
      {/each}
    </nav>
    <button class="theme" onclick={() => (theme = nextTheme[theme])} title="Theme: {themeLabel[theme]}">
      {themeLabel[theme]}
    </button>
  </header>

  {#if liveActive && liveData && current && current.race_id !== liveData.race_id}
    <a class="live-banner" href={href(liveData.series_id, liveData.race_id)}>
      <span class="dot" aria-hidden="true"></span>
      <strong>Live now</strong>
      {SERIES[liveData.series_id]?.short} · {liveData.track_name} · {sessionLabel(liveData.run_name)}
      <span class="arrow" aria-hidden="true">→</span>
    </a>
  {/if}

  <main>
    {#if current}
      <div class="picker-row">
        <RacePicker
          {races}
          {current}
          liveRaceId={liveActive ? (liveData?.race_id ?? null) : null}
          tab={route.current.tab}
        />
      </div>
      {#key current.race_id}
        <RaceView
          race={current}
          live={liveActive && liveData?.race_id === current.race_id ? liveData : undefined}
          liveUpdatedAt={liveFeed.feed.updatedAt}
          tab={route.current.tab}
        />
      {/key}
    {:else if raceList.feed.state.status === 'ok' && route.current.raceId}
      <div class="card">
        <p class="empty">That race isn't on the {year} schedule. <a href="#/">Go to the current race</a></p>
      </div>
    {:else if raceList.feed.state.status === 'loading' || raceList.feed.state.status === 'ok'}
      <div class="card"><p class="empty">Loading schedule…</p></div>
    {:else}
      <div class="card">
        <FeedStatus state={raceList.feed.state} unavailable="The {year} schedule isn't available yet." />
      </div>
    {/if}
  </main>

  <footer>
    <p>
      Unofficial fan-made viewer. Timing data is loaded straight from NASCAR's public feeds and belongs to NASCAR; this
      site is not affiliated with or endorsed by NASCAR.
    </p>
    <p>No ads, no trackers, no cookies.</p>
  </footer>
</div>

<style>
  .shell {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--gutter) 40px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 0;
    flex-wrap: wrap;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 17px;
    color: var(--ink);
    text-decoration: none;
    letter-spacing: -0.01em;
  }
  .logo {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 50%) 0 0 / 9px 9px;
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .unofficial {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .series {
    display: flex;
    gap: 2px;
    background: var(--surface-2);
    border-radius: 8px;
    padding: 3px;
    margin-left: auto;
  }
  .series a {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-2);
    text-decoration: none;
  }
  .series a[aria-current='page'] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .theme {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .live-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    margin-bottom: 12px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink);
    text-decoration: none;
    font-size: 14px;
  }
  .live-banner:hover {
    background: var(--surface-2);
  }
  .live-banner .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--critical);
  }
  .live-banner .arrow {
    margin-left: auto;
  }
  .picker-row {
    margin-bottom: 12px;
  }
  footer {
    margin-top: 40px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
  footer p {
    margin: 4px 0;
  }
  @media (max-width: 640px) {
    .series {
      order: 3;
      width: 100%;
      margin-left: 0;
      justify-content: space-between;
    }
    .series a {
      flex: 1;
      text-align: center;
    }
    .theme {
      margin-left: auto;
    }
  }
</style>
