<script lang="ts" module>
  export interface GpsCar {
    car: string;
    lat: number;
    lon: number;
  }
</script>

<script lang="ts" generics="T extends GpsCar">
  import { untrack, type Snippet } from 'svelte';

  // Cars placed straight from GPS on satellite imagery, like nascar.com's own map: plain web-mercator maths over
  // Esri World Imagery tiles, no map library. Only shown while live GPS is streaming.
  let {
    cars,
    trackId,
    center,
    trackLength,
    label,
    dot,
  }: {
    /** Drawn in order, so put the leader last. */
    cars: T[];
    trackId: number;
    /** [lat, lon] of the track, to frame the map before the cars have been all the way round. */
    center: [number, number] | null;
    /** Miles. */
    trackLength: number;
    label: string;
    dot: Snippet<[T, number, number, number]>;
  } = $props();

  const tileUrl = (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const worldX = (lon: number, z: number) => ((lon + 180) / 360) * 256 * 2 ** z;
  const worldY = (lat: number, z: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
  };

  /** [south, west, north, east] */
  type Box = [number, number, number, number];
  const storeKey = $derived(`rcr.trackbox.${trackId}`);

  function aroundCenter(c: [number, number]): Box {
    // Generous until the cars show where the track really is: a third of the lap length each way.
    const r = Math.min(1800, Math.max(300, (trackLength * 1609.34) / 3));
    const dLat = r / 110_540;
    const dLon = r / (111_320 * Math.cos((c[0] * Math.PI) / 180));
    return [c[0] - dLat, c[1] - dLon, c[0] + dLat, c[1] + dLon];
  }
  function stored(): Box | null {
    try {
      const b = JSON.parse(localStorage.getItem(storeKey) ?? 'null');
      return Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) ? (b as Box) : null;
    } catch {
      return null;
    }
  }

  let box = $state<Box | null>(null);
  $effect(() => {
    box = stored() ?? (center ? aroundCenter(center) : null);
  });

  // Learn the frame from where the cars drive: the middle 96% of fixes, with a margin. Kept per track.
  let lats: number[] = [];
  let lons: number[] = [];
  const last = new Map<string, string>();
  let lastFrame = 0;
  let firstAt = 0;

  // Have the cars been seen all the way round? (Most of 12 directions from the middle of the fixes.) A pack
  // bunched up behind the pace car only covers part of the track, so don't tighten to it.
  function allRound(): boolean {
    const n = lats.length;
    const cy = lats.reduce((a, b) => a + b, 0) / n;
    const cx = lons.reduce((a, b) => a + b, 0) / n;
    const k = Math.cos((cy * Math.PI) / 180);
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) seen.add(Math.floor(((Math.atan2(lats[i] - cy, (lons[i] - cx) * k) + Math.PI) / (2 * Math.PI)) * 12) % 12);
    return seen.size >= 10;
  }
  $effect(() => {
    const list = cars;
    untrack(() => learn(list));
  });
  function learn(cars: T[]) {
    for (const c of cars) {
      const k = `${c.lat},${c.lon}`;
      if (last.get(c.car) === k) continue;
      last.set(c.car, k);
      lats.push(c.lat);
      lons.push(c.lon);
    }
    if (lats.length > 3000) {
      lats = lats.slice(-2000);
      lons = lons.slice(-2000);
    }
    const now = Date.now();
    firstAt ||= now;
    if (lats.length < 150 || now - lastFrame < 5000 || !(allRound() || now - firstAt > 120_000)) {
      if (!box && cars.length) box = aroundCenter([cars[0].lat, cars[0].lon]);
      return;
    }
    lastFrame = now;
    const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
    const [s, n, w, e] = [q(lats, 0.02), q(lats, 0.98), q(lons, 0.02), q(lons, 0.98)];
    const m = 0.12;
    const next: Box = [s - (n - s) * m, w - (e - w) * m, n + (n - s) * m, e + (e - w) * m];
    // Only reframe on a real change, so the map doesn't creep.
    const cur = box;
    const size = cur ? Math.max(cur[2] - cur[0], cur[3] - cur[1]) : 1;
    if (!cur || next.some((v, i) => Math.abs(v - cur[i]) > size * 0.08)) box = next;
    if (lats.length >= 400) {
      try {
        localStorage.setItem(storeKey, JSON.stringify(box));
      } catch {
        /* it'll relearn next time */
      }
    }
  }

  // Zoom so the frame is 512–1024 tile pixels across: sharp enough, and about a dozen tiles.
  const view = $derived.by(() => {
    if (!box) return null;
    const [s, w, n, e] = box;
    const span0 = Math.max(worldX(e, 0) - worldX(w, 0), worldY(s, 0) - worldY(n, 0));
    const z = Math.max(1, Math.min(19, Math.floor(Math.log2(1024 / span0))));
    const x0 = worldX(w, z);
    const y0 = worldY(n, z);
    const width = worldX(e, z) - x0;
    const height = worldY(s, z) - y0;
    const tiles: { key: string; url: string; x: number; y: number }[] = [];
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + height) / 256); ty++) {
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + width) / 256); tx++) {
        tiles.push({ key: `${z}/${tx}/${ty}`, url: tileUrl(z, tx, ty), x: tx * 256 - x0, y: ty * 256 - y0 });
      }
    }
    return { z, x0, y0, width, height, tiles, r: Math.max(width, height) / 70 };
  });
</script>

{#if view}
  <!-- Drawn relative to the frame's corner: world pixels run into the millions, too big for smooth transforms. -->
  <svg viewBox="0 0 {view.width} {view.height}" aria-label={label}>
    <g aria-hidden="true">
      {#each view.tiles as t (t.key)}
        <!-- A hair over 256 so tile edges don't show seams. -->
        <image href={t.url} x={t.x} y={t.y} width="256.5" height="256.5" />
      {/each}
    </g>
    {#each cars as c (c.car)}
      {@render dot(c, worldX(c.lon, view.z) - view.x0, worldY(c.lat, view.z) - view.y0, view.r)}
    {/each}
  </svg>
{:else}
  <p class="empty">Waiting for cars to report…</p>
{/if}

<style>
  svg {
    display: block;
    width: 100%;
    max-height: 70vh;
    border-radius: var(--radius) var(--radius) 0 0;
    background: #2b2f2a;
  }
</style>
