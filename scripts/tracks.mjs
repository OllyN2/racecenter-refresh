// Keeps each track's center from NASCAR's 269 KB track map config in one tiny file per track
// (public/tracks/{trackId}.json): the GPS map opens on it, and the weather check compares it with the forecast's
// location. Re-run when NASCAR adds a track: `npm run tracks`.
import fs from 'node:fs';

const SRC = 'https://cf.nascar.com/cacher/tracks/trackMapConfigs.json';
const OUT = new URL('../public/tracks/', import.meta.url);

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${SRC}: HTTP ${res.status}`);
const all = await res.json();
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
for (const [id, t] of Object.entries(all)) {
  if (!t.trackData?.TrackPaths?.length) continue;
  const track = {
    id: Number(id),
    name: t.name,
    // [lat, lon]
    center: t.center ? [Number(t.center.latitude.toFixed(4)), Number(t.center.longitude.toFixed(4))] : null,
  };
  fs.writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(track));
  n++;
}
console.log(`wrote ${n} tracks to public/tracks/`);
