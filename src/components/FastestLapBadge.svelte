<script lang="ts">
  import { lapTime } from '../lib/format';

  let {
    time = null,
    lap = null,
    eligible = true,
    sample = false,
  }: {
    time?: number | null;
    lap?: number | null;
    eligible?: boolean;
    /** The copy shown in a table's key, next to its own text label. */
    sample?: boolean;
  } = $props();

  const label = $derived(
    `Fastest lap of the race${time ? `: ${lapTime(time)}${lap ? ` on lap ${lap}` : ''}` : ''}. ` +
      (eligible ? 'Worth a bonus point.' : 'Not eligible for series points.'),
  );
</script>

<span class="fl" title={sample ? undefined : label} aria-hidden={sample ? 'true' : undefined}>
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="9.25" r="5.25" />
    <path d="M8 9.25V6.25M6.25 1.75h3.5M8 1.75V4" />
  </svg>
  {#if eligible}<span aria-hidden="true">+1</span>{/if}
  {#if !sample}<span class="visually-hidden">{label}</span>{/if}
</span>

<style>
  .fl {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    color: var(--fastest);
    background: var(--fastest-wash);
    cursor: help;
  }
  svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
  }
</style>
