<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { feeds } from '../lib/api';
  import { lapTime, parseDriver, speed } from '../lib/format';
  import type { RaceInsights } from '../lib/insights';
  import { telemetry, TOKEN_URL } from '../lib/telemetry.svelte';
  import type { LiveFeed, LiveVehicle } from '../lib/types';
  import CarNumber from './CarNumber.svelte';
  import GpsMap from './GpsMap.svelte';
  import TelemetryStrip from './TelemetryStrip.svelte';

  // The Track tab: NASCAR's live GPS on satellite imagery (Ably, with the token the viewer brings from nascar.com,
  // since NASCAR only hands it to nascar.com). Without a token it shows how to get one.
  let { live, insights }: { live: LiveFeed; insights: RaceInsights | null } = $props();

  // The track's center, to open the map on before cars report: one tiny file per track (scripts/tracks.mjs).
  let center = $state<[number, number] | null>(null);
  // Derived, so a new live snapshot with the same track doesn't reload it.
  const trackId = $derived(live.track_id);
  $effect(() => {
    const id = trackId;
    let cancelled = false;
    center = null;
    fetch(`./tracks/${id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: { center: [number, number] | null } | null) => {
        if (!cancelled) center = t?.center ?? null;
      })
      .catch(() => {
        /* the map opens on the first car to report instead */
      });
    return () => {
      cancelled = true;
    };
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const running = $derived(live.vehicles.filter((v) => v.status === 1));
  const base = (v: LiveFeed['vehicles'][number]) => ({
    car: v.vehicle_number,
    name: v.driver.full_name,
    pos: v.running_position,
    lapped: v.delta < 0,
    pit: !!insights?.cars.get(v.vehicle_number)?.onPitRoad,
  });

  let selected = $state<string | null>(null);
  const selectedCar = $derived(running.find((v) => v.vehicle_number === selected));
  const selectedTel = $derived(!!selected && telemetry.status === 'live' && telemetry.seen.has(selected));
  const pick = (car: string) => (selected = selected === car ? null : car);

  // ---- Which cars are on the map ----
  // A preset, or (Custom) picked positions and drivers: a car shows if either matches. Remembered in this browser;
  // drivers by NASCAR's driver id, so they carry over to other races. Only the cars shown are streamed.
  type Show = 'all' | 'top10' | 'lead' | 'chase' | 'custom';
  const SHOW_KEY = 'rcr.trackShow';
  const saved = ((): { mode: Show; positions: number[]; drivers: number[] } => {
    try {
      const s = JSON.parse(localStorage.getItem(SHOW_KEY) ?? 'null');
      const ints = (a: unknown) => (Array.isArray(a) ? a.filter(Number.isInteger) : []);
      if (['all', 'top10', 'lead', 'chase', 'custom'].includes(s?.mode)) return { mode: s.mode, positions: ints(s.positions), drivers: ints(s.drivers) };
    } catch {
      /* start from All */
    }
    return { mode: 'all', positions: [], drivers: [] };
  })();
  let show = $state<Show>(saved.mode);
  const pickedPositions = new SvelteSet<number>(saved.positions);
  const pickedDrivers = new SvelteSet<number>(saved.drivers);
  let editing = $state(false);
  $effect(() => {
    const value = JSON.stringify({ mode: show, positions: [...pickedPositions], drivers: [...pickedDrivers] });
    try {
      localStorage.setItem(SHOW_KEY, value);
    } catch {
      /* it just won't be remembered */
    }
  });
  const hasChase = $derived(running.some((v) => v.driver.is_in_chase));
  // A race without Chase drivers shows everyone, without forgetting the choice.
  const mode = $derived<Show>(show === 'chase' && !hasChase ? 'all' : show);
  function choose(m: Show) {
    editing = m === 'custom' && (show !== 'custom' || !editing);
    show = m;
  }
  const toggle = <T,>(set: SvelteSet<T>, v: T) => (set.has(v) ? set.delete(v) : set.add(v));
  const matches = (v: LiveVehicle) =>
    mode === 'top10'
      ? v.running_position <= 10
      : mode === 'lead'
        ? v.delta >= 0
        : mode === 'chase'
          ? v.driver.is_in_chase
          : mode === 'custom'
            ? pickedPositions.has(v.running_position) || pickedDrivers.has(v.driver.driver_id)
            : true;
  // The car being followed stays on the map whatever the filter says.
  const shown = $derived(running.filter((v) => matches(v) || v.vehicle_number === selected));
  const byNumber = $derived([...running].sort((a, b) => parseInt(a.vehicle_number) - parseInt(b.vehicle_number)));

  $effect(() => telemetry.want(shown.map((v) => v.vehicle_number)));
  const FRESH_MS = 8000;
  // Drawn in this order: the leader over the rest, and the selected car over everything, so it shows in a pack.
  const drawOrder = (a: { car: string; pos: number }, b: { car: string; pos: number }) =>
    (a.car === selected ? 1e3 : -a.pos) - (b.car === selected ? 1e3 : -b.pos);
  // Cars that have reported lately, where playback has them this frame.
  const gpsCars = $derived.by(() => {
    if (telemetry.status !== 'live') return [];
    return shown
      .flatMap((v) => {
        const seen = telemetry.seen.get(v.vehicle_number);
        const p = seen && now - seen < FRESH_MS ? telemetry.at(v.vehicle_number) : null;
        return p ? [{ ...base(v), lat: p.lat, lon: p.lon }] : [];
      })
      .sort(drawOrder);
  });
  // Positions only exist once playback is running, so start it when cars start reporting.
  const reporting = $derived(telemetry.status === 'live' && telemetry.seen.size > 0);
  $effect(() => (reporting ? telemetry.animate() : undefined));
  const onPit = $derived(running.map(base).filter((d) => d.pit).sort((a, b) => a.pos - b.pos));

  // ---- Getting a token ----
  // Ends with the token itself, so the console shows it (copy() alone prints a puzzling "undefined"). A unique
  // global name so it can't clobber one of nascar.com's own.
  const SNIPPET = `copy(JSON.stringify(nascarToken = await (await fetch('${TOKEN_URL}')).json())); nascarToken`;
  let tokenInput = $state('');
  let tokenError = $state('');
  let copied = $state(false);
  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* select it by hand */
    }
  }
  function submit(e: SubmitEvent) {
    e.preventDefault();
    tokenError = telemetry.setToken(tokenInput) ?? '';
    if (!tokenError) tokenInput = '';
  }
  function stop() {
    selected = null;
    telemetry.forget();
  }
  const minsLeft = $derived(telemetry.expires ? Math.max(0, Math.round((telemetry.expires - now) / 60_000)) : null);

  // Cars show NASCAR's number artwork (the leaderboard's, so usually cached); a number without one shows as text.
  const noBadge = new SvelteSet<string>();
</script>

{#snippet carDot(d: ReturnType<typeof base>, x: number, y: number, r: number)}
  {@const label = `P${d.pos} #${d.car} ${d.name}${d.pit ? ', on pit road' : ''}`}
  <g
    class="car"
    class:leader={d.pos === 1}
    class:lapped={d.lapped}
    class:pit={d.pit}
    class:sel={d.car === selected}
    style:transform="translate({x}px, {y}px)"
    role="button"
    tabindex="0"
    aria-label={label}
    aria-pressed={d.car === selected}
    onclick={() => pick(d.car)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(d.car))}
  >
    <title>{label}</title>
    <circle {r} />
    {#if noBadge.has(d.car)}
      <text dy="0.35em" font-size={r * 1.05}>{d.car}</text>
    {:else}
      <!-- 78×70 artwork, as big as fits in the circle. -->
      <image
        href={feeds.carBadge(live.series_id, d.car)}
        x={-r * 0.8}
        y={-r * 0.72}
        width={r * 1.6}
        height={r * 1.44}
        onerror={() => noBadge.add(d.car)}
      />
    {/if}
  </g>
{/snippet}

<div class="card">
  {#if telemetry.hasToken}
    <div class="show">
      <div class="pill-group" role="group" aria-label="Cars on the map">
        <button class="pill" aria-pressed={mode === 'all'} onclick={() => choose('all')}>All</button>
        <button class="pill" aria-pressed={mode === 'top10'} onclick={() => choose('top10')}>Top 10</button>
        <button class="pill" aria-pressed={mode === 'lead'} onclick={() => choose('lead')}>Lead lap</button>
        {#if hasChase}<button class="pill" aria-pressed={mode === 'chase'} onclick={() => choose('chase')}>Chase</button>{/if}
        <button class="pill" aria-pressed={mode === 'custom'} aria-expanded={editing} onclick={() => choose('custom')}>Custom</button>
      </div>
      {#if mode === 'custom' && editing}
        <div class="advanced">
          <p class="hint">Shows a car if its position or its driver is picked.</p>
          <section>
            <h3>
              Positions
              {#if pickedPositions.size}<button class="link" onclick={() => pickedPositions.clear()}>Clear</button>{/if}
            </h3>
            <div class="chips">
              {#each running.map((_, i) => i + 1) as p (p)}
                <button class="chip" aria-pressed={pickedPositions.has(p)} aria-label="P{p}" onclick={() => toggle(pickedPositions, p)}>{p}</button>
              {/each}
            </div>
          </section>
          <section>
            <h3>
              Drivers
              {#if pickedDrivers.size}<button class="link" onclick={() => pickedDrivers.clear()}>Clear</button>{/if}
            </h3>
            <div class="drivers">
              {#each byNumber as v (v.vehicle_number)}
                <label>
                  <input type="checkbox" checked={pickedDrivers.has(v.driver.driver_id)} onchange={() => toggle(pickedDrivers, v.driver.driver_id)} />
                  <CarNumber series={live.series_id} number={v.vehicle_number} height={16} />
                  {parseDriver(v.driver.full_name).name}
                </label>
              {/each}
            </div>
          </section>
          <button class="done" onclick={() => (editing = false)}>Done</button>
        </div>
      {/if}
    </div>
    <!-- Stays up while (re)connecting, so the view and the followed car survive a trip to another tab. -->
    <GpsMap
      cars={gpsCars}
      follow={selected}
      {center}
      trackLength={live.track_length}
      label="Live car positions around {live.track_name}"
      dot={carDot}
    />

    {#if selectedCar}
      <div class="picked">
        <p class="who">P{selectedCar.running_position} <strong>#{selectedCar.vehicle_number} {selectedCar.driver.full_name}</strong></p>
        {#if selectedTel}
          <TelemetryStrip car={selectedCar.vehicle_number} />
        {:else if selectedCar.last_lap_time > 0}
          <p class="who">Last lap {lapTime(selectedCar.last_lap_time)} · {speed(selectedCar.last_lap_speed)} mph</p>
        {/if}
      </div>
    {/if}

    <div class="note">
      <p>
        {#if telemetry.status !== 'live'}
          Connecting to NASCAR's live GPS… {telemetry.problem}
        {:else if !shown.length}
          {mode === 'custom' ? 'Nothing picked yet: choose positions or drivers under Custom.' : 'No cars match.'}
        {:else if !gpsCars.length}
          Connected to NASCAR's live GPS. Waiting for cars to report…
        {:else}
          Live GPS from NASCAR for {gpsCars.length} of {shown.length} cars{gpsCars.length < shown.length ? ' (the rest aren’t reporting)' : ''}.
          {selected ? '' : 'Select a car to follow it and see its speed, pedals and steering.'}
        {/if}
        {#if minsLeft != null}<span class="muted">Token good for {minsLeft} more min.</span>{/if}
        <button class="link" onclick={stop}>Stop</button>
      </p>
      <p class="muted">Drag to move the map; scroll or pinch to zoom; Shift-drag or twist to rotate. Imagery: Esri, Maxar, Earthstar Geographics</p>
      {#if onPit.length}<p class="pits">On pit road: {onPit.map((d) => `#${d.car}`).join(', ')}</p>{/if}
    </div>
  {:else}
    <div class="setup">
      <h2>Live GPS map</h2>
      {#if telemetry.status === 'expired'}<p class="err">{telemetry.problem} Get a fresh one the same way.</p>{/if}
      <p>
        NASCAR streams every car's GPS position, speed, pedals and steering to nascar.com, and only hands nascar.com
        the token that unlocks it. To watch it here, use the token nascar.com gives your browser. It lasts an hour,
        stays in this browser, and also keeps the leaderboard about 20 seconds fresher.
      </p>
      <ol>
        <li>Open <a href="https://www.nascar.com/" target="_blank" rel="noreferrer">nascar.com</a> in another tab, then its browser console (F12, then Console).</li>
        <li>
          Run this there. It shows the token and copies it to your clipboard (Chrome may first ask you to type
          <q>allow pasting</q>):
          <span class="snippet"><code>{SNIPPET}</code><button class="link" onclick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button></span>
        </li>
        <li>Paste it here.</li>
      </ol>
      <form onsubmit={submit}>
        <input
          type="text"
          bind:value={tokenInput}
          placeholder="Paste token"
          aria-label="NASCAR live data token"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="submit" disabled={!tokenInput.trim()}>Connect</button>
      </form>
      {#if tokenError}<p class="err">{tokenError}</p>{/if}
    </div>
  {/if}
</div>

<style>
  /* :global because the dots render inside GpsMap. */
  .card :global(.car) {
    cursor: pointer;
    outline: none;
  }
  .card :global(.car circle) {
    fill: var(--surface);
    stroke: var(--ink-2);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }
  .card :global(.car text) {
    text-anchor: middle;
    font-weight: 700;
    fill: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .card :global(.car.leader circle) {
    stroke: var(--accent);
    stroke-width: 4;
  }
  .card :global(.car.lapped) {
    opacity: 0.55;
  }
  .card :global(.car.pit circle) {
    stroke-dasharray: 3.5 2.5;
  }
  .card :global(.car.sel circle),
  .card :global(.car:focus-visible circle) {
    stroke: var(--fastest);
    stroke-width: 4;
  }
  .show {
    display: grid;
    gap: 10px;
    padding: 12px 16px 10px;
  }
  .advanced {
    display: grid;
    gap: 12px;
    padding: 10px 12px 12px;
    border: 1px solid var(--grid);
    border-radius: 8px;
    font-size: 13px;
  }
  .advanced .hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .advanced h3 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 700;
  }
  .advanced h3 .link {
    font-size: 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    min-width: 32px;
    padding: 4px 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .chip:hover {
    background: var(--surface-2);
  }
  .chip[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--surface);
  }
  .drivers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 0 12px;
  }
  .drivers label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    cursor: pointer;
  }
  .drivers input {
    flex: none;
    margin: 0;
  }
  @media (max-width: 640px) {
    .drivers {
      grid-template-columns: 1fr 1fr;
    }
  }
  .done {
    justify-self: start;
    padding: 6px 14px;
    border: 0;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .picked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    margin: 10px 16px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .who {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .who strong {
    color: var(--ink);
  }
  .note {
    padding: 10px 16px 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .note p {
    margin: 0;
  }
  .note p + p {
    margin-top: 4px;
  }
  .muted {
    color: var(--faint);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .pits {
    color: var(--ink-2);
  }
  .setup {
    max-width: 680px;
    padding: 14px 16px 16px;
    color: var(--ink-2);
    font-size: 13px;
  }
  .setup h2 {
    margin-bottom: 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
  }
  .setup p {
    margin: 0 0 8px;
  }
  .setup ol {
    margin: 0 0 12px;
    padding-left: 20px;
  }
  .setup li + li {
    margin-top: 6px;
  }
  .setup a {
    color: var(--accent);
  }
  .snippet {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 4px;
  }
  code {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 11px;
    overflow-wrap: anywhere;
    user-select: all;
  }
  form {
    display: flex;
    gap: 8px;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  form button {
    padding: 7px 14px;
    border: 0;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  form button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .err {
    margin: 6px 0 0;
    color: var(--down-text);
  }
  .setup .err {
    margin: 0 0 8px;
  }
</style>
