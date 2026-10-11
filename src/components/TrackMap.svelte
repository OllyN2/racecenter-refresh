<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { feeds } from '../lib/api';
  import { lapTime, parseTimestamp, speed } from '../lib/format';
  import type { RaceInsights } from '../lib/insights';
  import { telemetry, TOKEN_URL } from '../lib/telemetry.svelte';
  import type { LiveFeed } from '../lib/types';
  import GpsMap from './GpsMap.svelte';
  import TelemetryStrip from './TelemetryStrip.svelte';

  let { live, insights }: { live: LiveFeed; insights: RaceInsights | null } = $props();

  interface Track {
    name: string;
    line: string;
    pit: string | null;
    finish: [number, number] | null;
    center: [number, number] | null;
  }

  // One small file per track, split out of NASCAR's map config by scripts/tracks.mjs.
  let track = $state<Track | null>(null);
  let missing = $state(false);
  // Derived, so a new live snapshot with the same track doesn't reload it.
  const trackId = $derived(live.track_id);
  $effect(() => {
    const id = trackId;
    let cancelled = false;
    track = null;
    missing = false;
    fetch(`./tracks/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((t: Track) => {
        if (!cancelled) track = t;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  let lineEl = $state<SVGPathElement>();
  let pitEl = $state<SVGPathElement>();
  const geo = $derived.by(() => {
    if (!track || !lineEl) return null;
    const b = lineEl.getBBox();
    const pad = Math.max(b.width, b.height) * 0.06;
    return {
      len: lineEl.getTotalLength(),
      pitLen: pitEl?.getTotalLength() ?? 0,
      box: `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
      r: Math.max(b.width, b.height) * 0.017,
    };
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
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

  // Drawn in this order: the leader over the rest, and the selected car over everything, so it shows in a pack.
  const drawOrder = (a: { car: string; pos: number }, b: { car: string; pos: number }) =>
    (a.car === selected ? 1e3 : -a.pos) - (b.car === selected ? 1e3 : -b.pos);

  // ---- Live GPS (Ably, with a token the viewer brings from nascar.com), placed on satellite imagery ----

  $effect(() => telemetry.want(running.map((v) => v.vehicle_number)));
  const FRESH_MS = 8000;
  // Cars that have reported lately, where playback has them this frame.
  const gpsCars = $derived.by(() => {
    if (telemetry.status !== 'live') return [];
    return running
      .flatMap((v) => {
        const seen = telemetry.seen.get(v.vehicle_number);
        const p = seen && now - seen < FRESH_MS ? telemetry.at(v.vehicle_number) : null;
        return p ? [{ ...base(v), lat: p.lat, lon: p.lon }] : [];
      })
      .sort(drawOrder);
  });
  const gpsMode = $derived(gpsCars.length > 0);
  // Positions only exist once playback is running, so start it when cars start reporting.
  const reporting = $derived(telemetry.status === 'live' && telemetry.seen.size > 0);
  $effect(() => (reporting ? telemetry.animate() : undefined));

  // ---- Estimated positions on the track drawing, from lap timing ----

  const RED = 3;
  const dots = $derived.by(() => {
    if (gpsMode || !geo || !lineEl) return [];
    // Race clock now = the snapshot's clock plus real time since NASCAR stamped it (capped, and frozen under red).
    const stamped = parseTimestamp(live.time_of_day_os);
    const extra = live.flag_state === RED || !Number.isFinite(stamped) ? 0 : Math.min(90, Math.max(0, (now - stamped) / 1000));
    const clock = live.elapsed_time + extra;
    const laps = live.vehicles.map((v) => v.last_lap_time).filter((t) => t > 0).sort((a, b) => a - b);
    const typical = laps[laps.length >> 1] || 30;

    return running
      .map((v) => {
        const b = base(v);
        let p: DOMPoint;
        if (b.pit && pitEl && geo.pitLen) {
          p = pitEl.getPointAtLength(geo.pitLen * 0.5);
        } else {
          const lapTime = v.last_lap_time > 0 ? v.last_lap_time : typical;
          let frac = (clock - v.vehicle_elapsed_time) / lapTime;
          // Past one lap with no new crossing: keep going round once, then hold just short of the line.
          frac = !(frac >= 0) ? 0 : frac < 2 ? frac % 1 : 0.995;
          p = lineEl!.getPointAtLength(frac * geo.len);
        }
        return { ...b, x: p.x, y: p.y };
      })
      .sort(drawOrder);
  });
  const onPit = $derived(running.map(base).filter((d) => d.pit).sort((a, b) => a.pos - b.pos));

  let selected = $state<string | null>(null);
  const selectedCar = $derived(running.find((v) => v.vehicle_number === selected));
  const selectedTel = $derived(!!selected && telemetry.status === 'live' && telemetry.seen.has(selected));
  const pick = (car: string) => (selected = selected === car ? null : car);

  // ---- Token form ----
  // Ends with the token itself, so the console shows it (copy() alone prints a puzzling "undefined"). A unique
  // global name so it can't clobber one of nascar.com's own.
  const SNIPPET = `copy(JSON.stringify(nascarToken = await (await fetch('${TOKEN_URL}')).json())); nascarToken`;
  let showForm = $state(false);
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
    if (!tokenError) {
      tokenInput = '';
      showForm = false;
    }
  }
  const minsLeft = $derived(telemetry.expires ? Math.max(0, Math.round((telemetry.expires - now) / 60_000)) : null);

  // Cars show NASCAR's number artwork (the leaderboard's, so usually cached); a number without one shows as text.
  const noBadge = new SvelteSet<string>();
</script>

{#snippet carDot(d: ReturnType<typeof base>, x: number, y: number, r: number, gps: boolean)}
  {@const label = `P${d.pos} #${d.car} ${d.name}${d.pit ? ', on pit road' : ''}`}
  <g
    class="car"
    class:leader={d.pos === 1}
    class:lapped={d.lapped}
    class:pit={d.pit}
    class:sel={d.car === selected}
    class:gps
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

{#snippet gpsDot(d: ReturnType<typeof base>, x: number, y: number, r: number)}
  {@render carDot(d, x, y, r, true)}
{/snippet}

<div class="card">
  {#if gpsMode}
    <GpsMap
      cars={gpsCars}
      follow={selected}
      center={track?.center ?? null}
      trackLength={live.track_length}
      label="Live car positions{track ? ` around ${track.name}` : ''}"
      dot={gpsDot}
    />
  {:else if missing}
    <p class="empty">There's no track map for this track yet.</p>
  {:else if !track}
    <p class="empty">Loading track…</p>
  {:else}
    <svg viewBox={geo?.box ?? '0 0 1 1'} aria-label="Estimated car positions around {track.name}">
      <path bind:this={lineEl} class="line" d={track.line} />
      {#if track.pit}<path bind:this={pitEl} class="pit-road" d={track.pit} />{/if}
      {#if geo && track.finish}
        <line class="finish" x1={track.finish[0]} x2={track.finish[0]} y1={track.finish[1] - geo.r * 1.6} y2={track.finish[1] + geo.r * 2.4} />
      {/if}
      {#if geo}
        {#each dots as d (d.car)}
          {@render carDot(d, d.x, d.y, geo.r, false)}
        {/each}
      {/if}
    </svg>
  {/if}

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
    {#if gpsMode}
      <p>
        Live GPS from NASCAR for {gpsCars.length} of {running.length} cars{gpsCars.length < running.length ? ' (the rest aren’t reporting)' : ''}.
        {selected ? '' : 'Select a car to follow it and see its speed, pedals and steering.'}
        {#if minsLeft != null}<span class="muted">Token good for {minsLeft} more min.</span>{/if}
        <button class="link" onclick={() => ((selected = null), telemetry.forget())}>Stop</button>
      </p>
      <p class="muted">Drag to move the map; scroll or pinch to zoom; Shift-drag or twist to rotate. Imagery: Esri, Maxar, Earthstar Geographics</p>
    {:else if telemetry.status === 'live'}
      <p>
        Connected to NASCAR's live GPS. Waiting for cars to report; positions are estimated until then.
        <button class="link" onclick={() => telemetry.forget()}>Stop</button>
      </p>
    {:else if telemetry.hasToken}
      <p>
        Connecting to NASCAR's live GPS… {telemetry.problem}
        <button class="link" onclick={() => telemetry.forget()}>Stop</button>
      </p>
    {:else}
      <p>
        Estimated from lap timing, which NASCAR updates about every 30 seconds.
        {#if telemetry.status === 'expired'}<strong>{telemetry.problem}</strong>{/if}
        <button class="link" aria-expanded={showForm} onclick={() => (showForm = !showForm)}>
          {telemetry.status === 'expired' ? 'Paste a new token' : 'Use live GPS'}
        </button>
      </p>
      {#if showForm}
        <div class="howto">
          <p>
            NASCAR streams each car's GPS, speed, gear, RPM, throttle and brake to nascar.com, and only hands the
            access token to nascar.com. To see it here on a satellite map, use the token nascar.com gives your
            browser. It also keeps the leaderboard about 20 seconds fresher. It lasts an hour and stays in this
            browser.
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
    {/if}
    {#if onPit.length}<p class="pits">On pit road: {onPit.map((d) => `#${d.car}`).join(', ')}</p>{/if}
  </div>
</div>

<style>
  svg {
    display: block;
    width: 100%;
    max-height: 70vh;
    padding: 8px;
  }
  .line {
    fill: none;
    stroke: var(--surface-3);
    stroke-width: 22;
    stroke-linejoin: round;
  }
  .pit-road {
    fill: none;
    stroke: var(--grid);
    stroke-width: 8;
    stroke-dasharray: 10 8;
  }
  .finish {
    stroke: var(--ink);
    stroke-width: 4;
  }
  /* :global because GPS dots render inside GpsMap. */
  .card :global(.car) {
    transition: transform 0.25s linear;
    cursor: pointer;
    outline: none;
  }
  /* Live GPS dots are placed afresh every frame. */
  .card :global(.car.gps) {
    transition: none;
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
  .note strong {
    color: var(--ink-2);
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
  .howto {
    max-width: 640px;
    margin-top: 10px;
    padding: 12px 14px;
    border: 1px solid var(--grid);
    border-radius: 8px;
    color: var(--ink-2);
    font-size: 13px;
  }
  .howto ol {
    margin: 8px 0;
    padding-left: 20px;
  }
  .howto li + li {
    margin-top: 4px;
  }
  .howto a {
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
  @media (prefers-reduced-motion: reduce) {
    .card :global(.car) {
      transition: none !important;
    }
  }
</style>
