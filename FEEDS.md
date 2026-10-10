# NASCAR data feeds

Every feed NASCAR's racecenter (`www.nascar.com/live-results/...`) loads or references, found by recording the
page's network traffic during a live race (Charlotte trucks, race 5688, 2026-10-09) and reading
`ndms_race_widgets/asset/js/racecenter-scripts.min.js`. `{Y}` season, `{S}` series (1 Cup, 2 O'Reilly, 3 Trucks),
`{R}` race id, `{CODE}` NCS / NXS / NTS.

All `cf.nascar.com` and `ai.nascar.com` feeds send `Access-Control-Allow-Origin: *` and are uncompressed. Feeds that
don't exist yet return **403** from S3. During a race most live feeds change about every **30 s**, even though
live-ops says to refresh every 5 s.

Measured during the Charlotte truck race (polling every 2 s for 150 s): every copy of the live feed changed every
30–40 s, and its `time_of_day_os` was already ~17 s old when it appeared. Lap times and live points changed every
~40 s, the raw feed every ~60 s, and stage points when a stage ended. Pit data, flags, lap notes and clips changed
only when something happened. The site polls the live feed every 5 s (mostly cheap 304s), so it shows each update
within ~5 s of NASCAR publishing it, and the header shows the data's own timestamp.

**Used** marks what this site reads today: *panel* = only when a driver's details are open, *live* = only during a race, *build* = split into `public/tracks/` by `npm run tracks`.

## Live race

| Feed | Size (race) | Used | What it has |
| --- | --- | --- | --- |
| `cf/live/feeds/live-feed.json` | ~47 KB | ✓ | Current session: lap, flag, every car's position, gap, last/best lap, laps led ranges, pit stops, loop stats. Same data at `cf/cacher/live/live-feed.json`, `cf/cacher/live/series_{S}/{R}/live-feed.json`, `cf/live/feeds/series_{S}/{R}/live_feed.json`. |
| `cf/racing-insights/raw-feed/{R}-{CODE}.json` | ~127 KB | ✓ live + panel | NASCAR's "raw feed": `RunData` (lap, flag, cautions, leaders, and the track's fuel/tire windows: `FuelMax`/`TireMax` in green-flag laps, `Fuel`/`TireYellowLaps` and `RedLaps` warning thresholds for laps left, `PitWindowMin`/`Max`), `FlagSummary`, and ~120 fields per car (incl. `GreenFlagLapsSincePit`, `YellowFlagLapsSincePit`, `GreenFlagLapsSinceLast4TirePit`): `DeltaNext`, `AvgLapTimeSince{2..30}LapsAgo`, `PosGL{2..30}L`, `LastRestartPosition/GL`, `LapsSinceLastPit`, `LastStopTireCount`, box/rolling stop times, laps in top 2/5/10, stage finishes, choose-cone pick, crew chief, spotter, full pit crew, team owner. |
| `cf/cacher/live/series_{S}/{R}/lap-times.json` | grows to ~640 KB | ✓ | Every lap time and running position per car, plus flag per lap. Downloaded once; new laps come from the live feed. |
| `cf/cacher/live/series_{S}/{R}/live-pit-data.json` | ~40–190 KB | ✓ | Every stop: tires changed, box time, in/out travel, positions gained. Lap 0 rows are pre-race, checkered rows post-race. |
| `cf/cacher/live/series_{S}/{R}/live-flag-data.json` | <1 KB | ✓ live | Flag changes with elapsed time, caution reason (`comment`) and free-pass `beneficiary`. |
| `cf/cacher/{Y}/{S}/{R}/live-stage-points.json` | ~4 KB | ✓ live | Stage results as each stage ends. |
| `cf/live/feeds/series_{S}/{R}/live_points.json` | ~65 KB | ✓ | Driver points as they run. |
| `cf/cacher/{Y}/{S}/live-driver-points.json` | ~28 KB | | Live standings with `delta_chase`, `is_clinch`, `chase_eligible`. |
| `cf/cacher/{Y}/{S}/{R}/lap-notes.json` | ~3 KB | fallback | Reporters' lap-by-lap notes (car numbers). Only used when a race has no AI notes. |
| `ai.nascar.com/RaceNotes/{Y}/{R}/race-notes.json` | ~12–30 KB | ✓ | What NASCAR's timeline shows: the lap notes rewritten with driver names, a category per note (`section`: Driver Battles, Restart, Lead Change, …), periodic Race Snapshot summaries (HTML), `flag` (1000 = milestone). |
| `cf/cacher/{Y}/{S}/{R}/snappytv.json` | ~25 KB | ✓ | Highlight clips (MP4s on `downforce.nascar.com`) tagged by lap. Pre-filled with the previous race's clips. `null` for trucks so far. |
| `cf/cacher/live/live-highlights.json` | tiny | | Live highlights list (empty so far). |
| `cf/cacher/{Y}/{S}/{R}/runs.json` | ~1 KB | | Weekend sessions with laps/time remaining, active/complete. |

## Weekend, results and standings

| Feed | Used | What it has |
| --- | --- | --- |
| `cf/cacher/{Y}/{S}/race_list_basic.json` | ✓ | Season schedule for one series (`cf/cacher/{Y}/race_list_basic.json` has all three, 265 KB). |
| `cf/cacher/{Y}/{S}/{R}/weekend-feed.json` | ✓ | Race summary, results, practice/qualifying runs; cautions, leaders and stage results fill in after the race. |
| `cf/raceresults?year={Y}&series={S}&raceid={R}` | | Results in raw-feed shape (`RunData`, `Results`, `FlagSummary`). |
| `cf/cacher/{Y}/{S}/{R}/entryList.json` | | Entry list with crew chief, team, hometown, birth date. |
| `cf/cacher/live/series_{S}/{R}/lap-averages.json` | | Practice 5/10/15/20/25/30-lap averages. |
| `cf/cacher/live/series_{S}/{R}/lap-times-practice.json` | | Practice lap times. |
| `cf/raceSessionResults/{S}/{R}/practice/results-{n}.json`, `.../qualifying/results-{n}.json`, `cf/data/cacher/production/{Y}/{S}/{R}/practice-{n}.json` | | Session results (403 for this race). |
| `cf/cacher/{Y}/{S}/points-feed.json`, `cf/cacher/{Y}/{S}/final/{S}-owners-points.json` | | Season driver and owner points. |
| `cf/cacher/{Y}/{S}/drivers-combined-feed-v2.json`, `cf/cacher/drivers.json` (1.4 MB) | | Driver bios, images, car badges. |
| `cf/cacher/{Y}/{S}/schedule-combined-feed.json`, `cf/cacher/tracks.json` | | Schedule and track details. |
| `cf/racing-insights/inseason-challenge/bracketdata.json` | | In-Season Challenge bracket. |

## Track map

| Feed | Used | What it has |
| --- | --- | --- |
| `cf/data/images/vector-tracks/svg/{trackId}.svg` | | ~2 KB outline of the track (Charlotte is 162). |
| `cf/cacher/tracks/trackMapConfigs.json` (269 KB) | ✓ build | Per track: map rotation/zoom and the racing line as SVG path segments with lengths. The Track tab places cars on this line using live-feed timing (`vehicle_elapsed_time`, `last_lap_time`). |
| `cf/cacher/tracks/layouts.json` (337 KB) | | Per track: GPS bounds, heading, finish-line coordinates. |
| `cf/cacher/tracks/dots.json` (819 KB) | | Sample of the per-car Ably messages (format reference only). |

## Images, video, audio

| Feed | Used | What it has |
| --- | --- | --- |
| `cf/data/images/carbadges/{S}/{number}.png` | ✓ | Car number artwork. |
| `cf/data/images/makes/{make}.png` | | Make logos (we bundle our own). |
| `downforce.nascar.com/output/.../*.mp4` | ✓ | Clip files from the SnappyTV feed. |
| `cf/config/audio/audio_mapping_{S}_3.json` | ✓ NRN | 40 scanner streams (HLS on `sa.aws.nascar.com`). Only NRN radio has `requiresAuth: false`; driver and officials channels need a NASCAR subscription. |
| `cf/live-ops/live-ops.json` | | Site config: refresh interval, video/radio stream URLs, feature switches. |

## Restricted (not usable from this site)

- **Ably realtime** (`wss://main.realtime.ably.net`). Channel `VehicleEntryList` pushes a leaderboard snapshot about
  every 15 s. Channel `vehicle{number}` pushes each car's GPS `location`, `mph`, `nGear`, `Throttle Position`,
  `Brake Pressure`, `Engine Speed` and `aSteering`. Tokens come from
  `f2akd1igr7.execute-api.us-east-1.amazonaws.com/Prod?nlbwa=1`, which only answers requests from `www.nascar.com`
  (other origins get a 502). Getting around that would mean faking NASCAR's origin, so this site doesn't use it.
- **NASCAR Drive** (`cf/drive/{S}/configs-ng.json`): needs CloudFront signed cookies.
- **Scanner channels** with `requiresAuth: true`.
- `1kg8ceiq2a.execute-api.../PROD/?type=getEntries` is only up/down votes on race notes, and
  `www.nascar.com/json/schedule` sits behind Cloudflare's bot check.
