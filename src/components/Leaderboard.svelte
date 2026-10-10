<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { feeds } from '../lib/api';
  import { lapTime, speed } from '../lib/format';
  import type { CarInsight, RaceInsights } from '../lib/insights';
  import type { BoardSource, LeaderboardRow } from '../lib/normalize';
  import { useFeed } from '../lib/poll.svelte';
  import type { RawFeed, TireFuelStatus } from '../lib/types';
  import CarNumber from './CarNumber.svelte';
  import DriverDetail from './DriverDetail.svelte';
  import DriverName from './DriverName.svelte';
  import FastestLapBadge from './FastestLapBadge.svelte';
  import FuelTires from './FuelTires.svelte';
  import Insights from './Insights.svelte';
  import MakeBadge from './MakeBadge.svelte';

  let {
    sources,
    series,
    raceId,
    insights = null,
    chaseIds,
    fastestLap = null,
  }: {
    sources: BoardSource[];
    series: number;
    raceId: number;
    insights?: RaceInsights | null;
    /** Chase drivers from the race's points file, for result rows (live rows carry the flag themselves). */
    chaseIds?: Set<number>;
    /** Holder of the race's fastest lap, which earns a bonus point. */
    fastestLap?: { car: string; time: number | null; lap: number | null } | null;
  } = $props();

  let picked = $state<string | null>(null);
  const active = $derived(sources.find((s) => s.id === picked) ?? sources[0]);
  const mode = $derived(active?.mode);
  const rows = $derived(
    (active?.rows ?? []).map((r) =>
      !r.driver.chase && chaseIds?.has(r.driverId) ? { ...r, driver: { ...r.driver, chase: true } } : r,
    ),
  );
  // Only the race itself has a fastest-lap bonus; practice and qualifying sessions don't.
  const fastestCar = $derived(fastestLap && (mode === 'race' || mode === 'final') ? fastestLap.car : null);

  let flash = $state<Record<string, 'up' | 'down'>>({});
  let prevPos = new Map<string, number>();
  let prevSource = '';
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const src = active;
    if (!src) return;
    untrack(() => {
      const changed: Record<string, 'up' | 'down'> = {};
      if (src.id === prevSource) {
        for (const r of src.rows) {
          const before = prevPos.get(r.key);
          if (before != null && r.pos != null && before !== r.pos) changed[r.key] = r.pos < before ? 'up' : 'down';
        }
      }
      prevSource = src.id;
      prevPos = new Map(src.rows.filter((r) => r.pos != null).map((r) => [r.key, r.pos!]));
      if (Object.keys(changed).length) {
        flash = changed;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (flash = {}), 2500);
      }
    });
  });

  $effect(() => () => clearTimeout(flashTimer));

  function moved(r: LeaderboardRow): number | null {
    return r.pos != null && r.start != null ? r.start - r.pos : null;
  }

  // Race analysis only applies to the race itself, not practice or qualifying sessions.
  const analysis = $derived(insights && (mode === 'race' || mode === 'final') ? insights : null);
  const COLS = 10;

  let open = $state<string | null>(null);

  // NASCAR's raw feed (~130 KB) carries pit, running and crew details for the panel. It loads on the first opened
  // panel and then stays, refreshing about as often as it changes (once a minute) while live.
  let wantRaw = $state(false);
  $effect(() => {
    if (open) wantRaw = true;
  });
  const raw = useFeed<RawFeed>(
    () => (wantRaw ? feeds.rawFeed(series, raceId) : null),
    () => (active?.live && wantRaw ? 60_000 : null),
  );
  const rawByCar = $derived(new Map((raw.feed.data?.Results ?? []).map((r) => [r.Number, r])));

  // NASCAR's own tire and fuel status (8 KB) for the running race.
  const liveRace = $derived(!!active?.live && mode === 'race');
  const tireFuel = useFeed<TireFuelStatus[]>(
    () => (liveRace ? feeds.tireFuel(series) : null),
    () => (liveRace ? 15_000 : null),
  );
  // The file has no race id and holds the series' previous race until this one updates it, so only trust it when
  // its cars are this field and nobody was fuelled after the current lap.
  const tireFuelByCar = $derived.by(() => {
    const list = tireFuel.feed.data;
    if (!liveRace || !list?.length) return null;
    const cars = new Set(rows.map((r) => r.car));
    const lap = Math.max(0, ...rows.map((r) => r.laps ?? 0));
    const ours = list.filter((s) => cars.has(s.Number)).length / list.length;
    const current = list.filter((s) => s.Fueled <= lap + 1).length / list.length;
    return ours >= 0.8 && current >= 0.8 ? new Map(list.map((s) => [s.Number, s])) : null;
  });

  function canOpen(ins: CarInsight | undefined): ins is CarInsight {
    return !!ins && (ins.stints.length > 0 || !!ins.stats || ins.restarts.length > 0);
  }

  async function show(car: string) {
    const race = sources.find((s) => s.mode === 'race' || s.mode === 'final');
    if (race && race.id !== active?.id) picked = race.id;
    open = car;
    await tick();
    document.getElementById(`row-${car}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function tireNote(t: NonNullable<CarInsight['tire']>): string {
    return t.tires == null ? 'since stop' : `${t.tires} tires`;
  }
</script>

{#if sources.length > 1}
  <div class="pill-group sources" role="group" aria-label="Session">
    {#each sources as s (s.id)}
      <button class="pill" aria-pressed={s.id === active?.id} onclick={() => (picked = s.id)}>
        {#if s.live}<span class="live" aria-hidden="true"></span>{/if}{s.label}
      </button>
    {/each}
  </div>
{/if}

{#if analysis}<Insights cards={analysis.cards} onpick={show} />{/if}

<div class="card">
  {#if !active || !active.rows.length}
    <p class="empty">No timing data yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            {#if mode !== 'entry'}<th class="r">Pos</th>{/if}
            {#if mode === 'race' || mode === 'final'}<th class="r wide" title="Positions gained or lost since the start">+/−</th>{/if}
            <th class="r">#</th>
            <th>Driver</th>
            <th class="wide">Make</th>
            {#if mode !== 'entry'}<th class="r">Gap</th>{/if}
            {#if mode === 'race'}
              <th class="r">Last lap</th>
              {#if analysis?.officialPace}
                <th class="r wide" title="NASCAR's average lap time over the last 10 laps">Last 10</th>
              {:else}
                <th class="r wide" title="Average of the last 5 green-flag laps">Pace</th>
              {/if}
              <th class="r wide">Led</th>
              {#if tireFuelByCar}
                <th class="r wide" title="NASCAR's tire and fuel status: share of fuel and tire life left">Fuel · Tires</th>
              {:else}
                <th class="r wide" title="Laps on the current tires">Tires</th>
              {/if}
            {:else if mode === 'timed'}
              <th class="r">Best lap</th>
              <th class="r wide">mph</th>
              <th class="r wide">Laps</th>
            {:else if mode === 'final'}
              <th class="r wide">Laps</th>
              <th class="r wide">Led</th>
              <th>Status</th>
              <th class="r wide">Pts</th>
            {:else}
              <th class="wide">Team</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.key)}
            {@const d = moved(r)}
            {@const ins = analysis?.cars.get(r.car)}
            {@const expandable = canOpen(ins)}
            {#snippet badges()}
              {#if ins?.onPitRoad}<span class="badge pit" title="On pit road">Pit</span>
              {:else if active?.live && r.status === 'Out'}<span class="badge" title="Out of the race">Out</span>
              {:else if active?.live && r.onTrack === false && (r.laps ?? 0) > 0}<span class="badge" title="Not on track">Off</span>{/if}
              {#if ins?.dvp}<span class="badge dvp" title="Under the damaged vehicle policy clock">DVP</span>{/if}
              {#if fastestLap && r.car === fastestCar}
                <FastestLapBadge time={fastestLap.time} lap={fastestLap.lap} eligible={!r.driver.ineligible} />
              {/if}
            {/snippet}
            <tr
              id="row-{r.car}"
              class={flash[r.key] ? `flash-${flash[r.key]}` : ''}
              class:expandable
              class:open={expandable && open === r.car}
              class:chase={r.driver.chase}
              onclick={() => expandable && (open = open === r.car ? null : r.car)}
            >
              {#if mode !== 'entry'}<td class="r pos">{r.pos ?? '—'}</td>{/if}
              {#if mode === 'race' || mode === 'final'}
                <td class="r wide delta" class:up={d && d > 0} class:down={d && d < 0}>
                  {#if d}{d > 0 ? '▲' : '▼'} {Math.abs(d)}{:else}–{/if}
                </td>
              {/if}
              <td class="car"><CarNumber {series} number={r.car} height={28} /></td>
              <td class="driver-cell">
                {#if expandable}
                  <button class="expand" aria-expanded={open === r.car} aria-controls="detail-{r.car}">
                    <DriverName driver={r.driver} sub={r.sponsor || r.team} {badges} />
                  </button>
                {:else}
                  <DriverName driver={r.driver} sub={r.sponsor || r.team} {badges} />
                {/if}
              </td>
              <td class="wide"><MakeBadge make={r.make} /></td>
              {#if mode !== 'entry'}
                <td class="r gap">
                  {r.gap}
                  {#if mode === 'race' && ins?.battle?.notable}
                    {@const closing = (ins.battle.rate ?? 0) > 0.02}
                    <span class="sub" class:closing title={closing ? `Closing ${ins.battle.rate!.toFixed(2)}s a lap` : 'Gap to the car ahead'}>
                      {ins.battle.gap.toFixed(3)} to P{ins.battle.aheadPos}
                    </span>
                  {/if}
                </td>
              {/if}
              {#if mode === 'race'}
                <td class="r">{lapTime(r.lastLap)}</td>
                <td class="r wide">
                  <span class:fast={ins?.fastest} title={ins?.fastest ? 'Fastest on track right now' : undefined}>{lapTime(ins?.pace)}</span>
                </td>
                <td class="r wide">{r.lapsLed || '–'}</td>
                <td class="r wide">
                  {#if ins?.onPitRoad}
                    <span class="muted">Pitting</span>
                  {:else if tireFuelByCar?.get(r.car)}
                    <FuelTires status={tireFuelByCar.get(r.car)!} />
                  {:else if ins?.tire}
                    {ins.tire.laps} {ins.tire.laps === 1 ? 'lap' : 'laps'}
                    {#if !ins.tire.fromStart}<span class="sub">{tireNote(ins.tire)}</span>{/if}
                  {:else}–{/if}
                </td>
              {:else if mode === 'timed'}
                <td class="r">{lapTime(r.bestLap)}</td>
                <td class="r wide">{speed(r.bestSpeed)}</td>
                <td class="r wide">{r.laps ?? '–'}</td>
              {:else if mode === 'final'}
                <td class="r wide">{r.laps ?? '–'}</td>
                <td class="r wide">{r.lapsLed || '–'}</td>
                <td class="status">{r.status}</td>
                <td class="r wide">{r.points ?? '–'}</td>
              {:else}
                <td class="wide team">{r.team}</td>
              {/if}
            </tr>
            {#if expandable && open === r.car}
              <tr class="detail-row" id="detail-{r.car}">
                <td colspan={COLS}><DriverDetail insight={ins} raw={rawByCar.get(r.car)} /></td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    {@const showChase = rows.some((r) => r.driver.chase)}
    {@const showFastest = !!fastestCar && rows.some((r) => r.car === fastestCar)}
    {#if showChase || showFastest}
      <p class="key">
        {#if showChase}<span class="item"><span class="swatch" aria-hidden="true"></span>Drivers in the Chase</span>{/if}
        {#if showFastest}<span class="item"><FastestLapBadge sample /> Fastest lap (bonus point)</span>{/if}
      </p>
    {/if}
  {/if}
</div>

<style>
  .sources {
    margin-bottom: 12px;
  }
  .live {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--critical);
    margin-right: 6px;
    vertical-align: 1px;
  }
  .pos {
    font-weight: 700;
    width: 1%;
  }
  .car {
    font-weight: 600;
    color: var(--ink-2);
    width: 1%;
  }
  .driver-cell {
    width: 100%;
  }
  .delta {
    font-size: 12px;
    color: var(--faint);
  }
  .delta.up {
    color: var(--up-text);
  }
  .delta.down {
    color: var(--down-text);
  }
  .gap {
    font-weight: 600;
  }
  .sub {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
  }
  .sub.closing {
    color: var(--up-text);
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
  }
  .fast {
    background: var(--green-wash);
    color: var(--up-text);
    font-weight: 700;
    border-radius: 4px;
    padding: 2px 5px;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-2);
    background: var(--surface-3);
    border-radius: 4px;
    padding: 2px 5px;
  }
  .badge.pit {
    color: var(--accent);
    background: var(--accent-wash);
  }
  .badge.dvp {
    color: var(--ink);
    background: var(--caution-wash);
  }
  tr.expandable {
    cursor: pointer;
  }
  .expand {
    all: unset;
    display: block;
    cursor: pointer;
  }
  .expand:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  tr.open td {
    background: var(--surface-2);
    border-bottom-color: transparent;
  }
  .detail-row td {
    background: var(--surface-2);
  }
  /* After the open-row rule so a Chase driver's row stays yellow while its details are showing. */
  tr.chase td {
    background: var(--chase-wash);
  }
  tr.chase:hover td {
    background: var(--chase-wash-strong);
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    margin: 0;
    padding: 10px 12px 12px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--grid);
  }
  .key .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .swatch {
    width: 14px;
    height: 10px;
    border-radius: 2px;
    background: var(--chase-wash-strong);
  }
  table.data tbody tr.detail-row:hover td {
    background: var(--surface-2);
  }
  .status {
    color: var(--ink-2);
  }
  .team {
    color: var(--ink-2);
  }
  tr.flash-up td {
    animation: flash-up 2.5s ease-out;
  }
  tr.flash-down td {
    animation: flash-down 2.5s ease-out;
  }
  @keyframes flash-up {
    from {
      background: var(--flash-up);
    }
  }
  @keyframes flash-down {
    from {
      background: var(--flash-down);
    }
  }
  @media (max-width: 640px) {
    .wide,
    .gap .sub {
      display: none;
    }
    table.data td,
    table.data th {
      padding-left: 6px;
      padding-right: 6px;
    }
    /* Let badges (fastest lap, pit, DVP) drop under the name rather than widen the table. */
    table.data td.driver-cell {
      white-space: normal;
    }
  }
</style>
