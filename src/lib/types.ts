export type SeriesId = 1 | 2 | 3;

export interface LiveFeed {
  lap_number: number;
  elapsed_time: number;
  flag_state: number;
  race_id: number;
  laps_in_race: number;
  laps_to_go: number;
  run_id: number;
  run_name: string;
  series_id: number;
  time_of_day_os: string;
  track_id: number;
  track_length: number;
  track_name: string;
  run_type: number;
  number_of_caution_segments: number;
  number_of_caution_laps: number;
  number_of_lead_changes: number;
  number_of_leaders: number;
  stage: { stage_num: number; finish_at_lap: number; laps_in_stage: number };
  vehicles: LiveVehicle[];
}

export interface LiveVehicle {
  running_position: number;
  starting_position: number;
  vehicle_number: string;
  vehicle_manufacturer: string;
  sponsor_name: string;
  driver: { driver_id: number; full_name: string; is_in_chase: boolean };
  delta: number;
  laps_completed: number;
  /** Race clock (s) when the car last crossed the start/finish line. */
  vehicle_elapsed_time: number;
  last_lap_time: number;
  last_lap_speed: number;
  best_lap_time: number;
  best_lap_speed: number;
  best_lap: number;
  laps_led: { start_lap: number; end_lap: number }[];
  pit_stops: {
    pit_in_elapsed_time: number;
    pit_out_elapsed_time: number;
    pit_in_lap_count: number;
    pit_in_leader_lap: number;
    positions_gained_lossed: number;
  }[];
  status: number;
  is_on_track: boolean;
  is_on_dvp: boolean;
  average_running_position: number;
  average_restart_speed: number;
  fastest_laps_run: number;
  laps_position_improved: number;
  passes_made: number;
  times_passed: number;
  passing_differential: number;
  quality_passes: number;
}

export interface ScheduleEvent {
  event_name: string;
  notes: string;
  start_time_utc: string;
  run_type: number;
}

export interface RaceSummary {
  race_id: number;
  series_id: number;
  race_season: number;
  race_name: string;
  track_id: number;
  track_name: string;
  race_date: string;
  date_scheduled: string;
  scheduled_laps: number;
  scheduled_distance: number;
  actual_laps: number;
  stage_1_laps: number;
  stage_2_laps: number;
  stage_3_laps: number;
  stage_4_laps?: number;
  number_of_lead_changes: number;
  number_of_leaders: number;
  number_of_cautions: number;
  number_of_caution_laps: number;
  average_speed: number;
  total_race_time: string;
  margin_of_victory: string;
  race_comments: string;
  winner_driver_id: number | null;
  television_broadcaster: string;
  radio_broadcaster: string;
  playoff_round: number;
  schedule: ScheduleEvent[];
}

export interface ResultRow {
  finishing_position: number;
  starting_position: number;
  car_number: string;
  driver_fullname: string;
  driver_id: number;
  team_name: string;
  car_make: string;
  sponsor: string;
  laps_led: number;
  times_led: number;
  laps_completed: number;
  finishing_status: string;
  points_earned: number;
  playoff_points_earned: number;
  diff_laps: number;
  diff_time: number;
  qualifying_position: number;
  qualifying_speed: number;
}

export interface WeekendRace extends RaceSummary {
  results: ResultRow[];
  caution_segments: {
    start_lap: number;
    end_lap: number;
    reason: string;
    comment: string;
    beneficiary_car_number: string | null;
    flag_state: number;
  }[];
  race_leaders: { start_lap: number; end_lap: number; car_number: string }[];
  stage_results: {
    stage_number: number;
    results: { driver_fullname: string; driver_id: number; car_number: string; finishing_position: number; stage_points: number }[];
  }[];
}

export interface WeekendRunResult {
  car_number: string;
  manufacturer: string;
  driver_id: number;
  driver_name: string;
  finishing_position: number;
  best_lap_time: number;
  best_lap_speed: number;
  best_lap_number: number;
  laps_completed: number;
  delta_leader: number;
}

export interface WeekendRun {
  run_type: number;
  run_name: string;
  run_date_utc: string;
  results: WeekendRunResult[];
}

export interface WeekendFeed {
  weekend_race: WeekendRace[];
  weekend_runs: WeekendRun[];
}

export interface LapTimes {
  laps: {
    Number: string;
    FullName: string;
    Manufacturer: string;
    RunningPos: number;
    NASCARDriverID: number;
    Laps: { Lap: number; LapTime: number | null; LapSpeed: string | null; RunningPos: number }[];
  }[];
  flags: { LapsCompleted: number; FlagState: number }[];
}

export interface LapNote {
  FlagState: number;
  Note: string;
  NoteID: number;
  DriverIDs: number[];
}

export interface LapNotes {
  laps: Record<string, LapNote[]>;
}

export interface PitStop {
  vehicle_number: string;
  driver_name: string;
  vehicle_manufacturer: string;
  leader_lap: number;
  lap_count: number;
  pit_in_flag_status: number;
  pit_in_race_time: number;
  in_travel_duration: number;
  out_travel_duration: number;
  total_duration: number;
  pit_stop_duration: number;
  pit_stop_type: string;
  left_front_tire_changed: boolean;
  left_rear_tire_changed: boolean;
  right_front_tire_changed: boolean;
  right_rear_tire_changed: boolean;
  pit_in_rank: number;
  pit_out_rank: number;
  positions_gained_lost: number;
}

export interface PointsRow {
  driver_id: number;
  car_number: string;
  first_name: string;
  last_name: string;
  points: number;
  points_position: number;
  delta_leader: number;
  delta_next: number;
  is_in_chase: boolean;
  is_points_eligible: boolean;
  is_rookie: boolean;
  /** NASCAR's own flag for who holds the race's fastest-lap bonus point. */
  is_fastest_lap_point: boolean;
  points_earned_this_race: number;
  stage_1_points: number;
  stage_2_points: number;
  stage_3_points: number;
  wins: number;
  top_5: number;
  top_10: number;
}

/** NASCAR's highlight clips for a race (published via SnappyTV). */
export interface ClipFeed {
  event: number;
  tracks: Record<string, ClipItem[]> | null;
}

export interface ClipItem {
  type: string;
  id: number;
  title: string;
  tags?: string[];
  video_duration: number;
  created_at: number;
  expired: boolean;
  status: string;
  downloads?: { resolution: string; bitrate: string; url: string }[];
}

/** NASCAR's "raw feed" (racing-insights): one row per car with ~120 running stats. Only the fields we show. */
export interface RawFeed {
  Results: RawResult[];
}

export interface RawResult {
  Number: string;
  S1Fin: number | null;
  S2Fin: number | null;
  S3Fin: number | null;
  LastRestartPosition: number | null;
  LastRestartGL: number | null;
  LastChooseLine: string | null;
  LastChooseRowNumber: number | null;
  TotalTimeOnPitRoad: number | null;
  TotalPitStops: number | null;
  LastStopTireCount: number | null;
  LastStopCompLap: number | null;
  LastStopTime: number | null;
  LastStopRollingTime: number | null;
  LapsInTop5: number | null;
  LapsInTop10: number | null;
  LapsOnLeadLap: number | null;
  BestGreenPos: number | null;
  WorstGreenPos: number | null;
  PosGL10L: number | null;
  TotalPositionsGained: number | null;
  TotalPositionsLost: number | null;
  CrewChiefNameTag: string | null;
  SpotterNameTag: string | null;
  TeamOwner: string | null;
  JackManNameTag: string | null;
  GasManNameTag: string | null;
  FrontTireChangerNameTag: string | null;
  RearTireChangerNameTag: string | null;
  TireCarrierNameTag: string | null;
}

/** live-stage-points.json: stage results as each stage ends. */
export interface LiveStage {
  stage_number: number;
  results: { position: number; vehicle_number: string; driver_id: number; full_name: string; stage_points: number }[];
}

/** live-flag-data.json: every flag change with the caution reason and free-pass car. */
export interface LiveFlag {
  lap_number: number;
  flag_state: number;
  comment: string | null;
  beneficiary: string | null;
}

/** ai.nascar.com race notes: what NASCAR's racecenter timeline shows (AI-written, categorized, with snapshots). */
export interface RaceNotesFeed {
  raceID: number;
  summary: { noteID: string; section: string; content: string; lap: string | number; flag: number }[];
}

/**
 * racinginsights tire and fuel status: NASCAR's own per-car estimate, one file per series. It has no race id and
 * keeps the last race's numbers until the next race in that series starts.
 */
export interface TireFuelStatus {
  RunningPos: number;
  Number: string;
  FullName: string;
  TireColor: 'Green' | 'Yellow' | 'Red' | string;
  LeftsChanged: number;
  RightsChanged: number;
  LapsSinceTiresChanged: number;
  TirePctRemain: number;
  FuelColor: 'Green' | 'Yellow' | 'Red' | string;
  Fueled: number;
  LapsSinceFuel: number;
  FuelPctRemain: number;
}

/** cacher/live/altleaderboard.json: NASCAR's alternate leaderboards for the race in progress (no race id). */
export interface AltLeaderboards {
  /** Average lap time over the last 10 laps (green-flag), whole field. Pos is running position. */
  AvgLaptimeLast10: { Pos: number; CarNum: string; LastName: string; DriverID: number; AvgLapTimeLast10: number }[];
  /** The ten fastest single laps of the race. */
  FastestLaps: { Pos: number; Number: string; LapsCompleted: number; LastLapTime: number; LastName: string; DriverID: number }[];
  /** Positions gained since the last restart. */
  Gainers: { Number: string; LastName: string; DriverID: number; RunningPos: number; LastRestart: number; PosGained: number }[];
}

interface WeatherHour {
  time_epoch: number;
  temp_f: number;
  condition: { text: string };
  chance_of_rain: number;
  wind_mph: number;
  wind_dir: string;
}

/** s3.nascar.com/openweather/weather.json: conditions at the current race weekend's track (no race id). */
export interface Weather {
  location: { name: string; region: string; lat: number; lon: number };
  current: { temp_f: number; condition: { text: string }; wind_mph: number; wind_dir: string; last_updated_epoch: number };
  forecast: { forecastday: { date: string; hour: WeatherHour[] }[] };
}

/** Season manufacturer standings for a series. */
export interface ManufacturerPoints {
  position: string;
  manufacturer: string;
  points: number;
  wins: number;
  delta_leader: string | number;
}

/**
 * NASCAR's leaderboard push on the Ably `VehicleEntryList` channel (viewers with a token), every 15 s, trimmed to
 * what's laid over the live feed. Times in seconds.
 */
export interface EntryList {
  /** Local time it arrived (ms). */
  at: number;
  race_id: number;
  /** Race clock. */
  elapsed: number | null;
  laps_to_go: number | null;
  flag_state: number | null;
  cautions: number | null;
  caution_laps: number | null;
  lead_changes: number | null;
  cars: EntryListCar[];
}

export interface EntryListCar {
  car: string;
  pos: number;
  laps: number;
  last_time: number;
  last_speed: number;
  best_time: number;
  best_speed: number;
  laps_down: number;
  /** Behind the leader, on the lead lap. */
  gap: number;
  on_track: boolean | null;
}
