<script lang="ts">
  import type { FeedState } from '../lib/poll.svelte';

  let { state, unavailable }: { state: FeedState<unknown>; unavailable: string } = $props();
</script>

{#if state.status === 'loading'}
  <p class="empty">Loading…</p>
{:else if state.status === 'unavailable'}
  <p class="empty">{unavailable}</p>
{:else if state.status === 'error'}
  <p class="empty">Couldn't reach the timing feed ({state.message}). Retrying…</p>
{/if}
