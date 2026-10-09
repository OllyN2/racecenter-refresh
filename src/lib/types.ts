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
