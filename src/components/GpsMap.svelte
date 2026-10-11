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
  // Esri World Imagery tiles, no map library. It opens framed on the track, north up, and never moves on its own;
  // the viewer pans, zooms and rotates it. Only shown while live GPS is streaming.
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
  const deg = (a: number) => (a * 180) / Math.PI;
  /** The rotate buttons and keys turn by 15°. */
  const STEP = Math.PI / 12;
  /** A turn that ends within 5° of north snaps to it. */
  const SNAP = Math.PI / 36;
  /** Two fingers only start rotating after a 10° twist, so pinching to zoom doesn't tilt the map. */
  const TWIST = Math.PI / 18;

  /** The world point in the middle of the map, the zoom level (fractional), and how far the map is turned
   *  clockwise (radians). */
  interface View {
    x: number;
    y: number;
    z: number;
    a: number;
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
    const z = Math.log2(Math.min(width, height) / ((2 * r) / metresPerUnit));
    return { x: worldX(c[1]), y: worldY(c[0]), z, a: 0 };
  }

  $effect(() => {
    if (view || !width || !height) return;
    const c = center ?? (cars[0] ? ([cars[0].lat, cars[0].lon] as [number, number]) : null);
    if (!c) return;
    homeAt = c;
    home = homeView(c);
    view = home;
  });

  // ---- Pan, zoom and rotate ----

  /** Turns (x, y) clockwise on screen by `a`. */
  const turn = (x: number, y: number, a: number): [number, number] => [
    x * Math.cos(a) - y * Math.sin(a),
    x * Math.sin(a) + y * Math.cos(a),
  ];

  let moving = $state(false);
  let settle = 0;
  function setView(v: View) {
    if (!home) return;
    const z = Math.max(home.z - 2, Math.min(ZOOM_MAX, v.z));
    // Keep within a view or so of the track, so it can't get lost.
    const reach = (1.5 * Math.max(width, height)) / 2 ** home.z;
    let a = Math.atan2(Math.sin(v.a), Math.cos(v.a));
    if (Math.abs(a) < 1e-6) a = 0;
    view = {
      x: Math.max(home.x - reach, Math.min(home.x + reach, v.x)),
      y: Math.max(home.y - reach, Math.min(home.y + reach, v.y)),
      z,
      a,
    };
    // Dots glide between GPS fixes; while the map moves they must jump with it.
    moving = true;
    clearTimeout(settle);
    settle = window.setTimeout(() => (moving = false), 150);
  }
  /** Zooms by `dz` levels and turns by `da`, keeping the point at (px, py) still. */
  function zoomAt(dz: number, px = width / 2, py = height / 2, da = 0) {
    if (!view || !home) return;
    const [ox, oy] = turn(px - width / 2, py - height / 2, -view.a);
    const ax = view.x + ox / 2 ** view.z;
    const ay = view.y + oy / 2 ** view.z;
    const z = Math.max(home.z - 2, Math.min(ZOOM_MAX, view.z + dz));
    const a = view.a + da;
    const [nx, ny] = turn(px - width / 2, py - height / 2, -a);
    setView({ x: ax - nx / 2 ** z, y: ay - ny / 2 ** z, z, a });
  }
  function panBy(dx: number, dy: number) {
    if (!view) return;
    const [wx, wy] = turn(dx, dy, -view.a);
    setView({ ...view, x: view.x - wx / 2 ** view.z, y: view.y - wy / 2 ** view.z });
  }
  const rotate = (da: number) => zoomAt(0, width / 2, height / 2, da);
  const north = () => view && rotate(-view.a);
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
  const angle = (p: { x: number; y: number }, o: { x: number; y: number }) => Math.atan2(p.y - o.y, p.x - o.x);

  // One pointer drags (with Shift, rotates); two pinch and twist. A press that moves only a few pixels is still a
  // click on a car.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let shiftDrag = false;
  let turned = false;
  let twist = 0;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, at(e));
    if (pointers.size === 1) {
      dragged = turned = false;
      shiftDrag = e.shiftKey;
    }
    twist = 0;
  }
  function move(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = at(e);
    if (pointers.size === 1) {
      if (!dragged && Math.hypot(p.x - prev.x, p.y - prev.y) < 5) return;
      if (!dragged) svg!.setPointerCapture(e.pointerId);
      dragged = true;
      if (shiftDrag) {
        const mid = { x: width / 2, y: height / 2 };
        rotate(angle(p, mid) - angle(prev, mid));
        turned = true;
      } else {
        panBy(p.x - prev.x, p.y - prev.y);
      }
    } else {
      const other = [...pointers].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      let da = angle(p, other) - angle(prev, other);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (!turned) {
        twist += da;
        da = Math.abs(twist) > TWIST ? twist : 0;
        turned = da !== 0;
      }
      dragged = true;
      panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2);
      if (before > 0) zoomAt(Math.log2(after / before), (p.x + other.x) / 2, (p.y + other.y) / 2, da);
    }
    pointers.set(e.pointerId, p);
  }
  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (!pointers.size && turned && view && Math.abs(view.a) < SNAP) north();
  }
  // The click that ends a drag isn't a click on a car.
  function swallow(e: MouseEvent) {
    if (!dragged) return;
    dragged = false;
    e.stopPropagation();
  }
  function keys(e: KeyboardEvent) {
    const step = Math.min(width, height) / 4;
    const act: Record<string, () => void> = e.shiftKey
      ? { ArrowLeft: () => rotate(-STEP), ArrowRight: () => rotate(STEP) }
      : {
          ArrowLeft: () => panBy(step, 0),
          ArrowRight: () => panBy(-step, 0),
          ArrowUp: () => panBy(0, step),
          ArrowDown: () => panBy(0, -step),
          '0': reset,
        };
    act['+'] = act['='] = () => zoomAt(1);
    act['-'] = () => zoomAt(-1);
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

  // Tiles are laid out north up and the layer is turned as a whole; cars are turned here, so their numbers stay
  // upright.
  const scale = $derived(view ? 2 ** view.z : 1);
  const sx = (x: number) => (x - view!.x) * scale + width / 2;
  const sy = (y: number) => (y - view!.y) * scale + height / 2;
  function place(x: number, y: number): [number, number] {
    const [px, py] = turn((x - view!.x) * scale, (y - view!.y) * scale, view!.a);
    return [px + width / 2, py + height / 2];
  }

  function tiles(tz: number) {
    const per = 256 / 2 ** tz; // world units per tile
    const size = per * scale;
    const last = 2 ** tz - 1;
    // What's on screen as a north-up box, which grows when the map is turned.
    const cos = Math.abs(Math.cos(view!.a));
    const sin = Math.abs(Math.sin(view!.a));
    const hw = (width * cos + height * sin) / 2 / scale;
    const hh = (width * sin + height * cos) / 2 / scale;
    const x0 = Math.floor((view!.x - hw) / per);
    const x1 = Math.floor((view!.x + hw) / per);
    const y0 = Math.max(0, Math.floor((view!.y - hh) / per));
    const y1 = Math.min(last, Math.floor((view!.y + hh) / per));
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
  // Tile edges overlap a little so they don't show seams, a little more when turned (edges are smoothed).
  const overlap = $derived(view?.a ? 1 : 0.5);
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
      aria-label="{label}. Arrow keys move the map, plus and minus zoom, Shift and the arrows rotate."
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
      <g aria-hidden="true" transform={view.a ? `rotate(${deg(view.a)} ${width / 2} ${height / 2})` : undefined}>
        {#each layers as l (l.z)}
          <g>
            {#each l.tiles as t (t.key)}
              <image href={t.url} x={t.x} y={t.y} width={t.size + overlap} height={t.size + overlap} />
            {/each}
          </g>
        {/each}
      </g>
      {#each cars as c (c.car)}
        {@const p = place(worldX(c.lon), worldY(c.lat))}
        {@render dot(c, p[0], p[1], r)}
      {/each}
    </svg>
    <div class="controls">
      <div class="group">
        <button onclick={() => zoomAt(1)} disabled={zoomMax} aria-label="Zoom in" title="Zoom in">+</button>
        <button onclick={() => zoomAt(-1)} disabled={zoomMin} aria-label="Zoom out" title="Zoom out">−</button>
      </div>
      <div class="group">
        <button onclick={() => rotate(-STEP)} aria-label="Rotate left" title="Rotate left (or Shift + drag)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.46-3.54M3 2v3h3" /></svg>
        </button>
        <button onclick={() => rotate(STEP)} aria-label="Rotate right" title="Rotate right (or Shift + drag)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.46-3.54M13 2v3h-3" /></svg>
        </button>
        {#if view.a}
          <button onclick={north} aria-label="North up" title="North up">
            <svg class="compass" viewBox="0 0 16 16" aria-hidden="true" style:transform="rotate({deg(view.a)}deg)">
              <path class="n" d="M8 1 12 8H4z" /><path d="M8 15 12 8H4z" />
            </svg>
          </button>
        {/if}
      </div>
      <div class="group">
        <button onclick={reset} aria-label="Show the whole track" title="Show the whole track, north up">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
        </button>
      </div>
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
  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  .group button {
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
  .group button + button {
    border-top: 1px solid var(--border);
  }
  .group button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .group button:disabled {
    color: var(--faint);
    cursor: default;
  }
  .group svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .group svg.compass {
    width: 16px;
    height: 16px;
    stroke: none;
    fill: var(--faint);
  }
  .compass .n {
    fill: var(--critical);
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
