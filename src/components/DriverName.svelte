<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DriverName } from '../lib/format';

  let { driver, sub = '', badges }: { driver: DriverName; sub?: string; badges?: Snippet } = $props();
</script>

<span class="driver">
  <span class="name">
    {driver.name}
    {#if driver.chase}<span class="visually-hidden">(in the Chase)</span>{/if}
    {#if driver.rookie}<abbr class="tag" title="Rookie">R</abbr>{/if}
    {#if driver.ineligible}<abbr class="tag" title="Not eligible for series points">i</abbr>{/if}
    {@render badges?.()}
  </span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</span>

<style>
  .driver {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .sub {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }
  .tag {
    text-decoration: none;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 4px;
    border-radius: 4px;
    background: var(--surface-3);
    color: var(--ink-2);
    cursor: help;
  }
  @media (max-width: 640px) {
    .sub {
      display: none;
    }
  }
</style>
