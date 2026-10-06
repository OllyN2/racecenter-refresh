<script lang="ts">
  import { feeds } from '../lib/api';

  let { series, number, height = 24 }: { series: number; number: string; height?: number } = $props();

  const src = $derived(feeds.carBadge(series, number));
  // Not every number has a badge (one-off entries return 403), so fall back to plain text.
  let failedSrc = $state<string | null>(null);
</script>

{#if !number || failedSrc === src}
  <span class="text">{number}</span>
{:else}
  <img
    {src}
    alt={number}
    {height}
    width={Math.round((height * 78) / 70)}
    loading="lazy"
    decoding="async"
    onerror={() => (failedSrc = src)}
  />
{/if}

<style>
  img {
    display: block;
    object-fit: contain;
  }
  .text {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
