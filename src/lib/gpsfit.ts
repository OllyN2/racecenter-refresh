// Lines NASCAR's GPS up with our SVG track maps. The SVGs are drawings, and NASCAR's own map offsets are hand-tuned
// and land cars ~40px off the line, so instead we fit a rotation, scale and shift to the cars' own GPS points
// (trimmed ICP). NASCAR's map config only provides the starting scale and angle, and the result has to have the
// cars running the right way round the racing line.

export type Pt = [number, number];
/** svg = [[a, -b], [b, a]] · local + [tx, ty] */
export type Transform = [number, number, number, number];

/** From NASCAR's trackMapConfigs (see scripts/tracks.mjs). */
export interface MapConfig {
  rotation: number;
  svgRotation: number;
  zoom: number;
  scale: number;
}

export interface Fit {
  T: Transform;
  /** Median distance from a car to the racing line, in SVG units. */
  median: number;
}

/** The most a good fit's median miss can be, for a track drawing whose bounding box has this diagonal. */
export const fitLimit = (diag: number) => Math.max(4, diag * 0.012);

/** Metres east and south of `origin` [lat, lon] (south, so y grows downward like SVG). */
export function toLocal(lat: number, lon: number, origin: Pt): Pt {
  return [(lon - origin[1]) * 111_320 * Math.cos((origin[0] * Math.PI) / 180), (origin[0] - lat) * 110_540];
}

export const apply = (T: Transform, p: Pt): Pt => [T[0] * p[0] - T[1] * p[1] + T[2], T[1] * p[0] + T[0] * p[1] + T[3]];

/** Index of the nearest sample and the squared distance to it. */
export function nearest(p: Pt, pts: Pt[]): [number, number] {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - p[0];
    const dy = pts[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return [best, bd];
}

// Least-squares rotation + uniform scale + shift taking A onto B (no mirroring).
function similarity(A: Pt[], B: Pt[]): Transform {
  const n = A.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) {
    ax += A[i][0]; ay += A[i][1]; bx += B[i][0]; by += B[i][1];
  }
  ax /= n; ay /= n; bx /= n; by /= n;
  let re = 0, im = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const x = A[i][0] - ax, y = A[i][1] - ay, u = B[i][0] - bx, v = B[i][1] - by;
    re += x * u + y * v;
    im += x * v - y * u;
    ss += x * x + y * y;
  }
  const a = re / ss;
  const b = im / ss;
  return [a, b, bx - (a * ax - b * ay), by - (b * ax + a * ay)];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? Infinity;
}

/** Trimmed ICP: pair each point with its nearest track sample, drop the worst 20% (pit stalls, spins), refit. */
export function refine(T: Transform, pts: Pt[], target: Pt[], iters: number): Fit {
  for (let i = 0; i < iters; i++) {
    const d = pts.map((p) => nearest(apply(T, p), target));
    const cut = median(d.map((x) => x[1])) * 4; // 2x the median distance
    const keep = d.map((x, j) => j).filter((j) => d[j][1] <= cut);
    if (keep.length < 10) break;
    T = similarity(keep.map((j) => pts[j]), keep.map((j) => target[d[j][0]]));
  }
  return { T, median: Math.sqrt(median(pts.map((p) => nearest(apply(T, p), target)[1]))) };
}

/** Share of moves that go forward along the racing line (its samples run in the direction of travel). */
function forwardShare(T: Transform, moves: [Pt, Pt][], line: Pt[]): number {
  const n = line.length;
  let fwd = 0, all = 0;
  for (const [a, b] of moves) {
    const i = nearest(apply(T, a), line)[0];
    const j = nearest(apply(T, b), line)[0];
    const d = (j - i + n) % n;
    if (d === 0) continue;
    all++;
    if (d < n / 2) fwd++;
  }
  return all ? fwd / all : 0;
}

/**
 * Fits GPS points (local metres) onto the track. `line` is the racing line sampled in the direction of travel,
 * `pit` is pit road. `moves` are pairs of consecutive positions of one car, used to pick the right way round on
 * near-symmetric ovals. Returns null when nothing fits well enough to trust.
 */
export function fitTrack(pts: Pt[], moves: [Pt, Pt][], line: Pt[], pit: Pt[], originLat: number, map: MapConfig | null): Fit | null {
  if (pts.length < 40 || line.length < 10) return null;
  const target = [...line, ...pit];
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const lineCx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const lineCy = (Math.max(...ys) + Math.min(...ys)) / 2;

  // SVG units per metre: OpenLayers' web-mercator resolution at NASCAR's zoom, divided by the icon scale they draw
  // the SVG at. Without a config, compare the spread of the points with the size of the drawing.
  let scale: number;
  if (map && map.scale > 0) {
    scale = 2 ** map.zoom / 156_543.033_928 / map.scale / Math.cos((originLat * Math.PI) / 180);
  } else {
    const px = pts.map((p) => p[0]);
    const py = pts.map((p) => p[1]);
    scale = diag / Math.max(1, Math.hypot(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py)));
  }

  // Start from NASCAR's angle (map rotation less the SVG's own) and from every 30° in case it's off.
  const angles = new Set<number>();
  if (map) angles.add((((map.rotation - map.svgRotation - 180) % 360) + 360) % 360);
  for (let a = 0; a < 360; a += 30) angles.add(a);

  const sample = pts.length > 240 ? pts.filter((_, i) => i % Math.ceil(pts.length / 240) === 0) : pts;
  const cx = sample.reduce((s, p) => s + p[0], 0) / sample.length;
  const cy = sample.reduce((s, p) => s + p[1], 0) / sample.length;
  const start = [...angles].map((deg) => {
    const r = (deg * Math.PI) / 180;
    const a = scale * Math.cos(r);
    const b = scale * Math.sin(r);
    return refine([a, b, lineCx - (a * cx - b * cy), lineCy - (b * cx + a * cy)], sample, target, 6);
  });

  let best: Fit | null = null;
  for (const f of start.sort((a, b) => a.median - b.median).slice(0, 4)) {
    const r = refine(f.T, sample, target, 25);
    const s = Math.hypot(r.T[0], r.T[1]);
    if (s < scale * 0.75 || s > scale * 1.33) continue;
    if (moves.length >= 10 && forwardShare(r.T, moves, line) < 0.7) continue;
    if (!best || r.median < best.median) best = r;
  }
  return best && best.median <= fitLimit(diag) ? best : null;
}
