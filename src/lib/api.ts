const BASE = 'https://cf.nascar.com';

export const feeds = {
  live: () => `${BASE}/live/feeds/live-feed.json`,
  // Per-series list: the all-series file is ~265 KB and the CDN doesn't compress.
  raceList: (year: number, series: number) => `${BASE}/cacher/${year}/${series}/race_list_basic.json`,
  weekend: (year: number, series: number, race: number) => `${BASE}/cacher/${year}/${series}/${race}/weekend-feed.json`,
  lapTimes: (series: number, race: number) => `${BASE}/cacher/live/series_${series}/${race}/lap-times.json`,
  lapNotes: (year: number, series: number, race: number) => `${BASE}/cacher/${year}/${series}/${race}/lap-notes.json`,
  clips: (year: number, series: number, race: number) => `${BASE}/cacher/${year}/${series}/${race}/snappytv.json`,
  pits: (series: number, race: number) => `${BASE}/cacher/live/series_${series}/${race}/live-pit-data.json`,
  carBadge: (series: number, car: string) => `${BASE}/data/images/carbadges/${series}/${car}.png`,
  points: (series: number, race: number) => `${BASE}/live/feeds/series_${series}/${race}/live_points.json`,
};

export type Fetched<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

// The feeds sit on S3 behind CloudFront: objects that don't exist yet return 403, not 404.
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (res.status === 403 || res.status === 404) return { status: 'unavailable' };
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    return { status: 'ok', data: (await res.json()) as T };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
