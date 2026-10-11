# NASCAR data feeds

Every NASCAR data feed we know of, what it holds, and whether this site uses it. Sources:

- **web**: NASCAR's racecenter page (`www.nascar.com/live-results/...`), from recording its network traffic during a
  live race (Charlotte trucks, race 5688, 2026-10-09) and reading
  `ndms_race_widgets/asset/js/racecenter-scripts.min.js`. Checked again against a full network capture (HAR) of the
  leaderboard and racecenter around the green flag of the Charlotte Cup race (5629, 2026-10-11), including its Ably
  WebSocket frames: every data request in it is listed here.
- **app**: the mobile app's config, `https://cf.nascar.com/mobile-cms/general/debug/config.json` (68 KB, its `Feeds`
  section).
- **probe**: found or checked by requesting URLs directly.

Placeholders: `cf/` = `https://cf.nascar.com/`, `{Y}` season, `{S}` series (1 Cup, 2 O'Reilly, 3 Trucks), `{CODE}`
NCS / NXS / NTS, `{R}` race id, `{driverId}` NASCAR driver id, `{trackId}` NASCAR track id (Charlotte is 162).
Sizes are from the 2026-10-09 Charlotte truck race.

**How the feeds behave**

- All `cf.nascar.com`, `ai.nascar.com` and `s3.nascar.com` feeds send `Access-Control-Allow-Origin: *`, and none are
  compressed.
- A feed that doesn't exist yet returns **403** from S3.
- Several "current race" feeds have **no race id**. They keep the last race's data until the next one starts, so
  check them against the race you're showing.
- During a race, every copy of the live feed changed every 30–40 s, even though live-ops says to refresh every 5 s,
  and its `time_of_day_os` was ~17 s old when it appeared. Lap times and live points changed every ~40 s, the raw
  feed every ~60 s. Pit data, flags, notes and clips changed only when something happened. Measured by polling every
  2 s for 150 s.
- The site polls the live feed every 5 s (mostly cheap 304s) and shows the data's own timestamp in the header.
  With a viewer's token, a live race also takes NASCAR's Ably leaderboard push, which runs 20–30 s ahead (see
  [below](#live-gps-and-telemetry-viewers-own-token)).
- nascar.com itself polls the live feed and race-note votes every 10 s, lap times every 14 s, the raw feed and
  `runs.json` every 15 s, and live-ops every 5 s (it never changed during the capture).

**Used** column: ✓ always, *live* only during a race, *panel* only when a driver's details are open, *fallback* when
the preferred feed is missing, *build* read by `npm run tracks` into `public/tracks/`.

## Live timing and scoring

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/live/feeds/live-feed.json` | ~47–85 KB | ✓ | probe | The current session (practice, qualifying or race): lap, flag, laps to go, stage, cautions, lead changes, and for every car: position, gap to the leader (`delta`, negative = laps down), last/best lap and speed, laps-led ranges, pit stops (an entry appears only once the car leaves pit road), status (1 running, other = out), `is_on_track` (false while running = on pit road), `is_on_dvp`, loop stats (average position, fastest laps run, restart speed; passes stay 0 until after the race). Identical copies: `cf/cacher/live/live-feed.json` (web, app), `cf/cacher/live/series_{S}/{R}/live-feed.json` (web), `cf/live/feeds/series_{S}/{R}/live_feed.json` (web). |
| `cf/raceSessionResults/{S}/{R}/race/results.json` | ~47 KB | | app | The "cached composite feed": the same shape as the Ably `VehicleEntryList` push. Has `et`, `run` (laps, laps remaining, time remaining), `flgs` (every flag with time), `entries` (driver, owner, vehicle details), `results` per car (position, lap, lap time, speed, best lap, interval `gap_tm`, total time, status text such as "DNF/Accident"), `leaders`, and `riRun` (cautions, stage ends, fuel/tire windows). Not yet known whether it updates faster than the live feed during a race. |
| `cf/cacher/live/series_{S}/{R}/lap-times.json` | grows to ~640 KB | ✓ | web | Every lap's time, speed and running position for every car, plus the flag on each lap. The site downloads it once and adds new laps from the live feed. Year-path copy: `cf/cacher/{Y}/{S}/{R}/lap-times.json` (app). |
| `cf/cacher/live/series_{S}/{R}/live-pit-data.json` | ~40–190 KB | ✓ | probe | Every stop: lap, flag in/out, tires changed (per corner), stopped time, in/out travel time, total time on pit road, positions gained or lost. Lap 0 rows are cars leaving pit road before the start; rows under the checkered flag are post-race. Copies: `cf/cacher/live/live-pit-data-app.json` (app, current race, no race id), `cf/cacher/{Y}/{S}/{R}/live-pit-data.json` (app). |
| `cf/cacher/live/series_{S}/{R}/live-flag-data.json` | <1 KB | ✓ live | probe | Every flag change with lap, elapsed time, caution reason (`comment`) and free-pass `beneficiary`. The site builds live caution segments from it, because the weekend feed only lists them after the race. |
| `cf/cacher/{Y}/{S}/{R}/live-stage-points.json` | ~4–7 KB | ✓ live | web, app | Stage results (position, car, driver, stage points) as each stage ends. |
| `cf/cacher/{Y}/{S}/{R}/runs.json` | ~1 KB | | web | The weekend's sessions (practice, qualifying, race) with laps and time remaining and active/complete flags. |

## Racing insights

NASCAR's "racing insights" data. The racecenter page uses the raw feed; the rest come from the app config's
`RacingInsightsFeeds` group plus its season points file. Probing ~45 other names in `cf/cacher/racinginsights/graphics/`
and the other endpoints on `feed.racinginsights.com` found nothing else.

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/racing-insights/raw-feed/{R}-{CODE}.json` | ~107–190 KB | ✓ panel | web | The full "raw feed". `RunData` holds lap, flag, cautions, lead changes, stage ends, the longest green run, and the track's fuel/tire windows (`FuelMax`/`TireMax` in green-flag laps, yellow/red thresholds, `PitWindowMin`/`Max`). `FlagSummary` holds time under each flag. `Results` has ~111 fields per car: position, gap to the leader and to the car ahead (`DeltaNext`), average lap time over the last 2–30 laps, positions gained/lost over the last 2–30 laps, last restart position and gain, choose-cone pick, laps since pit (green and yellow), last stop (tires, stopped time, rolling time), total pit-road time, laps in the top 2/5/10, best/worst position, stage finishes, crew chief, spotter, owner and full pit crew. Exists for past races too. |
| `cf/cacher/live/current-results.json` | ~77 KB | | web, app | The current race's racing-insights results in the raw feed's shape, minus 35 fields (last-N-lap gains and averages, `DeltaNext`, green/yellow laps since pit, total positions gained/lost). No race id. |
| `cf/cacher/{Y}/{S}/{R}/current-results.json` | ~77 KB | | app | The same, for a given race (the app's post-race results). |
| `cf/cacher/racinginsights/graphics/{S}-tireandfuelstatus.json` | ~8 KB | ✓ live | app | NASCAR's official fuel and tire status per car: `FuelPctRemain`, `TirePctRemain`, `FuelColor`/`TireColor` (Green/Yellow/Red), lap when last fueled, laps when the lefts and rights were changed, laps since each. One file per series with no race id; the site only uses it when its cars match the field and nobody was fueled after the current lap. Drives the Fuel · Tires gauges. |
| `cf/cacher/live/altleaderboard.json` | ~12 KB | ✓ live | app | NASCAR's alternate leaderboards for the race in progress: `AvgLaptimeLast10` and `AvgLaptimeLast20` (green-flag averages, whole field), `FastestLaps` (ten fastest single laps), `LapLeaders`, `StagePoints`, `Gainers` and `Losers` since the last restart. No race id; checked like the tire file. Drives the "Last 10" column, the Fastest-right-now and Biggest-gain-since-the-restart cards, and the live fastest-lap badge. |
| `cf/cacher/{Y}/{S}/racinginsights-points-feed.json` | ~52 KB | | app | Season driver standings with racing-insights extras: playoff rank and points, `projected_playoff_points`, `is_clinch`, `playoff_eligible`, `pre_week_points_pos` and `pos_gl` (positions gained or lost in the standings this week), stage wins, top 5/10, laps led, DNFs. |
| `feed.racinginsights.com/feed/livepoints?series={CODE}&raceid={R}` | ~28 KB | | app | Live standings API; the same rows as `live-driver-points.json`. |
| `cf/racing-insights/inseason-challenge/bracketdata.json` | ~20 KB | | web, app | In-Season Challenge bracket: rounds, matchups, next event. The app has its screen switched off. |

## Points and standings

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/live/feeds/series_{S}/{R}/live_points.json` | ~65 KB | ✓ | web | Driver points for a race as they run: position, points, behind, points this race, stage points, wins, top 5/10, `is_in_chase` (the reliable Chase flag), `is_fastest_lap_point` (holder of the fastest-lap bonus point), `is_points_eligible`. Before a race it can still hold another series' standings. Copy for the current race: `cf/cacher/live/live-points-app.json` (app). |
| `cf/cacher/{Y}/{S}/live-driver-points.json` | ~28 KB | | web, app | Live series standings with `delta_chase`, `is_clinch` and `chase_eligible`. |
| `cf/cacher/{Y}/{S}/live-driver-points-sim.json` | ~24 KB | | web | A points simulation (projected positions and stage points per driver). Last updated January 2026, so stale. |
| `cf/cacher/{Y}/{S}/points-feed.json` | ~73 KB | | web (live-ops) | Season driver points with wins, stage wins, top 5/10, laps led, DNFs and winnings. |
| `cf/cacher/{Y}/{S}/final/{S}-manufacturer-points.json` | ~1 KB | ✓ | app | Season manufacturer standings: points, wins, behind. Shown on Stages & points. |
| `cf/cacher/{Y}/{S}/ownerpoints-feed.json` | ~15 KB | | app | Owner standings (the owner championship). Final copy: `cf/cacher/{Y}/{S}/final/{S}-owners-points.json` (web). |

## Notes, clips and highlights

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `ai.nascar.com/RaceNotes/{Y}/{R}/race-notes.json` | ~12–30 KB | ✓ | web | What NASCAR's timeline shows: the lap notes rewritten with driver names, one category per note (`section`: Driver Battles, Restart, Lead Change, Pit Stop, …), Race Snapshot summaries as HTML every ~30 laps, and `flag` (1 green, 2 caution, 4 checkered, 1000 milestone). |
| `cf/cacher/{Y}/{S}/{R}/lap-notes.json` | ~3–13 KB | fallback | probe, app | The reporters' original lap-by-lap notes, with car numbers. Used only when a race has no AI notes. |
| `cf/cacher/{Y}/{S}/{R}/snappytv.json` | ~25 KB | ✓ | web, app | Highlight clips: title, length, tags (including "lap N"), and MP4 renditions on `downforce.nascar.com` ("-high" is 720p). Clips appear a few minutes after the moment. The next race's file is pre-filled with the previous race's clips, so the site ignores clips published before the race started. |
| `cf/cacher/live/live-highlights.json` | tiny | | web, app | Live highlights list (empty all race at Charlotte). |
| `cf/mobile-cms/temp/Feed/MostPopularMedia_STUB.json` | tiny | | app | Placeholder ("most popular" media, empty). |
| `1kg8ceiq2a.execute-api.us-east-1.amazonaws.com/PROD/?type=getEntries&raceID={R}` | <1 KB | | web | Up/down votes on each race note (`noteid`, `upVote`, `downVote`), the counts shown on NASCAR's timeline. |

## Weekend, schedule and results

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/cacher/{Y}/{S}/race_list_basic.json` | 66–111 KB | ✓ | app, probe | One series' season schedule: race, track, dates, laps, stage lengths, TV/radio, results summary. The all-series file `cf/cacher/{Y}/race_list_basic.json` is 265 KB, and `cf/cacher/{Y}/race_list_basic1.json` (app) is a 259 KB variant. Scheduled laps can be wrong (Charlotte trucks listed 167, ran 134), so the live feed's `laps_in_race` wins. |
| `cf/cacher/{Y}/{S}/schedule-feed.json` | 22–34 KB | | app | Every session of the season for a series (practice, qualifying, race) with start/end times. |
| `cf/cacher/{Y}/{S}/schedule-combined-feed.json`, `cf/cacher/{Y}/sorted-schedule-combined-feed.json` | 150 / 595 KB | | web / app | One entry per race: race state, logos, track images and links, date, ticket links, TV and radio. The sorted file covers all series. |
| `cf/cacher/{Y}/{S}/{R}/weekend-feed.json` | ~55 KB | ✓ | web, app | Race summary, entry list/results, and practice/qualifying results. Caution segments, race leaders and stage results only fill in after the race. |
| `cf/cacher/{Y}/{S}/{R}/entryList.json` | ~56 KB | | web | Entry list with crew chief, team, hometown and birth date. |
| `cf/raceresults?year={Y}&series={S}&raceid={R}` | ~63 KB | | web | Results in the raw feed's shape (`RunData`, `Results`, `FlagSummary`). |
| `cf/raceSessionResults/{S}/{R}/practice/results-{n}.json`, `.../qualifying/results-{n}.json`, `cf/data/cacher/production/{Y}/{S}/{R}/practice-{n}.json` | | | web | Session results (403 for the Charlotte truck race). |
| `cf/cacher/live/series_{S}/{R}/lap-averages.json` | ~15 KB | | web | Practice 5/10/15/20/25/30-lap averages. Year-path copy: `cf/cacher/{Y}/{S}/{R}/lap-averages.json` (app). |
| `cf/cacher/live/series_{S}/{R}/lap-times-practice.json` | ~81 KB | | web | Practice lap times. |
| `cf/cacher/{Y}/race_list_basic_watch.json` | | | app | 403. |

## Drivers, teams and tracks

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/cacher/drivers.json` | 1.4 MB | | web | Every driver: bio, images, car badge URL, team, sponsor, career stats. |
| `cf/cacher/{Y}/{S}/drivers-combined-feed-v2.json`, `cf/cacher/{Y}/{S}/drivers-combined-feed1.json` | 55 / 24 KB | | web / app | A series' drivers with bios and badges. |
| `cf/cacher/{Y}/{S}/drivers/{driverId}-info-feed.json` | ~17 KB | | app | One driver's career summary by track (starts, wins, top 5/10, poles, DNFs, laps led, average start and finish), by track type, by race and by year. |
| `cf/cacher/{Y}/{S}/drivers/{driverId}-race-list.json` | ~118 KB | | app | One driver's races in a season. |
| `cf/cacher/drivers-additional-info.json` | tiny | | app | A leftover single entry (Jeff Gordon). The config's path (`cacher/cacher/...`) returns 403. |
| `cf/cacher/{Y}/teams.json` | ~4 KB | | app | Teams: name, manufacturer, logo, link. |
| `cf/cacher/tracks.json` | ~53 KB | | web | Track details. |
| `cf/cacher/tracks/static-all-tracks.json` | ~48 KB | | app | Track details: surface, type, banking, year built, city/state, straightaway lengths, seating, owner. |
| `cf/cacher/tracks/bolt6_tracks_properties.json` | ~28 KB | | app | Per track: mapped map coordinates. |

## Track map

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/cacher/tracks/trackMapConfigs.json` | 269 KB | ✓ build | web | Per track: map rotation and zoom, center latitude/longitude, the racing line as ordered SVG path segments from the start/finish line, pit road paths and finish-line position. `npm run tracks` keeps each track's name and center in `public/tracks/{trackId}.json` (~70 bytes each): the GPS map opens on it, and the weather check compares it with the forecast's location. nascar.com's map (OpenLayers) places live GPS dots straight from latitude/longitude, over either Esri satellite tiles or this SVG pinned at `center + svgOffset` with the config's zoom, rotation and `svgScale`. The SVG isn't drawn to scale, so its hand-set placement can't be trusted for GPS; this site shows live GPS on satellite tiles only (see below). |
| `cf/cacher/tracks/layouts.json` | 337 KB | | web | Per track: GPS bounds, heading, finish-line coordinates. |
| `cf/data/images/vector-tracks/svg/{trackId}.svg` | ~2 KB | | web | Plain outline of the track. |
| `cf/cacher/tracks/dots.json` | 819 KB | | web | nascar.com's `?replay` sample of the per-car Ably messages: Phoenix, races 5427 and 5428, 4 cars each, about 1 message per car per second (`timestamp`, `vehicle_id`, `raceID`, `location` [lat, lon], `mph`, `nGear`, `Throttle Position`, `Brake Pressure`, `Engine Speed`, `aSteering`). Used to test the Track tab's GPS map offline. |
| `cf/cacher/tracks/trackPreview.webm` | 2.2 MB | | web | Preview video shown before the map loads. |

## Weather

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `s3.nascar.com/openweather/weather.json` | ~35 KB | ✓ | app | Weather at this weekend's track: location, `current` conditions (temperature, condition, wind, humidity, chance of rain) and a 2-day hourly `forecast`. No race id; the site shows it only within 30 km of the race's track, as current conditions during the race or the race-time forecast for one starting within two days. |

## Images, video and audio

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/data/images/carbadges/{S}/{number}.png` | 1–5 KB each | ✓ | web, probe | Car number artwork, 78×70. A missing number returns 403. |
| `cf/data/images/makes/{make}.png` | | | web | Make logos. The site bundles its own copies instead. |
| `downforce.nascar.com/output/7/prod/{clipId}/mp4/*.mp4` | ~6 MB/min | ✓ | web | Clip files from the SnappyTV feed. No cookies, supports range requests. |
| `cf/config/audio/audio_mapping_{S}_3.json` | ~9 KB | ✓ live | web, app | 40 scanner streams (HLS on `sa.aws.nascar.com/driveaudio3/stream_{n}.m3u8`, 2 s AAC segments): All Scan, every driver, officials, NRN. Only NRN radio has `requiresAuth: false`; it's the site's NRN radio button. |
| Video streams in live-ops (`dw9ptu32blt7h.cloudfront.net/...m3u8`, `live.nascar.com/presspass01/master.m3u8`, `mrn.streamguys1.com/...`) | | | web | Hero player and Press Pass streams and the MRN radio stream named in live-ops. Not checked further. |

## Site and app configuration

| Feed | Size | Used | Found | What it has |
| --- | --- | --- | --- | --- |
| `cf/live-ops/live-ops.json` | ~14 KB | | web | NASCAR's site config: live refresh interval (5000 ms), stream URLs, feature switches (`live_drive_ng_hide_telemetry`), Chase text. Staging copy: `cf/data/live-ops/stage/live-ops.json`. |
| `cf/mobile-cms/general/debug/config.json` | 68 KB | | app | The mobile app's config: every feed in this document marked "app", feature flags, menus, strings. |
| `cf/mobile-cms/live-na.json` | ~5 KB | | app | The app's live state: the race it treats as live, the current race id per series, and which live features are on (Live Camera, InCar Audio, Dot Racing, Timeline, …). |
| `cf/page-config/prod/homePage2025.json` | ~18 KB | | app | Home page layout and headlines. |
| `cf/cacher/{Y}/{S}/article-feed.json`, `cf/cacher/{Y}/app-article-feed.json`, `cf/cacher/{Y}/app-video-feed.json`, `cf/cacher/{Y}/app-gallery-feed.json` | up to ~1 MB | | app | News articles, videos and photo galleries. |
| `d3bd0tgyk368z1.cloudfront.net/feeds/epg/nascar01_nascar/AMG00115C1.json` | ~214 KB | | app | TV program guide. |
| `cf/rewards/prod/*.json`, `cf/mobile-cms/ar_sim_feed.json`, `cf/cacher/2020/1/ar-portal-feed.json`, `cf/mobile-cms/splash/**` | | | app | Fan rewards, AR features and splash animations. App-only. |
| `fantasygames.nascar.com` | | | app | Fantasy games API base. Not checked further. |

## Live GPS and telemetry (viewer's own token)

**Ably realtime** (`wss://main.realtime.ably.net`, JSON protocol `v=6`, `heartbeats=bounce`) carries NASCAR's GPS
positions, car telemetry and a faster leaderboard. The site uses it only with a token the viewer pastes on the Track
tab, which is the GPS map alone and asks for the token first. These two channels are all nascar.com attaches. Ably doesn't compress the socket (no `permessage-deflate`).

- Channel `vehicle{number}` (✓ used; the live feed's `vehicle_number`) pushes one car's `VehicleData` about every
  1.7 s in a race. The Track tab attaches every running car, and an open driver panel attaches that one car. Messages
  for another `raceID` are dropped. Measured over 138k messages of the 2026-10-11 Cup race:
  - `location` [lat, lon] and `locationTimestamp` (ms, on whole tenths of a second) are the fix. The GPS is clean:
    the distance between fixes matches the reported speed to ±2% and their direction matches `Heading` to a few
    degrees. But a fix is 0.9–3 s old when it arrives (median 2 s), and ~1% of messages repeat an old fix or
    position, or arrive out of order.
  - `timestamp` is in ms in some messages and µs in others.
  - `mph` (whole numbers) is always there. `Speed` and `Heading` (degrees from north) are finer, but drop out as
    both 0 (5% of messages), and three cars (#35, #88, #66) never sent them.
  - `aSteering` is the steering wheel angle in degrees, positive left. Cars sit 5–28° right on the straights (oval
    setups), past 90° only at walking pace in the pits, and ±360 is a glitch.
  - `Throttle Position` 0–100 (occasionally 101); `Brake Pressure` up to ~1,500 (nascar.com shows it as a
    percentage of 250); `Engine Speed` (some cars read near 0 for laps at a time); `nGear` (−1 at walking pace);
    `leadLap` (always empty).
  - The site plays every car back at one shared moment, as far behind as the next fix usually takes to arrive
    (~5 s, the same lag as drawing each message on arrival), on a curve through the fixes from their heading and
    speed, with the readings eased between samples (`src/lib/playback.ts`). Replaying the race, that cut frames where
    a car lurched from 6.4% to 0.1% and kept cars on the racing line (11 m off at worst before, 1.3 m after).
    Channels are attached with `rewind: "6s"`, so cars show at once.
- Channel `VehicleEntryList` (✓ live) pushes a leaderboard snapshot every 15 s (~20 KB, so ~5 MB an hour), in the same
  shape as `raceSessionResults/{S}/{R}/race/results.json`. Per car: `no`, `ps` (position), `lap` (laps completed),
  `lap_tm`/`best_tm` (ms), `spd`/`best_spd`, `delta_tm` (ms behind the leader) and `delta_lap` (laps down),
  `status_id`, and `riData` (`IsOnTrack`, `LapsSinceLastPit`, `LapsLed`, `PointsThisRace`, …). Per race: `et` (race
  clock, ms), `run.laps_rem`, `flgs` (every flag with its lap), and `riRun` (cautions, caution laps, lead changes,
  stage ends). On the 2026-10-11 Cup race every field matched the live feed's exactly at the same lap, and it was
  20–28 s ahead of the live feed (median, per car-lap; never behind) and showed pit road ~37 s sooner. It has no names,
  pit stops or laps-led ranges, so a live race lays it over the live feed (`withEntryList`) whenever a page with a
  live race is open and a token is set. About 1 push in 35 puts two cars in one position mid-update; those are
  skipped. Attaching with `params: {rewind: "1"}` sends the latest push at once. nascar.com instead reads it on load
  from the REST history, `main.realtime.ably.net/channels/VehicleEntryList/messages?envelope=json` (the last 9).
- **Tokens** come from `f2akd1igr7.execute-api.us-east-1.amazonaws.com/Prod?nlbwa=1`, which answers only
  `www.nascar.com` (other origins get a 502). It returns ready-made TokenDetails: `token`, `keyName`, `issued`,
  `expires` (1 hour), and `capability` `{"[*]*":["history","presence","subscribe"]}`. The site never asks for a token
  and never fakes NASCAR's origin. The viewer runs the one-liner the Track tab shows in the console of their own
  nascar.com tab and pastes the result. The token is kept only in that browser (`localStorage`, until it expires),
  and the socket closes while the page is hidden or nothing on screen needs it.
- **Satellite tiles** (✓ used, only while live GPS is streaming):
  `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, Esri World Imagery, the
  same imagery nascar.com's map can use. It's a JPEG of ~15 KB per 256 px tile, and about 12 tiles frame a track.
  Cars are placed straight from GPS with web-mercator maths. There's no map library and no fitting; on the Phoenix
  sample every fix lands on the racing surface. The map opens on a box a quarter lap each way from the track center
  (Charlotte's center is 36 m from the middle of its GPS fixes) and never moves on its own; the viewer pans,
  zooms and rotates it, and tiles load for the level in view. `layouts.json` has per-track GPS bounds, but 11 of 35 don't contain
  their track's center (Texas has Darlington's) and Charlotte's cut off the east end by 20 m, so they aren't used.
  Attribution: Esri, Maxar, Earthstar Geographics.

## Not usable from this site

- **Sportvision RaceView stream**: `wss://test.nascardatalive.com/raceviewweb` (app) no longer resolves. The staging
  `ws://dev.nascardatalive.com:5002/racefeed` is unencrypted, which browsers block on HTTPS pages.
- **NASCAR Drive** (`cf/drive/{S}/configs-ng.json`): needs CloudFront signed cookies.
- **Scanner channels** with `requiresAuth: true` (every driver, officials, All Scan): nascar.com plays them only for
  signed-in visitors, so the site leaves them out.
- **Ad slots**: `www.nascar.com/adunit/{id}/` (web) is JSON for nascar.com's ads.
- **Betting odds**: `cf/cacher/{Y}/{S}/{R}/winner-odds.json` (app) returns 403, and
  `fantasygames.nascar.com/api/static-v1/live/odds/race/{R}.json` (app) returns 404.
- **`www.nascar.com/json/...`**: `json/schedule/?season={Y}` (web) and `json/playoff_standings_drivers/?wid={S}` (app)
  sit behind Cloudflare's bot check.
- **`jllw22czv9.execute-api.us-east-1.amazonaws.com/prod/nascar-rewards`** (web): account-only rewards check-in.
