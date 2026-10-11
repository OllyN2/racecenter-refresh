<script lang="ts" module>
  export interface GpsCar {
    car: string;
    lat: number;
    lon: number;
  }
</script>

<script lang="ts" generics="T extends GpsCar">
  import type { Snippet } from 'svelte';

  // Cars placed straight from GPS on satellite imagery, like nascar.com's own map: plain web-mercator maths over
  // Esri World Imagery tiles, no map library. It opens framed on the track and never moves on its own; the viewer
  // drags to pan and scrolls, pinches or uses the buttons to zoom. Only shown while live GPS is streaming.
  let {
    cars,
    center,
    trackLength,
    label,
    dot,
  }: {
    /** Drawn in order, so put the leader last. */
    cars: T[];
    /** [lat, lon] of the track, to frame the map on. */
    center: [number, number] | null;
    /** Miles. */
    trackLength: number;
    label: string;
    /** Car, x and y in pixels, dot radius in pixels. */
    dot: Snippet<[T, number, number, number]>;
  } = $props();

  const tileUrl = (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  // Web-mercator world coordinates at zoom 0 (0–256 across the world).
  const worldX = (lon: number) => ((lon + 180) / 360) * 256;
  const worldY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256;
  };
  /** Esri's imagery stops at 19; the last zoom level enlarges it. */
  const TILE_MAX = 19;
  const ZOOM_MAX = 20;

  /** The world point in the middle of the map, and the zoom level (fractional). */
  interface View {
    x: number;
    y: number;
    z: number;
  }

  let width = $state(0);
  let height = $state(0);
  let view = $state<View | null>(null);
  let home = $state.raw<View | null>(null);
  let homeAt: [number, number] | null = null;

  // The whole track: a quarter lap each way from its center fits ovals and road courses alike.
  function homeView(c: [number, number]): View {
    const r = Math.min(1500, Math.max(250, trackLength * 1609.34 * 0.25));
    const metresPerUnit = (40_075_017 * Math.cos((c[0] * Math.PI) / 180)) / 256;
    return { x: worldX(c[1]), y: worldY(c[0]), z: Math.log2(Math.min(width, height) / ((2 * r) / metresPerUnit)) };
  }

  $effect(() => {
    if (view || !width || !height) return;
    const c = center ?? (cars[0] ? ([cars[0].lat, cars[0].lon] as [number, number]) : null);
    if (!c) return;
    homeAt = c;
    home = homeView(c);
    view = home;
  });

  // ---- Pan and zoom ----

  let moving = $state(false);
  let settle = 0;
  function setView(v: View) {
    if (!home) return;
    const z = Math.max(home.z - 2, Math.min(ZOOM_MAX, v.z));
    // Keep within a view or so of the track, so it can't get lost.
    const reach = (1.5 * Math.max(width, height)) / 2 ** home.z;
    view = {
      x: Math.max(home.x - reach, Math.min(home.x + reach, v.x)),
      y: Math.max(home.y - reach, Math.min(home.y + reach, v.y)),
      z,
    };
    // Dots glide between GPS fixes; while the map moves they must jump with it.
    moving = true;
    clearTimeout(settle);
    settle = window.setTimeout(() => (moving = false), 150);
  }
  /** Zooms by `dz` levels, keeping the point at (px, py) still. */
  function zoomAt(dz: number, px = width / 2, py = height / 2) {
    if (!view) return;
    const k0 = 2 ** view.z;
    const k1 = 2 ** Math.max((home?.z ?? 0) - 2, Math.min(ZOOM_MAX, view.z + dz));
    const ax = view.x + (px - width / 2) / k0;
    const ay = view.y + (py - height / 2) / k0;
    setView({ x: ax - (px - width / 2) / k1, y: ay - (py - height / 2) / k1, z: Math.log2(k1) });
  }
  function panBy(dx: number, dy: number) {
    if (view) setView({ x: view.x - dx / 2 ** view.z, y: view.y - dy / 2 ** view.z, z: view.z });
  }
  function reset() {
    const c = center ?? homeAt;
    if (!c) return;
    home = homeView(c);
    setView(home);
  }

  let svg = $state<SVGSVGElement>();
  const at = (e: MouseEvent) => {
    const b = svg!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  // One pointer drags; two pinch. A press that moves only a few pixels is still a click on a car.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, at(e));
    if (pointers.size === 1) dragged = false;
  }
  function move(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = at(e);
    if (pointers.size === 1) {
      if (!dragged && Math.hypot(p.x - prev.x, p.y - prev.y) < 5) return;
      if (!dragged) svg!.setPointerCapture(e.pointerId);
      dragged = true;
      panBy(p.x - prev.x, p.y - prev.y);
    } else {
      const other = [...pointers].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      dragged = true;
      panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2);
      if (before > 0) zoomAt(Math.log2(after / before), (p.x + other.x) / 2, (p.y + other.y) / 2);
    }
    pointers.set(e.pointerId, p);
  }
  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
  }
  // The click that ends a drag isn't a click on a car.
  function swallow(e: MouseEvent) {
    if (!dragged) return;
    dragged = false;
    e.stopPropagation();
  }
  function keys(e: KeyboardEvent) {
    const step = Math.min(width, height) / 4;
    const act: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      '+': () => zoomAt(1),
      '=': () => zoomAt(1),
      '-': () => zoomAt(-1),
      '0': reset,
    };
    if (e.target !== svg || !act[e.key]) return;
    e.preventDefault();
    act[e.key]();
  }
  // Wheel listeners from attributes are passive, and this one has to stop the page scrolling.
  $effect(() => {
    const el = svg;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      const p = at(e);
      // A mouse notch (100) is half a level; trackpad pinches arrive as ctrl+wheel with small deltas.
      zoomAt(-dy * (e.ctrlKey ? 0.01 : 0.005), p.x, p.y);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  // ---- Drawing ----

  const scale = $derived(view ? 2 ** view.z : 1);
  const sx = (x: number) => (x - view!.x) * scale + width / 2;
  const sy = (y: number) => (y - view!.y) * scale + height / 2;

  function tiles(tz: number) {
    const per = 256 / 2 ** tz; // world units per tile
    const size = per * scale;
    const last = 2 ** tz - 1;
    const x0 = Math.floor((view!.x - width / 2 / scale) / per);
    const x1 = Math.floor((view!.x + width / 2 / scale) / per);
    const y0 = Math.max(0, Math.floor((view!.y - height / 2 / scale) / per));
    const y1 = Math.min(last, Math.floor((view!.y + height / 2 / scale) / per));
    const out: { key: string; url: string; x: number; y: number; size: number }[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        out.push({ key: `${tz}/${tx}/${ty}`, url: tileUrl(tz, tx, ty), x: sx(tx * per), y: sy(ty * per), size });
      }
    }
    return out;
  }
  // The level in view, over the level the map opened at (already loaded), so zooming in never shows blank squares.
  const layers = $derived.by(() => {
    if (!view || !width || !height) return [];
    const level = (z: number) => Math.max(1, Math.min(TILE_MAX, Math.round(z)));
    const tz = level(view.z);
    const under = home ? level(home.z) : tz;
    return (under < tz ? [under, tz] : [tz]).map((z) => ({ z, tiles: tiles(z) }));
  });
  const r = $derived(Math.max(9, Math.min(13, width / 75)));
  const zoomMin = $derived(view && home ? view.z <= home.z - 2 + 1e-6 : false);
  const zoomMax = $derived(view ? view.z >= ZOOM_MAX - 1e-6 : false);
</script>

<div class="map" bind:clientWidth={width} bind:clientHeight={height}>
  {#if view}
    <!-- Positions are worked out in pixels here: SVG's own maths is single precision, too coarse for world pixels.
         role="application" is ARIA's role for a widget with its own keys, like a map; Svelte doesn't count it. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      class:moving
      viewBox="0 0 {width} {height}"
      role="application"
      aria-label="{label}. Arrow keys move the map, plus and minus zoom."
      tabindex="0"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onclickcapture={swallow}
      ondblclick={(e) => {
        const p = at(e);
        zoomAt(1, p.x, p.y);
      }}
      onkeydown={keys}
    >
      {#each layers as l (l.z)}
        <g aria-hidden="true">
          {#each l.tiles as t (t.key)}
            <!-- A hair over size so tile edges don't show seams. -->
            <image href={t.url} x={t.x} y={t.y} width={t.size + 0.5} height={t.size + 0.5} />
          {/each}
        </g>
      {/each}
      {#each cars as c (c.car)}
        {@render dot(c, sx(worldX(c.lon)), sy(worldY(c.lat)), r)}
      {/each}
    </svg>
    <div class="zoom">
      <button onclick={() => zoomAt(1)} disabled={zoomMax} aria-label="Zoom in" title="Zoom in">+</button>
      <button onclick={() => zoomAt(-1)} disabled={zoomMin} aria-label="Zoom out" title="Zoom out">−</button>
      <button onclick={reset} aria-label="Show the whole track" title="Show the whole track">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
      </button>
    </div>
  {:else if width}
    <p class="empty">Waiting for cars to report…</p>
  {/if}
</div>

<style>
  .map {
    position: relative;
    /* Explicit, so the height cap doesn't narrow it through the aspect ratio. */
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 70vh;
    overflow: hidden;
    border-radius: var(--radius) var(--radius) 0 0;
    background: #2b2f2a;
  }
  .map > svg {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .map > svg:active {
    cursor: grabbing;
  }
  .map > svg:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .moving :global(*) {
    transition: none !important;
  }
  .zoom {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  .zoom button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .zoom button + button {
    border-top: 1px solid var(--border);
  }
  .zoom button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .zoom button:disabled {
    color: var(--faint);
    cursor: default;
  }
  .zoom svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    color: #ccc;
  }
  @media (max-width: 640px) {
    .map {
      aspect-ratio: 1;
    }
  }
</style>
