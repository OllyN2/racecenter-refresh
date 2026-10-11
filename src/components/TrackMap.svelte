<script lang="ts">
  import { untrack } from 'svelte';
  import { lapTime, parseTimestamp, speed } from '../lib/format';
  import { apply, fitLimit, fitTrack, nearest, refine, toLocal, type Fit, type MapConfig, type Pt } from '../lib/gpsfit';
  import type { RaceInsights } from '../lib/insights';
  import { telemetry, TOKEN_URL, type CarTelemetry } from '../lib/telemetry.svelte';
  import type { LiveFeed } from '../lib/types';
  import TelemetryStrip from './TelemetryStrip.svelte';

  let { live, insights }: { live: LiveFeed; insights: RaceInsights | null } = $props();

  interface Track {
    id: number;
    name: string;
    line: string;
    pit: string | null;
    finish: [number, number] | null;
    center: Pt | null;
    map: MapConfig | null;
  }

  // One small file per track, split out of NASCAR's map config by scripts/tracks.mjs.
  let track = $state<Track | null>(null);
  let missing = $state(false);
  // Derived, so a new live snapshot with the same track doesn't reload it (and drop the GPS fit).
  const trackId = $derived(live.track_id);
  $effect(() => {
    const id = trackId;
    let cancelled = false;
    track = null;
    missing = false;
    fetch(`./tracks/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((t: Track) => {
        if (cancelled) return;
        resetGps(t);
        track = t;
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
      limit: fitLimit(Math.hypot(b.width, b.height)),
    };
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  // ---- Live GPS (Ably, with a token the viewer brings from nascar.com) ----

  const running = $derived(live.vehicles.filter((v) => v.status === 1));
  $effect(() => telemetry.want(running.map((v) => v.vehicle_number)));

  // The racing line sampled in the direction of travel, and pit road, in SVG units.
  const samples = $derived.by(() => {
    if (!geo || !lineEl) return null;
    const at = (el: SVGPathElement, len: number, n: number): Pt[] =>
      Array.from({ length: n }, (_, i) => {
        const p = el.getPointAtLength((i / n) * len);
        return [p.x, p.y];
      });
    return { line: at(lineEl, geo.len, 800), pit: pitEl && geo.pitLen ? at(pitEl, geo.pitLen, 160) : [] };
  });

  // How GPS lines up with this drawing. Fitted from the cars' own positions, remembered per track so a reload
  // mid-race doesn't start over, and refined as more positions arrive.
  let fit = $state.raw<Fit | null>(null);
  let origin: Pt | null = null;
  let buf: Pt[] = [];
  let moves: [Pt, Pt][] = [];
  let seen = new Map<string, { p: Pt; at: number }>();
  let lastTry = 0;
  let fresh = 0;
  const fitKey = (id: number) => `rcr.gpsfit.${id}`;

  function resetGps(t: Track) {
    origin = t.center;
    buf = [];
    moves = [];
    seen = new Map();
    fresh = 0;
    fit = null;
    try {
      const c = JSON.parse(localStorage.getItem(fitKey(t.id)) ?? 'null');
      if (c?.T?.length === 4 && c.origin?.length === 2) {
        origin = c.origin;
        fit = { T: c.T, median: c.median };
      }
    } catch {
      /* no saved fit */
    }
  }

  function keep(f: Fit) {
    fit = f;
    try {
      localStorage.setItem(fitKey(track!.id), JSON.stringify({ T: f.T, median: f.median, origin }));
    } catch {
      /* it'll refit next time */
    }
  }

  function collect(cars: ReadonlyMap<string, CarTelemetry>, s: { line: Pt[]; pit: Pt[] }, limit: number) {
    for (const [car, c] of cars) {
      const prev = seen.get(car);
      if (prev?.at === c.at) continue;
      origin ??= [c.lat, c.lon];
      const p = toLocal(c.lat, c.lon, origin);
      if (prev && c.at - prev.at < 5000 && Math.hypot(p[0] - prev.p[0], p[1] - prev.p[1]) > 8) moves.push([prev.p, p]);
      seen.set(car, { p, at: c.at });
      buf.push(p);
      fresh++;
    }
    if (buf.length > 900) buf = buf.slice(-600);
    if (moves.length > 300) moves = moves.slice(-200);

    const t = Date.now();
    if (!fit) {
      if (buf.length >= 80 && moves.length >= 20 && t - lastTry > 5000) {
        lastTry = t;
        const f = fitTrack(buf, moves, s.line, s.pit, origin![0], track!.map);
        if (f) {
          keep(f);
          fresh = 0;
        }
      }
    } else if (fresh >= 300) {
      fresh = 0;
      const pts = buf.filter((_, i) => i % Math.ceil(buf.length / 240) === 0);
      const target = [...s.line, ...s.pit];
      if (refine(fit.T, pts, target, 0).median > limit * 2) {
        fit = null; // a saved fit that no longer matches (a redrawn map): start over
      } else {
        const r = refine(fit.T, pts, target, 6);
        if (r.median <= limit && r.median <= fit.median * 1.25 + 0.5) keep(r);
      }
    }
  }

  $effect(() => {
    const cars = telemetry.cars;
    const s = samples;
    const g = geo;
    if (s && g && track && cars.size) untrack(() => collect(cars, s, g.limit));
  });

  const FRESH_MS = 8000;
  function gpsPoint(c: CarTelemetry, f: Fit, s: { line: Pt[]; pit: Pt[] }): { x: number; y: number; pit: boolean } {
    const q = apply(f.T, toLocal(c.lat, c.lon, origin!));
    const [li, ld] = nearest(q, s.line);
    const [pi, pd] = s.pit.length ? nearest(q, s.pit) : [-1, Infinity];
    // Snap to the drawn line (the drawing isn't to the metre); a car well off it (a spin, the garage) stays put.
    const snap = Math.max(12, f.median * 3) ** 2;
    if (pd < ld && pd <= snap) return { x: s.pit[pi][0], y: s.pit[pi][1], pit: true };
    if (ld <= snap) return { x: s.line[li][0], y: s.line[li][1], pit: false };
    return { x: q[0], y: q[1], pit: false };
  }

  const RED = 3;
  const dots = $derived.by(() => {
    if (!geo || !lineEl) return [];
    // Race clock now = the snapshot's clock plus real time since NASCAR stamped it (capped, and frozen under red).
    const stamped = parseTimestamp(live.time_of_day_os);
    const extra = live.flag_state === RED || !Number.isFinite(stamped) ? 0 : Math.min(90, Math.max(0, (now - stamped) / 1000));
    const clock = live.elapsed_time + extra;
    const laps = live.vehicles.map((v) => v.last_lap_time).filter((t) => t > 0).sort((a, b) => a - b);
    const typical = laps[laps.length >> 1] || 30;
    const gps = fit && samples && telemetry.status === 'live' ? telemetry.cars : null;

    return running
      .map((v) => {
        const ins = insights?.cars.get(v.vehicle_number);
        const base = { car: v.vehicle_number, name: v.driver.full_name, pos: v.running_position, lapped: v.delta < 0 };
        const c = gps?.get(v.vehicle_number);
        if (c && now - c.at < FRESH_MS) return { ...base, ...gpsPoint(c, fit!, samples!), gps: true };

        let p: DOMPoint;
        if (ins?.onPitRoad && pitEl && geo.pitLen) {
          p = pitEl.getPointAtLength(geo.pitLen * 0.5);
        } else {
          const lapTime = v.last_lap_time > 0 ? v.last_lap_time : typical;
          let frac = (clock - v.vehicle_elapsed_time) / lapTime;
          // Past one lap with no new crossing: keep going round once, then hold just short of the line.
          frac = !(frac >= 0) ? 0 : frac < 2 ? frac % 1 : 0.995;
          p = lineEl!.getPointAtLength(frac * geo.len);
        }
        return { ...base, pit: !!ins?.onPitRoad, x: p.x, y: p.y, gps: false };
      })
      .sort((a, b) => b.pos - a.pos); // leader drawn last, on top
  });
  const onPit = $derived(dots.filter((d) => d.pit).sort((a, b) => a.pos - b.pos));
  const gpsCount = $derived(dots.filter((d) => d.gps).length);
  const glide = $derived(Math.round(Math.max(250, Math.min(2000, telemetry.interval))));

  let selected = $state<string | null>(null);
  const selectedDot = $derived(dots.find((d) => d.car === selected));
  const selectedTel = $derived(selected ? telemetry.cars.get(selected) : undefined);
  const selectedLap = $derived.by(() => {
    const v = running.find((x) => x.vehicle_number === selected);
    return v && v.last_lap_time > 0 ? { time: v.last_lap_time, mph: v.last_lap_speed } : null;
  });
  const pick = (car: string) => (selected = selected === car ? null : car);

  // ---- Token form ----
  const SNIPPET = `copy(await (await fetch('${TOKEN_URL}')).text())`;
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
</script>

<div class="card">
  {#if missing}
    <p class="empty">There's no track map for this track yet.</p>
  {:else if !track}
    <p class="empty">Loading track…</p>
  {:else}
    <svg viewBox={geo?.box ?? '0 0 1 1'} aria-label="Car positions around {track.name}">
      <path bind:this={lineEl} class="line" d={track.line} />
      {#if track.pit}<path bind:this={pitEl} class="pit" d={track.pit} />{/if}
      {#if geo && track.finish}
        <line class="finish" x1={track.finish[0]} x2={track.finish[0]} y1={track.finish[1] - geo.r * 1.6} y2={track.finish[1] + geo.r * 2.4} />
      {/if}
      {#if geo}
        {#each dots as d (d.car)}
          {@const label = `P${d.pos} #${d.car} ${d.name}${d.pit ? ', on pit road' : ''}${gpsCount && !d.gps ? ' (estimated)' : ''}`}
          <g
            class="car"
            class:leader={d.pos === 1}
            class:lapped={d.lapped}
            class:pit={d.pit}
            class:est={gpsCount > 0 && !d.gps}
            class:sel={d.car === selected}
            style:transform="translate({d.x}px, {d.y}px)"
            style:transition-duration={d.gps ? `${glide}ms` : null}
            role="button"
            tabindex="0"
            aria-label={label}
            aria-pressed={d.car === selected}
            onclick={() => pick(d.car)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(d.car))}
          >
            <title>{label}</title>
            <circle r={geo.r} />
            <text dy="0.35em" font-size={geo.r * 1.05}>{d.car}</text>
          </g>
        {/each}
      {/if}
    </svg>

    {#if selectedDot}
      <div class="picked">
        <p class="who">P{selectedDot.pos} <strong>#{selectedDot.car} {selectedDot.name}</strong></p>
        {#if selectedTel && telemetry.status === 'live'}
          <TelemetryStrip t={selectedTel} />
        {:else if selectedLap}
          <p class="who">Last lap {lapTime(selectedLap.time)} · {speed(selectedLap.mph)} mph</p>
        {/if}
      </div>
    {/if}

    <div class="note">
      {#if gpsCount}
        <p>
          Live GPS from NASCAR for {gpsCount} of {running.length} cars{gpsCount < running.length ? ', the rest estimated' : ''}.
          {selected ? '' : 'Select a car for its speed, throttle and brake.'}
          {#if minsLeft != null}<span class="muted">Token good for {minsLeft} more min.</span>{/if}
          <button class="link" onclick={() => ((selected = null), telemetry.forget())}>Stop</button>
        </p>
      {:else if telemetry.status === 'live'}
        <p>
          Connected to NASCAR's live GPS. {fit || !telemetry.cars.size ? 'Waiting for cars to report' : 'Lining the map up with the cars'};
          positions are estimated until then.
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
              access token to nascar.com. To see it here, use the token nascar.com gives your browser. It lasts an hour
              and stays in this browser.
            </p>
            <ol>
              <li>Open <a href="https://www.nascar.com/" target="_blank" rel="noreferrer">nascar.com</a> in another tab, then its browser console (F12, then Console).</li>
              <li>
                Run this there. It copies a token to your clipboard:
                <span class="snippet"><code>{SNIPPET}</code><button class="link" onclick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button></span>
              </li>
              <li>Paste the token here.</li>
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
  {/if}
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
  .pit {
    fill: none;
    stroke: var(--grid);
    stroke-width: 8;
    stroke-dasharray: 10 8;
  }
  .finish {
    stroke: var(--ink);
    stroke-width: 4;
  }
  .car {
    transition: transform 0.25s linear;
  }
  .car {
    cursor: pointer;
    outline: none;
  }
  .car circle {
    fill: var(--surface);
    stroke: var(--ink-2);
    stroke-width: 2.5;
  }
  .car text {
    text-anchor: middle;
    font-weight: 700;
    fill: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .car.leader circle {
    fill: var(--accent);
    stroke: var(--accent);
  }
  .car.leader text {
    fill: #fff;
  }
  .car.lapped {
    opacity: 0.55;
  }
  .car.est {
    opacity: 0.4;
  }
  .car.pit circle {
    stroke-dasharray: 4 3;
  }
  .car.sel circle,
  .car:focus-visible circle {
    stroke: var(--fastest);
    stroke-width: 6;
  }
  .picked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    margin: 0 16px 10px;
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
    padding: 0 16px 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .note p {
    margin: 0;
  }
  .note strong {
    color: var(--ink-2);
  }
  .muted {
    margin: 0;
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
  .note p + p {
    margin-top: 4px;
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
    .car {
      transition: none !important;
    }
  }
</style>
