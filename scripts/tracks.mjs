// Splits NASCAR's 269 KB track map config into one small file per track (public/tracks/{trackId}.json), so the
// tracker only downloads the track being raced. Re-run when NASCAR adds or redraws a track: `npm run tracks`.
import fs from 'node:fs';

const SRC = 'https://cf.nascar.com/cacher/tracks/trackMapConfigs.json';
const OUT = new URL('../public/tracks/', import.meta.url);

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${SRC}: HTTP ${res.status}`);
const all = await res.json();
fs.mkdirSync(OUT, { recursive: true });

const join = (paths) => [...paths].sort((a, b) => a.Ordinal - b.Ordinal).map((p) => p.PathData.trim()).join(' ');
let n = 0;
for (const [id, t] of Object.entries(all)) {
  const d = t.trackData;
  if (!d?.TrackPaths?.length) continue;
  const track = {
    id: Number(id),
    name: t.name,
    // Racing line from the start/finish line in the direction of travel, then pit road from pit-in.
    line: join(d.TrackPaths),
    pit: d.PitPaths?.length ? join(d.PitPaths) : null,
    finish: d.FinishLine ? [Number(d.FinishLine.TranslateX), Number(d.FinishLine.TranslateY)] : null,
  };
  fs.writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(track));
  n++;
}
console.log(`wrote ${n} tracks to public/tracks/`);
