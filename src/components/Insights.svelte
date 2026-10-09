<script lang="ts">
  import type { InsightCard } from '../lib/insights';

  let { cards, onpick }: { cards: InsightCard[]; onpick: (car: string) => void } = $props();
</script>

{#if cards.length}
  <div class="insights">
    {#each cards as c (c.id)}
      <button class="card-btn" onclick={() => onpick(c.car)} title="Show {c.title}'s race details">
        <span class="label">{c.label}</span>
        <span class="row">
          <span class="who">{c.title}</span>
          <span class="value">{c.value}</span>
        </span>
        <span class="note">{c.note}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .card-btn {
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    padding: 10px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    min-width: 0;
  }
  .card-btn:hover {
    background: var(--surface-2);
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .who {
    font-weight: 700;
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value {
    font-weight: 700;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .note {
    font-size: 12px;
    color: var(--ink-2);
  }
  @media (max-width: 640px) {
    .insights {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .who,
    .value {
      font-size: 14px;
    }
  }
</style>
